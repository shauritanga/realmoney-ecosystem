import { describe, it, expect } from 'vitest';
import { CommunicationChannel, DispositionCode } from '../database/enums.js';
import {
  MAX_CALLBACK_DAYS,
  MAX_PTP_DAYS,
  MIN_PTP_AMOUNT,
  deriveConnected,
  normaliseDurationSource,
  validateInteraction,
} from './interaction-rules.js';

const NOW = new Date('2026-09-25T10:00:00Z');
const CTX = { outstandingBalance: 100_000, now: NOW };
const inDays = (n: number) => new Date(NOW.getTime() + n * 86_400_000).toISOString();

const call = (over: Record<string, unknown> = {}) => ({
  channel: CommunicationChannel.CALL,
  disposition: DispositionCode.UNREACHABLE,
  ...over,
});

const promise = (over: Record<string, unknown> = {}) =>
  call({
    disposition: DispositionCode.PROMISED_TO_PAY,
    ptpAmount: 50_000,
    ptpDate: inDays(3),
    ...over,
  });

describe('validateInteraction — promise to pay', () => {
  it('accepts a well-formed promise', () => {
    expect(validateInteraction(promise(), CTX)).toEqual([]);
  });

  it('rejects a promise with no amount — the old silent-drop bug', () => {
    expect(validateInteraction(promise({ ptpAmount: undefined }), CTX)).toContain(
      'A promise to pay needs an amount.',
    );
  });

  it('rejects a promise with no date — the other half of the silent drop', () => {
    expect(validateInteraction(promise({ ptpDate: undefined }), CTX)).toContain(
      'A promise to pay needs a date.',
    );
  });

  it('rejects a zero amount, which truthiness checks used to discard', () => {
    expect(validateInteraction(promise({ ptpAmount: 0 }), CTX)).toContain(
      'Promise amount must be greater than zero.',
    );
  });

  it('rejects a negative amount', () => {
    expect(validateInteraction(promise({ ptpAmount: -5_000 }), CTX)).toContain(
      'Promise amount must be greater than zero.',
    );
  });

  it('rejects an amount below the recording floor', () => {
    expect(validateInteraction(promise({ ptpAmount: MIN_PTP_AMOUNT - 1 }), CTX)).toContain(
      `Promise amount must be at least TZS ${MIN_PTP_AMOUNT}.`,
    );
  });

  it('rejects a promise larger than the debt', () => {
    expect(validateInteraction(promise({ ptpAmount: 100_001 }), CTX)).toContain(
      'Promise amount cannot exceed the outstanding balance.',
    );
  });

  it('accepts a promise for exactly the outstanding balance', () => {
    expect(validateInteraction(promise({ ptpAmount: 100_000 }), CTX)).toEqual([]);
  });

  it('rejects a past date but accepts today', () => {
    expect(validateInteraction(promise({ ptpDate: inDays(-1) }), CTX)).toContain(
      'Promise date cannot be in the past.',
    );
    expect(validateInteraction(promise({ ptpDate: NOW.toISOString() }), CTX)).toEqual([]);
  });

  it('caps how far out a promise may be made', () => {
    expect(validateInteraction(promise({ ptpDate: inDays(MAX_PTP_DAYS) }), CTX)).toEqual([]);
    expect(validateInteraction(promise({ ptpDate: inDays(MAX_PTP_DAYS + 2) }), CTX)).toContain(
      `Promise date cannot be more than ${MAX_PTP_DAYS} days away.`,
    );
  });

  it('compares promise dates as calendar days, not instants', () => {
    // A date picker sending "30 days out" carries a time of day. Comparing raw
    // instants against local midnight + 30d rejected the very date the picker
    // offered, so the boundary is evaluated in whole EAT days.
    const thirtyDaysOutLate = new Date(NOW.getTime() + MAX_PTP_DAYS * 86_400_000);
    thirtyDaysOutLate.setUTCHours(18, 30, 0, 0);
    expect(validateInteraction(promise({ ptpDate: thirtyDaysOutLate.toISOString() }), CTX)).toEqual(
      [],
    );
  });

  it('accepts a promise made earlier today', () => {
    // 07:00 EAT on the same local day: earlier than `now` but not a past date.
    expect(validateInteraction(promise({ ptpDate: '2026-09-25T04:00:00Z' }), CTX)).toEqual([]);
  });

  it('rejects an unparseable date instead of letting the driver throw', () => {
    expect(validateInteraction(promise({ ptpDate: 'tomorrow-ish' }), CTX)).toContain(
      'Promise date is not a valid date.',
    );
  });

  it('reports every problem at once rather than one per round trip', () => {
    const errors = validateInteraction(promise({ ptpAmount: 0, ptpDate: undefined }), CTX);
    expect(errors).toHaveLength(2);
  });

  it('ignores promise fields for other dispositions', () => {
    expect(validateInteraction(call({ ptpAmount: 0 }), CTX)).toEqual([]);
  });
});

describe('validateInteraction — callback', () => {
  const callback = (over: Record<string, unknown> = {}) =>
    call({ disposition: DispositionCode.CALLBACK_REQUESTED, followUpAt: inDays(1), ...over });

  it('accepts a future callback', () => {
    expect(validateInteraction(callback(), CTX)).toEqual([]);
  });

  it('requires a time — CALLBACK_REQUESTED used to capture nothing at all', () => {
    expect(validateInteraction(callback({ followUpAt: undefined }), CTX)).toContain(
      'A callback request needs a date and time.',
    );
  });

  it('rejects a callback in the past or right now', () => {
    expect(validateInteraction(callback({ followUpAt: inDays(-1) }), CTX)).toContain(
      'Callback time must be in the future.',
    );
    expect(validateInteraction(callback({ followUpAt: NOW.toISOString() }), CTX)).toContain(
      'Callback time must be in the future.',
    );
  });

  it('caps how far out a callback may be scheduled', () => {
    expect(
      validateInteraction(callback({ followUpAt: inDays(MAX_CALLBACK_DAYS + 1) }), CTX),
    ).toContain(`Callback cannot be more than ${MAX_CALLBACK_DAYS} days away.`);
  });
});

