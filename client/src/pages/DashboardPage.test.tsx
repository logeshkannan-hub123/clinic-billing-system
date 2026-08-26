import { fireEvent, screen } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DashboardPage } from './DashboardPage'
import { GeneratedBillsPage } from './GeneratedBillsPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DashboardPage', () => {
  it('renders revenue and every status count from the dashboard endpoint, formatted as currency', async () => {
    mockApi([
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: {
            date: '2026-08-16',
            revenueInPaise: 543210,
            generatedCount: 12,
            paidCount: 5,
            pendingCount: 4,
            partiallyPaidCount: 2,
            cancelledCount: 1,
          },
        }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
      </Routes>,
      { route: '/dashboard' },
    )

    expect(await screen.findByText('₹5,432.10')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('5')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByText('1')).toBeInTheDocument()
  })

  it('navigates to the filtered Generated Bills view when a status card is clicked', async () => {
    mockApi([
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: {
            date: '2026-08-16',
            revenueInPaise: 0,
            generatedCount: 0,
            paidCount: 0,
            pendingCount: 3,
            partiallyPaidCount: 0,
            cancelledCount: 0,
          },
        }),
      },
      { method: 'GET', path: /^\/api\/bills/, respond: () => ({ body: { bills: [], total: 0 } }) },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bills" element={<div>Filtered Bills Landing</div>} />
      </Routes>,
      { route: '/dashboard' },
    )

    fireEvent.click(await screen.findByText('Pending (Unpaid)'))

    expect(await screen.findByText('Filtered Bills Landing')).toBeInTheDocument()
  })

  it('navigates to Generated Bills showing every status when the Generated Bills card is clicked', async () => {
    mockApi([
      {
        method: 'GET',
        path: /^\/api\/admin\/dashboard/,
        respond: () => ({
          body: {
            date: '2026-08-16',
            revenueInPaise: 0,
            generatedCount: 1,
            paidCount: 1,
            pendingCount: 0,
            partiallyPaidCount: 0,
            cancelledCount: 0,
          },
        }),
      },
      {
        method: 'GET',
        path: /^\/api\/bills/,
        respond: () => ({
          body: {
            bills: [
              {
                _id: 'bill-1',
                billNumber: 'B-0001',
                patientId: 'patient-1',
                patientName: 'Paid Patient',
                patientPhone: '9876543210',
                items: [],
                consultationFeeInPaise: 0,
                subtotalInPaise: 1000,
                taxEnabled: false,
                taxRateBasisPoints: null,
                taxAmountInPaise: 0,
                roundingAdjustmentInPaise: 0,
                grandTotalInPaise: 1000,
                status: 'PAID',
                issuedAt: '2026-08-16T05:00:00.000Z',
                createdBy: 'admin-1',
                cancelledBy: null,
                cancelledAt: null,
                createdAt: '2026-08-16T05:00:00.000Z',
                updatedAt: '2026-08-16T05:00:00.000Z',
                dueAmountInPaise: 0,
              },
            ],
            total: 1,
          },
        }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/bills" element={<GeneratedBillsPage />} />
      </Routes>,
      { route: '/dashboard' },
    )

    fireEvent.click(await screen.findByText('Generated Bills'))

    // A PAID bill is normally excluded from the default worklist — it must
    // be visible here, proving the click landed on the "all statuses" view.
    expect(await screen.findByText('B-0001')).toBeInTheDocument()
    expect(screen.getByDisplayValue('All statuses')).toBeInTheDocument()
  })
})
