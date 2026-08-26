import { useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router-dom'
import { CLINIC_NAME } from '../constants/clinic'
import { useDisplaySettings } from '../hooks/useAdmin'
import { useCurrentUser, useLogout } from '../hooks/useAuth'
import { ChangePasswordDialog } from './ChangePasswordDialog'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'

const TITLES: Array<{ prefix: string; title: string }> = [
  { prefix: '/dashboard', title: 'Dashboard' },
  { prefix: '/bills/new', title: 'Create Bill' },
  { prefix: '/bills', title: 'Generated Bills' },
  { prefix: '/medicines', title: 'Medicine Management' },
  { prefix: '/receptionists', title: 'Receptionist Management' },
  { prefix: '/settings/tax', title: 'Tax Settings' },
  { prefix: '/settings', title: 'Settings' },
]

function titleForPath(pathname: string): string {
  // /bills/new is a literal route (see TITLES below), not a :id param — must
  // be excluded here or it matches this generic bill-detail pattern first.
  const billDetailId = /^\/bills\/([^/]+)$/.exec(pathname)?.[1]
  if (billDetailId && billDetailId !== 'new') return 'Bill Detail'
  const match = TITLES.find((entry) => pathname.startsWith(entry.prefix))
  return match?.title ?? CLINIC_NAME
}

/** Authenticated application shell: left navigation rail + top bar + content outlet. */
export function AppLayout() {
  const { data: user } = useCurrentUser()
  const logoutMutation = useLogout()
  const navigate = useNavigate()
  const location = useLocation()
  const [isSidebarOpen, setSidebarOpen] = useState(false)
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  // Live clinic branding once Settings has loaded; the static constant is the
  // loading/fallback value, never a network dependency for first paint.
  const { data: displaySettings } = useDisplaySettings()
  const clinicName = displaySettings?.clinic.name ?? CLINIC_NAME

  function handleLogout() {
    // onSettled (not onSuccess): the user must land back on /login whether
    // the server-side logout call succeeded or failed — e.g. it 401s because
    // the session was already expired, which is exactly the situation
    // "Log Out" needs to recover from, not get stuck on.
    logoutMutation.mutate(undefined, {
      onSettled: () => navigate('/login', { replace: true }),
    })
  }

  if (!user) {
    return null
  }

  return (
    <div className="app-shell">
      <Sidebar
        role={user.role}
        isOpen={isSidebarOpen}
        onNavigate={() => setSidebarOpen(false)}
        clinicName={clinicName}
      />
      <div className={`sidebar-backdrop${isSidebarOpen ? ' is-open' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="app-shell__main">
        <TopBar
          title={titleForPath(location.pathname)}
          user={user}
          onMenuClick={() => setSidebarOpen((open) => !open)}
          onChangePassword={() => setIsChangingPassword(true)}
          onLogout={handleLogout}
          loggingOut={logoutMutation.isPending}
        />
        <div className="app-shell__content">
          <Outlet />
        </div>
      </div>
      {isChangingPassword && <ChangePasswordDialog onClose={() => setIsChangingPassword(false)} />}
    </div>
  )
}
