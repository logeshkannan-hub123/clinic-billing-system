import type { ReactNode } from 'react'
import { CurrencyDisplay } from './CurrencyDisplay'
import { LoadingState } from './Feedback'

export interface BillSummaryTotals {
  consultationFeeInPaise: number
  /** Optional: items-only total (subtotal minus consultation fee), computed
   * by the caller from two already server-returned figures — never derived
   * inside this component. Omitted entirely by callers (e.g. BillDetailPage)
   * that have no need for a separate medicines line. */
  medicinesTotalInPaise?: number
  subtotalInPaise: number
  taxEnabled: boolean
  taxRateBasisPoints: number | null
  taxAmountInPaise: number
  roundingAdjustmentInPaise: number
  grandTotalInPaise: number
}

interface BillSummaryProps {
  totals: BillSummaryTotals | null
  /** Count of distinct medicine line items — shown next to the optional
   * Medicines row, e.g. "Medicines (3)". Purely a UI count, not a money figure. */
  itemCount?: number
  loading?: boolean
  children?: ReactNode
}

/**
 * Presentational only — every figure here is a server-computed value passed
 * in by the caller (POST /api/bills/preview, or a persisted Bill). Never
 * derives a total itself.
 */
export function BillSummary({ totals, itemCount, loading, children }: BillSummaryProps) {
  return (
    <div className="card card--padded bill-summary">
      <h2 className="card__title">Bill Summary</h2>

      {loading && !totals && <LoadingState label="Calculating…" />}

      {totals && (
        <>
          {totals.medicinesTotalInPaise !== undefined && (
            <div className="bill-summary__row">
              <span>Medicines{itemCount !== undefined ? ` (${itemCount})` : ''}</span>
              <CurrencyDisplay paise={totals.medicinesTotalInPaise} size="sm" tone="muted" />
            </div>
          )}
          <div className="bill-summary__row">
            <span>Consultation fee</span>
            <CurrencyDisplay paise={totals.consultationFeeInPaise} size="sm" tone="muted" />
          </div>
          <div className="bill-summary__row">
            <span>Subtotal</span>
            <CurrencyDisplay paise={totals.subtotalInPaise} size="sm" tone="muted" />
          </div>
          {totals.taxEnabled && (
            <div className="bill-summary__row">
              <span>Tax ({((totals.taxRateBasisPoints ?? 0) / 100).toFixed(2)}%)</span>
              <CurrencyDisplay paise={totals.taxAmountInPaise} size="sm" tone="muted" />
            </div>
          )}
          <div className="bill-summary__row">
            <span>Rounding adjustment</span>
            <CurrencyDisplay paise={totals.roundingAdjustmentInPaise} size="sm" tone="muted" />
          </div>
          <div className="bill-summary__row bill-summary__row--total">
            <span className="bill-summary__total-label">Grand Total</span>
            <CurrencyDisplay paise={totals.grandTotalInPaise} size="xl" />
          </div>
        </>
      )}

      {children}
    </div>
  )
}
