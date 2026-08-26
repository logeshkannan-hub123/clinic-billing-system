import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DashboardCard } from '../components/DashboardCard'
import { ErrorState, LoadingState, getErrorMessage } from '../components/Feedback'
import { PageHeader } from '../components/PageHeader'
import { formatPaise } from '../utils/money'
import { useDashboard } from '../hooks/useAdmin'
import type { BillStatus, DashboardSummary } from '../types/api'
import { todayIsoInKolkata } from '../utils/datetime'
import type { IconName } from '../components/icons'

const STATUS_CARDS: Array<{
  key: keyof Pick<DashboardSummary, 'pendingCount' | 'partiallyPaidCount' | 'paidCount' | 'cancelledCount'>
  label: string
  status: BillStatus
  tone: 'unpaid' | 'partial' | 'paid' | 'cancelled'
  icon: IconName
}> = [
  { key: 'pendingCount', label: 'Pending (Unpaid)', status: 'UNPAID', tone: 'unpaid', icon: 'alert-circle' },
  { key: 'partiallyPaidCount', label: 'Partially Paid', status: 'PARTIALLY_PAID', tone: 'partial', icon: 'clock' },
  { key: 'paidCount', label: 'Paid', status: 'PAID', tone: 'paid', icon: 'check-circle' },
  { key: 'cancelledCount', label: 'Cancelled', status: 'CANCELLED', tone: 'cancelled', icon: 'ban' },
]

export function DashboardPage() {
  const [date, setDate] = useState(todayIsoInKolkata())
  const navigate = useNavigate()
  const { data, isLoading, isError, error } = useDashboard(date)

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        subtitle="Today's clinic billing overview, in Asia/Kolkata time"
        actions={
          <label className="form-field form-field--inline">
            <span className="form-field__label">Date</span>
            <input
              type="date"
              className="input"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              max={todayIsoInKolkata()}
            />
          </label>
        }
      />

      {isLoading && <LoadingState label="Loading dashboard…" />}
      {isError && <ErrorState message={getErrorMessage(error, 'Could not load the dashboard')} />}

      {data && (
        <div className="dashboard-grid dashboard-grid--revenue">
          <DashboardCard tone="revenue" label="Revenue received" value={formatPaise(data.revenueInPaise)} icon="cash" />
          <DashboardCard
            label="Generated Bills"
            value={String(data.generatedCount)}
            icon="bills"
            onClick={() => navigate(`/bills?view=all&date=${date}`)}
          />
          {STATUS_CARDS.map((card) => (
            <DashboardCard
              key={card.key}
              tone={card.tone}
              icon={card.icon}
              label={card.label}
              value={String(data[card.key])}
              onClick={() => navigate(`/bills?status=${card.status}&date=${date}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
