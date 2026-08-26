import { screen, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReceiptView } from './ReceiptView'
import { mockApi, renderWithProviders } from '../test/testUtils'
import { DEFAULT_CLINIC_SETTINGS, toDisplaySettings } from '../test/settingsFixtures'
import type { Bill, Payment } from '../types/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

const BILL: Bill = {
  _id: 'bill-1',
  billNumber: 'INV-20260817-001',
  patientId: 'patient-1',
  patientName: 'Asha Rao',
  patientPhone: '9876500000',
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
  consultationFeeInPaise: 50000,
  subtotalInPaise: 52000,
  taxEnabled: true,
  taxRateBasisPoints: 500,
  taxAmountInPaise: 2600,
  roundingAdjustmentInPaise: 0,
  grandTotalInPaise: 54600,
  status: 'PAID',
  issuedAt: '2026-08-17T05:00:00.000Z',
  createdBy: 'admin-1',
  cancelledBy: null,
  cancelledAt: null,
  createdAt: '2026-08-17T05:00:00.000Z',
  updatedAt: '2026-08-17T05:00:00.000Z',
}

const PAYMENTS: Payment[] = [
  {
    _id: 'pay-1',
    billId: 'bill-1',
    method: 'CASH',
    amountInPaise: 54600,
    tenderedAmountInPaise: 60000,
    changeAmountInPaise: 5400,
    upiReference: null,
    recordedBy: 'admin-1',
    createdAt: '2026-08-17T05:05:00.000Z',
  },
]

function mockDisplay(overrides: Partial<typeof DEFAULT_CLINIC_SETTINGS> = {}) {
  const settings = { ...DEFAULT_CLINIC_SETTINGS, ...overrides }
  mockApi([{ method: 'GET', path: '/api/settings/display', respond: () => ({ body: toDisplaySettings(settings) }) }])
}

describe('ReceiptView', () => {
  it('never renders the patient phone number, regardless of settings', async () => {
    mockDisplay({
      receipt: {
        ...DEFAULT_CLINIC_SETTINGS.receipt,
        showLogo: true,
        showClinicAddress: true,
        showClinicPhone: true,
        showDoctorName: true,
        showTax: true,
        showPaymentMethod: true,
        showPaymentHistory: true,
      },
    })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    await screen.findByText('INV-20260817-001')
    expect(screen.queryByText(BILL.patientPhone)).not.toBeInTheDocument()
    expect(document.body.textContent).not.toContain(BILL.patientPhone)
  })

  it('falls back to the static clinic-name constant before display settings have loaded (and if they fail to)', async () => {
    mockApi([{ method: 'GET', path: '/api/settings/display', respond: () => ({ status: 500, body: { error: 'boom' } }) }])
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    // Immediately (before the mocked request even resolves) and after it
    // resolves as an error, the static constant is what's shown — the
    // component never renders a blank/undefined clinic name.
    expect(screen.getByText('VMF HEALTH CARE')).toBeInTheDocument()
    await screen.findByText('INV-20260817-001')
    expect(screen.getByText('VMF HEALTH CARE')).toBeInTheDocument()
  })

  it('shows a live clinic name once display settings load', async () => {
    mockDisplay({ clinic: { ...DEFAULT_CLINIC_SETTINGS.clinic, name: 'Downtown Clinic' } })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    expect(await screen.findByText('Downtown Clinic')).toBeInTheDocument()
  })

  it('respects showClinicAddress, showClinicPhone, and showDoctorName toggles', async () => {
    mockDisplay({
      // A distinct name is the "settings have actually loaded" signal below
      // — address/phone/doctor are absent both before load and after
      // (correctly) being hidden, so their absence alone can't prove the
      // toggle was honored rather than just "nothing loaded yet".
      clinic: { ...DEFAULT_CLINIC_SETTINGS.clinic, name: 'Toggle Test Clinic', address: '123 Main St', phone: '044-1234', doctorName: 'Dr. Iyer' },
      receipt: { ...DEFAULT_CLINIC_SETTINGS.receipt, showClinicAddress: false, showClinicPhone: false, showDoctorName: false },
    })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    await screen.findByText('Toggle Test Clinic')
    expect(screen.queryByText('123 Main St')).not.toBeInTheDocument()
    expect(screen.queryByText('044-1234')).not.toBeInTheDocument()
    expect(screen.queryByText('Dr. Iyer')).not.toBeInTheDocument()
  })

  it('shows clinic address/phone/doctor name when the toggles are on', async () => {
    mockDisplay({
      clinic: { ...DEFAULT_CLINIC_SETTINGS.clinic, address: '123 Main St', phone: '044-1234', doctorName: 'Dr. Iyer' },
    })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    expect(await screen.findByText('123 Main St')).toBeInTheDocument()
    expect(screen.getByText('044-1234')).toBeInTheDocument()
    expect(screen.getByText('Dr. Iyer')).toBeInTheDocument()
  })

  it('hides the tax line when showTax is off, even though the bill has tax', async () => {
    mockDisplay({ receipt: { ...DEFAULT_CLINIC_SETTINGS.receipt, showTax: false } })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    // The bill number renders immediately regardless of settings, so it's
    // not a safe signal that the async display-settings fetch has resolved
    // — wait directly for the setting-dependent assertion instead.
    await waitFor(() => expect(screen.queryByText(/tax \(/i)).not.toBeInTheDocument())
  })

  it('shows the tax line when showTax is on and the bill has tax enabled', async () => {
    mockDisplay()
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    expect(await screen.findByText(/tax \(/i)).toBeInTheDocument()
  })

  it('hides payment method and payment history when their toggles are off', async () => {
    mockDisplay({ receipt: { ...DEFAULT_CLINIC_SETTINGS.receipt, showPaymentMethod: false, showPaymentHistory: false } })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    await waitFor(() => expect(screen.queryByText(/paid via/i)).not.toBeInTheDocument())
    expect(screen.queryByText(/payment history/i)).not.toBeInTheDocument()
  })

  it('shows payment method and payment history when their toggles are on', async () => {
    mockDisplay()
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    expect(await screen.findByText(/paid via cash/i)).toBeInTheDocument()
    expect(screen.getByText(/payment history/i)).toBeInTheDocument()
  })

  it('renders the configured footer text', async () => {
    mockDisplay({ receipt: { ...DEFAULT_CLINIC_SETTINGS.receipt, footerText: 'Thank you for visiting!' } })
    renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    expect(await screen.findByText('Thank you for visiting!')).toBeInTheDocument()
  })

  it.each([
    ['A4', ''],
    ['A5', 'receipt--a5'],
    ['THERMAL_80MM', 'receipt--thermal-80mm'],
    ['THERMAL_58MM', 'receipt--thermal-58mm'],
  ] as const)('applies the correct class for paperSize %s', async (paperSize, expectedClass) => {
    mockDisplay({ receipt: { ...DEFAULT_CLINIC_SETTINGS.receipt, paperSize } })
    const { container } = renderWithProviders(<ReceiptView bill={BILL} payments={PAYMENTS} />)

    await waitFor(() => {
      const receiptEl = container.querySelector('.receipt')!
      if (expectedClass) {
        expect(receiptEl).toHaveClass(expectedClass)
      } else {
        expect(receiptEl.className.trim()).toBe('receipt')
      }
    })
  })
})
