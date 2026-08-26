import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { BillItemsEditor } from '../components/BillItemsEditor'
import { BillSummary } from '../components/BillSummary'
import { Button } from '../components/Button'
import { Card, CardHeader } from '../components/Card'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { CurrencyDisplay } from '../components/CurrencyDisplay'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { Icon } from '../components/icons'
import { PageHeader } from '../components/PageHeader'
import { PatientSelector } from '../components/PatientSelector'
import { PaymentDialog } from '../components/PaymentDialog'
import { ReceiptView } from '../components/ReceiptView'
import { StatusBadge } from '../components/StatusBadge'
import { useToast } from '../components/Toast'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { useCurrentUser } from '../hooks/useAuth'
import { useBill, useBillPreview, useCancelBill, useEditBill } from '../hooks/useBills'
import { formatDateTimeIst } from '../utils/datetime'
import { billItemsToFormRows, emptyItemRow, parseValidItemEntries, type BillItemFormRow } from '../utils/billForm'
import { paiseToRupeesInput, rupeesInputToPaise, sanitizeDecimalInput } from '../utils/money'
import type { Payment } from '../types/api'

const PAYMENT_METHOD_LABEL: Record<Payment['method'], string> = { CASH: 'Cash', UPI: 'UPI' }

export function BillDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { showToast } = useToast()
  const { data: user } = useCurrentUser()
  const { data, isLoading, isError, error } = useBill(id)

  const [isEditing, setIsEditing] = useState(false)
  const [isPaying, setIsPaying] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)

  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [feeInput, setFeeInput] = useState('0')
  const [rows, setRows] = useState<BillItemFormRow[]>([emptyItemRow()])
  // Snapshot of the four fields above, captured the moment editing starts —
  // compared against their live values to know whether the draft is truly
  // dirty (some field actually changed) rather than just "isEditing is
  // true," so re-navigating away from an unchanged in-progress edit doesn't
  // warn unnecessarily.
  const editSnapshotRef = useRef<string | null>(null)

  const editBill = useEditBill(id ?? '')
  const cancelBill = useCancelBill(id ?? '')
  const preview = useBillPreview()

  const bill = data?.bill

  useEffect(() => {
    if (!bill) return
    setPatientName(bill.patientName)
    setPatientPhone(bill.patientPhone)
    setFeeInput(paiseToRupeesInput(bill.consultationFeeInPaise))
    setRows(billItemsToFormRows(bill.items))
  }, [bill])

  // Same "empty/intermediate input must never silently become zero" rule as
  // BillingPage — see High #8 in the audit.
  const feeParsedPaise = rupeesInputToPaise(feeInput)
  const isFeeValid = feeParsedPaise !== null
  const consultationFeeInPaise = feeParsedPaise ?? 0
  const validEntries = parseValidItemEntries(rows)
  const validItems = validEntries.map((entry) => entry.item)
  const validItemsKey = JSON.stringify(validItems)
  const previewMutate = preview.mutate
  const previewReset = preview.reset

  useEffect(() => {
    if (!isEditing) return
    if (validItems.length === 0 || !isFeeValid) {
      previewReset()
      return
    }
    const timeout = window.setTimeout(() => {
      previewMutate({ items: validItems, consultationFeeInPaise })
    }, 350)
    return () => window.clearTimeout(timeout)
    // See BillingPage's identical pattern: validItemsKey is the real change
    // signal for this debounced preview call.
  }, [isEditing, validItemsKey, consultationFeeInPaise, isFeeValid, previewMutate, previewReset])

  const lineTotalsByRowId =
    preview.data && preview.data.itemLineTotalsInPaise.length === validEntries.length
      ? Object.fromEntries(
          validEntries.map((entry, index) => [entry.rowId, preview.data!.itemLineTotalsInPaise[index]!]),
        )
      : undefined

  const currentEditSnapshot = JSON.stringify({ patientName, patientPhone, feeInput, rows })
  const isDirty = isEditing && editSnapshotRef.current !== null && currentEditSnapshot !== editSnapshotRef.current
  useUnsavedChangesGuard(isDirty)

  if (isLoading) return <div className="page"><LoadingState label="Loading bill…" /></div>
  if (isError || !data) return <div className="page"><ErrorState message={getErrorMessage(error, 'Could not load this bill.')} /></div>

  function startEdit() {
    editSnapshotRef.current = JSON.stringify({ patientName, patientPhone, feeInput, rows })
    setIsEditing(true)
  }

  function cancelEdit() {
    setIsEditing(false)
    editSnapshotRef.current = null
    if (bill) {
      setPatientName(bill.patientName)
      setPatientPhone(bill.patientPhone)
      setFeeInput(paiseToRupeesInput(bill.consultationFeeInPaise))
      setRows(billItemsToFormRows(bill.items))
    }
  }

  function saveEdit() {
    if (!id) return
    editBill.mutate(
      { patientName, patientPhone, items: validItems, consultationFeeInPaise },
      {
        onSuccess: () => {
          showToast('Bill updated.', 'success')
          setIsEditing(false)
          editSnapshotRef.current = null
        },
      },
    )
  }

  function startCancel() {
    cancelBill.reset()
    setIsCancelling(true)
  }

  function cancelCancel() {
    cancelBill.reset()
    setIsCancelling(false)
  }

  function confirmCancel() {
    // Only close the dialog on confirmed success — a failed request keeps it
    // open with an inline error rather than leaving staff believing the bill
    // was cancelled when it wasn't.
    cancelBill.mutate(undefined, {
      onSuccess: () => {
        showToast('Bill cancelled.', 'success')
        setIsCancelling(false)
      },
    })
  }

  const canEdit = bill!.status === 'UNPAID'
  const canRecordPayment = bill!.status === 'UNPAID' || bill!.status === 'PARTIALLY_PAID'
  const canCancel = user?.role === 'admin' && bill!.status === 'UNPAID'
  const paidSoFar = data.payments.reduce((sum, payment) => sum + payment.amountInPaise, 0)
  const dueAmount = bill!.grandTotalInPaise - paidSoFar

  return (
    <div className="page">
      <PageHeader
        title="Bill Detail"
        actions={
          <>
            {!isEditing && canEdit && (
              <Button variant="outlined" onClick={startEdit}>
                <Icon name="pencil" size={16} />
                Edit Bill
              </Button>
            )}
            {!isEditing && canRecordPayment && <Button onClick={() => setIsPaying(true)}>Record Payment</Button>}
            {!isEditing && canCancel && (
              <Button variant="destructive" onClick={startCancel}>
                Cancel Bill
              </Button>
            )}
            {!isEditing && <Button variant="outlined" onClick={() => window.print()}>
              <Icon name="print" size={16} />
              Print
            </Button>}
          </>
        }
      />

      <div className="bill-detail-header">
        <div className="bill-detail-header__meta">
          <span className="bill-detail-header__number">{bill!.billNumber}</span>
          <div className="bill-detail-header__sub">
            <StatusBadge status={bill!.status} />
            <span>Issued {formatDateTimeIst(bill!.issuedAt)}</span>
          </div>
        </div>
      </div>

      {(bill!.status === 'UNPAID' || bill!.status === 'PARTIALLY_PAID') && (
        <div className="outstanding-banner">
          <span className="outstanding-banner__label">Outstanding balance</span>
          <CurrencyDisplay paise={dueAmount} size="lg" tone="due" />
        </div>
      )}
      {bill!.status === 'PAID' && (
        <div className="outstanding-banner outstanding-banner--settled">
          <span className="outstanding-banner__label">Fully paid</span>
          <Icon name="check-circle" />
        </div>
      )}

      <div className="detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
          <Card>
            <CardHeader title="Patient" />
            {isEditing ? (
              <PatientSelector
                name={patientName}
                phone={patientPhone}
                onNameChange={setPatientName}
                onPhoneChange={setPatientPhone}
                disabled={editBill.isPending}
              />
            ) : (
              <div className="patient-info">
                <div className="patient-info__item">
                  <span className="patient-info__label">Name</span>
                  <span className="patient-info__value">{bill!.patientName}</span>
                </div>
                <div className="patient-info__item">
                  <span className="patient-info__label">Phone</span>
                  <span className="patient-info__value">{bill!.patientPhone}</span>
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Medicines & Fees" />
            {isEditing ? (
              <>
                <BillItemsEditor rows={rows} onChange={setRows} lineTotalsByRowId={lineTotalsByRowId} disabled={editBill.isPending} />
                <div style={{ maxWidth: 220, marginTop: 'var(--space-4)' }}>
                  <label className="form-field">
                    <span className="form-field__label">Consultation fee (₹)</span>
                    <input
                      className="input"
                      inputMode="decimal"
                      value={feeInput}
                      onChange={(event) => setFeeInput(sanitizeDecimalInput(event.target.value))}
                      disabled={editBill.isPending}
                      aria-invalid={!isFeeValid}
                    />
                    {!isFeeValid && (
                      <span className="form-field__error" role="alert">
                        Enter a valid consultation fee
                      </span>
                    )}
                  </label>
                </div>
              </>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Medicine</th>
                      <th>Unit</th>
                      <th>Qty</th>
                      <th style={{ textAlign: 'right' }}>Price</th>
                      <th style={{ textAlign: 'right' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bill!.items.map((item, index) => (
                      <tr key={index}>
                        <td>{item.medicineName}</td>
                        <td>{item.unitType}</td>
                        <td>{item.quantity}</td>
                        <td style={{ textAlign: 'right' }}>
                          <CurrencyDisplay paise={item.unitPriceInPaise} size="sm" />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <CurrencyDisplay paise={item.lineTotalInPaise} size="sm" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {isEditing && (
            <>
              {editBill.isError && (
                <p className="inline-error" role="alert">
                  {getErrorMessage(editBill.error, 'Could not save changes.')}
                </p>
              )}
              <div className="toolbar">
                <Button variant="outlined" onClick={cancelEdit} disabled={editBill.isPending}>
                  Discard changes
                </Button>
                <Button
                  onClick={saveEdit}
                  loading={editBill.isPending}
                  disabled={
                    validItems.length === 0 ||
                    validItems.length !== rows.length ||
                    !patientName.trim() ||
                    patientPhone.length !== 10 ||
                    !isFeeValid
                  }
                >
                  Save Changes
                </Button>
              </div>
            </>
          )}

          <Card>
            <CardHeader title="Payment History" />
            {data.payments.length === 0 ? (
              <p className="text-muted">No payments recorded yet.</p>
            ) : (
              <div className="payment-history">
                {data.payments.map((payment) => (
                  <div className="payment-row" key={payment._id}>
                    <div className="payment-row__method">
                      <span className="payment-row__method-name">{PAYMENT_METHOD_LABEL[payment.method]}</span>
                      <span className="payment-row__meta">
                        {formatDateTimeIst(payment.createdAt)}
                        {payment.method === 'UPI' && payment.upiReference ? ` · Ref: ${payment.upiReference}` : ''}
                        {payment.method === 'CASH' && payment.changeAmountInPaise
                          ? ` · Change given: ${(payment.changeAmountInPaise / 100).toFixed(2)}`
                          : ''}
                      </span>
                    </div>
                    <CurrencyDisplay paise={payment.amountInPaise} tone="positive" />
                  </div>
                ))}
              </div>
            )}
          </Card>

          <div className="no-print">
            <Card>
              <CardHeader title="Receipt Preview" />
              {isEditing ? (
                // Never render the persisted bill's totals next to the live,
                // unsaved edit summary above — the two would show
                // contradictory numbers on the same screen. Save or discard
                // first; the preview resumes reflecting reality either way.
                <p className="text-muted">Save or discard your changes to see the updated receipt preview.</p>
              ) : (
                <ReceiptView bill={bill!} payments={data.payments} />
              )}
            </Card>
          </div>
        </div>

        <BillSummary
          totals={
            isEditing && preview.data
              ? { consultationFeeInPaise, ...preview.data }
              : {
                  consultationFeeInPaise: bill!.consultationFeeInPaise,
                  subtotalInPaise: bill!.subtotalInPaise,
                  taxEnabled: bill!.taxEnabled,
                  taxRateBasisPoints: bill!.taxRateBasisPoints,
                  taxAmountInPaise: bill!.taxAmountInPaise,
                  roundingAdjustmentInPaise: bill!.roundingAdjustmentInPaise,
                  grandTotalInPaise: bill!.grandTotalInPaise,
                }
          }
          loading={isEditing && preview.isPending}
        />
      </div>

      {isPaying && id && <PaymentDialog billId={id} dueAmountInPaise={dueAmount} onClose={() => setIsPaying(false)} />}

      {isCancelling && (
        <ConfirmationDialog
          title="Cancel this bill?"
          description="This bill has no payments recorded, so it can be cancelled. This action cannot be undone, and the bill number will remain reserved."
          confirmLabel="Cancel Bill"
          cancelLabel="Keep Bill"
          destructive
          loading={cancelBill.isPending}
          error={
            cancelBill.isError
              ? getErrorMessage(cancelBill.error, 'Could not cancel this bill. Please try again.')
              : undefined
          }
          onConfirm={confirmCancel}
          onCancel={cancelCancel}
        />
      )}
    </div>
  )
}
