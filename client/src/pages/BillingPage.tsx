import { useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { BillItemsEditor } from '../components/BillItemsEditor'
import { BillSummary } from '../components/BillSummary'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { getErrorMessage } from '../components/Feedback'
import { TextField } from '../components/FormField'
import { PageHeader } from '../components/PageHeader'
import { PatientSelector } from '../components/PatientSelector'
import { useToast } from '../components/Toast'
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard'
import { useDisplaySettings } from '../hooks/useAdmin'
import { useBillPreview, useCreateBill } from '../hooks/useBills'
import { ApiError } from '../api/client'
import type { DuplicateBillWarning } from '../types/api'
import { createIdempotencyKey, emptyItemRow, parseValidItemEntries, type BillItemFormRow } from '../utils/billForm'
import { paiseToRupeesInput, rupeesInputToPaise, sanitizeDecimalInput } from '../utils/money'

const PREVIEW_DEBOUNCE_MS = 350

export function BillingPage() {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const feeId = useId()

  const [patientName, setPatientName] = useState('')
  const [patientPhone, setPatientPhone] = useState('')
  const [feeInput, setFeeInputRaw] = useState('0')
  const [rows, setRows] = useState<BillItemFormRow[]>([emptyItemRow()])
  const [duplicateWarning, setDuplicateWarning] = useState<DuplicateBillWarning | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)

  const preview = useBillPreview()
  const createBill = useCreateBill()
  const debounceRef = useRef<number | undefined>(undefined)
  // One key per bill-creation attempt, reused across a duplicate-warning
  // "submit anyway" retry so the server can tell a genuine resubmission
  // (double-click, lost-response retry) apart from an intentional second
  // bill — see billService.createBill's idempotencyKey handling.
  const idempotencyKeyRef = useRef(createIdempotencyKey())

  // Default consultation fee, from Settings — applied once, and never once
  // the receptionist has actually touched the field (including if they type
  // before this finishes loading), so it's purely a starting point, never a
  // fight over who owns the value.
  const { data: displaySettings } = useDisplaySettings()
  const [hasEditedFee, setHasEditedFee] = useState(false)
  const appliedDefaultFee = useRef(false)

  function setFeeInput(value: string) {
    setHasEditedFee(true)
    setFeeInputRaw(value)
  }

  useEffect(() => {
    if (appliedDefaultFee.current || hasEditedFee || !displaySettings) return
    setFeeInputRaw(paiseToRupeesInput(displaySettings.defaultConsultationFeeInPaise))
    appliedDefaultFee.current = true
  }, [displaySettings, hasEditedFee])

  // `feeParsedPaise` is `null` for anything rupeesInputToPaise can't parse —
  // an empty field, or an intermediate typing state like "12." — which must
  // never be silently treated as a ₹0 fee (see isFeeValid/canSubmit below).
  const feeParsedPaise = rupeesInputToPaise(feeInput)
  const isFeeValid = feeParsedPaise !== null
  const consultationFeeInPaise = feeParsedPaise ?? 0
  const validEntries = parseValidItemEntries(rows)
  const validItems = validEntries.map((entry) => entry.item)
  const validItemsKey = JSON.stringify(validItems)
  const previewMutate = preview.mutate
  const previewReset = preview.reset

  useEffect(() => {
    if (validItems.length === 0 || !isFeeValid) {
      // Nothing valid to preview (no items, or an unparseable fee) — clear
      // any previously-fetched totals rather than leaving a stale preview
      // on screen for a form that can no longer submit as shown.
      previewReset()
      return
    }
    window.clearTimeout(debounceRef.current)
    debounceRef.current = window.setTimeout(() => {
      previewMutate({ items: validItems, consultationFeeInPaise })
    }, PREVIEW_DEBOUNCE_MS)
    return () => window.clearTimeout(debounceRef.current)
    // Re-runs only when the parsed item list or fee actually changes —
    // `validItemsKey` is that change signal; `validItems`/`previewMutate`
    // are derived fresh each render and would otherwise cause a request on
    // every keystroke-unrelated re-render.
  }, [validItemsKey, consultationFeeInPaise, isFeeValid, previewMutate, previewReset])

  const totals = preview.data
    ? {
        consultationFeeInPaise,
        // subtotalInPaise (server-computed) already equals items total + fee
        // (see server's billMath.ts) — this is a plain subtraction of two
        // already-authoritative numbers for display, not a re-derivation of
        // pricing/tax logic.
        medicinesTotalInPaise: preview.data.subtotalInPaise - consultationFeeInPaise,
        ...preview.data,
      }
    : null

  // Matched back to rows by stable id, not array position — a row that's
  // currently incomplete/invalid has no entry in `validEntries` at all, so
  // index-based matching would silently attribute another row's total to it.
  // Also guarded against a stale preview response whose item count no longer
  // matches the current valid rows (e.g. a row was just added/removed and
  // the debounced preview for it hasn't landed yet) — better to show no
  // total for a moment than a mismatched one.
  const lineTotalsByRowId =
    preview.data && preview.data.itemLineTotalsInPaise.length === validEntries.length
      ? Object.fromEntries(
          validEntries.map((entry, index) => [entry.rowId, preview.data!.itemLineTotalsInPaise[index]!]),
        )
      : undefined

  const isDirty =
    Boolean(patientName.trim() || patientPhone) || rows.some((row) => row.selected !== null) || hasEditedFee
  useUnsavedChangesGuard(isDirty)

  /** Wipes the draft back to a blank bill — patient, medicine rows,
   * consultation fee, any in-flight preview, and the idempotency key (this is
   * now a genuinely new bill-creation attempt, not a retry of the old one).
   * Resetting `hasEditedFee`/`appliedDefaultFee` lets the settings-configured
   * default consultation fee re-apply itself exactly as it does on first
   * mount, rather than leaving the fee at a hardcoded ₹0. */
  function resetDraft() {
    setPatientName('')
    setPatientPhone('')
    setFeeInputRaw('0')
    setHasEditedFee(false)
    appliedDefaultFee.current = false
    setRows([emptyItemRow()])
    setDuplicateWarning(null)
    previewReset()
    idempotencyKeyRef.current = createIdempotencyKey()
    setShowClearConfirm(false)
  }

  /** An empty draft (nothing typed, nothing selected) clears immediately —
   * there's nothing to lose, so a confirmation would just be friction. Once
   * the receptionist has entered anything meaningful, require an explicit
   * confirmation before discarding it. */
  function handleClearAll() {
    if (isDirty) {
      setShowClearConfirm(true)
    } else {
      resetDraft()
    }
  }

  function submit(confirmDuplicate = false) {
    createBill.mutate(
      {
        input: { patientName, patientPhone, items: validItems, consultationFeeInPaise },
        confirmDuplicate,
        idempotencyKey: idempotencyKeyRef.current,
      },
      {
        onSuccess: (bill) => {
          setDuplicateWarning(null)
          showToast('Bill generated successfully.', 'success')
          navigate(`/bills/${bill._id}`)
        },
        onError: (error) => {
          const duplicate =
            error instanceof ApiError && error.status === 409 && error.body && typeof error.body === 'object'
              ? (error.body as Partial<DuplicateBillWarning>)
              : null

          // Only a genuine duplicate-warning 409 sets the warning banner. Any
          // other failure — including a retry ("submit anyway") that fails
          // for an unrelated reason — must clear it, so the generic error
          // banner below is shown instead of a stale duplicate notice.
          if (duplicate?.warning === 'possible_duplicate' && duplicate.existingBillId && duplicate.existingBillNumber) {
            setDuplicateWarning(duplicate as DuplicateBillWarning)
          } else {
            setDuplicateWarning(null)
          }
        },
      },
    )
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    submit(false)
  }

  const canSubmit =
    patientName.trim().length > 0 &&
    patientPhone.length === 10 &&
    validItems.length > 0 &&
    validItems.length === rows.length &&
    isFeeValid

  return (
    <div className="page">
      <PageHeader title="Create Bill" subtitle="Add patient details and medicines to generate a new bill" />

      <form onSubmit={handleSubmit}>
        <div className="billing-layout">
          <div className="card card--padded billing-form">
            <div className="billing-form__section">
              <div className="section-title">Patient details</div>
              <PatientSelector
                name={patientName}
                phone={patientPhone}
                onNameChange={setPatientName}
                onPhoneChange={setPatientPhone}
                disabled={createBill.isPending}
              />
            </div>

            <div className="billing-form__section">
              <div className="section-title">Medicines</div>
              <BillItemsEditor rows={rows} onChange={setRows} lineTotalsByRowId={lineTotalsByRowId} disabled={createBill.isPending} />
            </div>

            <div className="billing-form__section">
              <div className="section-title">Fees</div>
              <div style={{ maxWidth: 220 }}>
                <TextField
                  id={feeId}
                  label="Consultation fee (₹)"
                  inputMode="decimal"
                  value={feeInput}
                  onChange={(event) => setFeeInput(sanitizeDecimalInput(event.target.value))}
                  disabled={createBill.isPending}
                  error={!isFeeValid ? 'Enter a valid consultation fee' : undefined}
                />
              </div>
            </div>

            {createBill.isError && !duplicateWarning && (
              <p className="inline-error" role="alert">
                {getErrorMessage(createBill.error, 'Could not generate the bill.')}
              </p>
            )}

            {duplicateWarning && (
              <div className="inline-notice duplicate-warning">
                <div>
                  A very similar bill (#{duplicateWarning.existingBillNumber}) was just created for this patient. Are
                  you sure you want to generate another one?
                </div>
                <div className="toolbar">
                  <Button type="button" variant="outlined" size="sm" onClick={() => setDuplicateWarning(null)}>
                    Cancel
                  </Button>
                  <Button type="button" size="sm" onClick={() => submit(true)} loading={createBill.isPending}>
                    Submit anyway
                  </Button>
                </div>
              </div>
            )}

            <div className="billing-actions">
              <Button type="button" variant="outlined" onClick={handleClearAll} disabled={createBill.isPending}>
                Clear All
              </Button>
              <Button type="submit" disabled={!canSubmit || Boolean(duplicateWarning)} loading={createBill.isPending}>
                Generate Bill
              </Button>
            </div>
          </div>

          <BillSummary totals={totals} itemCount={validItems.length} loading={preview.isPending} />
        </div>
      </form>

      {showClearConfirm && (
        <ConfirmationDialog
          title="Clear this bill draft?"
          description="This will remove the patient details, medicines, and consultation fee you've entered and cannot be undone."
          confirmLabel="Clear All"
          cancelLabel="Keep Editing"
          destructive
          onConfirm={resetDraft}
          onCancel={() => setShowClearConfirm(false)}
        />
      )}
    </div>
  )
}
