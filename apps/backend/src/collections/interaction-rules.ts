import { CommunicationChannel, DispositionCode } from '../database/enums.js';
import type { CallOutcome, DurationSource } from '../database/enums.js';
import { eatDaysBetween } from './date-range.js';

/**
 * Cross-field rules for a logged interaction, as pure functions.
 *
 * `logInteraction` previously accepted a PROMISED_TO_PAY with no amount and silently
 * created no promise while still returning 201 -- the collector saw success and the
 * promise simply vanished. `ptpAmount: 0` was dropped the same way, because the guard
 * was a truthiness check. These rules close that, and everything lives here rather
 * than in the service so it can be tested without a database.
 */

/** A promise may not be made further out than this. */
export const MAX_PTP_DAYS = 30;
/** A callback may not be scheduled further out than this. */
export const MAX_CALLBACK_DAYS = 14;
/** Smallest promise worth recording, in TZS. */
export const MIN_PTP_AMOUNT = 500;

export interface InteractionPayload {
  channel: CommunicationChannel;
  disposition: DispositionCode;
  notes?: string | null;
  durationSeconds?: number | null;
  durationSource?: DurationSource | null;
  callOutcome?: CallOutcome | null;
  followUpAt?: string | null;
  ptpAmount?: number | null;
  ptpDate?: string | null;
}

export interface InteractionContext {
  /** Used to cap a promise at what is actually owed. */
  outstandingBalance: number;
  now: Date;
}

/**
 * Returns every problem with the payload. An empty array means it is valid; the
 * caller raises a single BadRequestException joining the messages, so a collector
 * learns about all the problems at once instead of one per round trip.
 */
export function validateInteraction(
  dto: InteractionPayload,
  ctx: InteractionContext,
): string[] {
  const errors: string[] = [];

  if (dto.disposition === DispositionCode.PROMISED_TO_PAY) {
    const amount = dto.ptpAmount;
    if (amount === undefined || amount === null) {
      errors.push('A promise to pay needs an amount.');
    } else if (!Number.isFinite(amount) || amount <= 0) {
      errors.push('Promise amount must be greater than zero.');
    } else if (amount < MIN_PTP_AMOUNT) {
      errors.push(`Promise amount must be at least TZS ${MIN_PTP_AMOUNT}.`);
    } else if (amount > ctx.outstandingBalance) {
      errors.push('Promise amount cannot exceed the outstanding balance.');
    }

    if (!dto.ptpDate) {
      errors.push('A promise to pay needs a date.');
    } else {
      const promised = parseDate(dto.ptpDate);
      if (!promised) {
        errors.push('Promise date is not a valid date.');
      } else {
        // A promise date is a calendar day the borrower named, not an instant, so
        // compare whole EAT days. Comparing instants would reject "30 days out"
        // whenever the client sent a time of day later than local midnight.
        const daysOut = eatDaysBetween(ctx.now, promised);
        if (daysOut < 0) {
          errors.push('Promise date cannot be in the past.');
        } else if (daysOut > MAX_PTP_DAYS) {
          errors.push(`Promise date cannot be more than ${MAX_PTP_DAYS} days away.`);
        }
      }
    }
  }

  if (dto.disposition === DispositionCode.CALLBACK_REQUESTED) {
    if (!dto.followUpAt) {
      errors.push('A callback request needs a date and time.');
    } else {
      const followUp = parseDate(dto.followUpAt);
      if (!followUp) {
        errors.push('Callback time is not a valid date.');
      } else if (followUp.getTime() <= ctx.now.getTime()) {
        errors.push('Callback time must be in the future.');
      } else if (followUp.getTime() > ctx.now.getTime() + MAX_CALLBACK_DAYS * 86_400_000) {
        errors.push(`Callback cannot be more than ${MAX_CALLBACK_DAYS} days away.`);
      }
    }
  }

  // A claim the system cannot verify must carry an explanation.
  if (dto.disposition === DispositionCode.PAID && !dto.notes?.trim()) {
    errors.push('Marking a case PAID requires a note explaining the payment.');
  }

  if (dto.channel !== CommunicationChannel.CALL) {
    if (dto.durationSeconds) {
      errors.push('Only calls can carry a duration.');
    }
    if (dto.callOutcome) {
      errors.push('Only calls can carry a call outcome.');
    }
  } else if (dto.durationSource === 'CALL_LOG' && !dto.callOutcome) {
    // A call-log read always yields a call type; its absence means the client
    // fabricated the provenance.
    errors.push('A call-log duration must include the call outcome.');
  }

  if (dto.durationSeconds !== undefined && dto.durationSeconds !== null) {
    if (!Number.isInteger(dto.durationSeconds) || dto.durationSeconds < 0) {
      errors.push('Duration must be a whole number of seconds.');
    }
  }

  return errors;
}

/**
 * Whether the collector actually spoke to someone.
 *
 * Derived on the server from the call outcome so the client cannot claim a contact it
 * did not make, and so `COUNT(*) FILTER (WHERE connected)` is a plain index scan
 * rather than a rule reimplemented in SQL.
 */
export function deriveConnected(
  channel: CommunicationChannel,
  callOutcome?: CallOutcome | null,
  durationSeconds?: number | null,
): boolean | null {
  // A handed-off message is an attempt, never a confirmed contact.
  if (channel !== CommunicationChannel.CALL) return null;

  switch (callOutcome) {
    case 'ANSWERED':
      return true;
    case 'NO_ANSWER':
    case 'MISSED':
    case 'DECLINED':
    case 'BUSY':
      return false;
    case 'UNKNOWN':
    case undefined:
    case null:
      // No outcome reported: fall back to talk time, and stay honest about not
      // knowing when there is none.
      if (durationSeconds && durationSeconds > 0) return true;
      return null;
    default:
      return null;
  }
}

/**
 * The provenance to store. Non-call channels are always NONE, so a client cannot
 * inflate verified talk time by tagging an SMS as call-log-derived.
 */
export function normaliseDurationSource(
  channel: CommunicationChannel,
  durationSource?: DurationSource | null,
  durationSeconds?: number | null,
): DurationSource {
  if (channel !== CommunicationChannel.CALL) return 'NONE';
  if (durationSource) return durationSource;
  return durationSeconds && durationSeconds > 0 ? 'MANUAL' : 'NONE';
}

function parseDate(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
