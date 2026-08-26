import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { mockApi, renderWithProviders } from './test/testUtils'
import { DEFAULT_CLINIC_SETTINGS, DEFAULT_DISPLAY_SETTINGS } from './test/settingsFixtures'
import type { Bill, CurrentUser } from './types/api'

const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }
const RECEPTIONIST: CurrentUser = { id: 'recep-1', username: 'jane', role: 'receptionist', staffId: 'S1' }

function mockSettingsEndpoints() {
  return [
    { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
    { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
  ] as const
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('redirects an unauthenticated visitor to the login screen', async () => {
    mockApi([{ method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Unauthenticated' } }) }])
    renderWithProviders(<App />, { route: '/dashboard' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('lands an authenticated admin on the dashboard and shows admin-only navigation', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: {
            date: '2026-08-16',
            revenueInPaise: 150000,
            generatedCount: 4,
            paidCount: 2,
            pendingCount: 1,
            partiallyPaidCount: 1,
            cancelledCount: 0,
          },
        }),
      },
    ])
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /receptionists/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /tax settings/i })).toBeInTheDocument()
  })

  it('lands an authenticated receptionist on Generated Bills and hides admin-only navigation', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
    ])
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Generated Bills' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /receptionists/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /tax settings/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Dashboard' })).not.toBeInTheDocument()
  })

  it('redirects a receptionist away from the admin-only dashboard route', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
    ])
    renderWithProviders(<App />, { route: '/dashboard' })

    expect(await screen.findByRole('heading', { name: 'Generated Bills' })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'Dashboard' })).not.toBeInTheDocument())
  })
})

describe('App — session expiry', () => {
  it('redirects to the login screen when an authenticated page\'s data request comes back 401 mid-session', async () => {
    // Simulates a session that was valid at page load but expired before the
    // bills list finished loading: /auth/me succeeds exactly once (the
    // initial ProtectedRoute check), then — like every other endpoint on a
    // truly dead session, including a re-fetch of /auth/me itself once the
    // handler clears the cache — starts 401ing.
    let meCallCount = 0
    mockApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        respond: () => {
          meCallCount += 1
          return meCallCount === 1 ? { body: RECEPTIONIST } : { status: 401, body: { error: 'Authentication required' } }
        },
      },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ status: 401, body: { error: 'Authentication required' } }) },
    ])
    renderWithProviders(<App />, { route: '/' })

    // Lands on Generated Bills first (ProtectedRoute's own /auth/me call
    // succeeded), then the page's own data request 401s and the global
    // handler takes over.
    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    // No redirect loop: settles on /login rather than bouncing back and forth.
    await waitFor(() => expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument())
  })

  it('does not redirect to login for a plain failed login attempt (401 is the expected response)', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ status: 401, body: { error: 'Authentication required' } }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: true } }) },
      { method: 'POST', path: '/api/auth/login', respond: () => ({ status: 401, body: { error: 'Invalid username or password' } }) },
    ])
    renderWithProviders(<App />, { route: '/login' })

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'doctor' } })
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: 'wrongpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /log in/i }))

    expect(await screen.findByText(/invalid username or password/i)).toBeInTheDocument()
    // Still on the login screen, showing the credential error — not bounced
    // through a clear-and-redirect cycle for an entirely expected 401.
    expect(screen.getByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })

  it('logging out still returns to the login screen even when the server logout call itself 401s', async () => {
    // Same realistic shape as the session-expiry test above: the session is
    // already dead by the time Log Out is clicked (the exact case this
    // protects — the user notices they're stuck and clicks Log Out to
    // recover), so /auth/me — the same dead session — 401s from then on too.
    let meCallCount = 0
    mockApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        respond: () => {
          meCallCount += 1
          return meCallCount === 1 ? { body: RECEPTIONIST } : { status: 401, body: { error: 'Authentication required' } }
        },
      },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
      { method: 'POST', path: '/api/auth/logout', respond: () => ({ status: 401, body: { error: 'Authentication required' } }) },
    ])
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Generated Bills' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /log out/i }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})

