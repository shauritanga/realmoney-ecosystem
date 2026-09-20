import type { Loan } from '../database/entities/loan.entity.js';
import { LoanStatus } from '../database/enums.js';

export const INITIAL_BORROWING_LIMIT = 8000;

/** Derived from the latest settled principal, never from fees or prior limits. */
export function borrowingLimit(loan: Pick<Loan,
  'principalAmount' | 'settledAt' | 'dueDate' | 'status' | 'outstandingBalance'
> | null) {
  if (!loan) {
    return { amount: INITIAL_BORROWING_LIMIT, reason: 'FIRST_LOAN', increasePercent: 0 };
  }
  const onTime = loan.status === LoanStatus.SETTLED &&
    Number(loan.outstandingBalance) === 0 && loan.settledAt != null &&
    new Date(loan.settledAt).getTime() <= new Date(loan.dueDate).getTime();
  return {
    amount: Math.floor(Number(loan.principalAmount) * (onTime ? 1.25 : 1)),
    reason: onTime ? 'ON_TIME' : 'NO_ON_TIME_SETTLEMENT',
    increasePercent: onTime ? 25 : 0,
  };
}
