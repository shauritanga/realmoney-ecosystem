/**
 * Loan extensions: the borrower pays a fee and the due date moves out.
 *
 * The fee buys time and nothing else. It does not touch `outstandingBalance`,
 * `totalPaid` or `totalAmount` -- the debt at the end of an extension is exactly the
 * debt at the start. That is what makes an extension honest to describe and also what
 * keeps the borrower app's `paid / total` progress bar from running backwards.
 *
 * Rounding follows `clickpesa-fees.ts`: up to the nearest TZS 50, because that is what
 * a person can actually hand over.
 */
import { LoanStatus } from '../database/enums.js';

/** Extension fees round up to this, like every other fee the borrower sees. */
export const FEE_ROUNDING_TZS = 50;

/** Below this an extension is not worth the transaction cost on either side. */
export const MIN_EXTENSION_FEE_TZS = 500;

export interface ExtensionSettings {
  /** Percent of the outstanding balance. */
  feePercent: number;
  /** How many extensions one loan may have. */
  maxExtensions: number;
}

export interface ExtendableLoan {
  status: LoanStatus;
  dueDate: Date | string;
  tenureDays: number;
  outstandingBalance: number;
}

export type ExtensionCheck = { ok: true } | { ok: false; reason: string };

/**
 * What one extension costs. Rounded up to TZS 50 and floored at the minimum, so a
 * nearly-settled loan cannot buy a month for pocket change.
 */
export function extensionFee(outstanding: number, feePercent: number): number {
  const raw = Number(outstanding) * (Number(feePercent) / 100);
  const rounded = Math.ceil(raw / FEE_ROUNDING_TZS) * FEE_ROUNDING_TZS;
  return Math.max(MIN_EXTENSION_FEE_TZS, rounded);
}

/**
 * Where the due date lands. One more full tenure from the *current* due date, not
 * from today -- extending a loan that is already a week late should not quietly
 * forgive that week.
 */
export function extendedDueDate(currentDueDate: Date | string, tenureDays: number): Date {
  const next = new Date(currentDueDate);
  next.setDate(next.getDate() + tenureDays);
  return next;
}

/** Statuses for which buying more time is meaningful. */
const EXTENDABLE: LoanStatus[] = [LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED];

/**
 * Whether this loan may be extended right now, with a reason a collector can read
 * out on the call.
 */
export function canExtend(
  loan: ExtendableLoan,
  extensionsGranted: number,
  settings: ExtensionSettings,
): ExtensionCheck {
  if (!EXTENDABLE.includes(loan.status)) {
    return loan.status === LoanStatus.SETTLED
      ? { ok: false, reason: 'This loan is already settled.' }
      : { ok: false, reason: `A ${loan.status.toLowerCase()} loan cannot be extended.` };
  }

  if (Number(loan.outstandingBalance) <= 0) {
    return { ok: false, reason: 'Nothing is outstanding on this loan.' };
  }

  if (extensionsGranted >= settings.maxExtensions) {
    return {
      ok: false,
      reason:
        settings.maxExtensions === 1
          ? 'This loan has already been extended once, which is the limit.'
          : `This loan has already been extended ${extensionsGranted} times, which is the limit.`,
    };
  }

  return { ok: true };
}

/** Everything a client needs to show an extension offer before it is taken. */
export interface ExtensionQuote {
  fee: number;
  newDueDate: Date;
  currentDueDate: Date;
  extensionsGranted: number;
  extensionsRemaining: number;
  outstandingBalance: number;
}

export function quoteExtension(
  loan: ExtendableLoan,
  extensionsGranted: number,
  settings: ExtensionSettings,
): ExtensionQuote {
  return {
    fee: extensionFee(loan.outstandingBalance, settings.feePercent),
    newDueDate: extendedDueDate(loan.dueDate, loan.tenureDays),
    currentDueDate: new Date(loan.dueDate),
    extensionsGranted,
    extensionsRemaining: Math.max(0, settings.maxExtensions - extensionsGranted),
    outstandingBalance: Number(loan.outstandingBalance),
  };
}
