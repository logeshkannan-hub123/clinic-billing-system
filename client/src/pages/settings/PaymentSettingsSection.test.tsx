import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { mockApi, renderWithProviders } from '../../test/testUtils'
import { DEFAULT_CLINIC_SETTINGS, DEFAULT_DISPLAY_SETTINGS, mergeClinicSettings } from '../../test/settingsFixtures'
import type { CurrentUser } from '../../types/api'

const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('PaymentSettingsSection', () => {
  it('renders Cash and UPI toggles, both enabled by default, and no card/bank-transfer controls', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/payments' })

    const cash = (await screen.findByLabelText(/^cash/i)) as HTMLInputElement
    const upi = screen.getByLabelText(/^upi/i) as HTMLInputElement
    expect(cash.checked).toBe(true)
    expect(upi.checked).toBe(true)
    // "Card"/"bank transfer" may appear in explanatory copy (they aren't
    // available yet), but there must be no actual control for either.
    expect(screen.queryByLabelText(/^card$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^bank transfer$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^card/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /^bank transfer/i })).not.toBeInTheDocument()
  })

  it('disables Save and shows an inline message when both methods would be turned off', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/payments' })

    fireEvent.click(await screen.findByLabelText(/^cash/i))
    fireEvent.click(screen.getByLabelText(/^upi/i))

    expect(await screen.findByText(/at least one payment method must stay enabled/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('saves disabling UPI while cash stays enabled', async () => {
    let saved = DEFAULT_CLINIC_SETTINGS
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: saved }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      {
        method: 'PATCH',
        path: '/api/admin/clinic-settings',
        respond: (body) => {
          saved = mergeClinicSettings(saved, body as never)
          return { body: saved }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/settings/payments' })

    fireEvent.click(await screen.findByLabelText(/^upi/i))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/payment settings updated/i)).toBeInTheDocument()
    expect(saved.payments).toEqual({ cashEnabled: true, upiEnabled: false })
  })

  it('surfaces a backend rejection rather than failing silently', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      {
        method: 'PATCH',
        path: '/api/admin/clinic-settings',
        respond: () => ({ status: 400, body: { error: 'At least one payment method (cash or UPI) must remain enabled' } }),
      },
    ])
    renderWithProviders(<App />, { route: '/settings/payments' })

    fireEvent.click(await screen.findByLabelText(/^upi/i))
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/must remain enabled/i)).toBeInTheDocument()
  })
})
