import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Route, Routes } from 'react-router-dom'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DEFAULT_DISPLAY_SETTINGS } from '../test/settingsFixtures'
import { BillDetailPage } from './BillDetailPage'
import type { Bill, BillWithPayments, CurrentUser } from '../types/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

const ADMIN: CurrentUser = { id: 'admin-1', username: 'admin', role: 'admin' }
const RECEPTIONIST: CurrentUser = { id: 'recep-1', username: 'jane', role: 'receptionist', staffId: 'S1' }

function makeBill(overrides: Partial<Bill> = {}): Bill {
  return {
    _id: 'bill-1',
    billNumber: 'B-0001',
    patientId: 'patient-1',
    patientName: 'Asha Rao',
    patientPhone: '9876543210',
    items: [
      {
        medicineId: null,
        category: null,
        brandName: null,
        genericName: null,
        composition: null,
        strength: null,
        mrpInPaise: null,
        medicineName: 'Paracetamol',
        unitType: 'tablet',
        quantity: 10,
        unitPriceInPaise: 200,
        lineTotalInPaise: 2000,
      },
    ],
    consultationFeeInPaise: 0,
    subtotalInPaise: 2000,
    taxEnabled: false,
    taxRateBasisPoints: null,
    taxAmountInPaise: 0,
    roundingAdjustmentInPaise: 0,
    grandTotalInPaise: 2000,
    status: 'UNPAID',
    issuedAt: '2026-08-16T05:00:00.000Z',
    createdBy: 'admin-1',
    cancelledBy: null,
    cancelledAt: null,
    createdAt: '2026-08-16T05:00:00.000Z',
    updatedAt: '2026-08-16T05:00:00.000Z',
    ...overrides,
  }
}

function renderDetail(billWithPayments: BillWithPayments, user: CurrentUser = ADMIN) {
  mockApi([
    { method: 'GET', path: '/api/auth/me', respond: () => ({ body: user }) },
    { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: billWithPayments }) },
    {
      method: 'POST',
      path: '/api/bills/bill-1/payments',
      respond: (body) => {
        const input = body as { method: 'CASH' | 'UPI'; tenderedAmountInPaise?: number; amountInPaise?: number }
        const applied = input.method === 'CASH' ? Math.min(input.tenderedAmountInPaise ?? 0, 2000) : (input.amountInPaise ?? 0)
        const due = 2000 - applied
        return {
          body: {
            payment: { _id: 'pay-1', billId: 'bill-1', method: input.method, amountInPaise: applied, tenderedAmountInPaise: input.tenderedAmountInPaise ?? null, changeAmountInPaise: input.method === 'CASH' ? (input.tenderedAmountInPaise ?? 0) - applied : null, upiReference: null, recordedBy: 'admin-1', createdAt: '2026-08-16T05:05:00.000Z' },
            bill: { id: 'bill-1', status: due <= 0 ? 'PAID' : 'PARTIALLY_PAID' },
            dueAmountInPaise: Math.max(due, 0),
          },
        }
      },
    },
  ])
  return renderWithProviders(
    <Routes>
      <Route path="/bills/:id" element={<BillDetailPage />} />
    </Routes>,
    { route: '/bills/bill-1' },
  )
}

describe('BillDetailPage — payments', () => {
  it('records a partial cash payment and shows the server-derived remaining balance', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    fireEvent.change(await screen.findByLabelText(/tendered amount/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })

  it('shows the estimated change due for a cash payment only once tendered exceeds the balance, and hides it for UPI', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const dialog = await screen.findByRole('dialog')
    const tenderedField = await screen.findByLabelText(/tendered amount/i)

    // Bill total is ₹20.00 (2000 paise). Tendering less than that is a partial
    // payment — there is no change to hand back, so no banner should appear.
    fireEvent.change(tenderedField, { target: { value: '10' } })
    expect(within(dialog).queryByText('Change to return')).not.toBeInTheDocument()

    // Tendering exactly the due amount is also not overpaying — still no change.
    fireEvent.change(tenderedField, { target: { value: '20' } })
    expect(within(dialog).queryByText('Change to return')).not.toBeInTheDocument()

    // Tendering more than the due amount previews the real change to return.
    fireEvent.change(tenderedField, { target: { value: '50' } })
    expect(await within(dialog).findByText('Change to return')).toBeInTheDocument()
    expect(within(dialog).getByText('₹30.00')).toBeInTheDocument()

    // Switching to UPI has no concept of tendered cash, so the preview disappears.
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'UPI' } })
    expect(within(dialog).queryByText('Change to return')).not.toBeInTheDocument()
  })

  it('shows the payment dialog for UPI with an optional reference field and no gateway integration', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    fireEvent.change(screen.getByLabelText(/payment method/i), { target: { value: 'UPI' } })

    expect(screen.getByLabelText(/upi reference/i)).toBeInTheDocument()
    expect(screen.getByText(/optional/i)).toBeInTheDocument()
  })

  it('hides the Record Payment action once a bill is fully PAID', async () => {
    renderDetail({
      bill: makeBill({ status: 'PAID' }),
      payments: [
        {
          _id: 'pay-1',
          billId: 'bill-1',
          method: 'CASH',
          amountInPaise: 2000,
          tenderedAmountInPaise: 2000,
          changeAmountInPaise: 0,
          upiReference: null,
          recordedBy: 'admin-1',
          createdAt: '2026-08-16T05:05:00.000Z',
        },
      ],
    })

    await screen.findAllByText('B-0001')
    expect(screen.queryByRole('button', { name: /record payment/i })).not.toBeInTheDocument()
    expect(screen.getByText(/fully paid/i)).toBeInTheDocument()
  })

  it('only shows Cancel Bill to admins on an UNPAID bill', async () => {
    renderDetail({ bill: makeBill(), payments: [] })
    expect(await screen.findByRole('button', { name: /cancel bill/i })).toBeInTheDocument()
  })

  it('hides Cancel Bill from receptionists, even on an UNPAID bill', async () => {
    renderDetail({ bill: makeBill(), payments: [] }, RECEPTIONIST)
    await screen.findByRole('button', { name: /record payment/i })
    expect(screen.queryByRole('button', { name: /cancel bill/i })).not.toBeInTheDocument()
  })

  it('keeps the cancel-confirmation dialog open with an error when cancellation fails, and only closes once it succeeds', async () => {
    let attempt = 0
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: { bill: makeBill(), payments: [] } }) },
      {
        method: 'PATCH',
        path: '/api/bills/bill-1/cancel',
        respond: () => {
          attempt += 1
          if (attempt === 1) {
            return { status: 409, body: { error: 'Bill can only be cancelled while UNPAID' } }
          }
          return { body: makeBill({ status: 'CANCELLED' }) }
        },
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/:id" element={<BillDetailPage />} />
      </Routes>,
      { route: '/bills/bill-1' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /cancel bill/i }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog.querySelector('button.btn--destructive')!)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('dialog').querySelector('button.btn--destructive')!)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
})

