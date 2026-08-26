import { formatPaise } from '../utils/money'

type CurrencySize = 'sm' | 'md' | 'lg' | 'xl'
type CurrencyTone = 'default' | 'muted' | 'positive' | 'due'

interface CurrencyDisplayProps {
  paise: number
  size?: CurrencySize
  tone?: CurrencyTone
  className?: string
}

/** Renders a server-computed paise amount for display only — never derives it. */
export function CurrencyDisplay({ paise, size = 'md', tone = 'default', className = '' }: CurrencyDisplayProps) {
  const classes = [
    'currency',
    size !== 'md' ? `currency--${size}` : '',
    tone !== 'default' ? `currency--${tone}` : '',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return <span className={classes}>{formatPaise(paise)}</span>
}
