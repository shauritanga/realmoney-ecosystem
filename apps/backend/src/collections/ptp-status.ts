import { PtpStatus } from '../database/enums.js';
import type { PtpResolvedReason } from '../database/enums.js';

/**
 * Promise-to-pay lifecycle, as pure functions with an injected clock.
 *
 * Before this existed, `HONORED` and `BROKEN` were never written anywhere in the
 * codebase and `resolvedAt` was never set, so every promise stayed PENDING forever
 * and no kept-rate could be computed.
 */

/**
 * Grace after the promised date before a pending promise counts as broken. A
 * borrower who pays late on the promised day has still kept the promise.
 *
 * The Dart client hardcoded one hour of its own; this is now the single definition
 * and the client reads the derived state from the server instead.
 */
export const PTP_GRACE_HOURS = 24;

/**
 * When promise tracking went live.
 *
 * Every promise whose deadline passed before this was made while nothing wrote
 * HONORED or BROKEN at all, so the first sweep would otherwise flip years of
 * untracked promises to BROKEN at once and crater the kept-rate. Those are marked
 * BACKFILL_UNVERIFIED and excluded from the metric by default.
 *
 * A fixed date rather than "the first time the sweep ran": the boundary between
 * "nobody was measuring this" and "we measured it and they missed" must not move
 * when the process restarts. Override with PTP_TRACKING_START if a deployment goes
 * live on a different day.
 */
export const DEFAULT_PTP_TRACKING_START = '2026-09-25T00:00:00.000Z';

export function ptpTrackingStart(configured?: string): Date {
  const parsed = new Date(configured || DEFAULT_PTP_TRACKING_START);
  return Number.isNaN(parsed.getTime()) ? new Date(DEFAULT_PTP_TRACKING_START) : parsed;
}

export interface PtpLike {
  status: PtpStatus;
  promisedDate: Date | string;
}

/** The instant a promise is considered broken if nothing has been paid by then. */
export function ptpDeadline(promisedDate: Date | string, graceHours = PTP_GRACE_HOURS): Date {
  return new Date(new Date(promisedDate).getTime() + graceHours * 3_600_000);
}

/** A still-pending promise whose deadline has passed. */
export function isPtpOverdue(
  ptp: PtpLike,
  now: Date = new Date(),
  graceHours = PTP_GRACE_HOURS,
): boolean {
  if (ptp.status !== PtpStatus.PENDING) return false;
  const deadline = ptpDeadline(ptp.promisedDate, graceHours);
  if (Number.isNaN(deadline.getTime())) return false;
  return deadline.getTime() <= now.getTime();
}

/**
 * Display-time truth. A promise that lapsed seconds ago reads as BROKEN here even
 * before the next persistence sweep has run.
 */
export function resolvePtpStatus(ptp: PtpLike, now: Date = new Date()): PtpStatus {
  return isPtpOverdue(ptp, now) ? PtpStatus.BROKEN : ptp.status;
}

/**
 * What a collector's queue row shows, without leaking the whole PTP record.
 *
 * BROKEN is distinct from OVERDUE: OVERDUE is a promise past its deadline that the
 * sweep has not resolved yet, BROKEN is one it has. Both must stay visible on the
 * row. An earlier version returned NONE for anything not PENDING, so the moment the
 * sweep ran, a borrower who had just broken their word looked exactly like one who
 * never gave it -- losing precisely the signal a collector needs most.
 */
export type PtpState = 'NONE' | 'PENDING' | 'OVERDUE' | 'BROKEN';

export function ptpState(
  ptp: (PtpLike & { resolvedReason?: PtpResolvedReason | null }) | null | undefined,
  now: Date = new Date(),
): PtpState {
  if (!ptp) return 'NONE';
  if (ptp.status === PtpStatus.PENDING) {
    return isPtpOverdue(ptp, now) ? 'OVERDUE' : 'PENDING';
  }
  // A renegotiated or pre-tracking promise is not the borrower failing, so it is not
  // flagged on the row.
  if (ptp.status === PtpStatus.BROKEN && isPtpFailure(ptp.resolvedReason)) {
    return 'BROKEN';
  }
  return 'NONE';
}