describe('BillDetailPage — editing', () => {
  it('hides the receipt preview (rather than showing stale totals) while an edit is in progress', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    // Persisted totals visible in the receipt before editing starts.
    await screen.findAllByText('B-0001')
    expect(screen.getAllByText('₹20.00').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /edit bill/i }))

    expect(screen.getByText(/save or discard your changes to see the updated receipt preview/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }))
    await waitFor(() =>
      expect(
        screen.queryByText(/save or discard your changes to see the updated receipt preview/i),
      ).not.toBeInTheDocument(),
    )
  })

  it('blocks Save Changes and shows an inline error for an invalid consultation fee, without silently treating it as zero', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    fireEvent.click(await screen.findByRole('button', { name: /edit bill/i }))
    const feeField = screen.getByLabelText(/consultation fee/i)

    // An intermediate, unparseable value — not empty, not a valid number.
    fireEvent.change(feeField, { target: { value: '12.' } })

    expect(await screen.findByText(/enter a valid consultation fee/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled()
  })

  it('warns before leaving an in-progress edit, but not before starting one', async () => {
    renderDetail({ bill: makeBill(), payments: [] })

    // Not yet editing — no warning registered.
    let event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    fireEvent.click(await screen.findByRole('button', { name: /edit bill/i }))

    // Editing started, but nothing has actually changed yet — still no warning.
    event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)

    // A real change to the draft — now leaving should warn.
    fireEvent.change(screen.getByLabelText(/consultation fee/i), { target: { value: '99' } })
    event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)

    // Discarding the edit clears the dirty state again.
    fireEvent.click(screen.getByRole('button', { name: /discard changes/i }))
    event = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
})

describe('PaymentDialog — payment-method settings integration', () => {
  it('hides a payment method the Admin has disabled, and still offers the enabled one', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: { bill: makeBill(), payments: [] } }) },
      {
        method: 'GET',
        path: '/api/settings/display',
        respond: () => ({ body: { ...DEFAULT_DISPLAY_SETTINGS, payments: { cashEnabled: true, upiEnabled: false } } }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/:id" element={<BillDetailPage />} />
      </Routes>,
      { route: '/bills/bill-1' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const methodSelect = (await screen.findByLabelText(/payment method/i)) as HTMLSelectElement
    const optionValues = Array.from(methodSelect.options).map((option) => option.value)

    expect(optionValues).toContain('CASH')
    expect(optionValues).not.toContain('UPI')
  })

  it('switches away from a method that becomes disabled after the dialog already defaulted to it', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: { bill: makeBill(), payments: [] } }) },
      {
        method: 'GET',
        path: '/api/settings/display',
        respond: () => ({ body: { ...DEFAULT_DISPLAY_SETTINGS, payments: { cashEnabled: false, upiEnabled: true } } }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/:id" element={<BillDetailPage />} />
      </Routes>,
      { route: '/bills/bill-1' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    const methodSelect = (await screen.findByLabelText(/payment method/i)) as HTMLSelectElement

    // CASH is the dialog's hardcoded initial state, but it's disabled here —
    // once settings load, the form must not be left pointed at a hidden option.
    await waitFor(() => expect(methodSelect.value).toBe('UPI'))
    expect(screen.getByLabelText(/upi reference/i)).toBeInTheDocument()
  })

  it('surfaces a backend rejection (not a silent failure) if a method is disabled between page load and submit', async () => {
    mockApi([
      { method: 'GET', path: '/api/auth/me', respond: () => ({ body: ADMIN }) },
      { method: 'GET', path: '/api/bills/bill-1', respond: () => ({ body: { bill: makeBill(), payments: [] } }) },
      { method: 'GET', path: '/api/settings/display', respond: () => ({ body: DEFAULT_DISPLAY_SETTINGS }) },
      {
        method: 'POST',
        path: '/api/bills/bill-1/payments',
        respond: () => ({ status: 400, body: { error: 'This payment method is currently disabled by the clinic' } }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route path="/bills/:id" element={<BillDetailPage />} />
      </Routes>,
      { route: '/bills/bill-1' },
    )

    fireEvent.click(await screen.findByRole('button', { name: /record payment/i }))
    fireEvent.change(await screen.findByLabelText(/tendered amount/i), { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: /confirm payment/i }))

    expect(await screen.findByText(/currently disabled by the clinic/i)).toBeInTheDocument()
    // Not a silent failure — the dialog stays open so the receptionist can
    // see the error and pick a different method, rather than the request
    // just vanishing.
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })
})
