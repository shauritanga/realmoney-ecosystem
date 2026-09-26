import { describe, it, expect } from 'vitest';
import { PtpStatus } from '../database/enums.js';
import {
  PTP_GRACE_HOURS,
  isPtpFailure,
  isPtpOverdue,
  ptpDeadline,
  ptpKeptRate,
  ptpState,
  resolveOnPayment,
  resolveOverdue,
  resolvePtpStatus,
} from './ptp-status.js';

const NOW = new Date('2026-09-25T10:00:00Z');
const hours = (n: number) => n * 3_600_000;
const at = (offsetHours: number) => new Date(NOW.getTime() + hours(offsetHours));

const pending = (promisedDate: Date) => ({ status: PtpStatus.PENDING, promisedDate });

describe('ptp deadline', () => {
  it('adds the grace period to the promised date', () => {
    expect(ptpDeadline(NOW).toISOString()).toBe(at(PTP_GRACE_HOURS).toISOString());
  });

  it('honours an explicit grace override', () => {
    expect(ptpDeadline(NOW, 0).toISOString()).toBe(NOW.toISOString());
  });
});

describe('isPtpOverdue', () => {
  it('is false while inside the grace window', () => {
    expect(isPtpOverdue(pending(at(-PTP_GRACE_HOURS + 1)), NOW)).toBe(false);
  });

  it('is true exactly at the deadline', () => {
    expect(isPtpOverdue(pending(at(-PTP_GRACE_HOURS)), NOW)).toBe(true);
  });

  it('is false for a promise whose date is still in the future', () => {
    expect(isPtpOverdue(pending(at(48)), NOW)).toBe(false);
  });

  it('ignores promises that already concluded', () => {
    const old = at(-100);
    expect(isPtpOverdue({ status: PtpStatus.HONORED, promisedDate: old }, NOW)).toBe(false);
    expect(isPtpOverdue({ status: PtpStatus.BROKEN, promisedDate: old }, NOW)).toBe(false);
  });

  it('treats an unparseable date as not overdue rather than throwing', () => {
    expect(isPtpOverdue({ status: PtpStatus.PENDING, promisedDate: 'not-a-date' }, NOW)).toBe(false);
  });

  it('accepts an ISO string as well as a Date', () => {
    expect(isPtpOverdue(pending(at(-48)), NOW)).toBe(true);
    expect(
      isPtpOverdue({ status: PtpStatus.PENDING, promisedDate: at(-48).toISOString() }, NOW),
    ).toBe(true);
  });
});

describe('resolvePtpStatus', () => {
  it('reports a lapsed pending promise as broken before any sweep runs', () => {
    expect(resolvePtpStatus(pending(at(-48)), NOW)).toBe(PtpStatus.BROKEN);
  });

  it('leaves a live promise pending', () => {
    expect(resolvePtpStatus(pending(at(12)), NOW)).toBe(PtpStatus.PENDING);
  });

  it('never rewrites a concluded status', () => {
    expect(resolvePtpStatus({ status: PtpStatus.HONORED, promisedDate: at(-99) }, NOW)).toBe(
      PtpStatus.HONORED,
    );
  });
});

describe('ptpState', () => {
  it('is NONE with no promise, or one that was kept', () => {
    expect(ptpState(null, NOW)).toBe('NONE');
    expect(ptpState(undefined, NOW)).toBe('NONE');
    expect(ptpState({ status: PtpStatus.HONORED, promisedDate: at(-99) }, NOW)).toBe('NONE');
  });

  it('separates a live promise from a lapsed one', () => {
    expect(ptpState(pending(at(12)), NOW)).toBe('PENDING');
    expect(ptpState(pending(at(-48)), NOW)).toBe('OVERDUE');
  });

  it('keeps flagging a promise after the sweep resolves it to BROKEN', () => {
    // The row must not go quiet the moment the sweep runs: a borrower who just
    // broke their word would otherwise look like one who never gave it.
    expect(
      ptpState(
        {
          status: PtpStatus.BROKEN,
          promisedDate: at(-48),
          resolvedReason: 'DATE_PASSED',
        },
        NOW,
      ),
    ).toBe('BROKEN');
  });

  it('does not flag a renegotiated or pre-tracking promise as broken', () => {
    for (const reason of ['SUPERSEDED', 'BACKFILL_UNVERIFIED'] as const) {
      expect(
        ptpState(
          { status: PtpStatus.BROKEN, promisedDate: at(-48), resolvedReason: reason },
          NOW,
        ),
      ).toBe('NONE');
    }
  });
});

