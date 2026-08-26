// Asia/Kolkata is a fixed UTC+5:30 offset with no daylight saving, so plain
// offset arithmetic is correct here (no timezone-database lookup needed).
const KOLKATA_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Kolkata-local calendar date for `date`, as `YYYYMMDD` (used for bill numbering). */
export function getKolkataDateKey(date: Date): string {
  const kolkataDate = new Date(date.getTime() + KOLKATA_OFFSET_MS);
  const year = kolkataDate.getUTCFullYear();
  const month = String(kolkataDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(kolkataDate.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

/**
 * Today's Kolkata-local calendar date, as `YYYY-MM-DD` (the query-param/API
 * form — same underlying computation as `getKolkataDateKey`, just formatted
 * with dashes instead of the dash-less form bill numbering uses).
 */
export function getKolkataTodayIso(now: Date = new Date()): string {
  const dateKey = getKolkataDateKey(now);
  return `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
}

/**
 * UTC instant range `[startUtc, endUtc)` covering one Kolkata-local calendar
 * day, given as `YYYY-MM-DD`. Used to filter UTC-stored timestamps (e.g.
 * `Bill.issuedAt`) by clinic-local day.
 */
export function getKolkataDayRangeUtc(isoDate: string): { startUtc: Date; endUtc: Date } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) {
    throw new Error(`Invalid date, expected YYYY-MM-DD: ${isoDate}`);
  }
  const [, yearStr, monthStr, dayStr] = match;
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  const startUtc = new Date(Date.UTC(year, month - 1, day) - KOLKATA_OFFSET_MS);
  const endUtc = new Date(startUtc.getTime() + 24 * 60 * 60 * 1000);
  return { startUtc, endUtc };
}
