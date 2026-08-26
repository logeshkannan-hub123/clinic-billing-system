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

describe('BillingSettingsSection', () => {
  it('renders the invoice prefix, partial-payment, and duplicate-warning settings', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/billing' })

    expect(await screen.findByDisplayValue('INV')).toBeInTheDocument()
    expect(screen.getByText('Allow Partial Payments')).toBeInTheDocument()
    expect(screen.getByText('Duplicate Bill Warning')).toBeInTheDocument()
    const partialToggle = screen.getByLabelText(/allow partial payments/i) as HTMLInputElement
    const duplicateToggle = screen.getByLabelText(/duplicate bill warning/i) as HTMLInputElement
    expect(partialToggle.checked).toBe(true)
    expect(duplicateToggle.checked).toBe(true)
  })

  it('populates the default consultation fee from saved settings, formatted as rupees', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      {
        method: 'GET',
        path: '/api/admin/clinic-settings',
        respond: () => ({
          body: { ...DEFAULT_CLINIC_SETTINGS, billing: { ...DEFAULT_CLINIC_SETTINGS.billing, defaultConsultationFeeInPaise: 50000 } },
        }),
      },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/billing' })

    expect(await screen.findByDisplayValue('500.00')).toBeInTheDocument()
  })

  it('rejects an invalid invoice prefix client-side', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/billing' })

    const prefixField = await screen.findByLabelText(/invoice prefix/i)
    fireEvent.change(prefixField, { target: { value: 'inv-01' } })

    expect(await screen.findByText(/1-10 uppercase/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('toggles and saves duplicateWarningEnabled', async () => {
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
    renderWithProviders(<App />, { route: '/settings/billing' })

    const duplicateToggle = await screen.findByLabelText(/duplicate bill warning/i)
    fireEvent.click(duplicateToggle)
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/billing settings updated/i)).toBeInTheDocument()
    expect((screen.getByLabelText(/duplicate bill warning/i) as HTMLInputElement).checked).toBe(false)
  })
})
