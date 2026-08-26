/** Client-side mirrors of the validation rules enforced server-side in
 * server/src/routes/adminClinicSettings.ts — usability only, giving
 * immediate feedback. The server remains authoritative; every save still
 * goes through its own checks regardless of what passes here. */

const HTTP_URL_PATTERN = /^https?:\/\/[^\s]+$/i
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
export const INVOICE_PREFIX_PATTERN = /^[A-Z0-9]{1,10}$/

export function isValidHttpUrl(value: string): boolean {
  return HTTP_URL_PATTERN.test(value)
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value)
}
