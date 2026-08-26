import { useEffect, useId, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { SelectField, TextField } from '../../components/FormField'
import { useToast } from '../../components/Toast'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import type { DateFormat, RegionalSettings, TimeFormat } from '../../types/api'
import type { SettingsSectionContext } from './SettingsPage'

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  'DD/MM/YYYY': 'DD/MM/YYYY',
  'MM/DD/YYYY': 'MM/DD/YYYY',
  'YYYY-MM-DD': 'YYYY-MM-DD',
}

const TIME_FORMAT_LABELS: Record<TimeFormat, string> = {
  '12h': '12-hour',
  '24h': '24-hour',
}

const EMPTY: RegionalSettings = { currencySymbol: '₹', dateFormat: 'DD/MM/YYYY', timeFormat: '12h' }

export function RegionalSettingsSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()

  const [form, setForm] = useState<RegionalSettings>(EMPTY)
  const [saved, setSaved] = useState<RegionalSettings>(EMPTY)

  useEffect(() => {
    if (!data) return
    setForm(data.regional)
    setSaved(data.regional)
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  const symbolValid = form.currencySymbol.length >= 1 && form.currencySymbol.length <= 5
  const hasErrors = !symbolValid

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors) return
    update.mutate(
      { regional: form },
      {
        onSuccess: (settings) => {
          setSaved(settings.regional)
          setForm(settings.regional)
          showToast('Regional settings updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setForm(saved)
  }

  const symbolId = useId()
  const dateFormatId = useId()
  const timeFormatId = useId()

  if (isLoading) return <LoadingState label="Loading regional settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load regional settings')} />

  return (
    <Card>
      <CardHeader title="Regional Settings" />
      <form onSubmit={handleSubmit} className="settings-form">
        <div className="form-grid">
          <div className="form-field">
            <span className="form-field__label">Timezone</span>
            <div className="settings-readonly-value">Asia/Kolkata</div>
            <span className="form-field__hint">
              Fixed — every date/time in this app is calculated and reported in Indian Standard Time.
            </span>
          </div>
          <div className="form-field">
            <span className="form-field__label">Currency</span>
            <div className="settings-readonly-value">INR</div>
            <span className="form-field__hint">Fixed — all amounts are stored and billed in Indian Rupees.</span>
          </div>
        </div>

        <div className="form-grid">
          <TextField
            id={symbolId}
            label="Currency symbol"
            value={form.currencySymbol}
            onChange={(event) => setForm((f) => ({ ...f, currencySymbol: event.target.value }))}
            error={!symbolValid ? '1-5 characters' : undefined}
            hint="Cosmetic only — shown before every amount."
          />
          <SelectField
            id={dateFormatId}
            label="Date format"
            value={form.dateFormat}
            onChange={(event) => setForm((f) => ({ ...f, dateFormat: event.target.value as DateFormat }))}
          >
            {(Object.keys(DATE_FORMAT_LABELS) as DateFormat[]).map((format) => (
              <option key={format} value={format}>
                {DATE_FORMAT_LABELS[format]}
              </option>
            ))}
          </SelectField>
          <SelectField
            id={timeFormatId}
            label="Time format"
            value={form.timeFormat}
            onChange={(event) => setForm((f) => ({ ...f, timeFormat: event.target.value as TimeFormat }))}
          >
            {(Object.keys(TIME_FORMAT_LABELS) as TimeFormat[]).map((format) => (
              <option key={format} value={format}>
                {TIME_FORMAT_LABELS[format]}
              </option>
            ))}
          </SelectField>
        </div>

        {update.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(update.error, 'Could not save regional settings.')}
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
