import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MedicineAutocomplete } from './MedicineAutocomplete'
import { mockApi, renderWithProviders } from '../test/testUtils'
import type { MedicineSearchResult } from '../types/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

const DOLO: MedicineSearchResult = {
  id: 'med-1',
  category: 'MEDICINE',
  name: 'Dolo 500',
  brandName: 'Dolo',
  genericName: 'Paracetamol',
  composition: 'Paracetamol 500 mg',
  strength: '500 mg',
  billingUnit: 'tablet',
  volume: null,
  volumeUnit: null,
  sellingPriceInPaise: 3000,
}

function renderAutocomplete(onSelect = vi.fn(), onClear = vi.fn()) {
  renderWithProviders(<MedicineAutocomplete selected={null} onSelect={onSelect} onClear={onClear} />)
  return { onSelect, onClear }
}

describe('MedicineAutocomplete', () => {
  it('debounces the search request rather than firing on every keystroke', async () => {
    let callCount = 0
    mockApi([
      {
        method: 'GET',
        path: /^\/api\/medicines\/search/,
        respond: () => {
          callCount += 1
          return { body: [DOLO] }
        },
      },
    ])
    renderAutocomplete()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'd' } })
    fireEvent.change(input, { target: { value: 'do' } })
    fireEvent.change(input, { target: { value: 'dol' } })

    await screen.findByText('Dolo 500')
    expect(callCount).toBe(1)
  })

  it('shows a "No medicines found" state for an empty result set', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [] }) }])
    renderAutocomplete()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'xyz' } })
    expect(await screen.findByText(/no medicines found/i)).toBeInTheDocument()
  })

  it('shows product details (generic name, strength, unit, price) in each result', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    renderAutocomplete()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dolo' } })
    await screen.findByText('Dolo 500')
    expect(screen.getByText(/paracetamol.*500 mg/i)).toBeInTheDocument()
    expect(screen.getByText(/tablet/i)).toBeInTheDocument()
    expect(screen.getByText('₹30.00')).toBeInTheDocument()
  })

  it('selecting a result populates the input and calls onSelect with the full product', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    const { onSelect } = renderAutocomplete()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dolo' } })
    const option = await screen.findByRole('option', { name: /dolo 500/i })
    fireEvent.mouseDown(option)

    expect(onSelect).toHaveBeenCalledWith(DOLO)
    expect(screen.getByRole('combobox')).toHaveValue('Dolo 500')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('supports ArrowDown + Enter keyboard selection', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    const { onSelect } = renderAutocomplete()

    const input = screen.getByRole('combobox')
    fireEvent.change(input, { target: { value: 'dolo' } })
    await screen.findByRole('option', { name: /dolo 500/i })

    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'Enter' })

    expect(onSelect).toHaveBeenCalledWith(DOLO)
  })

  it('closes the dropdown when clicking outside', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    renderAutocomplete()

    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'dolo' } })
    await screen.findByRole('listbox')

    fireEvent.mouseDown(document.body)
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
  })

  it('clears the parent selection when typing away from the previously selected product', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    const onClear = vi.fn()
    renderWithProviders(<MedicineAutocomplete selected={DOLO} onSelect={vi.fn()} onClear={onClear} />)

    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('Dolo 500')
    fireEvent.change(input, { target: { value: 'Dolo 5' } })

    expect(onClear).toHaveBeenCalled()
  })

  /** A real parent (BillItemsEditor) reacts to onClear by setting `selected`
   * back to null and re-rendering with the new prop — a plain static-prop
   * test can't reproduce that round-trip, so this wraps the component in a
   * small stateful harness that behaves exactly like the real one. */
  function StatefulAutocomplete({ initialSelected }: { initialSelected: MedicineSearchResult | null }) {
    const [selected, setSelected] = useState<MedicineSearchResult | null>(initialSelected)
    return <MedicineAutocomplete selected={selected} onSelect={setSelected} onClear={() => setSelected(null)} />
  }

  it('keeps the first typed character instead of resetting to empty when editing an already-selected product', async () => {
    mockApi([{ method: 'GET', path: /^\/api\/medicines\/search/, respond: () => ({ body: [DOLO] }) }])
    renderWithProviders(<StatefulAutocomplete initialSelected={DOLO} />)

    const input = screen.getByRole('combobox')
    expect(input).toHaveValue('Dolo 500')

    // Click in and type a single character, replacing the confirmed
    // selection's text — this is the exact sequence that used to race
    // against the parent's onClear-triggered re-render and wipe the field
    // back to empty on the very next render.
    fireEvent.change(input, { target: { value: 'd' } })

    expect(input).toHaveValue('d')

    // And it keeps accumulating normally from there.
    fireEvent.change(input, { target: { value: 'do' } })
    expect(input).toHaveValue('do')
  })
})
