import { describe, expect, it } from 'vitest';
import { AgingBucket } from '../database/enums.js';
import {
  accruePenalty,
  agingBucketFor,
  daysOverdueFor,
  penaltyBase,
  penaltyCeiling,
  penaltyDaysDue,
} from './penalty.js';

const DUE = new Date('2026-09-20T09:00:00.000Z');
const SETTINGS = { ratePerDay: 1, maxPercentOfPrincipal: 100 };

/** A loan of 10,000 principal owing 12,250 in total, nothing paid. */
function loan(overrides: Record<string, unknown> = {}) {
  return {
    dueDate: DUE,
    totalAmount: 12_250,
    totalPaid: 0,
    principalAmount: 10_000,
    penaltyAmount: 0,
    penaltyAccruedThrough: DUE,
    ...overrides,
  } as any;
}

describe('penalty day counting', () => {
  it('charges nothing on the due date itself', () => {
    expect(penaltyDaysDue(loan(), new Date('2026-09-20T23:59:00.000Z'))).toBe(0);
  });

  it('charges one day once the calendar has turned', () => {
    expect(penaltyDaysDue(loan(), new Date('2026-09-21T00:30:00.000Z'))).toBe(1);
  });

  it('charges nothing before the loan is due, however early the watermark', () => {
    expect(penaltyDaysDue(loan({ penaltyAccruedThrough: null }), new Date('2026-09-18T00:00:00.000Z'))).toBe(0);
  });

  it('counts from the due date when no sweep has run yet', () => {
    expect(penaltyDaysDue(loan({ penaltyAccruedThrough: null }), new Date('2026-09-25T12:00:00.000Z'))).toBe(5);
  });

  /**
   * The back-fill sets the watermark to the day the feature shipped, so borrowers are
   * not retroactively billed for months during which nothing charged them.
   */
  it('counts from the watermark, not the due date, once one is set', () => {
    const backFilled = loan({ dueDate: new Date('2026-01-01T00:00:00.000Z'), penaltyAccruedThrough: new Date('2026-09-24T00:00:00.000Z') });
    expect(penaltyDaysDue(backFilled, new Date('2026-09-26T00:00:00.000Z'))).toBe(2);
  });
});

