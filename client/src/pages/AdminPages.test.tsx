import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { ReceptionistsPage } from './ReceptionistsPage'
import { TaxSettingsPage } from './TaxSettingsPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ReceptionistsPage', () => {
  it('lists receptionists and creates a new one', async () => {
    let created: unknown
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }] }),
      },
      {
        method: 'POST',
        path: '/api/admin/receptionists',
        respond: (body) => {
          created = body
          return { status: 201, body: { id: 'r2', username: 'raj', staffId: 'S2', isActive: true } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    expect(await screen.findByText('jane')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /add receptionist/i }))
    fireEvent.change(screen.getByLabelText(/staff id/i), { target: { value: 'S2' } })
    fireEvent.change(screen.getByLabelText(/^username/i), { target: { value: 'raj' } })
    fireEvent.change(screen.getByLabelText(/^temporary password/i), { target: { value: 'temp1234' } })
    fireEvent.change(screen.getByLabelText(/confirm temporary password/i), { target: { value: 'temp1234' } })
    fireEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => expect(created).toMatchObject({ staffId: 'S2', username: 'raj' }))
  })

  it('keeps Create Account disabled until staff id, username, and matching passwords are all valid', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [] }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /add receptionist/i }))
    const submit = screen.getByRole('button', { name: /create account/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/staff id/i), { target: { value: 'S2' } })
    fireEvent.change(screen.getByLabelText(/^username/i), { target: { value: 'ra' } }) // too short
    fireEvent.change(screen.getByLabelText(/^temporary password/i), { target: { value: 'temp1234' } })
    fireEvent.change(screen.getByLabelText(/confirm temporary password/i), { target: { value: 'temp1234' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/must be at least 3 characters/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^username/i), { target: { value: 'raj' } })
    fireEvent.change(screen.getByLabelText(/confirm temporary password/i), { target: { value: 'mismatch1' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/confirm temporary password/i), { target: { value: 'temp1234' } })
    expect(submit).toBeEnabled()
  })

  it('keeps Reset Password disabled until the new password meets the minimum length and both entries match', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }] }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /reset password/i }))
    const dialog = screen.getByRole('dialog')
    const submit = within(dialog).getByRole('button', { name: /^reset password$/i })
    expect(submit).toBeDisabled()

    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'short' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/must be at least 8 characters/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/^new password/i), { target: { value: 'longenough1' } })
    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'different1' } })
    expect(submit).toBeDisabled()
    expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText(/confirm new password/i), { target: { value: 'longenough1' } })
    expect(submit).toBeEnabled()
  })

  it('asks for confirmation before deactivating an account', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }] }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /deactivate/i }))

    expect(await screen.findByText(/no longer be able to log in/i)).toBeInTheDocument()
  })

  it('keeps the confirmation dialog open with an error when deactivation fails, and only closes on a successful retry', async () => {
    let attempt = 0
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }] }),
      },
      {
        method: 'PATCH',
        path: '/api/admin/receptionists/r1',
        respond: () => {
          attempt += 1
          if (attempt === 1) {
            return { status: 500, body: { error: 'Internal server error' } }
          }
          return { body: { id: 'r1', staffId: 'S1', username: 'jane', isActive: false } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /deactivate/i }))
    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn--destructive')!)

    // Dialog stays open and shows the server's sanitized error message — it
    // must never just vanish, leaving the admin unsure whether it worked.
    const dialog = await screen.findByRole('dialog')
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
    // The receptionist must still show as Active — the failed request never
    // took effect, and the UI must not imply otherwise.
    expect(within(dialog).getByText(/deactivate receptionist/i)).toBeInTheDocument()

    // Retry succeeds — dialog closes.
    fireEvent.click(dialog.querySelector('button.btn--destructive')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('asks for confirmation before permanently deleting an account, and removes it from the list on success', async () => {
    let receptionists = [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }]
    mockApi([
      { method: 'GET', path: '/api/admin/receptionists', respond: () => ({ body: receptionists }) },
      {
        method: 'DELETE',
        path: '/api/admin/receptionists/r1',
        respond: () => {
          receptionists = []
          return { status: 204, body: undefined }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText(/permanently deletes/i)).toBeInTheDocument()

    fireEvent.click(dialog.querySelector('button.btn--destructive')!)

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.queryByText('jane')).not.toBeInTheDocument()
  })

  it('keeps the delete confirmation dialog open with an error when deletion fails', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/admin/receptionists',
        respond: () => ({ body: [{ _id: 'r1', staffId: 'S1', username: 'jane', isActive: true, createdAt: '2026-08-16T00:00:00.000Z' }] }),
      },
      { method: 'DELETE', path: '/api/admin/receptionists/r1', respond: () => ({ status: 500, body: { error: 'Internal server error' } }) },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/receptionists" element={<ReceptionistsPage />} />
      </Routes>,
      { route: '/receptionists' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /^delete$/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog.querySelector('button.btn--destructive')!)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('jane')).toBeInTheDocument()
  })
})

describe('TaxSettingsPage', () => {
  it('loads the active tax configuration and saves an updated rate', async () => {
    let saved: unknown
    mockApi([
      { method: 'GET', path: '/api/admin/settings', respond: () => ({ body: { taxEnabled: true, taxRateBasisPoints: 500 } }) },
      {
        method: 'PATCH',
        path: '/api/admin/settings',
        respond: (body) => {
          saved = body
          return { body }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/settings/tax" element={<TaxSettingsPage />} />
      </Routes>,
      { route: '/settings/tax' },
    )

    const rateField = await screen.findByLabelText(/tax rate/i)
    expect(rateField).toHaveValue('5')

    fireEvent.change(rateField, { target: { value: '8.5' } })
    fireEvent.click(screen.getByRole('button', { name: /save settings/i }))

    await waitFor(() => expect(saved).toMatchObject({ taxEnabled: true, taxRateBasisPoints: 850 }))
  })

  it('strips non-numeric characters from the tax rate field as the user types', async () => {
    mockApi([
      { method: 'GET', path: '/api/admin/settings', respond: () => ({ body: { taxEnabled: true, taxRateBasisPoints: 500 } }) },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/settings/tax" element={<TaxSettingsPage />} />
      </Routes>,
      { route: '/settings/tax' },
    )

    const rateField = await screen.findByLabelText(/tax rate/i)

    fireEvent.change(rateField, { target: { value: 'ab12.5.6cd' } })
    expect(rateField).toHaveValue('12.56')

    fireEvent.change(rateField, { target: { value: '18%' } })
    expect(rateField).toHaveValue('18')
  })
})
