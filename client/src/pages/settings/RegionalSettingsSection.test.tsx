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

describe('RegionalSettingsSection', () => {
  it('shows timezone and currency as fixed, read-only text', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/regional' })

    await screen.findByRole('heading', { name: 'Regional Settings' })
    expect(screen.getByText('Asia/Kolkata')).toBeInTheDocument()
    expect(screen.getByText('INR')).toBeInTheDocument()
    // Fixed values are plain text, not editable form controls.
    expect(screen.queryByRole('textbox', { name: /timezone/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: /^currency$/i })).not.toBeInTheDocument()
  })

  it('changes and saves the date format', async () => {
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
    renderWithProviders(<App />, { route: '/settings/regional' })

    const dateFormat = await screen.findByLabelText(/date format/i)
    fireEvent.change(dateFormat, { target: { value: 'YYYY-MM-DD' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/regional settings updated/i)).toBeInTheDocument()
    expect(saved.regional.dateFormat).toBe('YYYY-MM-DD')
  })

  it('changes and saves the time format', async () => {
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
    renderWithProviders(<App />, { route: '/settings/regional' })

    const timeFormat = await screen.findByLabelText(/time format/i)
    fireEvent.change(timeFormat, { target: { value: '24h' } })
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }))

    expect(await screen.findByText(/regional settings updated/i)).toBeInTheDocument()
    expect(saved.regional.timeFormat).toBe('24h')
  })

  it('rejects a currency symbol outside 1-5 characters', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/admin/clinic-settings', respond: () => ({ body: DEFAULT_CLINIC_SETTINGS }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/settings/regional' })

    const symbolField = await screen.findByLabelText(/currency symbol/i)
    fireEvent.change(symbolField, { target: { value: 'TOOLONG' } })

    expect(await screen.findByText(/1-5 characters/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })
})
