import { ApiError } from '../api/client'
import { Icon } from './icons'

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="feedback feedback--loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

export function ErrorState({ message }: { message: string }) {
  return (
    <div className="feedback feedback--error" role="alert">
      <span className="feedback__icon">
        <Icon name="alert-circle" size={28} />
      </span>
      <span>{message}</span>
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="feedback feedback--empty">
      <span className="empty-illustration">
        <Icon name="inbox" size={26} />
      </span>
      <span>{message}</span>
    </div>
  )
}

export function getErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return fallback
}
