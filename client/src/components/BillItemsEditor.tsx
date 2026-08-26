import { Button, IconButton } from './Button'
import { Icon } from './icons'
import { MedicineAutocomplete } from './MedicineAutocomplete'
import type { BillItemFormRow } from '../utils/billForm'
import { emptyItemRow } from '../utils/billForm'
import { formatPaise } from '../utils/money'

interface BillItemsEditorProps {
  rows: BillItemFormRow[]
  onChange: (rows: BillItemFormRow[]) => void
  /** Keyed by BillItemFormRow.id, not array index — see billForm.ts's
   * ValidItemEntry for why index-based matching silently drifts as soon as
   * any row is incomplete/invalid. */
  lineTotalsByRowId?: Record<string, number>
  disabled?: boolean
}

/** Digits only. */
function sanitizeIntegerInput(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Prefers the *live* per-unit price implied by the server's own preview
 * total (lineTotal ÷ quantity) over the price captured at selection time.
 * The selling price a medicine was selected with can drift — an admin
 * changing it in another tab, mid-draft — and the server is always the
 * authority on what it'll actually charge (see billService's
 * resolveItemsAgainstCatalog); once a preview response has landed, showing
 * anything else here would just be display-only staleness the receptionist
 * has no way to notice. Falls back to the selection-time snapshot only
 * before the first preview for this row has arrived.
 */
function formatUnitPrice(row: BillItemFormRow, lineTotalInPaise: number | undefined): string {
  if (!row.selected) return '—'
  const quantity = Number.parseInt(row.quantityInput, 10)
  if (lineTotalInPaise !== undefined && Number.isInteger(quantity) && quantity > 0) {
    return formatPaise(lineTotalInPaise / quantity)
  }
  return formatPaise(row.selected.sellingPriceInPaise)
}

export function BillItemsEditor({
  rows,
  onChange,
  lineTotalsByRowId,
  disabled,
}: BillItemsEditorProps) {
  function updateRow(index: number, patch: Partial<BillItemFormRow>) {
    onChange(rows.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function addRow() {
    onChange([...rows, emptyItemRow()])
  }

  function removeRow(index: number) {
    onChange(rows.filter((_, i) => i !== index))
  }

  return (
    <div className="items-editor">
      <div className="table-wrap">
        <table className="items-editor__table">
          <thead>
            <tr>
              <th>Medicine</th>
              <th>Unit</th>
              <th>Qty</th>
              <th>Unit Price</th>
              <th>Total</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={row.id}>
                <td>
                  <MedicineAutocomplete
                    key={row.id}
                    selected={row.selected}
                    onSelect={(result) =>
                      updateRow(index, {
                        selected: {
                          id: result.id,
                          name: result.name,
                          genericName: result.genericName,
                          strength: result.strength,
                          billingUnit: result.billingUnit,
                          sellingPriceInPaise: result.sellingPriceInPaise,
                        },
                      })
                    }
                    onClear={() => updateRow(index, { selected: null })}
                    disabled={disabled}
                    aria-label={`Medicine for item ${index + 1}`}
                  />
                </td>
                <td>{row.selected?.billingUnit ?? '—'}</td>
                <td>
                  <input
                    type="text"
                    inputMode="numeric"
                    className="items-editor__qty"
                    value={row.quantityInput}
                    onChange={(event) => updateRow(index, { quantityInput: sanitizeIntegerInput(event.target.value) })}
                    disabled={disabled}
                  />
                </td>
                <td className="items-editor__price">{formatUnitPrice(row, lineTotalsByRowId?.[row.id])}</td>
                <td className="items-editor__line-total">
                  {lineTotalsByRowId?.[row.id] !== undefined ? formatPaise(lineTotalsByRowId[row.id]!) : '—'}
                </td>
                <td>
                  <IconButton
                    label="Remove item"
                    size="sm"
                    onClick={() => removeRow(index)}
                    disabled={disabled || rows.length <= 1}
                  >
                    <Icon name="close" size={16} />
                  </IconButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Button type="button" variant="outlined" size="sm" onClick={addRow} disabled={disabled}>
        + Add medicine
      </Button>
    </div>
  )
}
