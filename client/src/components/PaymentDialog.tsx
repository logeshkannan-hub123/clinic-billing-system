import { useEffect, useId, useState, type FormEvent } from 'react'
import { Button } from './Button'
import { CurrencyDisplay } from './CurrencyDisplay'
import { Dialog } from './Dialog'
import { getErrorMessage } from './Feedback'
import { SelectField, TextField } from './FormField'
import { useDisplaySettings } from '../hooks/useAdmin'
import { useRecordPayment } from '../hooks/useBills'
import { rupeesInputToPaise, sanitizeDecimalInput } from '../utils/money'
import { useToast } from './Toast'

interface PaymentDialogProps {
  billId: string
  dueAmountInPaise: number
  onClose: () => void
}

type Method = 'CASH' | 'UPI'

export function PaymentDialog({ billId, dueAmountInPaise, onClose }: PaymentDialogProps) {
  const titleId = useId()
  const amountId = useId()
  const referenceId = useId()
  const recordPayment = useRecordPayment(billId)
  const { showToast } = useToast()

  // Settings only decide which options to *show* — the server is still the
  // real authorization boundary and re-validates the chosen method on
  // submit regardless of what's cached here (see the generic error banner
  // below, which surfaces a backend rejection the same as any other).
  const { data: displaySettings } = useDisplaySettings()
  const cashEnabled = displaySettings?.payments.cashEnabled ?? true
  const upiEnabled = displaySettings?.payments.upiEnabled ?? true

  const [method, setMethod] = useState<Method>('CASH')
  const [amountInput, setAmountInput] = useState('')
  const [reference, setReference] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)

  // If the currently selected method isn't actually available (disabled by
  // the Admin, or CASH was the stale default while only UPI is enabled),
  // switch to whichever one is — never leave the form pointed at an option
  // that's about to be hidden.
  useEffect(() => {
    if (method === 'CASH' && !cashEnabled && upiEnabled) {
      setMethod('UPI')
    } else if (method === 'UPI' && !upiEnabled && cashEnabled) {
      setMethod('CASH')
    }
  }, [method, cashEnabled, upiEnabled])

  const parsedAmount = rupeesInputToPaise(amountInput)

  // Live estimate only, mirroring the server's own formula (calculateCashApplication)
  // so the receptionist can see it before submitting — the server recomputes and
  // records the authoritative change amount when the payment is actually saved.
  // Only shown once tendered actually exceeds the balance due: a partial or
  // exact payment has no change to hand back, so "₹0.00" there would just
  // read as a paradox next to money still being owed.
  const estimatedChangeInPaise =
    method === 'CASH' && parsedAmount !== null && parsedAmount > dueAmountInPaise ? parsedAmount - dueAmountInPaise : null

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setValidationError(null)

    if (parsedAmount === null || parsedAmount <= 0) {
      setValidationError('Enter a valid amount greater than zero.')
      return
    }

    // Client-side nudge only — prevents an obviously-wrong overpayment
    // keystroke from being submitted; the server remains authoritative and
    // will reject any amount it disagrees with regardless of this check.
    if (method === 'UPI' && parsedAmount > dueAmountInPaise) {
      setValidationError('UPI amount cannot exceed the outstanding balance.')
      return
    }

    const input =
      method === 'CASH'
        ? { method: 'CASH' as const, tenderedAmountInPaise: parsedAmount }
        : { method: 'UPI' as const, amountInPaise: parsedAmount, upiReference: reference.trim() || undefined }

    recordPayment.mutate(input, {
      onSuccess: (result) => {
        showToast(
          result.bill.status === 'PAID'
            ? 'Payment recorded — bill is now fully paid.'
            : 'Payment recorded.',
          'success',
        )
        onClose()
      },
    })
  }

  return (
    <Dialog titleId={titleId} title="Record Payment" onClose={onClose}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <div className="outstanding-banner">
          <span className="outstanding-banner__label">Outstanding balance</span>
          <CurrencyDisplay paise={dueAmountInPaise} size="lg" tone="due" />
        </div>

        <SelectField
          id={`${titleId}-method`}
          label="Payment method"
          value={method}
          onChange={(event) => setMethod(event.target.value as Method)}
        >
          {cashEnabled && <option value="CASH">Cash</option>}
          {upiEnabled && <option value="UPI">UPI</option>}
        </SelectField>

        <TextField
          id={amountId}
          label={method === 'CASH' ? 'Tendered amount (₹)' : 'Amount (₹)'}
          hint={method === 'CASH' ? 'The server calculates the amount applied and any change due.' : undefined}
          inputMode="decimal"
          value={amountInput}
          onChange={(event) => setAmountInput(sanitizeDecimalInput(event.target.value))}
          placeholder="0.00"
          autoFocus
          required
        />

        {method === 'UPI' && (
          <TextField
            id={referenceId}
            label="UPI reference"
            hint="Optional"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="Transaction / UTR number"
          />
        )}

        {estimatedChangeInPaise !== null && (
          <div className="outstanding-banner outstanding-banner--settled">
            <span className="outstanding-banner__label">Change to return</span>
            <CurrencyDisplay paise={estimatedChangeInPaise} size="lg" tone="positive" />
          </div>
        )}

        {(validationError || recordPayment.isError) && (
          <p className="inline-error" role="alert">
            {validationError ?? getErrorMessage(recordPayment.error, 'Could not record the payment.')}
          </p>
        )}

        <div className="dialog__actions">
          <Button type="button" variant="outlined" onClick={onClose} disabled={recordPayment.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={recordPayment.isPending}>
            Confirm Payment
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
