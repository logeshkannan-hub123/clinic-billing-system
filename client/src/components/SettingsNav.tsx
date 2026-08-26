import type { MouseEvent } from 'react'
import { NavLink } from 'react-router-dom'
import { Icon, type IconName } from './icons'

interface SettingsNavItem {
  to: string
  label: string
  icon: IconName
}

const ITEMS: SettingsNavItem[] = [
  { to: '/settings/clinic', label: 'Clinic', icon: 'settings' },
  { to: '/settings/billing', label: 'Billing', icon: 'bills' },
  { to: '/settings/receipt', label: 'Receipt', icon: 'receipt' },
  { to: '/settings/payments', label: 'Payments', icon: 'wallet' },
  { to: '/settings/patients', label: 'Patients', icon: 'user' },
  { to: '/settings/regional', label: 'Regional', icon: 'globe' },
  { to: '/settings/security', label: 'Security', icon: 'shield' },
  // Tax stays its own pre-existing page (docs/architecture/admin-settings.md:
  // "Tax configuration is managed separately") — a plain link out of this
  // nested route tree, not one of the section routes above.
  { to: '/settings/tax', label: 'Tax', icon: 'percent' },
]

interface SettingsNavProps {
  /** When true, clicking a different section asks for confirmation first —
   * see useUnsavedChangesGuard.ts for why this is a click-intercept rather
   * than React Router's useBlocker (this app doesn't use a data router). */
  isDirty: boolean
  confirmNavigation: () => boolean
}

export function SettingsNav({ isDirty, confirmNavigation }: SettingsNavProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    if (isDirty && !confirmNavigation()) {
      event.preventDefault()
    }
  }

  return (
    <nav className="settings-nav" aria-label="Settings sections">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="settings-nav__link"
          onClick={handleClick}
          end
        >
          <Icon name={item.icon} size={18} />
          {item.label}
        </NavLink>
      ))}
    </nav>
  )
}
