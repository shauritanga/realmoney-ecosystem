/**
 * Late-payment penalties.
 *
 * `LoanProduct.latePenaltyRateDaily` has been seeded at 1%/day since the beginning
 * and read by nothing: `Loan.penaltyAmount` was set to 0 at creation and never
 * written again, while the Swahili reminder SMS has been promising a penalty all
 * along ("ili kuepuka faini"). These are the pure helpers behind actually charging it.
 *
 * Two rules matter more than the arithmetic:
 *
 *  1. **Penalties never accrue on penalties.** The base is the contracted debt still
 *     unpaid -- principal, interest and fee -- with accrued penalty excluded. A
 *     compounding charge on a defaulted loan runs away from any amount a borrower
 *     could ever repay.
 *  2. **There is a ceiling.** At 1%/day an uncapped penalty passes the principal
 *     itself inside four months and keeps going for as long as the row exists.
 *     `maxPenaltyPercentOfPrincipal` stops it.
 *
 * Days are counted with `utcDaysBetween`, the same helper behind `daysToDue`, so the
 * penalty and the collections queue can never disagree about whether a loan is late.
 */
import { AgingBucket } from '../database/enums.js';
import { utcDaysBetween } from '../collections/date-range.js';

/** Just enough of a loan to price a penalty. */
export interface PenaltyInput {
  dueDate: Date | string;
  /** Contracted amount: principal + interest + fee. Excludes penalty. */
  totalAmount: number;
  totalPaid: number;
  principalAmount: number;
  penaltyAmount: number;
  /** How far penalties have already been charged. Null means never swept. */
  penaltyAccruedThrough: Date | string | null;
}

export interface PenaltySettings {
  /** Percent of the unpaid contracted debt, per day. */
  ratePerDay: number;
  /** Ceiling on total accrued penalty as a percent of principal. 0 disables it. */
  maxPercentOfPrincipal: number;
}

export interface PenaltyAccrual {
  /** Additional penalty to charge now, always > 0. */
  amount: number;
  /** Whole days this charge covers. */
  days: number;
  /** The new `penaltyAccruedThrough` watermark. */
  through: Date;
  /** True when the ceiling clipped the charge. */
  capped: boolean;
}

/** Round to whole cents, away from float drift. */
function money(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The debt a penalty is charged on: contracted amount still unpaid, penalty
 * excluded. Never negative -- an overpaid loan owes nothing.
 */
export function penaltyBase(loan: Pick<PenaltyInput, 'totalAmount' | 'totalPaid'>): number {
  return Math.max(0, money(Number(loan.totalAmount) - Number(loan.totalPaid)));
}

/**
 * The most penalty this loan may ever carry. `Infinity` when the ceiling is disabled.
 */
export function penaltyCeiling(principal: number, maxPercentOfPrincipal: number): number {
  if (!(maxPercentOfPrincipal > 0)) return Infinity;
  return money(Number(principal) * (maxPercentOfPrincipal / 100));
}

/**
 * Whole days of penalty not yet charged.
 *
 * Counting starts the day after the due date, and never before the watermark -- so a
 * loan that falls overdue today owes nothing until tomorrow, and a loan whose
 * watermark was set by the back-fill is not billed for the months before the policy
 * existed.
 */
export function penaltyDaysDue(loan: PenaltyInput, now: Date): number {
  const due = new Date(loan.dueDate);
  const watermark = loan.penaltyAccruedThrough ? new Date(loan.penaltyAccruedThrough) : due;
  const from = watermark.getTime() > due.getTime() ? watermark : due;
  return Math.max(0, utcDaysBetween(from, now));
}

/**
 * What to charge this loan right now, or null when there is nothing to charge.
 *
 * Idempotent by construction: the caller advances `penaltyAccruedThrough` to
 * `through`, after which a second call the same day counts zero days.
 */
export function accruePenalty(
  loan: PenaltyInput,
  settings: PenaltySettings,
  now: Date,
): PenaltyAccrual | null {
  const days = penaltyDaysDue(loan, now);
  if (days <= 0) return null;

  const base = penaltyBase(loan);
  // A loan that is fully paid but not yet marked settled owes no penalty, and neither
  // does one on a zero-rate product. Advance the watermark anyway so the days do not
  // pile up waiting to be charged the moment either changes.
  const raw = money(base * (Number(settings.ratePerDay) / 100) * days);

  const ceiling = penaltyCeiling(loan.principalAmount, settings.maxPercentOfPrincipal);
  const room = money(ceiling - Number(loan.penaltyAmount));
  const amount = Math.max(0, Math.min(raw, room));
  if (amount <= 0) return null;

  return {
    amount,
    days,
    through: now,
    capped: amount < raw,
  };
}

/**
 * How overdue a loan is, in whole days. Negative values are clamped to zero so a
 * loan that is not yet due reads as CURRENT rather than as a negative age.
 */
export function daysOverdueFor(dueDate: Date | string, now: Date): number {
  // daysToDue() is utcDaysBetween(now, dueDate) and reads positive while the loan is
  // still in the future, so overdue days are its negation.
  return Math.max(0, -utcDaysBetween(now, new Date(dueDate)));
}

/** The reporting bucket for a given age. Matches the admin aging breakdown. */
export function agingBucketFor(daysOverdue: number): AgingBucket {
  if (daysOverdue <= 0) return AgingBucket.CURRENT;
  if (daysOverdue <= 7) return AgingBucket.D1_7;
  if (daysOverdue <= 30) return AgingBucket.D8_30;
  if (daysOverdue <= 60) return AgingBucket.D31_60;
  return AgingBucket.D60_PLUS;
}