describe('ptpKeptRate', () => {
  it('is null when nothing has concluded, rather than a misleading zero', () => {
    expect(ptpKeptRate([])).toBeNull();
    expect(ptpKeptRate([{ status: PtpStatus.PENDING }, { status: PtpStatus.PENDING }])).toBeNull();
  });

  it('excludes pending promises from the denominator', () => {
    const rate = ptpKeptRate([
      { status: PtpStatus.HONORED },
      { status: PtpStatus.BROKEN },
      { status: PtpStatus.PENDING },
      { status: PtpStatus.PENDING },
    ]);
    expect(rate).toBe(0.5);
  });

  it('reaches 1 and 0 at the extremes', () => {
    expect(ptpKeptRate([{ status: PtpStatus.HONORED }])).toBe(1);
    expect(ptpKeptRate([{ status: PtpStatus.BROKEN }])).toBe(0);
  });

  it('excludes the historical backfill by default so the rate is not cratered by it', () => {
    const rows = [
      { status: PtpStatus.HONORED, resolvedReason: 'SETTLED_IN_FULL' as const },
      { status: PtpStatus.BROKEN, resolvedReason: 'BACKFILL_UNVERIFIED' as const },
      { status: PtpStatus.BROKEN, resolvedReason: 'BACKFILL_UNVERIFIED' as const },
    ];
    expect(ptpKeptRate(rows)).toBe(1);
    expect(ptpKeptRate(rows, { includeBackfilled: true })).toBeCloseTo(1 / 3);
  });
});

describe('resolveOnPayment', () => {
  const ptp = { status: PtpStatus.PENDING, promisedAmount: 50_000 };

  it('honours the promise when the loan settles, whatever was paid', () => {
    expect(resolveOnPayment(ptp, 10_000, true, NOW)).toEqual({
      status: PtpStatus.HONORED,
      resolvedAt: NOW,
      resolvedReason: 'SETTLED_IN_FULL',
    });
  });

  it('honours the promise when the payment covers the promised amount', () => {
    expect(resolveOnPayment(ptp, 50_000, false, NOW)?.resolvedReason).toBe('PARTIAL_PAYMENT');
    expect(resolveOnPayment(ptp, 60_000, false, NOW)?.status).toBe(PtpStatus.HONORED);
  });

  it('leaves the promise pending when the payment falls short', () => {
    expect(resolveOnPayment(ptp, 49_999, false, NOW)).toBeNull();
  });

  it('is a no-op on an already-resolved promise, so it is safe to retry', () => {
    expect(resolveOnPayment({ ...ptp, status: PtpStatus.HONORED }, 99_999, true, NOW)).toBeNull();
    expect(resolveOnPayment({ ...ptp, status: PtpStatus.BROKEN }, 99_999, true, NOW)).toBeNull();
  });

  it('compares numerically when the amount arrives as a string from the driver', () => {
    const stringy = { status: PtpStatus.PENDING, promisedAmount: '50000' as unknown as number };
    expect(resolveOnPayment(stringy, 50_000, false, NOW)?.status).toBe(PtpStatus.HONORED);
  });
});

describe('resolveOverdue', () => {
  it('returns null for a promise that has not lapsed', () => {
    expect(resolveOverdue(pending(at(12)), NOW)).toBeNull();
  });

  it('dates the break at the deadline, not at the moment it was noticed', () => {
    const promised = at(-72);
    const resolution = resolveOverdue(pending(promised), NOW);
    expect(resolution?.status).toBe(PtpStatus.BROKEN);
    expect(resolution?.resolvedAt.toISOString()).toBe(ptpDeadline(promised).toISOString());
    expect(resolution?.resolvedAt.getTime()).toBeLessThan(NOW.getTime());
  });

  it('marks promises predating the cutoff as an unverified backfill', () => {
    const cutoff = at(-24);
    expect(resolveOverdue(pending(at(-500)), NOW, cutoff)?.resolvedReason).toBe(
      'BACKFILL_UNVERIFIED',
    );
    expect(resolveOverdue(pending(at(-30)), NOW, cutoff)?.resolvedReason).toBe('DATE_PASSED');
  });

  it('treats everything as genuinely missed when no cutoff is supplied', () => {
    expect(resolveOverdue(pending(at(-500)), NOW)?.resolvedReason).toBe('DATE_PASSED');
  });
});

describe('non-failure resolutions', () => {
  it('treats a renegotiated promise as not a failure', () => {
    expect(isPtpFailure('SUPERSEDED')).toBe(false);
  });

  it('treats the historical backfill as not a failure', () => {
    expect(isPtpFailure('BACKFILL_UNVERIFIED')).toBe(false);
  });

  it('treats a genuinely missed deadline as a failure', () => {
    expect(isPtpFailure('DATE_PASSED')).toBe(true);
  });

  it('treats a missing reason as a failure, so nothing is quietly excused', () => {
    expect(isPtpFailure(null)).toBe(true);
    expect(isPtpFailure(undefined)).toBe(true);
  });

  it('keeps superseded promises out of the kept-rate entirely', () => {
    // A collector who renegotiates and then has the new promise kept should read
    // 100%, not 50% -- the original was replaced, not broken.
    const rows = [
      { status: PtpStatus.BROKEN, resolvedReason: 'SUPERSEDED' as const },
      { status: PtpStatus.HONORED, resolvedReason: 'SETTLED_IN_FULL' as const },
    ];
    expect(ptpKeptRate(rows)).toBe(1);
    // Not even the include-historical toggle brings them back.
    expect(ptpKeptRate(rows, { includeBackfilled: true })).toBe(1);
  });
});
