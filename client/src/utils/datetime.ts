/**
 * Display formatting only, all in Asia/Kolkata — the server already computes
 * every date-boundary/aggregation decision (see timezone.ts server-side);
 * the client only needs to render an ISO instant for a human, and produce a
 * `YYYY-MM-DD` string for date-filter query params.
 */

const KOLKATA_TIME_ZONE = 'Asia/Kolkata'

export function formatDateTimeIst(isoString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: KOLKATA_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(isoString))
}

export function formatDateIst(isoString: string): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: KOLKATA_TIME_ZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(isoString))
}

/** Today's Kolkata calendar date as `YYYY-MM-DD`, for date-filter query params. */
export function todayIsoInKolkata(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}
