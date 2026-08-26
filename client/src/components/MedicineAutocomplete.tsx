import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMedicineSearch } from '../hooks/useMedicines'
import type { MedicineCategory, MedicineSearchResult } from '../types/api'
import type { SelectedMedicine } from '../utils/billForm'
import { formatPaise } from '../utils/money'

const SEARCH_DEBOUNCE_MS = 350
const DROPDOWN_MAX_HEIGHT = 320
const DROPDOWN_MIN_WIDTH = 300
const VIEWPORT_MARGIN = 8
const MIN_COMFORTABLE_SPACE = 200

interface MedicineAutocompleteProps {
  selected: SelectedMedicine | null
  onSelect: (result: MedicineSearchResult) => void
  onClear: () => void
  category?: MedicineCategory
  disabled?: boolean
  placeholder?: string
  'aria-label'?: string
}

interface DropdownPosition {
  left: number
  width: number
  top: number | null
  bottom: number | null
  maxHeight: number
}

function optionMeta(result: MedicineSearchResult): string {
  return [result.brandName, result.genericName, result.strength].filter(Boolean).join(' · ')
}

/** Computes a fixed-position rect for the portaled dropdown from the input's
 * current bounding box, flipping above the input when there isn't
 * comfortable room below (e.g. the row is near the bottom of the viewport). */
function computeDropdownPosition(inputEl: HTMLElement): DropdownPosition {
  const rect = inputEl.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_MARGIN
  const spaceAbove = rect.top - VIEWPORT_MARGIN
  const placeAbove = spaceBelow < MIN_COMFORTABLE_SPACE && spaceAbove > spaceBelow

  const width = Math.max(rect.width, DROPDOWN_MIN_WIDTH)
  const left = Math.min(Math.max(rect.left, VIEWPORT_MARGIN), window.innerWidth - width - VIEWPORT_MARGIN)
  const maxHeight = Math.max(120, Math.min(DROPDOWN_MAX_HEIGHT, placeAbove ? spaceAbove : spaceBelow))

  return {
    left,
    width,
    top: placeAbove ? null : rect.bottom + 4,
    bottom: placeAbove ? window.innerHeight - rect.top + 4 : null,
    maxHeight,
  }
}

/**
 * Search-as-you-type product selector — genuinely new UI pattern for this
 * codebase (no prior combobox/autocomplete existed). Debounces requests with
 * the same manual setTimeout approach already used for the bill preview
 * (BillingPage.tsx/BillDetailPage.tsx), rather than a new debounce library.
 *
 * The results dropdown is rendered through a portal into `document.body` and
 * positioned as `position: fixed` from the input's own bounding rect. It used
 * to be an absolutely-positioned child of this component, but that put it
 * inside `.table-wrap` (overflow-x: auto — which per the CSS overflow spec
 * also computes overflow-y to auto), which clipped/scrolled it instead of
 * letting it float above the page. A portal sidesteps every ancestor
 * overflow/stacking context between here and the page root.
 */
