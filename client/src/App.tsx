import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { setUnauthorizedHandler } from './api/client'
import { AppLayout } from './components/AppLayout'
import { LoadingState } from './components/Feedback'
import { ProtectedRoute } from './components/ProtectedRoute'
import { useCurrentUser } from './hooks/useAuth'
import { BillDetailPage } from './pages/BillDetailPage'
import { BillingPage } from './pages/BillingPage'
import { DashboardPage } from './pages/DashboardPage'
import { GeneratedBillsPage } from './pages/GeneratedBillsPage'
import { LoginPage } from './pages/LoginPage'
import { MedicineManagementPage } from './pages/MedicineManagementPage'
import { ReceptionistsPage } from './pages/ReceptionistsPage'
import { BillingSettingsSection } from './pages/settings/BillingSettingsSection'
import { ClinicInfoSection } from './pages/settings/ClinicInfoSection'
import { PatientSettingsSection } from './pages/settings/PatientSettingsSection'
import { PaymentSettingsSection } from './pages/settings/PaymentSettingsSection'
import { ReceiptSettingsSection } from './pages/settings/ReceiptSettingsSection'
import { RegionalSettingsSection } from './pages/settings/RegionalSettingsSection'
import { SecuritySettingsSection } from './pages/settings/SecuritySettingsSection'
import { SettingsPage } from './pages/settings/SettingsPage'
import { TaxSettingsPage } from './pages/TaxSettingsPage'

/** Lands the authenticated user on their role's default screen. */
function RoleHome() {
  const { data: user, isLoading } = useCurrentUser()

  if (isLoading) {
    return <LoadingState label="Loading…" />
  }

  return <Navigate to={user?.role === 'admin' ? '/dashboard' : '/bills'} replace />
}

/**
 * Centralized session-expiry handling — registers one handler (see
 * api/client.ts's `setUnauthorizedHandler`) that every API call funnels
 * through on an unexpected 401, instead of each page having to notice its
 * own query failed and react individually. Mounted once here, at the app
 * root, so it's active regardless of which route is showing.
 */
function useSessionExpiryHandler() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const locationRef = useRef(location)
  locationRef.current = location

  useEffect(() => {
    function handleUnauthorized() {
      // Already on /login: nothing to clear the user off of, and
      // re-navigating here on every one of possibly several simultaneous
      // 401s (e.g. three queries failing around the same moment) would just
      // spam history entries — this is what actually prevents a redirect
      // loop, not any state on the handler itself.
      if (locationRef.current.pathname === '/login') return
      queryClient.clear()
      navigate('/login', { replace: true })
    }

    setUnauthorizedHandler(handleUnauthorized)
    return () => setUnauthorizedHandler(null)
  }, [navigate, queryClient])
}

function App() {
  useSessionExpiryHandler()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<RoleHome />} />
        <Route
          path="dashboard"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <DashboardPage />
            </ProtectedRoute>
          }
        />
        <Route path="bills" element={<GeneratedBillsPage />} />
        <Route path="bills/new" element={<BillingPage />} />
        <Route path="bills/:id" element={<BillDetailPage />} />
        <Route path="medicines" element={<MedicineManagementPage />} />
        <Route
          path="receptionists"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <ReceptionistsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings/tax"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <TaxSettingsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="settings"
          element={
            <ProtectedRoute allowedRoles={['admin']}>
              <SettingsPage />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="clinic" replace />} />
          <Route path="clinic" element={<ClinicInfoSection />} />
          <Route path="billing" element={<BillingSettingsSection />} />
          <Route path="receipt" element={<ReceiptSettingsSection />} />
          <Route path="payments" element={<PaymentSettingsSection />} />
          <Route path="patients" element={<PatientSettingsSection />} />
          <Route path="regional" element={<RegionalSettingsSection />} />
          <Route path="security" element={<SecuritySettingsSection />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
