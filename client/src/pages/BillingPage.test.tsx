import { act, fireEvent, screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DEFAULT_DISPLAY_SETTINGS } from '../test/settingsFixtures'
import { BillingPage } from './BillingPage'

afterEach(() => {
  vi.unstubAllGlobals()
})

const MEDICINE_SEARCH_ROUTE = {
  method: 'GET',
  path: /^\/api\/medicines\/search/,
  respond: () => ({
    body: [
      {
        id: 'med-1',
        category: 'MEDICINE',
        name: 'Paracetamol',
        brandName: null,
        genericName: 'Paracetamol',
        composition: 'Paracetamol 500 mg',
        strength: '500 mg',
        billingUnit: 'tablet',
        volume: null,
        volumeUnit: null,
        sellingPriceInPaise: 2000,
      },
    ],
  }),
}

/** Types into the autocomplete, waits for the (mocked) search result, and
 * selects it — quantity is left at its default of 1, so with the mocked
 * ₹20.00 selling price the line total is exactly the 2000-paise fixture
 * used throughout this file's preview/create mocks. */
async function fillMinimalBill() {
  fireEvent.change(screen.getByLabelText(/patient name/i), { target: { value: 'Asha Rao' } })
  fireEvent.change(screen.getByLabelText(/patient phone/i), { target: { value: '9876543210' } })
  fireEvent.change(screen.getByLabelText(/medicine for item 1/i), { target: { value: 'Paracetamol' } })
  const option = await screen.findByRole('option', { name: /paracetamol/i })
  fireEvent.mouseDown(option)
}

