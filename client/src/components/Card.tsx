import type { ReactNode } from 'react'

interface CardProps {
  children: ReactNode
  className?: string
  padded?: boolean
}

export function Card({ children, className = '', padded = true }: CardProps) {
  return <div className={`card${padded ? ' card--padded' : ''} ${className}`.trim()}>{children}</div>
}

interface CardHeaderProps {
  title: string
  actions?: ReactNode
}

export function CardHeader({ title, actions }: CardHeaderProps) {
  return (
    <div className="card__header">
      <h2 className="card__title">{title}</h2>
      {actions}
    </div>
  )
}
