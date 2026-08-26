import { screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { describe, expect, it } from 'vitest'
import { BillItemsEditor } from './BillItemsEditor'
import { renderWithProviders } from '../test/testUtils'
import type { BillItemFormRow, SelectedMedicine } from '../utils/billForm'

function row(id: string, selected: SelectedMedicine | null, quantityInput = '1'): BillItemFormRow {
  return { id, selected, quantityInput }
}

const PARACETAMOL: SelectedMedicine = {
  id: 'med-1',
  name: 'Paracetamol',
  genericName: 'Paracetamol',
  strength: '500 mg',
  billingUnit: 'tablet',
  sellingPriceInPaise: 2000,
}

const CROCIN: SelectedMedicine = {
  id: 'med-2',
  name: 'Crocin',
  genericName: 'Paracetamol',
  strength: '650 mg',
  billingUnit: 'tablet',
  sellingPriceInPaise: 1500,
}

describe('BillItemsEditor', () => {
  it('attributes each line total to the correct row by id, not array position, when an earlier row is incomplete', () => {
    // Row 1 is incomplete (no medicine selected — e.g. cleared mid-edit);
    // only row 2 has a real preview total. Before the row-id fix, an
    // index-based lookup would have shown row 2's total on row 1 (a
    // phantom price for an empty row) and nothing on row 2 itself.
    const rows: BillItemFormRow[] = [row('row-1', null), row('row-2', CROCIN)]

    renderWithProviders(<BillItemsEditor rows={rows} onChange={() => {}} lineTotalsByRowId={{ 'row-2': 1500 }} />)

    const dataRows = screen.getAllByRole('row').slice(1) // drop the header row
    const totals = dataRows.map((tr) => tr.querySelector('.items-editor__line-total')?.textContent)
    expect(totals).toEqual(['—', '₹15.00'])
  })

  it('keeps a row\'s rendered state attached to its own id, not its array position, when another row is removed', () => {
    const rows: BillItemFormRow[] = [row('row-1', PARACETAMOL), row('row-2', CROCIN)]
    const { unmount } = renderWithProviders(
      <BillItemsEditor rows={rows} onChange={() => {}} lineTotalsByRowId={{ 'row-1': 2000, 'row-2': 1500 }} />,
    )
    expect(screen.getByLabelText(/medicine for item 2/i)).toHaveValue('Crocin')
    unmount()

    // Row 1 removed — row-2's data now sits at array index 0, but it's still
    // the same row (same id), so its content must move with it, not reset.
    renderWithProviders(<BillItemsEditor rows={[row('row-2', CROCIN)]} onChange={() => {}} lineTotalsByRowId={{ 'row-2': 1500 }} />)

    expect(screen.getByLabelText(/medicine for item 1/i)).toHaveValue('Crocin')
    expect(screen.queryByLabelText(/medicine for item 2/i)).not.toBeInTheDocument()
  })

  it('shows the live per-unit price implied by the preview total, not the price captured at selection time', () => {
    // Selected at ₹15.00/unit, but the server's own preview total for
    // quantity 2 implies ₹17.50/unit — e.g. the admin raised the price in
    // another tab after this row was selected. The server is authoritative.
    const rows: BillItemFormRow[] = [row('row-1', CROCIN, '2')]
    renderWithProviders(<BillItemsEditor rows={rows} onChange={() => {}} lineTotalsByRowId={{ 'row-1': 3500 }} />)

    expect(screen.getByText('₹17.50')).toBeInTheDocument()
    expect(screen.queryByText('₹15.00')).not.toBeInTheDocument()
  })

  it('falls back to the selection-time price before any preview total has arrived for the row', () => {
    const rows: BillItemFormRow[] = [row('row-1', CROCIN)]
    renderWithProviders(<BillItemsEditor rows={rows} onChange={() => {}} />)

    expect(screen.getByText('₹15.00')).toBeInTheDocument()
  })

  it('shows "—" for a row with no preview total yet, never a stale/mismatched figure', () => {
    const rows: BillItemFormRow[] = [row('row-1', PARACETAMOL)]
    renderWithProviders(<BillItemsEditor rows={rows} onChange={() => {}} />)

    expect(screen.getByRole('row', { name: /paracetamol/i })).toHaveTextContent('—')
  })
})
