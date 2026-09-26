import { describe, expect, it } from 'vitest';
import { allocatePayment, allocationTotal, outstandingByLeg } from './allocation.js';

/** A loan owing a bit of everything, so leg order is actually observable. */
const OWED = { penalty: 300, interest: 2000, fee: 250, principal: 10_000 };

describe('payment allocation', () => {
  it('clears penalty, then interest, then fee, then principal', () => {
    expect(allocatePayment(2600, OWED)).toEqual({
      penalty: 300,
      interest: 2000,
      fee: 250,
      principal: 50,
      unapplied: 0,
    });
  });

  it('puts a payment smaller than the penalty entirely against the penalty', () => {
    expect(allocatePayment(100, OWED)).toEqual({
      penalty: 100, interest: 0, fee: 0, principal: 0, unapplied: 0,
    });
  });

  it('fills a leg exactly without spilling into the next one', () => {
    expect(allocatePayment(300, OWED)).toMatchObject({ penalty: 300, interest: 0 });
    expect(allocatePayment(2300, OWED)).toMatchObject({ penalty: 300, interest: 2000, fee: 0 });
  });

  it('reports an overpayment as unapplied rather than inventing a fifth bucket', () => {
    const total = OWED.penalty + OWED.interest + OWED.fee + OWED.principal;
    expect(allocatePayment(total + 500, OWED)).toEqual({ ...OWED, unapplied: 500 });
  });

  it('always sums the four legs plus unapplied back to the amount', () => {
    for (const amount of [0, 1, 299.99, 300, 2549.5, 12_550, 99_999]) {
      const result = allocatePayment(amount, OWED);
      expect(allocationTotal(result) + result.unapplied).toBeCloseTo(amount, 2);
    }
  });

  it('skips a leg that is already clear', () => {
    expect(allocatePayment(500, { penalty: 0, interest: 0, fee: 250, principal: 10_000 }))
      .toMatchObject({ fee: 250, principal: 250 });
  });

  it('treats a missing, negative or unparseable balance as nothing owed', () => {
    expect(allocatePayment(1000, {})).toEqual({
      penalty: 0, interest: 0, fee: 0, principal: 0, unapplied: 1000,
    });
    expect(allocatePayment(1000, { penalty: -50, interest: NaN, fee: undefined, principal: 400 }))
      .toMatchObject({ penalty: 0, interest: 0, fee: 0, principal: 400, unapplied: 600 });
  });

  it('allocates nothing for a zero or negative amount', () => {
    for (const amount of [0, -1, NaN]) {
      expect(allocationTotal(allocatePayment(amount, OWED))).toBe(0);
    }
  });

  it('rounds to whole cents rather than accumulating float error', () => {
    const result = allocatePayment(0.3, { penalty: 0.1, interest: 0.2, fee: 0, principal: 5 });
    expect(result.penalty).toBe(0.1);
    expect(result.interest).toBe(0.2);
    expect(result.principal).toBe(0);
    expect(result.unapplied).toBe(0);
  });

  /**
   * The property the reconcile branch leans on: running the whole payment history
   * through the waterfall and subtracting gives what is still owed, so no per-leg
   * denormalised column is needed on the loan.
   */
  it('is consistent when replayed: history then increment equals one combined run', () => {
    const contracted = { penalty: 300, interest: 2000, fee: 250, principal: 10_000 };
    const first = allocatePayment(1000, contracted);
    const remaining = {
      penalty: contracted.penalty - first.penalty,
      interest: contracted.interest - first.interest,
      fee: contracted.fee - first.fee,
      principal: contracted.principal - first.principal,
    };
    const second = allocatePayment(2000, remaining);
    const combined = allocatePayment(3000, contracted);

    expect({
      penalty: first.penalty + second.penalty,
      interest: first.interest + second.interest,
      fee: first.fee + second.fee,
      principal: first.principal + second.principal,
    }).toEqual({
      penalty: combined.penalty,
      interest: combined.interest,
      fee: combined.fee,
      principal: combined.principal,
    });
  });
});

describe('outstanding by leg', () => {
  const loan = { penaltyAmount: 300, interestAmount: 2000, processingFee: 250, principalAmount: 10_000 };

  it('subtracts what has been applied to each leg', () => {
    expect(outstandingByLeg(loan, { penalty: 300, interest: 500, fee: 0, principal: 0 }))
      .toEqual({ penalty: 0, interest: 1500, fee: 250, principal: 10_000 });
  });

  it('never reports a negative balance when a leg was overpaid', () => {
    expect(outstandingByLeg(loan, { penalty: 900, interest: 0, fee: 0, principal: 0 }).penalty).toBe(0);
  });
});
