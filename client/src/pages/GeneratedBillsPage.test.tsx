import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { GeneratedBillsPage } from './GeneratedBillsPage'
import type { BillListItem, BillStatus } from '../types/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function bill(id: string, status: BillStatus, dueAmountInPaise: number): BillListItem {
  return {
    _id: id,
    billNumber: `B-000${id}`,
    patientId: `patient-${id}`,
    patientName: `Patient ${id}`,
    patientPhone: '9876543210',
    items: [],
    consultationFeeInPaise: 0,
    subtotalInPaise: 1000,
    taxEnabled: false,
    taxRateBasisPoints: null,
    taxAmountInPaise: 0,
    roundingAdjustmentInPaise: 0,
    grandTotalInPaise: 1000,
    status,
    issuedAt: '2026-08-16T05:15:00.000Z',
    createdBy: 'admin-1',
    cancelledBy: null,
    cancelledAt: null,
    createdAt: '2026-08-16T05:15:00.000Z',
    updatedAt: '2026-08-16T05:15:00.000Z',
    dueAmountInPaise,
  }
}

const ALL_BILLS: BillListItem[] = [
  bill('1', 'UNPAID', 1000),
  bill('2', 'PARTIALLY_PAID', 400),
  bill('3', 'PAID', 0),
  bill('4', 'CANCELLED', 1000),
]

function renderPage(route = '/bills') {
  mockApi([
    {
      method: 'GET',
      path: /^\/api\/bills/,
      respond: () => ({ body: { bills: ALL_BILLS, total: ALL_BILLS.length } }),
    },
  ])
  return renderWithProviders(
    <Routes>
      <Route path="/bills" element={<GeneratedBillsPage />} />
    </Routes>,
    { route },
  )
}

describe('GeneratedBillsPage', () => {
  it('defaults to showing only UNPAID and PARTIALLY_PAID bills, excluding PAID and CANCELLED', async () => {
    renderPage()

    expect(await screen.findByText('B-0001')).toBeInTheDocument()
    expect(screen.getByText('B-0002')).toBeInTheDocument()
    expect(screen.queryByText('B-0003')).not.toBeInTheDocument()
    expect(screen.queryByText('B-0004')).not.toBeInTheDocument()
  })

  it('reveals PAID and CANCELLED bills once "All statuses" is selected, keeping history searchable', async () => {
    renderPage()
    await screen.findByText('B-0001')

    fireEvent.change(screen.getByDisplayValue(/active \(unpaid \+ partial\)/i), { target: { value: 'all' } })

    await waitFor(() => expect(screen.getByText('B-0003')).toBeInTheDocument())
    expect(screen.getByText('B-0004')).toBeInTheDocument()
  })

  it('honors a status passed in via the URL (dashboard card click-through)', async () => {
    renderPage('/bills?status=PAID')

    await waitFor(() => expect(screen.getByDisplayValue('Paid')).toBeInTheDocument())
  })

  it('shows the server-computed due amount for UNPAID and PARTIALLY_PAID bills', async () => {
    renderPage()
    await screen.findByText('B-0001')

    const row1 = screen.getByText('B-0001').closest('tr')!
    expect(row1.querySelector('.currency--due')).toHaveTextContent('₹10.00')

    const row2 = screen.getByText('B-0002').closest('tr')!
    expect(row2.querySelector('.currency--due')).toHaveTextContent('₹4.00')
  })

  it('does not show a due amount for PAID or CANCELLED bills, even though the field is present', async () => {
    renderPage()
    await screen.findByText('B-0001')
    fireEvent.change(screen.getByDisplayValue(/active \(unpaid \+ partial\)/i), { target: { value: 'all' } })
    await screen.findByText('B-0003')

    const paidRow = screen.getByText('B-0003').closest('tr')!
    const cancelledRow = screen.getByText('B-0004').closest('tr')!
    expect(paidRow).toHaveTextContent('—')
    expect(cancelledRow).toHaveTextContent('—')
  })

  it('paginates rather than rendering an unbounded table, and preserves the active filter across pages', async () => {
    const seenSkips: Array<string | null> = []
    mockApi([
      {
        method: 'GET',
        path: /^\/api\/bills/,
        respond: (_body, requestPath) => {
          const params = new URLSearchParams((requestPath ?? '').split('?')[1] ?? '')
          seenSkips.push(params.get('skip'))
          return { body: { bills: ALL_BILLS, total: 120, status: params.get('status') } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills" element={<GeneratedBillsPage />} />
      </Routes>,
      { route: '/bills' },
    )

    await screen.findByText('B-0001')
    expect(screen.getByText(/1–50 of 120/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeDisabled()

    fireEvent.click(screen.getByRole('button', { name: /^next$/i }))

    await waitFor(() => expect(seenSkips.at(-1)).toBe('50'))
    expect(await screen.findByText(/51–100 of 120/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /previous/i })).toBeEnabled()

    // Changing the filter resets back to page 1 rather than staying on a
    // now-meaningless skip offset for the new (possibly much smaller) result set.
    fireEvent.change(screen.getByDisplayValue(/active \(unpaid \+ partial\)/i), { target: { value: 'all' } })
    await waitFor(() => expect(seenSkips.at(-1)).toBe('0'))
  })

  it('shows both date and time for each bill, not date only', async () => {
    renderPage()
    await screen.findByText('B-0001')

    // issuedAt is 05:15 UTC = 10:45 IST — a bare date string wouldn't include this.
    const row1 = within(screen.getByText('B-0001').closest('tr')!)
    expect(row1.getByText(/10:45/)).toBeInTheDocument()
  })
})
