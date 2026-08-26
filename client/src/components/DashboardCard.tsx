import type { IconName } from './icons'
import { Icon } from './icons'

interface DashboardCardProps {
  label: string
  value: string
  icon?: IconName
  tone?: 'revenue' | 'unpaid' | 'partial' | 'paid' | 'cancelled' | 'default'
  onClick?: () => void
  description?: string
}

export function DashboardCard({ label, value, icon, tone = 'default', onClick, description }: DashboardCardProps) {
  const classes = ['stat-card', tone !== 'default' ? `stat-card--${tone}` : '', onClick ? 'stat-card--clickable' : '']
    .filter(Boolean)
    .join(' ')

  const content = (
    <>
      <div className="stat-card__top">
        <span className="stat-card__label">{label}</span>
        {icon && (
          <span className="stat-card__icon">
            <Icon name={icon} size={18} />
          </span>
        )}
      </div>
      <span className="stat-card__value">{value}</span>
      {description && <span className="text-muted">{description}</span>}
    </>
  )

  if (onClick) {
    return (
      <button type="button" className={classes} onClick={onClick}>
        {content}
      </button>
    )
  }

  return <div className={classes}>{content}</div>
}
