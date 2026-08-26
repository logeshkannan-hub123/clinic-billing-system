import { describe, expect, it } from "vitest";
import { getKolkataDateKey, getKolkataDayRangeUtc, getKolkataTodayIso } from "./timezone.js";

describe("getKolkataDateKey", () => {
  it("returns the same UTC calendar date when well within the Kolkata day", () => {
    expect(getKolkataDateKey(new Date("2026-08-15T10:00:00.000Z"))).toBe("20260815");
  });

  it("rolls over to the next Kolkata day for late-UTC timestamps", () => {
    // 18:30 UTC = 00:00 IST the next day.
    expect(getKolkataDateKey(new Date("2026-08-15T18:30:00.000Z"))).toBe("20260816");
  });

  it("stays on the same Kolkata day just before the rollover", () => {
    expect(getKolkataDateKey(new Date("2026-08-15T18:29:59.999Z"))).toBe("20260815");
  });
});

describe("getKolkataDayRangeUtc", () => {
  it("computes the UTC range for a Kolkata calendar day", () => {
    const { startUtc, endUtc } = getKolkataDayRangeUtc("2026-08-15");
    expect(startUtc.toISOString()).toBe("2026-08-14T18:30:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-08-15T18:30:00.000Z");
  });

  it("round-trips with getKolkataDateKey at the range boundaries", () => {
    const { startUtc, endUtc } = getKolkataDayRangeUtc("2026-08-15");
    expect(getKolkataDateKey(startUtc)).toBe("20260815");
    expect(getKolkataDateKey(new Date(endUtc.getTime() - 1))).toBe("20260815");
    expect(getKolkataDateKey(endUtc)).toBe("20260816");
  });

  it("rejects a malformed date string", () => {
    expect(() => getKolkataDayRangeUtc("15-08-2026")).toThrow();
    expect(() => getKolkataDayRangeUtc("2026/08/15")).toThrow();
    expect(() => getKolkataDayRangeUtc("not-a-date")).toThrow();
  });
});

describe("getKolkataTodayIso", () => {
  it("formats the Kolkata date with dashes", () => {
    expect(getKolkataTodayIso(new Date("2026-08-15T10:00:00.000Z"))).toBe("2026-08-15");
  });

  it("rolls over to the next Kolkata day for late-UTC timestamps", () => {
    expect(getKolkataTodayIso(new Date("2026-08-15T18:30:00.000Z"))).toBe("2026-08-16");
  });

  it("is directly usable as input to getKolkataDayRangeUtc", () => {
    const iso = getKolkataTodayIso(new Date("2026-08-15T10:00:00.000Z"));
    expect(() => getKolkataDayRangeUtc(iso)).not.toThrow();
  });
});
