import { NavLink } from 'react-router-dom'
import { CLINIC_MARK, CLINIC_NAME } from '../constants/clinic'
import type { UserRole } from '../types/api'
import { Icon } from './icons'

interface SidebarProps {
  role: UserRole
  isOpen: boolean
  onNavigate: () => void
  /** Live clinic name from Settings; falls back to the static constant while
   * loading or before an Admin has configured one. */
  clinicName?: string
}

export function Sidebar({ role, isOpen, onNavigate, clinicName = CLINIC_NAME }: SidebarProps) {
  return (
    <nav className={`sidebar${isOpen ? ' is-open' : ''}`} aria-label="Primary">
      <div className="sidebar__brand">
        <span className="sidebar__brand-mark" aria-hidden="true">
          {CLINIC_MARK}
        </span>
        <span className="sidebar__brand-text">
          <span className="sidebar__brand-name">{clinicName}</span>
          <span className="sidebar__brand-tagline">Reception workstation</span>
        </span>
      </div>

      <div className="sidebar__nav">
        {role === 'admin' && (
          <NavLink to="/dashboard" className="sidebar__link" onClick={onNavigate}>
            <Icon name="dashboard" size={19} />
            Dashboard
          </NavLink>
        )}
        <NavLink to="/bills" end className="sidebar__link" onClick={onNavigate}>
          <Icon name="bills" size={19} />
          Generated Bills
        </NavLink>
        <NavLink to="/bills/new" className="sidebar__link" onClick={onNavigate}>
          <Icon name="plus" size={19} />
          New Bill
        </NavLink>
        <NavLink to="/medicines" className="sidebar__link" onClick={onNavigate}>
          <Icon name="pill" size={19} />
          Medicines
        </NavLink>
      </div>

      {role === 'admin' && (
        <>
          <span className="sidebar__section-label">Administration</span>
          <div className="sidebar__nav">
            <NavLink to="/receptionists" className="sidebar__link" onClick={onNavigate}>
              <Icon name="users" size={19} />
              Receptionists
            </NavLink>
            <NavLink to="/settings" className="sidebar__link" onClick={onNavigate}>
              <Icon name="settings" size={19} />
              Settings
            </NavLink>
            <NavLink to="/settings/tax" className="sidebar__link" onClick={onNavigate}>
              <Icon name="percent" size={19} />
              Tax Settings
            </NavLink>
          </div>
        </>
      )}

      <div className="sidebar__spacer" />
    </nav>
  )
}
