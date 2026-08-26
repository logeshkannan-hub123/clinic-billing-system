import { fireEvent, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DEFAULT_DISPLAY_SETTINGS } from '../test/settingsFixtures'
import type { CurrentUser } from '../types/api'

const RECEPTIONIST: CurrentUser = { id: 'recep-1', username: 'jane', role: 'receptionist', staffId: 'S1' }
const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }

afterEach(() => {
  vi.unstubAllGlobals()
})

function baseMocks(user: CurrentUser) {
  return [
    { method: 'GET', path: '/api/auth/me', respond: () => ({ body: user }) },
    { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
  ] as const
}

describe('ChangePasswordDialog', () => {
  it('lets a receptionist change their own password', async () => {
    let captured: unknown
    mockApi([
      ...baseMocks(RECEPTIONIST),
      {
        method: 'PATCH',
        path: '/api/auth/password',
        respond: (body) => {
          captured = body
          return { status: 204, body: undefined }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/bills' })

    fireEvent.click(await screen.findByRole('button', { name: /change password/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/current password/i), { target: { value: 'oldpassword' } })
    fireEvent.change(within(dialog).getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.change(within(dialog).getByLabelText(/confirm new password/i), { target: { value: 'newpassword456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^change password$/i }))

    expect(await screen.findByText(/password changed/i)).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(captured).toEqual({ currentPassword: 'oldpassword', newPassword: 'newpassword456' })
  })

  it('shows a validation error and disables submit when the new passwords do not match', async () => {
    mockApi([...baseMocks(RECEPTIONIST)])
    renderWithProviders(<App />, { route: '/bills' })

    fireEvent.click(await screen.findByRole('button', { name: /change password/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/current password/i), { target: { value: 'oldpassword' } })
    fireEvent.change(within(dialog).getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.change(within(dialog).getByLabelText(/confirm new password/i), { target: { value: 'different' } })

    expect(within(dialog).getByText(/passwords do not match/i)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /^change password$/i })).toBeDisabled()
  })

  it('keeps the dialog open with an inline error when the current password is wrong', async () => {
    mockApi([
      ...baseMocks(RECEPTIONIST),
      {
        method: 'PATCH',
        path: '/api/auth/password',
        respond: () => ({ status: 401, body: { error: 'Current password is incorrect' } }),
      },
    ])
    renderWithProviders(<App />, { route: '/bills' })

    fireEvent.click(await screen.findByRole('button', { name: /change password/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/current password/i), { target: { value: 'wrongpassword' } })
    fireEvent.change(within(dialog).getByLabelText(/^new password/i), { target: { value: 'newpassword456' } })
    fireEvent.change(within(dialog).getByLabelText(/confirm new password/i), { target: { value: 'newpassword456' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /^change password$/i }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/current password is incorrect/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('is also available to an admin from the top bar', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: {
            date: '2026-08-16',
            revenueInPaise: 0,
            generatedCount: 0,
            paidCount: 0,
            pendingCount: 0,
            partiallyPaidCount: 0,
            cancelledCount: 0,
          },
        }),
      },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
    ])
    renderWithProviders(<App />, { route: '/' })

    fireEvent.click(await screen.findByRole('button', { name: /change password/i }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })
})
