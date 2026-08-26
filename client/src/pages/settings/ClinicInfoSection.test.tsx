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
})

describe('ClinicInfoSection', () => {
  it('loads and displays the current clinic information', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    expect(await screen.findByDisplayValue('VMF HEALTH CARE')).toBeInTheDocument()
  })

  it('shows the loading state, then an error state if the settings fail to load', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ status: 500, body: { error: 'boom' } }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('edits and saves the clinic name, showing a success toast and updating the cache', async () => {
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

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'Downtown Clinic' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/clinic information updated/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Downtown Clinic')).toBeInTheDocument()
  })

  it('shows an inline validation error and disables Save for an invalid email', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const emailField = await screen.findByLabelText(/email/i)
    fireEvent.change(emailField, { target: { value: 'not-an-email' } })

    expect(await screen.findByText(/valid email address/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('shows an inline length error and disables Save for a website URL over the server\'s 500-character limit', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const websiteField = await screen.findByLabelText(/website/i)
    const tooLong = `https://example.com/${'a'.repeat(500)}`
    fireEvent.change(websiteField, { target: { value: tooLong } })

    expect(await screen.findByText(/at most 500 characters/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('keeps the form editable and shows the server error when saving fails', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      { method: 'PATCH', path: '/api/admin/clinic-settings', respond: () => ({ status: 500, body: { error: 'Internal server error' } }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'New Name' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByDisplayValue('New Name')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).not.toBeDisabled()
  })

  it('shows a logo preview for a valid http(s) URL and a safe fallback when the image fails to load', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const logoField = await screen.findByLabelText(/logo url/i)
    fireEvent.change(logoField, { target: { value: 'https://example.com/logo.png' } })

    const preview = await screen.findByAltText('Clinic logo preview')
    expect(preview).toHaveAttribute('src', 'https://example.com/logo.png')

    fireEvent.error(preview)
    expect(await screen.findByText(/couldn't load an image/i)).toBeInTheDocument()
    expect(screen.queryByAltText('Clinic logo preview')).not.toBeInTheDocument()
  })

  it('rejects a non-http(s) logo URL client-side', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const logoField = await screen.findByLabelText(/logo url/i)
    fireEvent.change(logoField, { target: { value: 'javascript:alert(1)' } })

    expect(await screen.findByText(/valid http\(s\) url/i)).toBeInTheDocument()
    expect(screen.queryByAltText('Clinic logo preview')).not.toBeInTheDocument()
  })

  it('Reset restores the last saved values without submitting', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/clinic' })

    const nameField = await screen.findByLabelText(/clinic name/i)
    fireEvent.change(nameField, { target: { value: 'Something Else' } })
    expect(screen.getByRole('button', { name: /reset/i })).not.toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /reset/i }))
    await waitFor(() => expect(screen.getByDisplayValue('VMF HEALTH CARE')).toBeInTheDocument())
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })
})
