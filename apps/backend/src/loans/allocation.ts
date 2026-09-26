/**
 * How a payment is applied across what a borrower owes.
 *
 * Until now `outstandingBalance` was decremented by a flat amount with no record of
 * what the money settled, so a partial payment was indistinguishable from a small
 * full one and the income accounts had nothing to post against.
 *
 * Order is penalty -> interest -> fee -> principal: charges for carrying the debt are
 * cleared before the debt itself, which is both the industry norm and the order that
 * stops a borrower paying interest on charges they have already covered.
 */
import { ALLOCATION_ORDER } from '../database/enums.js';
import type { AllocationLeg } from '../database/enums.js';

export type Owed = Record<AllocationLeg, number>;

export interface Allocation extends Owed {
  /**
   * Money that had nowhere to go. Should be zero -- callers enforce
   * `amount <= outstandingBalance` -- but returning it makes an overpayment a visible
   * number rather than a silent rounding artefact.
   */
  unapplied: number;
}

/**
 * Cents, and never NaN.
 *
 * A missing or unparseable balance becomes zero rather than poisoning every leg: an
 * allocation is a total function, and silently writing NaN into a money column is far
 * worse than allocating nothing.
 */
function money(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

/**
 * Fills each bucket in order until the money runs out.
 *
 * Pure and total: negative or missing balances are treated as zero, and the four legs
 * plus `unapplied` always sum to `amount`.
 */
export function allocatePayment(amount: number, owed: Partial<Owed>): Allocation {
  let remaining = money(amount);
  if (remaining < 0) remaining = 0;

  const result = { penalty: 0, interest: 0, fee: 0, principal: 0, unapplied: 0 } as Allocation;

  for (const leg of ALLOCATION_ORDER) {
    if (remaining <= 0) break;
    const due = Math.max(0, money(owed[leg]));
    const applied = Math.min(remaining, due);
    result[leg] = applied;
    remaining = money(remaining - applied);
  }

  result.unapplied = remaining;
  return result;
}

/** The four legs of an allocation, summed. Excludes `unapplied`. */
export function allocationTotal(allocation: Partial<Allocation>): number {
  return money(ALLOCATION_ORDER.reduce((sum, leg) => sum + money(allocation[leg]), 0));
}

/**
 * What a loan still owes per bucket, derived from the allocation legs already
 * recorded against it.
 *
 * Deriving rather than denormalising keeps one source of truth. Repayments made
 * before the waterfall existed have all-zero legs -- nothing recorded what they
 * settled -- so their amount is treated as having come off the principal, which is
 * where the old flat decrement effectively put it.
 */
export function outstandingByLeg(
  loan: { interestAmount: number; processingFee: number; penaltyAmount: number; principalAmount: number },
  paid: Owed,
): Owed {
  return {
    penalty: Math.max(0, money(Number(loan.penaltyAmount) - paid.penalty)),
    interest: Math.max(0, money(Number(loan.interestAmount) - paid.interest)),
    fee: Math.max(0, money(Number(loan.processingFee) - paid.fee)),
    principal: Math.max(0, money(Number(loan.principalAmount) - paid.principal)),
  };
}
