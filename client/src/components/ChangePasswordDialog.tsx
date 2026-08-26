import { useId, useState, type FormEvent } from 'react'
import { useChangePassword } from '../hooks/useAuth'
import { Button } from './Button'
import { Dialog } from './Dialog'
import { getErrorMessage } from './Feedback'
import { TextField } from './FormField'
import { useToast } from './Toast'

const MIN_PASSWORD_LENGTH = 8

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const currentFieldId = useId()
  const newFieldId = useId()
  const confirmFieldId = useId()
  const { showToast } = useToast()
  const changePassword = useChangePassword()

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const newPasswordTooShort = newPassword.length > 0 && newPassword.length < MIN_PASSWORD_LENGTH
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== newPassword
  const canSubmit =
    currentPassword.length > 0 && newPassword.length >= MIN_PASSWORD_LENGTH && newPassword === confirmPassword

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          showToast('Password changed.', 'success')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog titleId={titleId} title="Change password" onClose={onClose}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <TextField
          id={currentFieldId}
          label="Current password"
          type="password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          autoComplete="current-password"
          autoFocus
          required
        />
        <TextField
          id={newFieldId}
          label="New password"
          type="password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          autoComplete="new-password"
          error={newPasswordTooShort ? `Must be at least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          required
        />
        <TextField
          id={confirmFieldId}
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          autoComplete="new-password"
          error={confirmMismatch ? 'Passwords do not match' : undefined}
          required
        />
        {changePassword.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(changePassword.error, 'Could not change your password.')}
          </p>
        )}
        <div className="dialog__actions">
          <Button type="button" variant="outlined" onClick={onClose} disabled={changePassword.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={changePassword.isPending} disabled={!canSubmit}>
            Change Password
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
