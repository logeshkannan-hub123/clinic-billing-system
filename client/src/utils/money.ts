/**
 * Display/input unit conversion only — paise <-> rupees. This file never
 * computes a subtotal, tax, rounding adjustment, or grand total; every one
 * of those numbers always comes from the server (POST /api/bills/preview or
 * the bill/payment responses themselves).
 */

export function formatPaise(paiseValue: number): string {
  const rupees = paiseValue / 100
  return `₹${rupees.toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** Parses a receptionist-typed rupee amount (e.g. "52.50") into integer paise. */
export function rupeesInputToPaise(input: string): number | null {
  const trimmed = input.trim()
  if (trimmed === '') return null
  if (!/^\d+(\.\d{1,2})?$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return Math.round(value * 100)
}

export function paiseToRupeesInput(paiseValue: number): string {
  return (paiseValue / 100).toFixed(2)
}

/** Keystroke filter for rupee-amount inputs: digits, at most one decimal
 * point, at most 2 fractional digits. Input masking only — parsing/validation
 * for submission still goes through `rupeesInputToPaise`. */
export function sanitizeDecimalInput(value: string): string {
  const digitsAndDots = value.replace(/[^\d.]/g, '')
  const [whole = '', ...rest] = digitsAndDots.split('.')
  if (rest.length === 0) return whole
  return `${whole}.${rest.join('').slice(0, 2)}`
}
