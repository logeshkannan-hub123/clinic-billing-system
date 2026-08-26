import { fireEvent, screen, within } from '@testing-library/react'
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

describe('SecuritySettingsSection', () => {
  it('renders the current session timeout and login protection as always-on, read-only', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    expect(await screen.findByDisplayValue('720')).toBeInTheDocument()
    expect(screen.getByText(/always on/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/login protection enabled/i)).not.toBeInTheDocument()
  })

  it('rejects a session timeout below 15 minutes', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    const timeoutField = await screen.findByLabelText(/session timeout/i)
    fireEvent.change(timeoutField, { target: { value: '5' } })

    expect(await screen.findByText(/between 15 and 1440/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('rejects a session timeout above 1440 minutes', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    const timeoutField = await screen.findByLabelText(/session timeout/i)
    fireEvent.change(timeoutField, { target: { value: '5000' } })

    expect(await screen.findByText(/between 15 and 1440/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('saves a valid session timeout', async () => {
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
    renderWithProviders(<App />, { route: '/settings/security' })

    const timeoutField = await screen.findByLabelText(/session timeout/i)
    fireEvent.change(timeoutField, { target: { value: '30' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/security settings updated/i)).toBeInTheDocument()
    expect(saved.security.sessionTimeoutMinutes).toBe(30)
  })

  it('cancels out of the delete-account confirmation without deleting anything', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    fireEvent.click(await screen.findByRole('button', { name: /delete admin account/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(within(dialog).getByRole('button', { name: /cancel/i }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /security settings/i })).toBeInTheDocument()
  })

  it('shows an inline error and keeps the dialog open for an incorrect password', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      { method: 'DELETE', path: '/api/admin/account', respond: () => ({ status: 401, body: { error: 'Incorrect password' } }) },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    fireEvent.click(await screen.findByRole('button', { name: /delete admin account/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'wrongpassword' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete account$/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/incorrect password/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('deletes the admin account with the correct password and returns to the login screen', async () => {
    let deleted = false
    mockApi([
      {
        method: 'GET',
        path: '/api/auth/me',
        respond: () => (deleted ? { status: 401, body: { error: 'Unauthenticated' } } : { body: ADMIN }),
      },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      { method: 'GET', path: '/api/auth/setup-status', respond: () => ({ body: { adminExists: !deleted } }) },
      {
        method: 'DELETE',
        path: '/api/admin/account',
        respond: () => {
          deleted = true
          return { status: 204, body: undefined }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/settings/security' })

    fireEvent.click(await screen.findByRole('button', { name: /delete admin account/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByLabelText(/password/i), { target: { value: 'password123' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^delete account$/i }))

    expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument()
  })
})
