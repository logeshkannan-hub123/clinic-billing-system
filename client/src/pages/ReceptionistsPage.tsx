import { useId, useState, type FormEvent } from 'react'
import { Button } from '../components/Button'
import { ConfirmationDialog } from '../components/ConfirmationDialog'
import { DataTable, type DataTableColumn } from '../components/DataTable'
import { Dialog } from '../components/Dialog'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { TextField } from '../components/FormField'
import { PageHeader } from '../components/PageHeader'
import { useToast } from '../components/Toast'
import {
  useCreateReceptionist,
  useDeleteReceptionist,
  useReceptionists,
  useResetReceptionistPassword,
  useSetReceptionistActive,
} from '../hooks/useAdmin'
import type { ReceptionistListItem } from '../types/api'
import { formatDateIst } from '../utils/datetime'

export function ReceptionistsPage() {
  const { data, isLoading, isError, error } = useReceptionists()
  const [isCreating, setIsCreating] = useState(false)
  const [togglingTarget, setTogglingTarget] = useState<ReceptionistListItem | null>(null)
  const [resettingTarget, setResettingTarget] = useState<ReceptionistListItem | null>(null)
  const [deletingTarget, setDeletingTarget] = useState<ReceptionistListItem | null>(null)

  const setActive = useSetReceptionistActive()
  const deleteReceptionist = useDeleteReceptionist()

  function startToggle(receptionist: ReceptionistListItem) {
    setActive.reset()
    setTogglingTarget(receptionist)
  }

  function cancelToggle() {
    setActive.reset()
    setTogglingTarget(null)
  }

  function confirmToggle() {
    if (!togglingTarget) return
    // Only close the dialog on confirmed success — a failed request leaves
    // it open with an inline error so the admin never mistakes "the request
    // failed" for "access was revoked."
    setActive.mutate(
      { id: togglingTarget._id, isActive: !togglingTarget.isActive },
      { onSuccess: () => setTogglingTarget(null) },
    )
  }

  function startDelete(receptionist: ReceptionistListItem) {
    deleteReceptionist.reset()
    setDeletingTarget(receptionist)
  }

  function cancelDelete() {
    deleteReceptionist.reset()
    setDeletingTarget(null)
  }

  function confirmDelete() {
    if (!deletingTarget) return
    deleteReceptionist.mutate(deletingTarget._id, { onSuccess: () => setDeletingTarget(null) })
  }

  const columns: DataTableColumn<ReceptionistListItem>[] = [
    { key: 'staffId', header: 'Staff ID', render: (r) => r.staffId },
    { key: 'username', header: 'Username', render: (r) => r.username },
    {
      key: 'isActive',
      header: 'Status',
      render: (r) => (
        <span className={`status-badge status-badge--${r.isActive ? 'paid' : 'cancelled'}`}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    { key: 'createdAt', header: 'Added', render: (r) => formatDateIst(r.createdAt) },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (r) => (
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <Button size="sm" variant="outlined" onClick={() => setResettingTarget(r)}>
            Reset Password
          </Button>
          <Button size="sm" variant={r.isActive ? 'destructive' : 'tonal'} onClick={() => startToggle(r)}>
            {r.isActive ? 'Deactivate' : 'Activate'}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => startDelete(r)}>
            Delete
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="page">
      <PageHeader
        title="Receptionist Management"
        subtitle="Create and manage receptionist accounts for this clinic"
        actions={<Button onClick={() => setIsCreating(true)}>Add Receptionist</Button>}
      />

      {isLoading && <LoadingState label="Loading receptionists…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load receptionists')} />}

      {data && (
        <DataTable columns={columns} rows={data} getRowKey={(r) => r._id} emptyMessage="No receptionists yet — add the first one." />
      )}

      {isCreating && <CreateReceptionistDialog onClose={() => setIsCreating(false)} />}

      {togglingTarget && (
        <ConfirmationDialog
          title={togglingTarget.isActive ? 'Deactivate receptionist?' : 'Activate receptionist?'}
          description={
            togglingTarget.isActive
              ? `${togglingTarget.username} will no longer be able to log in or create bills. Their existing bills remain unaffected.`
              : `${togglingTarget.username} will regain access to log in and create bills.`
          }
          confirmLabel={togglingTarget.isActive ? 'Deactivate' : 'Activate'}
          destructive={togglingTarget.isActive}
          loading={setActive.isPending}
          error={
            setActive.isError
              ? getErrorMessage(setActive.error, 'Could not update this account. Please try again.')
              : undefined
          }
          onConfirm={confirmToggle}
          onCancel={cancelToggle}
        />
      )}

      {resettingTarget && <ResetPasswordDialog target={resettingTarget} onClose={() => setResettingTarget(null)} />}

      {deletingTarget && (
        <ConfirmationDialog
          title="Delete receptionist?"
          description={`This permanently deletes ${deletingTarget.username}'s account. This cannot be undone. Their existing bills remain unaffected. If you may want this account back later, deactivate it instead.`}
          confirmLabel="Delete"
          destructive
          loading={deleteReceptionist.isPending}
          error={
            deleteReceptionist.isError
              ? getErrorMessage(deleteReceptionist.error, 'Could not delete this account. Please try again.')
              : undefined
          }
          onConfirm={confirmDelete}
          onCancel={cancelDelete}
        />
      )}
    </div>
  )
}

// Mirrors the server's own minimums (routes/adminReceptionists.ts,
// auth/password.ts) — client-side validation is a UX convenience, never
// the authority; the server re-validates everything sent here regardless.
const MIN_USERNAME_LENGTH = 3
const MIN_PASSWORD_LENGTH = 8

function CreateReceptionistDialog({ onClose }: { onClose: () => void }) {
  const titleId = useId()
  const staffIdField = useId()
  const usernameField = useId()
  const passwordField = useId()
  const confirmField = useId()
  const { showToast } = useToast()
  const createReceptionist = useCreateReceptionist()

  const [staffId, setStaffId] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const usernameTooShort = username.trim().length > 0 && username.trim().length < MIN_USERNAME_LENGTH
  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password
  const canSubmit =
    staffId.trim().length > 0 &&
    username.trim().length >= MIN_USERNAME_LENGTH &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirmPassword

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    createReceptionist.mutate(
      { staffId, username, password },
      {
        onSuccess: () => {
          showToast('Receptionist created.', 'success')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog titleId={titleId} title="Add Receptionist" onClose={onClose}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <TextField id={staffIdField} label="Staff ID" value={staffId} onChange={(e) => setStaffId(e.target.value)} required autoFocus />
        <TextField
          id={usernameField}
          label="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="off"
          error={usernameTooShort ? `Must be at least ${MIN_USERNAME_LENGTH} characters` : undefined}
          required
        />
        <TextField
          id={passwordField}
          label="Temporary password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          error={passwordTooShort ? `Must be at least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          required
        />
        <TextField
          id={confirmField}
          label="Confirm temporary password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          error={confirmMismatch ? 'Passwords do not match' : undefined}
          required
        />
        {createReceptionist.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(createReceptionist.error, 'Could not create the receptionist.')}
          </p>
        )}
        <div className="dialog__actions">
          <Button type="button" variant="outlined" onClick={onClose} disabled={createReceptionist.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={createReceptionist.isPending} disabled={!canSubmit}>
            Create Account
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function ResetPasswordDialog({ target, onClose }: { target: ReceptionistListItem; onClose: () => void }) {
  const titleId = useId()
  const passwordField = useId()
  const confirmField = useId()
  const { showToast } = useToast()
  const resetPassword = useResetReceptionistPassword()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const passwordTooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
  const confirmMismatch = confirmPassword.length > 0 && confirmPassword !== password
  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && password === confirmPassword

  function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!canSubmit) return
    resetPassword.mutate(
      { id: target._id, password },
      {
        onSuccess: () => {
          showToast(`Password reset for ${target.username}.`, 'success')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog titleId={titleId} title={`Reset password — ${target.username}`} onClose={onClose}>
      <form className="dialog__body" onSubmit={handleSubmit} noValidate>
        <TextField
          id={passwordField}
          label="New password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          autoFocus
          error={passwordTooShort ? `Must be at least ${MIN_PASSWORD_LENGTH} characters` : undefined}
          required
        />
        <TextField
          id={confirmField}
          label="Confirm new password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          error={confirmMismatch ? 'Passwords do not match' : undefined}
          required
        />
        {resetPassword.isError && (
          <p className="inline-error" role="alert">
            {getErrorMessage(resetPassword.error, 'Could not reset the password.')}
          </p>
        )}
        <div className="dialog__actions">
          <Button type="button" variant="outlined" onClick={onClose} disabled={resetPassword.isPending}>
            Cancel
          </Button>
          <Button type="submit" loading={resetPassword.isPending} disabled={!canSubmit}>
            Reset Password
          </Button>
        </div>
      </form>
    </Dialog>
  )
}
