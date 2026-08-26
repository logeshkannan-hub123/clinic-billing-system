import { useEffect, useId, useState, type FormEvent } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { TextField } from '../../components/FormField'
import { useToast } from '../../components/Toast'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import type { ClinicInfoSettings } from '../../types/api'
import { isValidEmail, isValidHttpUrl } from '../../utils/settingsValidation'
import type { SettingsSectionContext } from './SettingsPage'

const EMPTY: ClinicInfoSettings = {
  name: '',
  doctorName: '',
  logoUrl: null,
  phone: '',
  email: '',
  website: '',
  address: '',
  registrationNumber: '',
  gstNumber: '',
}

export function ClinicInfoSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()

  const [form, setForm] = useState<ClinicInfoSettings>(EMPTY)
  const [saved, setSaved] = useState<ClinicInfoSettings>(EMPTY)
  const [logoFailed, setLogoFailed] = useState(false)

  useEffect(() => {
    if (!data) return
    setForm(data.clinic)
    setSaved(data.clinic)
  }, [data])

  const isDirty = JSON.stringify(form) !== JSON.stringify(saved)
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  function set<K extends keyof ClinicInfoSettings>(key: K, value: ClinicInfoSettings[K]) {
    setForm((current) => ({ ...current, [key]: value }))
  }

  const errors: Partial<Record<keyof ClinicInfoSettings, string>> = {
    name: form.name.length > 200 ? 'Must be at most 200 characters' : undefined,
    doctorName: form.doctorName.length > 150 ? 'Must be at most 150 characters' : undefined,
    phone: form.phone.length > 30 ? 'Must be at most 30 characters' : undefined,
    // Length caps mirror the server's own limits (routes/adminClinicSettings.ts)
    // — previously only the format was checked client-side, so an
    // over-length value showed no inline error here and only failed after
    // a round trip to the server.
    email:
      form.email !== '' && !isValidEmail(form.email)
        ? 'Enter a valid email address'
        : form.email.length > 200
          ? 'Must be at most 200 characters'
          : undefined,
    website:
      form.website !== '' && !isValidHttpUrl(form.website)
        ? 'Enter a valid http(s) URL'
        : form.website.length > 500
          ? 'Must be at most 500 characters'
          : undefined,
    logoUrl:
      form.logoUrl !== null && !isValidHttpUrl(form.logoUrl)
        ? 'Enter a valid http(s) URL'
        : (form.logoUrl?.length ?? 0) > 500
          ? 'Must be at most 500 characters'
          : undefined,
    address: form.address.length > 500 ? 'Must be at most 500 characters' : undefined,
    registrationNumber: form.registrationNumber.length > 50 ? 'Must be at most 50 characters' : undefined,
    gstNumber: form.gstNumber.length > 50 ? 'Must be at most 50 characters' : undefined,
  }
  const hasErrors = Object.values(errors).some(Boolean)

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors) return
    update.mutate(
      { clinic: form },
      {
        onSuccess: (settings) => {
          setSaved(settings.clinic)
          setForm(settings.clinic)
          showToast('Clinic information updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setForm(saved)
  }

  const nameId = useId()
  const doctorId = useId()
  const phoneId = useId()
  const emailId = useId()
  const websiteId = useId()
  const regId = useId()
  const gstId = useId()
  const addressId = useId()
  const logoId = useId()

  if (isLoading) return <LoadingState label="Loading clinic settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load clinic settings')} />

  return (
    <Card>
      <CardHeader title="Clinic Information" />
      <form onSubmit={handleSubmit} className="settings-form">
        <div className="form-grid">
          <TextField
            id={nameId}
            label="Clinic name"
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
            error={errors.name}
            required
          />
          <TextField
            id={doctorId}
            label="Doctor name"
            value={form.doctorName}
            onChange={(event) => set('doctorName', event.target.value)}
            error={errors.doctorName}
          />
          <TextField
            id={phoneId}
            label="Clinic phone"
            value={form.phone}
            onChange={(event) => set('phone', event.target.value)}
            error={errors.phone}
          />
          <TextField
            id={emailId}
            label="Email"
            type="email"
            value={form.email}
            onChange={(event) => set('email', event.target.value)}
            error={errors.email}
          />
          <TextField
            id={websiteId}
            label="Website"
            value={form.website}
            onChange={(event) => set('website', event.target.value)}
            error={errors.website}
            placeholder="https://…"
          />
          <TextField
            id={regId}
            label="Registration number"
            value={form.registrationNumber}
            onChange={(event) => set('registrationNumber', event.target.value)}
            error={errors.registrationNumber}
          />
          <TextField
            id={gstId}
            label="GST number"
            value={form.gstNumber}
            onChange={(event) => set('gstNumber', event.target.value)}
            error={errors.gstNumber}
          />
        </div>

        <TextField
          id={addressId}
          label="Address"
          value={form.address}
          onChange={(event) => set('address', event.target.value)}
          error={errors.address}
          hint="Shown on the receipt when enabled"
        />

        <div>
          <TextField
            id={logoId}
            label="Logo URL"
            value={form.logoUrl ?? ''}
            onChange={(event) => {
              const value = event.target.value.trim()
              set('logoUrl', value === '' ? null : event.target.value)
              setLogoFailed(false)
            }}
            error={errors.logoUrl}
            placeholder="https://…"
            hint="A direct http(s) link to an image — no file upload."
          />
          {form.logoUrl && isValidHttpUrl(form.logoUrl) && !logoFailed && (
            <div className="settings-logo-preview">
              <img
                src={form.logoUrl}
                alt="Clinic logo preview"
                onError={() => setLogoFailed(true)}
              />
            </div>
          )}
          {form.logoUrl && isValidHttpUrl(form.logoUrl) && logoFailed && (
            <p className="settings-logo-preview__error">Couldn't load an image from this URL.</p>
          )}
        </div>

        {update.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(update.error, 'Could not save clinic information.')}
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