describe('BillingPage', () => {
  it('calls the preview endpoint as the form is filled and renders the server-returned totals', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi([
      MEDICINE_SEARCH_ROUTE,
      {
        method: 'POST',
        path: '/api/bills/preview',
        respond: () => ({
          body: {
            itemLineTotalsInPaise: [2000],
            subtotalInPaise: 2000,
            taxEnabled: true,
            taxRateBasisPoints: 500,
            taxAmountInPaise: 100,
            roundingAdjustmentInPaise: 0,
            grandTotalInPaise: 2100,
          },
        }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    vi.useRealTimers()

    expect(await screen.findByText('₹21.00')).toBeInTheDocument()
    expect(screen.getByText(/tax \(5\.00%\)/i)).toBeInTheDocument()
  })

  it('generates a bill and navigates to its detail page, never sending client totals for the server to trust', async () => {
    let capturedBody: unknown
    mockApi([
      MEDICINE_SEARCH_ROUTE,
      {
        method: 'POST',
        path: '/api/bills/preview',
        respond: () => ({
          body: {
            itemLineTotalsInPaise: [2000],
            subtotalInPaise: 2000,
            taxEnabled: false,
            taxRateBasisPoints: null,
            taxAmountInPaise: 0,
            roundingAdjustmentInPaise: 0,
            grandTotalInPaise: 2000,
          },
        }),
      },
      {
        method: 'POST',
        path: '/api/bills',
        respond: (body) => {
          capturedBody = body
          return { status: 201, body: { _id: 'bill-1', billNumber: 'B-0001' } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
        <Route path="/bills/:id" element={<div>Bill Detail Landing</div>} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }))

    expect(await screen.findByText('Bill Detail Landing')).toBeInTheDocument()
    // The request body is the raw input the server will recompute from —
    // no subtotal/tax/grandTotal field is ever sent by the client.
    expect(capturedBody).not.toHaveProperty('grandTotalInPaise')
    expect(capturedBody).not.toHaveProperty('subtotalInPaise')
    expect(capturedBody).toMatchObject({ patientName: 'Asha Rao', patientPhone: '9876543210' })
  })

  it('surfaces the duplicate-bill warning and only submits again after explicit confirmation', async () => {
    let createCallCount = 0
    mockApi([
      MEDICINE_SEARCH_ROUTE,
      {
        method: 'POST',
        path: '/api/bills/preview',
        respond: () => ({
          body: {
            itemLineTotalsInPaise: [2000],
            subtotalInPaise: 2000,
            taxEnabled: false,
            taxRateBasisPoints: null,
            taxAmountInPaise: 0,
            roundingAdjustmentInPaise: 0,
            grandTotalInPaise: 2000,
          },
        }),
      },
      {
        method: 'POST',
        path: '/api/bills',
        respond: (body) => {
          createCallCount += 1
          const confirmDuplicate = (body as { confirmDuplicate?: boolean }).confirmDuplicate
          if (!confirmDuplicate) {
            return {
              status: 409,
              body: { warning: 'possible_duplicate', existingBillId: 'bill-0', existingBillNumber: 'B-0000' },
            }
          }
          return { status: 201, body: { _id: 'bill-1', billNumber: 'B-0001' } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
        <Route path="/bills/:id" element={<div>Bill Detail Landing</div>} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }))

    expect(await screen.findByText(/B-0000/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /submit anyway/i }))

    await waitFor(() => expect(createCallCount).toBe(2))
    expect(await screen.findByText('Bill Detail Landing')).toBeInTheDocument()
  })

  it('shows a generic error (not the stale duplicate banner) when "submit anyway" fails for an unrelated reason', async () => {
    let createCallCount = 0
    mockApi([
      MEDICINE_SEARCH_ROUTE,
      {
        method: 'POST',
        path: '/api/bills/preview',
        respond: () => ({
          body: {
            itemLineTotalsInPaise: [2000],
            subtotalInPaise: 2000,
            taxEnabled: false,
            taxRateBasisPoints: null,
            taxAmountInPaise: 0,
            roundingAdjustmentInPaise: 0,
            grandTotalInPaise: 2000,
          },
        }),
      },
      {
        method: 'POST',
        path: '/api/bills',
        respond: (body) => {
          createCallCount += 1
          const confirmDuplicate = (body as { confirmDuplicate?: boolean }).confirmDuplicate
          if (!confirmDuplicate) {
            return {
              status: 409,
              body: { warning: 'possible_duplicate', existingBillId: 'bill-0', existingBillNumber: 'B-0000' },
            }
          }
          // The retry fails for an unrelated reason — a transient server error, not a duplicate.
          return { status: 500, body: { error: 'Internal server error' } }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
        <Route path="/bills/:id" element={<div>Bill Detail Landing</div>} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    fireEvent.click(screen.getByRole('button', { name: /generate bill/i }))
    expect(await screen.findByText(/B-0000/)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /submit anyway/i }))
    await waitFor(() => expect(createCallCount).toBe(2))

    // The stale duplicate banner must be gone, replaced by a real error —
    // never silently hidden just because a duplicate warning fired earlier.
    expect(screen.queryByText(/B-0000/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /submit anyway/i })).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    // Never navigated away — the failure must be visible on this page.
    expect(screen.queryByText('Bill Detail Landing')).not.toBeInTheDocument()
    // Retry is still possible.
    expect(screen.getByRole('button', { name: /generate bill/i })).toBeEnabled()
  })

  it('prefills the consultation fee from the settings-configured default', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/settings/display',
        respond: () => ({ body: { ...DEFAULT_DISPLAY_SETTINGS, defaultConsultationFeeInPaise: 50000 } }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    await waitFor(() => expect(screen.getByLabelText(/consultation fee/i)).toHaveValue('500.00'))
  })

  it('still lets the receptionist freely edit the consultation fee after the default loads', async () => {
    mockApi([
      {
        method: 'GET',
        path: '/api/settings/display',
        respond: () => ({ body: { ...DEFAULT_DISPLAY_SETTINGS, defaultConsultationFeeInPaise: 50000 } }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    const feeField = screen.getByLabelText(/consultation fee/i)
    await waitFor(() => expect(feeField).toHaveValue('500.00'))

    fireEvent.change(feeField, { target: { value: '750' } })
    expect(feeField).toHaveValue('750')
  })

  it('defaults the consultation fee to 0 when no display setting is available', async () => {
    mockApi([{ method: 'GET', path: '/api/settings/display', respond: () => ({ status: 500, body: { error: 'boom' } }) }])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    expect(await screen.findByLabelText(/consultation fee/i)).toHaveValue('0')
  })

  it('blocks submit and shows an inline error for an invalid consultation fee, instead of silently billing zero', async () => {
    mockApi([MEDICINE_SEARCH_ROUTE])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    const feeField = screen.getByLabelText(/consultation fee/i)
    // An intermediate, unparseable value produced by the sanitizer itself
    // (a trailing decimal point) — not empty, not a valid amount.
    fireEvent.change(feeField, { target: { value: '12.' } })

    expect(await screen.findByText(/enter a valid consultation fee/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /generate bill/i })).toBeDisabled()
  })

  it('clears the previous preview total once the only item is removed, instead of leaving a stale total on screen', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockApi([
      MEDICINE_SEARCH_ROUTE,
      {
        method: 'POST',
        path: '/api/bills/preview',
        respond: () => ({
          body: {
            itemLineTotalsInPaise: [2000],
            subtotalInPaise: 2000,
            taxEnabled: false,
            taxRateBasisPoints: null,
            taxAmountInPaise: 0,
            roundingAdjustmentInPaise: 0,
            grandTotalInPaise: 2000,
          },
        }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )

    await fillMinimalBill()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    vi.useRealTimers()

    // Both the subtotal and grand total read ₹20.00 here (no tax, no
    // rounding), so assert on count rather than a single unambiguous match.
    expect((await screen.findAllByText('₹20.00')).length).toBeGreaterThan(0)

    // Clear the only row's medicine selection — the form no longer
    // represents a submittable bill, so the previous total must go with it.
    fireEvent.change(screen.getByLabelText(/medicine for item 1/i), { target: { value: '' } })

    await waitFor(() => expect(screen.queryAllByText('₹20.00')).toHaveLength(0))
    expect(screen.queryByText('Grand Total')).not.toBeInTheDocument()
  })

  it('warns before leaving a started-but-unsaved draft, but not before touching the form at all', async () => {
    mockApi([MEDICINE_SEARCH_ROUTE])
    renderWithProviders(
      <Routes>
        <Route path="/bills/new" element={<BillingPage />} />
      </Routes>,
      { route: '/bills/new' },
    )
    await screen.findByLabelText(/patient name/i)

    // Untouched form — nothing to lose yet.
    let event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    fireEvent.change(screen.getByLabelText(/patient name/i), { target: { value: 'Asha Rao' } })

    event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })
})
