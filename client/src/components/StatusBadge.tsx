import type { BillStatus } from '../types/api'

const LABELS: Record<BillStatus, string> = {
  UNPAID: 'Unpaid',
  PARTIALLY_PAID: 'Partially Paid',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
}

export function StatusBadge({ status }: { status: BillStatus }) {
  return (
    <span className={`status-badge status-badge--${status.toLowerCase()}`}>{LABELS[status]}</span>
  )
}
