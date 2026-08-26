import type { CurrentUser } from '../types/api'
import { IconButton } from './Button'
import { Icon } from './icons'

interface TopBarProps {
  title: string
  user: CurrentUser | undefined
  onMenuClick: () => void
  onChangePassword: () => void
  onLogout: () => void
  loggingOut: boolean
}

export function TopBar({ title, user, onMenuClick, onChangePassword, onLogout, loggingOut }: TopBarProps) {
  return (
    <header className="topbar">
      <div className="topbar__start">
        <span className="topbar__menu-button">
          <IconButton label="Open navigation" onClick={onMenuClick}>
            <Icon name="menu" size={20} />
          </IconButton>
        </span>
        <span className="topbar__title">{title}</span>
      </div>
      <div className="topbar__end">
        {user && (
          <span className="topbar__user">
            <span className="topbar__username">{user.username}</span>
            <span className="topbar__role">{user.role}</span>
          </span>
        )}
        <IconButton label="Change password" onClick={onChangePassword}>
          <Icon name="key" size={19} />
        </IconButton>
        <IconButton label="Log out" onClick={onLogout} disabled={loggingOut}>
          <Icon name="logout" size={19} />
        </IconButton>
      </div>
    </header>
  )
}