describe('validateInteraction — channel consistency', () => {
  it('requires a note when claiming a case is PAID', () => {
    const paid = { channel: CommunicationChannel.CALL, disposition: DispositionCode.PAID };
    expect(validateInteraction(paid, CTX)).toContain(
      'Marking a case PAID requires a note explaining the payment.',
    );
    expect(validateInteraction({ ...paid, notes: 'Paid cash at the office.' }, CTX)).toEqual([]);
    expect(validateInteraction({ ...paid, notes: '   ' }, CTX)).toHaveLength(1);
  });

  it('refuses a duration or call outcome on a message channel', () => {
    const sms = {
      channel: CommunicationChannel.SMS,
      disposition: DispositionCode.UNREACHABLE,
      durationSeconds: 45,
      callOutcome: 'ANSWERED' as const,
    };
    const errors = validateInteraction(sms, CTX);
    expect(errors).toContain('Only calls can carry a duration.');
    expect(errors).toContain('Only calls can carry a call outcome.');
  });

  it('allows WhatsApp with no duration', () => {
    expect(
      validateInteraction(
        { channel: CommunicationChannel.WHATSAPP, disposition: DispositionCode.UNREACHABLE },
        CTX,
      ),
    ).toEqual([]);
  });

  it('demands a call outcome when the client claims the duration came from the call log', () => {
    expect(
      validateInteraction(call({ durationSource: 'CALL_LOG', durationSeconds: 134 }), CTX),
    ).toContain('A call-log duration must include the call outcome.');
    expect(
      validateInteraction(
        call({ durationSource: 'CALL_LOG', durationSeconds: 134, callOutcome: 'ANSWERED' }),
        CTX,
      ),
    ).toEqual([]);
  });

  it('does not demand an outcome for a self-reported duration', () => {
    expect(
      validateInteraction(call({ durationSource: 'MANUAL', durationSeconds: 134 }), CTX),
    ).toEqual([]);
  });

  it('rejects a fractional or negative duration', () => {
    expect(validateInteraction(call({ durationSeconds: 1.5 }), CTX)).toContain(
      'Duration must be a whole number of seconds.',
    );
    expect(validateInteraction(call({ durationSeconds: -1 }), CTX)).toContain(
      'Duration must be a whole number of seconds.',
    );
  });

  it('accepts a zero duration', () => {
    expect(validateInteraction(call({ durationSeconds: 0 }), CTX)).toEqual([]);
  });
});

describe('deriveConnected', () => {
  const CALL = CommunicationChannel.CALL;

  it('trusts an answered call', () => {
    expect(deriveConnected(CALL, 'ANSWERED')).toBe(true);
  });

  it('treats every non-answer outcome as not connected', () => {
    for (const outcome of ['NO_ANSWER', 'MISSED', 'DECLINED', 'BUSY'] as const) {
      expect(deriveConnected(CALL, outcome, 30)).toBe(false);
    }
  });

  it('falls back to talk time when the outcome is unknown', () => {
    expect(deriveConnected(CALL, 'UNKNOWN', 30)).toBe(true);
    expect(deriveConnected(CALL, undefined, 30)).toBe(true);
    expect(deriveConnected(CALL, null, 30)).toBe(true);
  });

  it('stays null rather than guessing when nothing is known', () => {
    expect(deriveConnected(CALL, 'UNKNOWN', 0)).toBeNull();
    expect(deriveConnected(CALL, undefined, undefined)).toBeNull();
  });

  it('never marks a handed-off message as a contact', () => {
    expect(deriveConnected(CommunicationChannel.SMS, 'ANSWERED', 99)).toBeNull();
    expect(deriveConnected(CommunicationChannel.WHATSAPP, 'ANSWERED', 99)).toBeNull();
  });
});

describe('normaliseDurationSource', () => {
  it('forces message channels to NONE so verified talk time cannot be inflated', () => {
    expect(normaliseDurationSource(CommunicationChannel.SMS, 'CALL_LOG', 500)).toBe('NONE');
    expect(normaliseDurationSource(CommunicationChannel.WHATSAPP, 'CALL_LOG', 500)).toBe('NONE');
  });

  it('keeps the reported provenance for calls', () => {
    expect(normaliseDurationSource(CommunicationChannel.CALL, 'CALL_LOG', 134)).toBe('CALL_LOG');
    expect(normaliseDurationSource(CommunicationChannel.CALL, 'IN_APP_TIMER', 134)).toBe(
      'IN_APP_TIMER',
    );
  });

  it('infers self-reported when a duration arrives with no provenance', () => {
    expect(normaliseDurationSource(CommunicationChannel.CALL, null, 134)).toBe('MANUAL');
  });

  it('records NONE when there is no duration to attribute', () => {
    expect(normaliseDurationSource(CommunicationChannel.CALL, null, 0)).toBe('NONE');
    expect(normaliseDurationSource(CommunicationChannel.CALL, null, null)).toBe('NONE');
  });
});
