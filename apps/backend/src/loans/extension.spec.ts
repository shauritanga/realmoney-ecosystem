import { describe, expect, it } from 'vitest';
import { LoanStatus } from '../database/enums.js';
import {
  MIN_EXTENSION_FEE_TZS,
  canExtend,
  extendedDueDate,
  extensionFee,
  quoteExtension,
} from './extension.js';

const SETTINGS = { feePercent: 25, maxExtensions: 2 };

function loan(overrides: Record<string, unknown> = {}) {
  return {
    status: LoanStatus.OVERDUE,
    dueDate: new Date('2026-09-20T09:00:00.000Z'),
    tenureDays: 14,
    outstandingBalance: 12_250,
    ...overrides,
  } as any;
}

describe('extension fee', () => {
  it('is the configured percentage of the outstanding balance', () => {
    // 25% of 12,000 is exactly 3,000 and needs no rounding.
    expect(extensionFee(12_000, 25)).toBe(3000);
  });

  it('rounds up to the nearest TZS 50, because that is what a person can hand over', () => {
    // 25% of 12,250 is 3,062.50.
    expect(extensionFee(12_250, 25)).toBe(3100);
    expect(extensionFee(10_001, 25)).toBe(2550);
  });

  it('never charges less than the minimum, however small the balance', () => {
    expect(extensionFee(100, 25)).toBe(MIN_EXTENSION_FEE_TZS);
    expect(extensionFee(0, 25)).toBe(MIN_EXTENSION_FEE_TZS);
  });

  it('follows the configured percentage rather than a hardcoded 25', () => {
    expect(extensionFee(10_000, 10)).toBe(1000);
    expect(extensionFee(10_000, 50)).toBe(5000);
  });
});

describe('extended due date', () => {
  it('adds one more full tenure', () => {
    expect(extendedDueDate(new Date('2026-09-20T09:00:00.000Z'), 14).toISOString())
      .toBe('2026-10-04T09:00:00.000Z');
  });

  /**
   * Measured from the current due date, not from today: extending a loan that is
   * already a week late must not quietly forgive that week.
   */
  it('extends from the due date, not from today', () => {
    const alreadyLate = extendedDueDate(new Date('2026-09-01T00:00:00.000Z'), 30);
    expect(alreadyLate.toISOString().slice(0, 10)).toBe('2026-10-01');
  });

  it('rolls across month and year boundaries', () => {
    expect(extendedDueDate(new Date('2026-12-28T00:00:00.000Z'), 14).toISOString().slice(0, 10))
      .toBe('2027-01-11');
  });
});

describe('extension eligibility', () => {
  it.each([LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED])('allows a %s loan', (status) => {
    expect(canExtend(loan({ status }), 0, SETTINGS)).toEqual({ ok: true });
  });

  it('refuses a settled loan by name', () => {
    expect(canExtend(loan({ status: LoanStatus.SETTLED }), 0, SETTINGS))
      .toEqual({ ok: false, reason: 'This loan is already settled.' });
  });

  it.each([LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.REJECTED])('refuses a %s loan', (status) => {
    const result = canExtend(loan({ status }), 0, SETTINGS);
    expect(result.ok).toBe(false);
  });

  it('refuses when nothing is outstanding', () => {
    expect(canExtend(loan({ outstandingBalance: 0 }), 0, SETTINGS))
      .toMatchObject({ ok: false, reason: 'Nothing is outstanding on this loan.' });
  });

  it('allows extensions up to the cap and refuses the one after', () => {
    expect(canExtend(loan(), 0, SETTINGS).ok).toBe(true);
    expect(canExtend(loan(), 1, SETTINGS).ok).toBe(true);
    expect(canExtend(loan(), 2, SETTINGS).ok).toBe(false);
  });

  it('says how many were already granted when it refuses', () => {
    const result = canExtend(loan(), 2, SETTINGS);
    expect(result.ok).toBe(false);
    expect((result as { reason: string }).reason).toContain('2 times');
  });

  it('reads naturally when the cap is one', () => {
    const result = canExtend(loan(), 1, { feePercent: 25, maxExtensions: 1 });
    expect((result as { reason: string }).reason).toContain('already been extended once');
  });

  it('refuses everything when extensions are switched off', () => {
    expect(canExtend(loan(), 0, { feePercent: 25, maxExtensions: 0 }).ok).toBe(false);
  });
});

describe('extension quote', () => {
  it('reports the fee, both dates, and how many are left', () => {
    const quote = quoteExtension(loan(), 1, SETTINGS);
    expect(quote).toMatchObject({
      fee: 3100,
      extensionsGranted: 1,
      extensionsRemaining: 1,
      outstandingBalance: 12_250,
    });
    expect(quote.currentDueDate.toISOString().slice(0, 10)).toBe('2026-09-20');
    expect(quote.newDueDate.toISOString().slice(0, 10)).toBe('2026-10-04');
  });

  it('never reports a negative number remaining', () => {
    expect(quoteExtension(loan(), 5, SETTINGS).extensionsRemaining).toBe(0);
  });
});
