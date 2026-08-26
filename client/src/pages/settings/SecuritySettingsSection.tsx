import { useEffect, useId, useState, type FormEvent } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Button } from '../../components/Button'
import { Card, CardHeader } from '../../components/Card'
import { Dialog } from '../../components/Dialog'
import { ErrorState, LoadingState, getErrorMessage } from '../../components/Feedback'
import { TextField } from '../../components/FormField'
import { useToast } from '../../components/Toast'
import { useDeleteAdminAccount } from '../../hooks/useAuth'
import { useClinicSettings, useUpdateClinicSettings } from '../../hooks/useAdmin'
import type { SettingsSectionContext } from './SettingsPage'

const DEFAULT_TIMEOUT = '720'

/** Digits only. */
function sanitizeIntegerInput(value: string): string {
  return value.replace(/\D/g, '')
}

export function SecuritySettingsSection() {
  const { setDirty } = useOutletContext<SettingsSectionContext>()
  const { data, isLoading, isError, error } = useClinicSettings()
  const update = useUpdateClinicSettings()
  const { showToast } = useToast()
  const [isDeletingAccount, setIsDeletingAccount] = useState(false)

  const [timeoutInput, setTimeoutInput] = useState(DEFAULT_TIMEOUT)
  const [saved, setSaved] = useState(DEFAULT_TIMEOUT)

  useEffect(() => {
    if (!data) return
    const value = String(data.security.sessionTimeoutMinutes)
    setTimeoutInput(value)
    setSaved(value)
  }, [data])

  const isDirty = timeoutInput !== saved
  useEffect(() => setDirty(isDirty), [isDirty, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])

  const parsed = Number(timeoutInput)
  const timeoutValid = timeoutInput !== '' && Number.isInteger(parsed) && parsed >= 15 && parsed <= 1440
  const hasErrors = !timeoutValid

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (hasErrors) return
    update.mutate(
      { security: { sessionTimeoutMinutes: parsed } },
      {
        onSuccess: (settings) => {
          const value = String(settings.security.sessionTimeoutMinutes)
          setSaved(value)
          setTimeoutInput(value)
          showToast('Security settings updated.', 'success')
        },
      },
    )
  }

  function handleReset() {
    setTimeoutInput(saved)
  }

  const timeoutId = useId()

  if (isLoading) return <LoadingState label="Loading security settings…" />
  if (isError) return <ErrorState message={getErrorMessage(error, 'Could not load security settings')} />

  return (
    <>
      <Card>
        <CardHeader title="Security Settings" />
        <form onSubmit={handleSubmit} className="settings-form">
          <TextField
            id={timeoutId}
            label="Session timeout (minutes)"
            inputMode="numeric"
            value={timeoutInput}
            onChange={(event) => setTimeoutInput(sanitizeIntegerInput(event.target.value))}
            error={!timeoutValid ? 'Enter a whole number between 15 and 1440' : undefined}
            hint="How long a signed-in session lasts without activity, from 15 minutes to 24 hours. Takes effect on the next request after saving."
          />

          <div className="form-field">
            <span className="form-field__label">Login protection</span>
            <div className="settings-readonly-value">Always on — rate-limited login attempts</div>
            <span className="form-field__hint">
              Not configurable here — brute-force login protection is always active and can't be
              turned off from this screen.
            </span>
          </div>

          {update.isError && (
            <p className="inline-error" role="alert">
              {getErrorMessage(update.error, 'Could not save security settings.')}
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

      <Card>
        <CardHeader title="Danger Zone" />
        <div className="settings-form">
          <div className="form-field">
            <span className="form-field__label">Delete admin account</span>
            <span className="form-field__hint">
              Permanently deletes your admin account and signs you out. This cannot be undone, and
              this clinic will need first-time setup again to create a new admin. Existing bills and
              receptionist accounts are unaffected.
            </span>
          </div>
          <div className="settings-form__actions">
            <Button type="button" variant="destructive" onClick={() => setIsDeletingAccount(true)}>
              Delete Admin Account
            </Button>
          </div>
        </div>
      </Card>

      {isDeletingAccount && <DeleteAdminAccountDialog onClose={() => setIsDeletingAccount(false)} />}
    </>
  )
}

function DeleteAdminAccountDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const passwordFieldId = useId()
  const navigate = useNavigate()
  const deleteAccount = useDeleteAdminAccount()
  const [password, setPassword] = useState('')

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    deleteAccount.mutate(password, {
      onSuccess: () => navigate('/login', { replace: true }),
    })
  }

  return (
    <Dialog titleId={titleId} title="Delete admin account?" onClose={onClose}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <p>
          This permanently deletes your admin account and cannot be undone. Enter your password to
          confirm.
        </p>
        <TextField
          id={passwordFieldId}
          label="Password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
        {deleteAccount.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(deleteAccount.error, 'Could not delete this account. Please try again.')}
          </p>
        )}
        <div className="dialog__actions dialog__actions--destructive">
          <Button type="button" variant="outlined" onClick={onClose} disabled={deleteAccount.isPending}>
            Cancel
          </Button>
          <Button type="submit" variant="destructive" loading={deleteAccount.isPending} disabled={password.length === 0}>
            Delete Account
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
