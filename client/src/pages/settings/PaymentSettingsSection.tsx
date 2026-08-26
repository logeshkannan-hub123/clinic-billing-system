import { useEffect, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { Switch } from '../../components/Switch'
import { useToast } from '../../components/Toast'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import type { PaymentSettings } from '../../types/api'
import type { SettingsSectionContext } from './SettingsPage'

const EMPTY: PaymentSettings = { cashEnabled: true, upiEnabled: true }

export function PaymentSettingsSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()

  const [form, setForm] = useState<PaymentSettings>(EMPTY)
  const [saved, setSaved] = useState<PaymentSettings>(EMPTY)

  useEffect(() => {
    if (!data) return
    setForm(data.payments)
    setSaved(data.payments)
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  // The backend is the real boundary (rejects this same state with 400), but
  // there's no reason to let the Admin submit a save that would leave the
  // clinic with no way to take a payment at all.
  const bothDisabled = !form.cashEnabled && !form.upiEnabled

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (bothDisabled) return
    update.mutate(
      { payments: form },
      {
        onSuccess: (settings) => {
          setSaved(settings.payments)
          setForm(settings.payments)
          showToast('Payment settings updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setForm(saved)
  }

  if (isLoading) return <LoadingState label="Loading payment settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load payment settings')} />

  return (
    <Card>
      <CardHeader title="Payment Settings" />
      <form onSubmit={handleSubmit} className="settings-form">
        <Switch
          id="payments-cash"
          checked={form.cashEnabled}
          onChange={(checked) => setForm((f) => ({ ...f, cashEnabled: checked }))}
          label="Cash"
          hint="Let receptionists record cash payments, with server-calculated change."
        />
        <Switch
          id="payments-upi"
          checked={form.upiEnabled}
          onChange={(checked) => setForm((f) => ({ ...f, upiEnabled: checked }))}
          label="UPI"
          hint="Let receptionists record UPI payments, with an optional reference."
        />

        <p className="settings-note">
          Card and bank transfer aren't available — this clinic's billing system doesn't process
          those payment methods yet.
        </p>

        {bothDisabled && (
          <p className="inline-error" role="alert">
            At least one payment method must stay enabled.
          </p>
        )}

        {update.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(update.error, 'Could not save payment settings.')}
          </p>
        )}

        <div className="settings-form__actions">
          <Button type="button" variant="outlined" onClick={handleReset} disabled={!isDirty || update.isPending}>
            Reset
          </Button>
          <Button type="submit" disabled={!isDirty || bothDisabled} loading={update.isPending}>
            Save Changes
          </Button>
        </div>
      </form>
    </Card>
  )
}
