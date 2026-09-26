/**
 * Calendar-day arithmetic for collections.
 *
 * Two different day definitions coexist here on purpose:
 *
 *  - **UTC days** for collection *levels*. `daysToDue` has always truncated in UTC
 *    and changing it would reshuffle which tier a loan falls into, so it stays.
 *  - **EAT days (UTC+3) for reports and "today" stats.** `getCollectorStats`
 *    previously used `setHours(0,0,0,0)` — server local time — so on a UTC host a
 *    Tanzanian collector's day began at 03:00 EAT and the first three hours of work
 *    landed in the previous day's numbers. Admins mean the local day, so reports use
 *    EAT. Tanzania observes no DST, so a fixed offset is exact and needs no tz data.
 */

/** East Africa Time is UTC+3 year-round. */
export const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
export const REPORT_TZ = 'Africa/Nairobi';

/** Reports refuse spans longer than this, to keep a stray query from scanning years. */
export const MAX_RANGE_DAYS = 366;

/** UTC calendar-day truncation: levels must not depend on server timezone. */
export function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole UTC calendar days between two instants (b - a). */
export function utcDaysBetween(a: Date, b: Date): number {
  return Math.round((startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime()) / 86_400_000);
}

/** The EAT calendar day an instant belongs to, as 'YYYY-MM-DD'. */
export function eatDayKey(instant: Date): string {
  return new Date(instant.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

/** The UTC instant at which an EAT calendar day begins (00:00 EAT = 21:00 UTC prior). */
export function eatDayStart(dayKey: string): Date {
  const parsed = new Date(`${dayKey}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Invalid day key: ${dayKey}`);
  return new Date(parsed.getTime() - EAT_OFFSET_MS);
}

/** The UTC instant at which the EAT day containing `now` begins. */
export function startOfEatDay(now: Date = new Date()): Date {
  return eatDayStart(eatDayKey(now));
}

export interface DateRange {
  /** Inclusive lower bound. */
  from: Date;
  /** Exclusive upper bound. */
  to: Date;
  /** EAT day key of `from`. */
  fromKey: string;
  /** EAT day key of the last day included (i.e. `to` minus one day). */
  toKey: string;
}

/** The EAT day containing `now`, as a half-open range. */
export function todayRange(now: Date = new Date()): DateRange {
  return resolveDateRange(eatDayKey(now), eatDayKey(now), now);
}

/**
 * Builds a half-open [from, to) range of UTC instants from optional 'YYYY-MM-DD'
 * EAT day keys, defaulting to the 30 EAT days ending today. `to` is inclusive of its
 * whole day, which is what a date picker means when a user selects it.
 */
export function resolveDateRange(
  from?: string,
  to?: string,
  now: Date = new Date(),
): DateRange {
  const toKey = to ?? eatDayKey(now);
  const fromKey = from ?? eatDayKey(new Date(eatDayStart(toKey).getTime() - 29 * 86_400_000));

  const start = eatDayStart(fromKey);
  const end = new Date(eatDayStart(toKey).getTime() + 86_400_000);
  if (start >= end) throw new Error('Date range "from" must not be after "to".');

  const spanDays = Math.round((end.getTime() - start.getTime()) / 86_400_000);
  if (spanDays > MAX_RANGE_DAYS) {
    throw new Error(`Date range must not exceed ${MAX_RANGE_DAYS} days (got ${spanDays}).`);
  }
  return { from: start, to: end, fromKey, toKey };
}

/** Whole EAT calendar days between two instants (b - a). */
export function eatDaysBetween(a: Date, b: Date): number {
  return Math.round(
    (eatDayStart(eatDayKey(b)).getTime() - eatDayStart(eatDayKey(a)).getTime()) / 86_400_000,
  );
}

/** Every EAT day key in a range, inclusive and ordered — used to zero-fill gaps. */
export function eatDayKeys(range: DateRange): string[] {
  const keys: string[] = [];
  for (let t = range.from.getTime(); t < range.to.getTime(); t += 86_400_000) {
    keys.push(eatDayKey(new Date(t)));
  }
  return keys;
}
