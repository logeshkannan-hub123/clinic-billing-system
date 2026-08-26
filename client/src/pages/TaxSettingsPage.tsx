import { useEffect, useId, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { Card } from '../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { TextField } from '../components/FormField'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import { useTaxSettings, useUpdateTaxSettings } from '../hooks/useAdmin'
import { sanitizeDecimalInput } from '../utils/money'

export function TaxSettingsPage() {
  const { data, isLoading, isError, error } = useTaxSettings()
  const update = useUpdateTaxSettings()
  const { showToast } = useToast()
  const checkboxId = useId()
  const rateId = useId()

  const [taxEnabled, setTaxEnabled] = useState(false)
  const [ratePercentInput, setRatePercentInput] = useState('0')

  useEffect(() => {
    if (!data) return
    setTaxEnabled(data.taxEnabled)
    setRatePercentInput(data.taxRateBasisPoints !== null ? (data.taxRateBasisPoints / 100).toString() : '0')
  }, [data])

  const parsedRate = Number.parseFloat(ratePercentInput)
  const rateValid = !taxEnabled || (Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 100)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!rateValid) return
    update.mutate(
      {
        taxEnabled,
        taxRateBasisPoints: taxEnabled ? Math.round(parsedRate * 100) : null,
      },
      {
        onSuccess: () => showToast('Tax settings updated.', 'success'),
      },
    )
  }

  return (
    <div className="page">
      <PageHeader title="Tax Settings" subtitle="Controls whether tax is applied to bills created from now on" />

      {isLoading && <LoadingState label="Loading tax settings…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load tax settings')} />}

      {data && (
        <Card>
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', maxWidth: 380 }}>
            <label className="checkbox-field">
              <input
                id={checkboxId}
                type="checkbox"
                checked={taxEnabled}
                onChange={(event) => setTaxEnabled(event.target.checked)}
              />
              Apply tax to new bills
            </label>

            {taxEnabled && (
              <TextField
                id={rateId}
                label="Tax rate (%)"
                inputMode="decimal"
                value={ratePercentInput}
                onChange={(event) => setRatePercentInput(sanitizeDecimalInput(event.target.value))}
                error={!rateValid ? 'Enter a rate between 0 and 100.' : undefined}
                hint="Applies to the subtotal (medicines + consultation fee)."
              />
            )}

            {update.isError && (
              <p className="inline-error" role="alert">
                {getErrorMessage(update.error, 'Could not save tax settings.')}
              </p>
            )}

            <Button type="submit" loading={update.isPending} disabled={!rateValid}>
              Save Settings
            </Button>
          </form>
        </Card>
      )}
    </div>
  )
}
