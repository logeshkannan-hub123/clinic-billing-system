import { useId } from 'react'
import { Button } from './Button'
import { Dialog } from './Dialog'

interface ConfirmationDialogProps {
  title: string
  description: string
  confirmLabel?: string
  cancelLabel?: string
  destructive?: boolean
  loading?: boolean
  /** Shown inline and keeps the dialog open — the caller is responsible for
   * NOT closing the dialog on a failed mutation; this component never closes
   * itself. */
  error?: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmationDialog({
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive,
  loading,
  error,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  const titleId = useId()

  return (
    <Dialog titleId={titleId} title={title} onClose={onCancel}>
      <div className="dialog__body">
        <p>{description}</p>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className={`dialog__actions${destructive ? ' dialog__actions--destructive' : ''}`}>
        <Button variant="outlined" onClick={onCancel} disabled={loading}>
          {cancelLabel}
        </Button>
        <Button variant={destructive ? 'destructive' : 'filled'} onClick={onConfirm} loading={loading}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  )
}