/**
 * Reasons a promise concluded without the borrower having failed it. Neither belongs
 * in a kept-rate, and neither is an escalation candidate.
 *
 * SUPERSEDED means the borrower renegotiated and a replacement promise was recorded;
 * the outcome belongs to that replacement, so counting the original as broken would
 * penalise a collector for successfully re-securing a commitment.
 *
 * BACKFILL_UNVERIFIED means the promise lapsed before anything tracked outcomes at
 * all, so counting it would describe a backlog nobody was measuring.
 */
export const NON_FAILURE_PTP_REASONS: PtpResolvedReason[] = [
  'SUPERSEDED',
  'BACKFILL_UNVERIFIED',
];

export function isPtpFailure(resolvedReason?: PtpResolvedReason | null): boolean {
  return !resolvedReason || !NON_FAILURE_PTP_REASONS.includes(resolvedReason);
}

/**
 * Share of concluded promises that were kept.
 *
 * Pending promises are excluded — they have no outcome yet — so an all-pending set
 * returns null rather than a misleading 0. Superseded promises are always excluded,
 * and the historical backfill is excluded unless explicitly asked for.
 */
export function ptpKeptRate(
  ptps: Array<{ status: PtpStatus; resolvedReason?: PtpResolvedReason | null }>,
  opts: { includeBackfilled?: boolean } = {},
): number | null {
  let honored = 0;
  let concluded = 0;
  for (const p of ptps) {
    if (p.resolvedReason === 'SUPERSEDED') continue;
    if (!opts.includeBackfilled && p.resolvedReason === 'BACKFILL_UNVERIFIED') continue;
    if (p.status === PtpStatus.HONORED) honored++;
    if (p.status === PtpStatus.HONORED || p.status === PtpStatus.BROKEN) concluded++;
  }
  if (concluded === 0) return null;
  return honored / concluded;
}

export interface PtpResolution {
  status: PtpStatus;
  resolvedAt: Date;
  resolvedReason: PtpResolvedReason;
}

/**
 * How a payment resolves a pending promise. Called from inside the ClickPesa
 * settlement transaction, which already holds a pessimistic lock on the loan.
 *
 * Returns null to leave the promise PENDING — a part payment short of what was
 * promised is not yet a kept promise, and the date may still be in the future.
 */
export function resolveOnPayment(
  ptp: { status: PtpStatus; promisedAmount: number },
  amountPaid: number,
  loanSettled: boolean,
  now: Date = new Date(),
): PtpResolution | null {
  if (ptp.status !== PtpStatus.PENDING) return null;
  if (loanSettled) {
    return { status: PtpStatus.HONORED, resolvedAt: now, resolvedReason: 'SETTLED_IN_FULL' };
  }
  if (amountPaid >= Number(ptp.promisedAmount)) {
    return { status: PtpStatus.HONORED, resolvedAt: now, resolvedReason: 'PARTIAL_PAYMENT' };
  }
  return null;
}

/**
 * How a lapsed promise resolves.
 *
 * `resolvedAt` is the **deadline**, not `now`. The promise broke when its deadline
 * passed, not when a sweep happened to notice — recording the observation time would
 * make every "days late" figure depend on how often someone opened a dashboard.
 *
 * `cutoff` marks promises whose deadline predates the lifecycle going live, so the
 * one-time historical flood is distinguishable from promises that were genuinely
 * tracked and then missed.
 */
export function resolveOverdue(
  ptp: PtpLike,
  now: Date = new Date(),
  cutoff?: Date,
): PtpResolution | null {
  if (!isPtpOverdue(ptp, now)) return null;
  const deadline = ptpDeadline(ptp.promisedDate);
  const backfilled = cutoff !== undefined && deadline < cutoff;
  return {
    status: PtpStatus.BROKEN,
    resolvedAt: deadline,
    resolvedReason: backfilled ? 'BACKFILL_UNVERIFIED' : 'DATE_PASSED',
  };
}
