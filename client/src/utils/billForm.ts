import type { BillItem, BillItemInput } from '../types/api'

/** The minimal shape a bill-item row needs to display a chosen product —
 * satisfied by both a live `MedicineSearchResult` (a fresh autocomplete
 * pick) and a reconstruction of an existing bill item's own snapshot (when
 * seeding the editor for an already-created bill). `id` is `''` for a
 * legacy/free-text item that predates the medicine catalog — see
 * `parseItemRow`, which turns that into an `undefined` `medicineId` so the
 * server treats it exactly as it does today (no catalog re-resolution). */
export interface SelectedMedicine {
  id: string
  name: string
  genericName: string | null
  strength: string | null
  billingUnit: string
  sellingPriceInPaise: number
}

/**
 * Form-local row shape: a confirmed product selection (or none yet) plus a
 * raw typed quantity string, so reformatting never fights the receptionist
 * mid-keystroke. Converted to the real `BillItemInput` shape only when
 * calling preview/create/edit.
 *
 * `id` is a client-only, stable row identity — NOT sent to the server, never
 * derived from array position. It's what lets React (keyed on `row.id`,
 * see BillItemsEditor) keep a row's in-progress autocomplete/search state
 * attached to the correct row when a *different* row is added or removed,
 * and what lets a preview response's per-item totals be matched back to the
 * exact row that produced them instead of by array index (see
 * parseValidItemEntries below) — a row that becomes invalid/incomplete no
 * longer occupies a slot in that array, so index-based matching silently
 * drifts as soon as any row isn't valid.
 */
export interface BillItemFormRow {
  id: string
  selected: SelectedMedicine | null
  quantityInput: string
}

let rowIdCounter = 0

function createRowId(): string {
  rowIdCounter += 1
  return `row-${rowIdCounter}`
}

/** One per bill-creation *attempt*, not per bill — generate once when the
 * form/draft is created and reuse it across a double-click or a client
 * retry after a lost response, so the server (see billService.createBill's
 * idempotencyKey handling) can resolve a repeated submission to the same
 * bill instead of creating a second one. `crypto.randomUUID` is available in
 * every modern browser and Node 19+; the fallback only matters for an older
 * test/runtime environment and never needs to be cryptographically strong —
 * it just needs to not collide within one bill-creation attempt. */
export function createIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function emptyItemRow(): BillItemFormRow {
  return { id: createRowId(), selected: null, quantityInput: '1' }
}

export function billItemToSelectedMedicine(item: BillItem): SelectedMedicine {
  return {
    id: item.medicineId ?? '',
    name: item.medicineName,
    genericName: item.genericName,
    strength: item.strength,
    billingUnit: item.unitType,
    sellingPriceInPaise: item.unitPriceInPaise,
  }
}

/** Rebuilds the editor's rows from a persisted bill's items — used on
 * initial load and on "Discard changes". Deliberately assigns a *fresh*
 * `id` to every row rather than trying to preserve one from a prior editing
 * session: this is a wholesale reset of what the form represents, and a
 * fresh id forces React to remount each row's MedicineAutocomplete (via its
 * key), which is exactly what correctly resets that component's local
 * search/input state back to the reverted value — see MedicineAutocomplete's
 * removed `selected`-sync effect for why that reset can't safely happen any
 * other way. */
export function billItemsToFormRows(items: BillItem[]): BillItemFormRow[] {
  return items.map((item) => ({
    id: createRowId(),
    selected: billItemToSelectedMedicine(item),
    quantityInput: String(item.quantity),
  }))
}

/** Returns null if the row isn't yet a valid, complete item — i.e. no
 * product has been selected, or the quantity isn't a positive integer. */
export function parseItemRow(row: BillItemFormRow): BillItemInput | null {
  const quantity = Number.parseInt(row.quantityInput, 10)

  if (!row.selected) return null
  if (!Number.isInteger(quantity) || quantity < 1) return null

  return {
    // Empty id means this is a legacy/free-text item reconstructed from an
    // existing bill — omit medicineId so the server passes it through
    // unchanged rather than trying to re-resolve a nonexistent catalog record.
    medicineId: row.selected.id || undefined,
    medicineName: row.selected.name,
    unitType: row.selected.billingUnit,
    quantity,
    unitPriceInPaise: row.selected.sellingPriceInPaise,
  }
}

export interface ValidItemEntry {
  rowId: string
  item: BillItemInput
}

/** Only the rows that currently parse as valid items, each paired with its
 * stable row id — the pairing is what lets a preview response's
 * `itemLineTotalsInPaise[i]` (ordered the same as this array) be attributed
 * back to the correct row even when an earlier row in the full `rows` array
 * is incomplete/invalid and therefore has no entry here at all. */
export function parseValidItemEntries(rows: BillItemFormRow[]): ValidItemEntry[] {
  const entries: ValidItemEntry[] = []
  for (const row of rows) {
    const item = parseItemRow(row)
    if (item) entries.push({ rowId: row.id, item })
  }
  return entries
}

/** Only the rows that currently parse as valid items — used to drive preview/submit. */
export function parseValidItemRows(rows: BillItemFormRow[]): BillItemInput[] {
  return parseValidItemEntries(rows).map((entry) => entry.item)
}
