import type { Loan } from '../database/entities/loan.entity.js';
import { LoanStatus } from '../database/enums.js';

export const INITIAL_BORROWING_LIMIT = 8000;

/** Derived from the latest settled principal, never from fees or prior limits. */
export function borrowingLimit(loan: Pick<Loan,
  'principalAmount' | 'settledAt' | 'dueDate' | 'status' | 'outstandingBalance'
> & Partial<Pick<Loan, 'originalDueDate'>> | null) {
  if (!loan) {
    return { amount: INITIAL_BORROWING_LIMIT, reason: 'FIRST_LOAN', increasePercent: 0 };
  }
  // Measured against the date the borrower originally agreed to, not the one they
  // may have bought later. An extension is paid for precisely because the loan was
  // going to be late, so honouring the extended date here would hand out the on-time
  // reward for the opposite of paying on time. Loans disbursed before extensions
  // existed have no original date and fall back to their only one.
  const contractedDueDate = loan.originalDueDate ?? loan.dueDate;
  const onTime = loan.status === LoanStatus.SETTLED &&
    Number(loan.outstandingBalance) === 0 && loan.settledAt != null &&
    new Date(loan.settledAt).getTime() <= new Date(contractedDueDate).getTime();
  return {
    amount: Math.floor(Number(loan.principalAmount) * (onTime ? 1.25 : 1)),
    reason: onTime ? 'ON_TIME' : 'NO_ON_TIME_SETTLEMENT',
    increasePercent: onTime ? 25 : 0,
  };
}
