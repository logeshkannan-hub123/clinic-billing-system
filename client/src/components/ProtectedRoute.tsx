import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useCurrentUser } from '../hooks/useAuth'
import type { UserRole } from '../types/api'
import { LoadingState } from './Feedback'

interface ProtectedRouteProps {
  children: ReactNode
  allowedRoles?: UserRole[]
}

/**
 * UI convenience only — hides pages the user's role shouldn't see. The
 * server's requireAuth/requireRole middleware is the real, unbypassable
 * enforcement; this never substitutes for it.
 */
export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
  const { data: user, isLoading, isError } = useCurrentUser()

  if (isLoading) {
    return <LoadingState label="Checking your session…" />
  }

  if (isError || !user) {
    return <Navigate to="/login" replace />
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/bills" replace />
  }

  return <>{children}</>
}