describe('Admin Settings — access and navigation', () => {
  it('shows a Settings nav link for an admin', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: { date: '2026-08-16', revenueInPaise: 0, generatedCount: 0, paidCount: 0, pendingCount: 0, partiallyPaidCount: 0, cancelledCount: 0 },
        }),
      },
      ...mockSettingsEndpoints(),
    ])
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /^settings$/i })).toBeInTheDocument()
  })

  it('does not show a Settings nav link for a receptionist', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
    ])
    renderWithProviders(<App />, { route: '/' })

    expect(await screen.findByRole('heading', { name: 'Generated Bills' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /^settings$/i })).not.toBeInTheDocument()
  })

  it('redirects /settings to /settings/clinic and shows the Clinic Information section for an admin', async () => {
    mockApi([{ method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) }, ...mockSettingsEndpoints()])
    renderWithProviders(<App />, { route: '/settings' })

    expect(await screen.findByRole('heading', { name: 'Clinic Information' })).toBeInTheDocument()
  })

  it('makes every settings section reachable, and links Tax out to the existing /settings/tax page', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      ...mockSettingsEndpoints(),
      { method: 'GET', path: '/api/admin/settings', respond: () => ({ body: { taxEnabled: false, taxRateBasisPoints: null } }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    expect(await screen.findByRole('heading', { name: 'Clinic Information' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /billing/i }))
    expect(await screen.findByRole('heading', { name: 'Billing Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /receipt/i }))
    expect(await screen.findByRole('heading', { name: 'Receipt Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /payments/i }))
    expect(await screen.findByRole('heading', { name: 'Payment Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /patients/i }))
    expect(await screen.findByRole('heading', { name: 'Patient Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /regional/i }))
    expect(await screen.findByRole('heading', { name: 'Regional Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /security/i }))
    expect(await screen.findByRole('heading', { name: 'Security Settings' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('link', { name: /^tax$/i }))
    expect(await screen.findByRole('heading', { name: 'Tax Settings' })).toBeInTheDocument()
  })

  it('redirects a receptionist away from every admin-only settings route', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    expect(await screen.findByRole('heading', { name: 'Generated Bills' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Security Settings' })).not.toBeInTheDocument()
  })
})

describe('Top bar page title', () => {
  it('shows "Create Bill" on /bills/new, not "Bill Detail" — /bills/new must not be swallowed by the generic /bills/:id pattern', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/bills/new' })

    await screen.findByRole('heading', { name: 'Create Bill' })
    expect(screen.getByText('Create Bill', { selector: '.topbar__title' })).toBeInTheDocument()
    expect(screen.queryByText('Bill Detail', { selector: '.topbar__title' })).not.toBeInTheDocument()
  })

  it('still shows "Bill Detail" for an actual bill-detail route', async () => {
    const bill: Bill = {
      _id: 'bill-1',
      billNumber: 'B-0001',
      patientId: 'patient-1',
      patientName: 'Asha Rao',
      patientPhone: '9876543210',
      items: [],
      consultationFeeInPaise: 0,
      subtotalInPaise: 0,
      taxEnabled: false,
      taxRateBasisPoints: null,
      taxAmountInPaise: 0,
      roundingAdjustmentInPaise: 0,
      grandTotalInPaise: 0,
      status: 'UNPAID',
      issuedAt: '2026-08-16T05:00:00.000Z',
      createdBy: 'admin-1',
      cancelledBy: null,
      cancelledAt: null,
      createdAt: '2026-08-16T05:00:00.000Z',
      updatedAt: '2026-08-16T05:00:00.000Z',
    }
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: RECEPTIONIST }) },
      { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: { bill, payments: [] } }) },
    ])
    renderWithProviders(<App />, { route: '/bills/bill-1' })

    expect(await screen.findByText('Bill Detail', { selector: '.topbar__title' })).toBeInTheDocument()
  })
})