describe('penalty accrual', () => {
  it('charges the daily rate on the unpaid contracted debt', () => {
    const accrual = accruePenalty(loan(), SETTINGS, new Date('2026-09-23T00:00:00.000Z'));
    expect(accrual).toMatchObject({ days: 3, capped: false });
    // 1% of 12,250 for three days.
    expect(accrual!.amount).toBe(367.5);
  });

  it('returns nothing when the loan is not yet late', () => {
    expect(accruePenalty(loan(), SETTINGS, new Date('2026-09-20T12:00:00.000Z'))).toBeNull();
  });

  /**
   * Idempotency is the whole point of the watermark: the caller advances
   * `penaltyAccruedThrough` to `through`, after which the same day charges nothing.
   */
  it('charges nothing twice for the same day', () => {
    const now = new Date('2026-09-23T00:00:00.000Z');
    const first = accruePenalty(loan(), SETTINGS, now)!;
    const after = loan({ penaltyAccruedThrough: first.through, penaltyAmount: first.amount });
    expect(accruePenalty(after, SETTINGS, now)).toBeNull();
  });

  it('never compounds: an accrued penalty does not raise the base', () => {
    const now = new Date('2026-09-21T00:00:00.000Z');
    const withPenalty = loan({ penaltyAmount: 5000, penaltyAccruedThrough: DUE });
    // Still 1% of 12,250, not of 17,250.
    expect(accruePenalty(withPenalty, SETTINGS, now)!.amount).toBe(122.5);
  });

  it('charges only on what is still unpaid', () => {
    const half = loan({ totalPaid: 6125 });
    expect(accruePenalty(half, SETTINGS, new Date('2026-09-21T00:00:00.000Z'))!.amount).toBe(61.25);
  });

  it('charges nothing on a loan that is paid off but not yet marked settled', () => {
    expect(accruePenalty(loan({ totalPaid: 12_250 }), SETTINGS, new Date('2026-09-30T00:00:00.000Z'))).toBeNull();
  });

  it('charges nothing on a zero-rate product', () => {
    expect(accruePenalty(loan(), { ...SETTINGS, ratePerDay: 0 }, new Date('2026-09-30T00:00:00.000Z'))).toBeNull();
  });

  it('clips the charge at the ceiling and says so', () => {
    const nearCap = loan({ penaltyAmount: 9900 });
    const accrual = accruePenalty(nearCap, SETTINGS, new Date('2026-09-30T00:00:00.000Z'))!;
    // Ceiling is 100% of the 10,000 principal, so only 100 of room is left.
    expect(accrual).toMatchObject({ amount: 100, capped: true });
  });

  it('stops entirely once the ceiling is reached', () => {
    expect(accruePenalty(loan({ penaltyAmount: 10_000 }), SETTINGS, new Date('2027-01-01T00:00:00.000Z'))).toBeNull();
  });

  it('accrues without limit when the ceiling is disabled', () => {
    const settings = { ratePerDay: 1, maxPercentOfPrincipal: 0 };
    expect(penaltyCeiling(10_000, 0)).toBe(Infinity);
    const accrual = accruePenalty(loan({ penaltyAmount: 50_000 }), settings, new Date('2026-09-21T00:00:00.000Z'))!;
    expect(accrual).toMatchObject({ amount: 122.5, capped: false });
  });

  it('never reports a negative base for an overpaid loan', () => {
    expect(penaltyBase({ totalAmount: 100, totalPaid: 150 })).toBe(0);
  });

  /**
   * Regression. Postgres stores timestamptz to microseconds while a JavaScript Date
   * holds only milliseconds, so a watermark written by SQL -- `now()` in the migration
   * back-fill -- never round-trips to an equal value. The accrual update originally
   * guarded on `penaltyAccruedThrough = <the value I read>`, which therefore matched
   * nothing: no charge, and no advance of the watermark, so every back-filled loan
   * stayed stuck that way permanently. The guard is now "not already charged today",
   * which is both precision-proof and the real invariant.
   *
   * This test pins the arithmetic side: a watermark whose sub-millisecond digits were
   * truncated on the way in must still produce the same number of chargeable days.
   */
  it('is unaffected by sub-millisecond precision lost reading the watermark back', () => {
    const stored = '2026-09-23T14:49:45.852171Z'; // microseconds, as Postgres keeps it
    const readBack = new Date('2026-09-23T14:49:45.852Z'); // milliseconds, as JS holds it
    const now = new Date('2026-09-26T14:50:00.000Z');

    const fromStored = penaltyDaysDue(loan({ penaltyAccruedThrough: stored }), now);
    const fromReadBack = penaltyDaysDue(loan({ penaltyAccruedThrough: readBack }), now);

    expect(fromStored).toBe(fromReadBack);
    // And it charges, rather than silently doing nothing.
    expect(accruePenalty(loan({ penaltyAccruedThrough: readBack }), SETTINGS, now)).not.toBeNull();
  });
});

describe('aging', () => {
  it('reports zero days overdue before the due date', () => {
    expect(daysOverdueFor(DUE, new Date('2026-09-18T00:00:00.000Z'))).toBe(0);
    expect(daysOverdueFor(DUE, new Date('2026-09-20T23:00:00.000Z'))).toBe(0);
  });

  it('counts whole days past due', () => {
    expect(daysOverdueFor(DUE, new Date('2026-09-27T00:00:00.000Z'))).toBe(7);
  });

  it.each([
    [0, AgingBucket.CURRENT],
    [1, AgingBucket.D1_7],
    [7, AgingBucket.D1_7],
    [8, AgingBucket.D8_30],
    [30, AgingBucket.D8_30],
    [31, AgingBucket.D31_60],
    [60, AgingBucket.D31_60],
    [61, AgingBucket.D60_PLUS],
    [400, AgingBucket.D60_PLUS],
  ])('buckets %i days overdue as %s', (days, bucket) => {
    expect(agingBucketFor(days)).toBe(bucket);
  });
});
