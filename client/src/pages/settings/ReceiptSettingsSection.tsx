import { useEffect, useId, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { SelectField, TextareaField } from '../../components/FormField'
import { Switch } from '../../components/Switch'
import { useToast } from '../../components/Toast'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import type { ReceiptPaperSize, ReceiptSettings } from '../../types/api'
import type { SettingsSectionContext } from './SettingsPage'

const PAPER_SIZE_LABELS: Record<ReceiptPaperSize, string> = {
  A4: 'A4',
  A5: 'A5',
  THERMAL_80MM: 'Thermal 80mm',
  THERMAL_58MM: 'Thermal 58mm',
}

const EMPTY: ReceiptSettings = {
  showLogo: true,
  showClinicAddress: true,
  showClinicPhone: true,
  showDoctorName: true,
  showTax: true,
  showPaymentMethod: true,
  showPaymentHistory: true,
  paperSize: 'A4',
  footerText: '',
}

const TOGGLE_FIELDS: Array<{ key: keyof ReceiptSettings & string; label: string }> = [
  { key: 'showLogo', label: 'Show clinic logo' },
  { key: 'showClinicAddress', label: 'Show clinic address' },
  { key: 'showClinicPhone', label: 'Show clinic phone' },
  { key: 'showDoctorName', label: 'Show doctor name' },
  { key: 'showTax', label: 'Show tax information' },
  { key: 'showPaymentMethod', label: 'Show payment method' },
  { key: 'showPaymentHistory', label: 'Show payment history' },
]

export function ReceiptSettingsSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()

  const [form, setForm] = useState<ReceiptSettings>(EMPTY)
  const [saved, setSaved] = useState<ReceiptSettings>(EMPTY)

  useEffect(() => {
    if (!data) return
    setForm(data.receipt)
    setSaved(data.receipt)
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  const footerValid = form.footerText.length <= 300
  const hasErrors = !footerValid

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors) return
    update.mutate(
      { receipt: form },
      {
        onSuccess: (settings) => {
          setSaved(settings.receipt)
          setForm(settings.receipt)
          showToast('Receipt settings updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setForm(saved)
  }

  const paperSizeId = useId()
  const footerId = useId()

  if (isLoading) return <LoadingState label="Loading receipt settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load receipt settings')} />

  return (
    <Card>
      <CardHeader title="Receipt Settings" />
      <form onSubmit={handleSubmit} className="settings-form">
        <div className="settings-switch-grid">
          {TOGGLE_FIELDS.map(({ key, label }) => (
            <Switch
              key={key}
              id={`receipt-${key}`}
              checked={form[key] as boolean}
              onChange={(checked) => setForm((f) => ({ ...f, [key]: checked }))}
              label={label}
            />
          ))}
        </div>

        <SelectField
          id={paperSizeId}
          label="Receipt paper size"
          value={form.paperSize}
          onChange={(event) => setForm((f) => ({ ...f, paperSize: event.target.value as ReceiptPaperSize }))}
        >
          {(Object.keys(PAPER_SIZE_LABELS) as ReceiptPaperSize[]).map((size) => (
            <option key={size} value={size}>
              {PAPER_SIZE_LABELS[size]}
            </option>
          ))}
        </SelectField>

        <TextareaField
          id={footerId}
          label="Receipt footer text"
          value={form.footerText}
          onChange={(event) => setForm((f) => ({ ...f, footerText: event.target.value }))}
          error={!footerValid ? 'Must be at most 300 characters' : undefined}
          hint="Shown at the bottom of every printed receipt."
          rows={3}
        />

        <p className="settings-note">
          The patient's phone number is never printed on the receipt, regardless of these settings.
        </p>

        {update.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(update.error, 'Could not save receipt settings.')}
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
