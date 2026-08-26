import { fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../../App'
import { mockApi, renderWithProviders } from '../../test/testUtils'
import { DEFAULT_CLINIC_SETTINGS, DEFAULT_DISPLAY_SETTINGS, mergeClinicSettings } from '../../test/settingsFixtures'
import type { CurrentUser } from '../../types/api'

const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Settings — unsaved-changes navigation guard', () => {
  it('blocks switching sections when the user declines the confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'Unsaved Edit' } })

    fireEvent.click(screen.getByRole('link', { name: /billing/i }))

    expect(window.confirm).toHaveBeenCalled()
    // Declined — still on Clinic Information, with the edit intact.
    expect(screen.getByRole('heading', { name: 'Clinic Information' })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Unsaved Edit')).toBeInTheDocument()
  })

  it('allows switching sections once the user confirms leaving unsaved changes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'Unsaved Edit' } })

    fireEvent.click(screen.getByRole('link', { name: /billing/i }))

    expect(await screen.findByRole('heading', { name: 'Billing Settings' })).toBeInTheDocument()
  })

  it('does not prompt when navigating away from a clean (unedited) section', async () => {
    vi.spyOn(window, 'confirm')
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    await screen.findByRole('heading', { name: 'Clinic Information' })
    fireEvent.click(screen.getByRole('link', { name: /billing/i }))

    expect(await screen.findByRole('heading', { name: 'Billing Settings' })).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()
  })
})

describe('Settings — React Query cache propagation', () => {
  it('updates the Sidebar clinic name immediately after saving, with no page refresh', async () => {
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
    renderWithProviders(<App />, { route: '/settings/clinic' })

    expect(await screen.findByText('VMF HEALTH CARE')).toBeInTheDocument() // sidebar, pre-save

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'Riverside Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(screen.getByText('Riverside Clinic')).toBeInTheDocument())
    // The old brand name is gone from the sidebar without any reload —
    // proving the PATCH response updated the shared displaySettings cache.
    expect(screen.queryByText('VMF HEALTH CARE')).not.toBeInTheDocument()
  })
})
