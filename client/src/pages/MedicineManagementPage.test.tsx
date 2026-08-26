import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DEFAULT_DISPLAY_SETTINGS } from '../test/settingsFixtures'
import type { CurrentUser, Medicine } from '../types/api'

const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }
const RECEPTIONIST: CurrentUser = { id: 'recep-1', username: 'jane', role: 'receptionist', staffId: 'S1' }

afterEach(() => {
  vi.unstubAllGlobals()
})

function dolo(overrides: Partial<Medicine> = {}): Medicine {
  return {
    _id: 'med-1',
    category: 'MEDICINE',
    name: 'Dolo 500',
    brandName: 'Dolo',
    genericName: 'Paracetamol',
    composition: 'Paracetamol 500 mg',
    strength: '500 mg',
    billingUnit: 'tablet',
    volume: null,
    volumeUnit: null,
    mrpInPaise: 350,
    sellingPriceInPaise: 300,
    status: 'ACTIVE',
    createdBy: 'admin-1',
    updatedBy: null,
    createdAt: '2026-08-17T00:00:00.000Z',
    updatedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  }
}

function baseMocks(user: CurrentUser) {
  return [
    { method: 'GET', path: '/api/auth/me', respond: () => ({ body: user }) },
    { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
  ]
}

describe('MedicineManagementPage', () => {
  it('lists medicines for the active category tab', async () => {
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    expect(await screen.findByText('Dolo 500')).toBeInTheDocument()
    expect(screen.getByText('Paracetamol 500 mg')).toBeInTheDocument()
  })

  it('admin sees Edit, Disable, and Delete actions; receptionist sees none of them', async () => {
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^disable$/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^delete$/i })).toBeInTheDocument()
  })

  it('receptionist does not see Edit/Disable/Delete controls', async () => {
    mockApi([
      ...baseMocks(RECEPTIONIST),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    expect(screen.queryByRole('button', { name: /^edit$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^disable$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument()
    // Add New must still be available.
    expect(screen.getByRole('button', { name: /add new/i })).toBeInTheDocument()
  })

  it('switching category tabs re-fetches for the new category', async () => {
    let lastQuery = ''
    mockApi([
      ...baseMocks(ADMIN),
      {
        method: 'GET',
        path: /^\/api\/medicines\?/,
        respond: (_body, requestPath) => {
          lastQuery = requestPath ?? ''
          return { body: [] }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByRole('heading', { name: /medicine management/i })
    fireEvent.click(screen.getByRole('button', { name: /^fluids$/i }))

    await waitFor(() => expect(lastQuery).toContain('FLUID'))
  })

  it('lets a receptionist add a new medicine, which is immediately Active', async () => {
    let created: unknown
    mockApi([
      ...baseMocks(RECEPTIONIST),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [] }) },
      {
        method: 'POST',
        path: '/api/medicines',
        respond: (body) => {
          created = body
          return { status: 201, body: dolo({ status: 'ACTIVE' }) }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    fireEvent.click(await screen.findByRole('button', { name: /add new/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/product name/i), { target: { value: 'Dolo 500' } })
    fireEvent.change(within(dialog).getByLabelText(/generic name/i), { target: { value: 'Paracetamol' } })
    fireEvent.change(within(dialog).getByLabelText(/^composition/i), { target: { value: 'Paracetamol 500 mg' } })
    fireEvent.change(within(dialog).getByLabelText(/mrp/i), { target: { value: '3.50' } })
    fireEvent.change(within(dialog).getByLabelText(/selling price/i), { target: { value: '3.00' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /add medicine/i }))

    await waitFor(() => expect(created).toBeTruthy())
    expect(created).toMatchObject({ name: 'Dolo 500', genericName: 'Paracetamol', sellingPriceInPaise: 300 })
    expect(created).not.toHaveProperty('status')
  })

  it('requires volume and volumeUnit for a Fluid product', async () => {
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [] }) },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    fireEvent.click(await screen.findByRole('button', { name: /add new/i }))
    const dialog = await screen.findByRole('dialog')

    fireEvent.change(within(dialog).getByLabelText(/^category/i), { target: { value: 'FLUID' } })
    fireEvent.change(within(dialog).getByLabelText(/product name/i), { target: { value: 'Normal Saline' } })
    fireEvent.change(within(dialog).getByLabelText(/generic name/i), { target: { value: 'Sodium Chloride' } })
    fireEvent.change(within(dialog).getByLabelText(/^composition/i), { target: { value: 'Sodium Chloride 0.9%' } })
    fireEvent.change(within(dialog).getByLabelText(/mrp/i), { target: { value: '150' } })
    fireEvent.change(within(dialog).getByLabelText(/selling price/i), { target: { value: '120' } })

    // Volume/volumeUnit fields appear, and submit stays disabled until filled.
    const volumeField = within(dialog).getByLabelText(/^volume\s*\*?$/i)
    expect(volumeField).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: /add medicine/i })).toBeDisabled()

    fireEvent.change(volumeField, { target: { value: '500' } })
    fireEvent.change(within(dialog).getByLabelText(/volume unit/i), { target: { value: 'ml' } })
    expect(within(dialog).getByRole('button', { name: /add medicine/i })).toBeEnabled()
  })

  it('lets admin edit an existing medicine, pre-filled', async () => {
    let patched: unknown
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
      {
        method: 'PATCH',
        path: '/api/medicines/med-1',
        respond: (body) => {
          patched = body
          return { body: dolo({ sellingPriceInPaise: 320 }) }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    fireEvent.click(screen.getByRole('button', { name: /^edit$/i }))
    const dialog = await screen.findByRole('dialog')

    expect(within(dialog).getByLabelText(/product name/i)).toHaveValue('Dolo 500')
    fireEvent.change(within(dialog).getByLabelText(/selling price/i), { target: { value: '3.20' } })
    fireEvent.click(within(dialog).getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(patched).toMatchObject({ sellingPriceInPaise: 320 }))
  })

  it('lets admin disable a medicine after confirmation', async () => {
    let disabledStatus: unknown
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
      {
        method: 'PATCH',
        path: '/api/medicines/med-1/status',
        respond: (body) => {
          disabledStatus = body
          return { body: dolo({ status: 'INACTIVE' }) }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    fireEvent.click(screen.getByRole('button', { name: /^disable$/i }))

    const confirmDialog = await screen.findByRole('dialog')
    expect(within(confirmDialog).getByText(/no longer appear in billing search/i)).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^disable$/i }))

    await waitFor(() => expect(disabledStatus).toMatchObject({ status: 'INACTIVE' }))
  })

  it('lets admin permanently delete an unused medicine after confirmation', async () => {
    let deleted = false
    mockApi([
      ...baseMocks(ADMIN),
      {
        method: 'GET',
        path: /^\/api\/medicines\?/,
        respond: () => ({ body: deleted ? [] : [dolo()] }),
      },
      {
        method: 'DELETE',
        path: '/api/medicines/med-1',
        respond: () => {
          deleted = true
          return { status: 204, body: undefined }
        },
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    const confirmDialog = await screen.findByRole('dialog')
    expect(within(confirmDialog).getByText(/permanently deletes/i)).toBeInTheDocument()
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByText('Dolo 500')).not.toBeInTheDocument())
  })

  it('shows the server error and keeps the record when deleting a medicine used in a bill', async () => {
    mockApi([
      ...baseMocks(ADMIN),
      { method: 'GET', path: /^\/api\/medicines\?/, respond: () => ({ body: [dolo()] }) },
      {
        method: 'DELETE',
        path: '/api/medicines/med-1',
        respond: () => ({
          status: 409,
          body: { error: 'This medicine has been used in at least one bill and cannot be deleted. Disable it instead.' },
        }),
      },
    ])
    renderWithProviders(<App />, { route: '/medicines' })

    await screen.findByText('Dolo 500')
    fireEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    const confirmDialog = await screen.findByRole('dialog')
    fireEvent.click(within(confirmDialog).getByRole('button', { name: /^delete$/i }))

    expect(await within(confirmDialog).findByRole('alert')).toHaveTextContent(/used in at least one bill/i)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('Dolo 500')).toBeInTheDocument()
  })
})