export function MedicineAutocomplete({
  selected,
  onSelect,
  onClear,
  category,
  disabled,
  placeholder = 'Search medicine…',
  'aria-label': ariaLabel = 'Search medicine',
}: MedicineAutocompleteProps) {
  const listboxId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLUListElement>(null)
  const debounceRef = useRef<number | undefined>(undefined)

  const [inputValue, setInputValue] = useState(selected?.name ?? '')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [position, setPosition] = useState<DropdownPosition | null>(null)

  // Deliberately no effect re-syncing `inputValue` from the `selected` prop
  // on every change. This component is always mounted under a row keyed by
  // a stable, row-scoped id (see BillItemFormRow.id / BillItemsEditor) —
  // `selected` only ever changes here as a *result* of this component's own
  // onSelect/onClear calls, never pushed in from outside while this exact
  // instance stays mounted. A prior version of this effect re-ran on every
  // `selected` change including the one caused by this component's own
  // `onClear()` call below (typing away from a confirmed selection), which
  // raced against the just-typed character and wiped it back to empty on
  // the very next render. A genuine external reset (discarding an edit,
  // loading a different bill) goes through billItemsToFormRows, which
  // assigns each row a *fresh* id — a different key remounts this component
  // entirely, correctly re-initializing `inputValue` from the new `selected`
  // via the `useState` call above without needing a reactive effect at all.

  const { data: results = [], isLoading } = useMedicineSearch(debouncedQuery, category)

  useEffect(() => {
    setActiveIndex(-1)
  }, [results])

  const showDropdown = isOpen && debouncedQuery.trim().length > 0

  // Reposition on open and on any ancestor scroll or viewport resize —
  // `scroll` is registered with `capture: true` so it fires for scrolling
  // inside any nested scroll container (e.g. `.table-wrap`), not just the
  // window itself. The flip/maxHeight decision is based on available
  // viewport space around the input, not on the dropdown's own content size,
  // so results/isLoading are deliberately not dependencies here — the actual
  // rendered height is simply capped by maxHeight via CSS overflow. (Bails
  // out via the functional setPosition update when nothing has actually
  // moved, rather than always replacing with a new object — otherwise every
  // scroll event forces a render, and a change purely in reference identity
  // would re-trigger this effect and loop.)
  useLayoutEffect(() => {
    if (!showDropdown) {
      setPosition(null)
      return
    }
    function updatePosition() {
      if (!inputRef.current) return
      const next = computeDropdownPosition(inputRef.current)
      setPosition((prev) =>
        prev &&
        prev.left === next.left &&
        prev.width === next.width &&
        prev.top === next.top &&
        prev.bottom === next.bottom &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      )
    }
    updatePosition()
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [showDropdown])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      if (containerRef.current?.contains(target)) return
      if (dropdownRef.current?.contains(target)) return
      setIsOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  function handleInputChange(value: string) {
    setInputValue(value)
    setIsOpen(true)
    // Typing away from the confirmed selection means the row is no longer
    // backed by a real product until a fresh one is picked.
    if (selected && value !== selected.name) {
      onClear()
    }
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      setDebouncedQuery(value)
    }, SEARCH_DEBOUNCE_MS)
  }

  function handleSelect(result: MedicineSearchResult) {
    setInputValue(result.name)
    setIsOpen(false)
    setActiveIndex(-1)
    onSelect(result)
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        setIsOpen(true)
        return
      }
      setActiveIndex((index) => Math.min(index + 1, results.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && results[activeIndex]) {
        event.preventDefault()
        handleSelect(results[activeIndex]!)
      }
    } else if (event.key === 'Escape') {
      setIsOpen(false)
    }
  }

  return (
    <div className="medicine-autocomplete" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className="input"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={showDropdown}
        aria-controls={listboxId}
        aria-autocomplete="list"
        value={inputValue}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => handleInputChange(event.target.value)}
        onFocus={() => {
          if (debouncedQuery.trim().length > 0) setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
      />
      {showDropdown &&
        position &&
        createPortal(
          <ul
            className="medicine-autocomplete__dropdown"
            role="listbox"
            id={listboxId}
            ref={dropdownRef}
            style={{
              left: position.left,
              width: position.width,
              top: position.top ?? undefined,
              bottom: position.bottom ?? undefined,
              maxHeight: position.maxHeight,
            }}
          >
            {isLoading && <li className="medicine-autocomplete__status">Searching…</li>}
            {!isLoading && results.length === 0 && (
              <li className="medicine-autocomplete__status">No medicines found</li>
            )}
            {!isLoading &&
              results.map((result, index) => (
                <li
                  key={result.id}
                  role="option"
                  aria-selected={index === activeIndex}
                  className={`medicine-autocomplete__option${index === activeIndex ? ' is-active' : ''}`}
                  // onMouseDown (not onClick) so the option registers before the
                  // input's onBlur would otherwise close the dropdown first.
                  onMouseDown={(event) => {
                    event.preventDefault()
                    handleSelect(result)
                  }}
                >
                  <span className="medicine-autocomplete__option-main">
                    <span className="medicine-autocomplete__option-name">{result.name}</span>
                    <span className="medicine-autocomplete__option-meta">{optionMeta(result)}</span>
                    <span className="medicine-autocomplete__option-unit">{result.billingUnit}</span>
                  </span>
                  <span className="medicine-autocomplete__option-price">
                    {formatPaise(result.sellingPriceInPaise)}
                  </span>
                </li>
              ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
