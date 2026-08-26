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

const TOGGLE_LABELS = [
  'Show clinic logo',
  'Show clinic address',
  'Show clinic phone',
  'Show doctor name',
  'Show tax information',
  'Show payment method',
  'Show payment history',
]

describe('ReceiptSettingsSection', () => {
  it('renders every show* toggle, the paper size selector, and the footer field', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/receipt' })

    await screen.findByRole('heading', { name: 'Receipt Settings' })
    for (const label of TOGGLE_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
    expect(screen.getByLabelText(/paper size/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/footer text/i)).toBeInTheDocument()
    expect(screen.getByText(/never printed on the receipt/i)).toBeInTheDocument()
  })

  it('changes the paper size and saves it', async () => {
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
    renderWithProviders(<App />, { route: '/settings/receipt' })

    const paperSize = await screen.findByLabelText(/paper size/i)
    fireEvent.change(paperSize, { target: { value: 'THERMAL_80MM' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/receipt settings updated/i)).toBeInTheDocument()
    expect(saved.receipt.paperSize).toBe('THERMAL_80MM')
  })

  it('saves footer text', async () => {
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
    renderWithProviders(<App />, { route: '/settings/receipt' })

    const footer = await screen.findByLabelText(/footer text/i)
    fireEvent.change(footer, { target: { value: 'Thank you for visiting!' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/receipt settings updated/i)).toBeInTheDocument()
    expect(saved.receipt.footerText).toBe('Thank you for visiting!')
  })

  it('rejects footer text over 300 characters client-side', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/receipt' })

    const footer = await screen.findByLabelText(/footer text/i)
    fireEvent.change(footer, { target: { value: 'x'.repeat(301) } })

    expect(await screen.findByText(/at most 300 characters/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('toggling showLogo off is reflected in the switch state', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/receipt' })

    const showLogo = (await screen.findByLabelText(/show clinic logo/i)) as HTMLInputElement
    expect(showLogo.checked).toBe(true)
    fireEvent.click(showLogo)
    expect(showLogo.checked).toBe(false)
  })
})
