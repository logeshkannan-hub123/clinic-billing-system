import { useEffect, useId, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { TextField } from '../../components/FormField'
import { Switch } from '../../components/Switch'
import { useToast } from '../../components/Toast'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import { paiseToRupeesInput, rupeesInputToPaise, sanitizeDecimalInput } from '../../utils/money'
import { INVOICE_PREFIX_PATTERN } from '../../utils/settingsValidation'
import type { SettingsSectionContext } from './SettingsPage'

interface FormState {
  invoicePrefix: string
  allowPartialPayments: boolean
  duplicateWarningEnabled: boolean
  feeInput: string
}

const EMPTY: FormState = {
  invoicePrefix: 'INV',
  allowPartialPayments: true,
  duplicateWarningEnabled: true,
  feeInput: '0.00',
}

export function BillingSettingsSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()

  const [form, setForm] = useState<FormState>(EMPTY)
  const [saved, setSaved] = useState<FormState>(EMPTY)

  useEffect(() => {
    if (!data) return
    const next: FormState = {
      invoicePrefix: data.billing.invoicePrefix,
      allowPartialPayments: data.billing.allowPartialPayments,
      duplicateWarningEnabled: data.billing.duplicateWarningEnabled,
      feeInput: paiseToRupeesInput(data.billing.defaultConsultationFeeInPaise),
    }
    setForm(next)
    setSaved(next)
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  const parsedFeeInPaise = rupeesInputToPaise(form.feeInput)
  const prefixValid = INVOICE_PREFIX_PATTERN.test(form.invoicePrefix)
  const feeValid = parsedFeeInPaise !== null && parsedFeeInPaise >= 0
  const hasErrors = !prefixValid || !feeValid

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors || parsedFeeInPaise === null) return
    update.mutate(
      {
        billing: {
          invoicePrefix: form.invoicePrefix,
          allowPartialPayments: form.allowPartialPayments,
          duplicateWarningEnabled: form.duplicateWarningEnabled,
          defaultConsultationFeeInPaise: parsedFeeInPaise,
        },
      },
      {
        onSuccess: (settings) => {
          const next: FormState = {
            invoicePrefix: settings.billing.invoicePrefix,
            allowPartialPayments: settings.billing.allowPartialPayments,
            duplicateWarningEnabled: settings.billing.duplicateWarningEnabled,
            feeInput: paiseToRupeesInput(settings.billing.defaultConsultationFeeInPaise),
          }
          setSaved(next)
          setForm(next)
          showToast('Billing settings updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setForm(saved)
  }

  const prefixId = useId()
  const feeId = useId()
  const partialId = useId()
  const duplicateId = useId()

  if (isLoading) return <LoadingState label="Loading billing settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load billing settings')} />

  return (
    <Card>
      <CardHeader title="Billing Settings" />
      <form onSubmit={handleSubmit} className="settings-form">
        <div className="form-grid">
          <TextField
            id={prefixId}
            label="Invoice prefix"
            value={form.invoicePrefix}
            onChange={(event) => setForm((f) => ({ ...f, invoicePrefix: event.target.value.toUpperCase() }))}
            error={!prefixValid ? '1-10 uppercase letters/digits (e.g. INV)' : undefined}
            hint="Applies to bills issued from now on — existing bill numbers never change."
          />
          <TextField
            id={feeId}
            label="Default consultation fee (₹)"
            inputMode="decimal"
            value={form.feeInput}
            onChange={(event) => setForm((f) => ({ ...f, feeInput: sanitizeDecimalInput(event.target.value) }))}
            error={!feeValid ? 'Enter a valid non-negative amount' : undefined}
            hint="Pre-fills Create Bill — the receptionist can still change it per bill."
          />
        </div>

        <Switch
          id={partialId}
          checked={form.allowPartialPayments}
          onChange={(checked) => setForm((f) => ({ ...f, allowPartialPayments: checked }))}
          label="Allow Partial Payments"
          hint="Allows receptionists to record payments in multiple transactions."
        />

        <Switch
          id={duplicateId}
          checked={form.duplicateWarningEnabled}
          onChange={(checked) => setForm((f) => ({ ...f, duplicateWarningEnabled: checked }))}
          label="Duplicate Bill Warning"
          hint="Warn staff when a similar bill was recently created for the same patient."
        />

        {update.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(update.error, 'Could not save billing settings.')}
          </p>
        )}

        <div className="settings-form__actions">
          <Button type="button" variant="outlined" onClick={handleReset} disabled={!isDirty || update.isPending}>
            Reset
          </Button>
          <Button type="submit" disabled={!isDirty || hasErrors} loading={update.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Card>
  )
}
