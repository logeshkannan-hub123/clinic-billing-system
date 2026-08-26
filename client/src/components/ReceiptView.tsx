import { CLINIC_NAME } from '../constants/clinic'
import { useDisplaySettings } from '../hooks/useAdmin'
import type { Bill, Payment, ReceiptPaperSize } from '../types/api'
import { formatDateTimeIst } from '../utils/datetime'
import { formatPaise } from '../utils/money'

const PAPER_SIZE_CLASS: Record<ReceiptPaperSize, string> = {
  A4: '',
  A5: 'receipt--a5',
  THERMAL_80MM: 'receipt--thermal-80mm',
  THERMAL_58MM: 'receipt--thermal-58mm',
}

const PAYMENT_METHOD_LABEL: Record<Payment['method'], string> = {
  CASH: 'Cash',
  UPI: 'UPI',
}

/**
 * Printer-independent: renders as plain HTML styled for the browser's own
 * print dialog (`window.print()`), which works with any printer through the
 * OS — no thermal-specific integration. Deliberately never renders
 * `patientPhone`, per the confirmed requirement — this is unconditional and
 * does not depend on any Settings toggle; there is no `showPatientPhone`
 * field anywhere in this app (see docs/architecture/admin-settings.md).
 * Kept as its own component so a future thermal-specific renderer can
 * replace just this piece without touching the rest of the bill detail page.
 */
export function ReceiptView({ bill, payments }: { bill: Bill; payments: Payment[] }) {
  const { data: displaySettings } = useDisplaySettings()
  const clinic = displaySettings?.clinic
  const receipt = displaySettings?.receipt

  const showLogo = receipt?.showLogo ?? true
  const showClinicAddress = receipt?.showClinicAddress ?? true
  const showClinicPhone = receipt?.showClinicPhone ?? true
  const showDoctorName = receipt?.showDoctorName ?? true
  const showTax = receipt?.showTax ?? true
  const showPaymentMethod = receipt?.showPaymentMethod ?? true
  const showPaymentHistory = receipt?.showPaymentHistory ?? true
  const paperSizeClass = receipt ? PAPER_SIZE_CLASS[receipt.paperSize] : ''

  const paymentMethodsUsed = [...new Set(payments.map((payment) => payment.method))]

  return (
    <div className={`receipt${paperSizeClass ? ` ${paperSizeClass}` : ''}`}>
      <div className="receipt__header">
        {showLogo && clinic?.logoUrl && <img src={clinic.logoUrl} alt="" className="receipt__logo" />}
        <h2>{clinic?.name ?? CLINIC_NAME}</h2>
        {showDoctorName && clinic?.doctorName && <p className="receipt__doctor">{clinic.doctorName}</p>}
        {showClinicAddress && clinic?.address && <p className="receipt__meta">{clinic.address}</p>}
        {showClinicPhone && clinic?.phone && <p className="receipt__meta">{clinic.phone}</p>}
        <p className="receipt__bill-number">{bill.billNumber}</p>
        <p className="receipt__date">{formatDateTimeIst(bill.issuedAt)}</p>
      </div>

      <div className="receipt__patient">
        <span>Patient:</span> {bill.patientName}
      </div>

      <table className="receipt__items">
        <thead>
          <tr>
            <th>Medicine</th>
            <th>Qty</th>
            <th>Unit</th>
            <th>Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {bill.items.map((item, index) => (
            <tr key={index}>
              <td>{item.medicineName}</td>
              <td>{item.quantity}</td>
              <td>{item.unitType}</td>
              <td>{formatPaise(item.unitPriceInPaise)}</td>
              <td>{formatPaise(item.lineTotalInPaise)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt__totals">
        <div>
          <span>Consultation fee</span>
          <span>{formatPaise(bill.consultationFeeInPaise)}</span>
        </div>
        <div>
          <span>Subtotal</span>
          <span>{formatPaise(bill.subtotalInPaise)}</span>
        </div>
        {bill.taxEnabled && showTax && (
          <div>
            <span>Tax ({((bill.taxRateBasisPoints ?? 0) / 100).toFixed(2)}%)</span>
            <span>{formatPaise(bill.taxAmountInPaise)}</span>
          </div>
        )}
        <div>
          <span>Rounding</span>
          <span>{formatPaise(bill.roundingAdjustmentInPaise)}</span>
        </div>
        <div className="receipt__grand-total">
          <span>Grand Total</span>
          <span>{formatPaise(bill.grandTotalInPaise)}</span>
        </div>
      </div>

      {showPaymentMethod && paymentMethodsUsed.length > 0 && (
        <div className="receipt__meta">
          Paid via {paymentMethodsUsed.map((method) => PAYMENT_METHOD_LABEL[method]).join(', ')}
        </div>
      )}

      {showPaymentHistory && payments.length > 0 && (
        <div className="receipt__payments">
          <p className="receipt__payments-title">Payment history</p>
          {payments.map((payment) => (
            <div key={payment._id} className="receipt__payments-row">
              <span>
                {PAYMENT_METHOD_LABEL[payment.method]} · {formatDateTimeIst(payment.createdAt)}
              </span>
              <span>{formatPaise(payment.amountInPaise)}</span>
            </div>
          ))}
        </div>
      )}

      {receipt?.footerText && <p className="receipt__footer">{receipt.footerText}</p>}
    </div>
  )
}
