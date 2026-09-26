import { describe, it, expect } from 'vitest';
import {
  EAT_OFFSET_MS,
  MAX_RANGE_DAYS,
  eatDayKey,
  eatDayKeys,
  eatDayStart,
  resolveDateRange,
  startOfEatDay,
  startOfUtcDay,
  todayRange,
  utcDaysBetween,
} from './date-range.js';

const NOW = new Date('2026-09-25T10:00:00Z');

describe('utc day helpers', () => {
  it('truncates to the UTC day regardless of time of day', () => {
    expect(startOfUtcDay(new Date('2026-09-25T23:59:59Z')).toISOString()).toBe(
      '2026-09-25T00:00:00.000Z',
    );
  });

  it('counts whole calendar days between instants', () => {
    expect(utcDaysBetween(NOW, new Date('2026-09-27T01:00:00Z'))).toBe(2);
    expect(utcDaysBetween(NOW, new Date('2026-09-23T23:00:00Z'))).toBe(-2);
    expect(utcDaysBetween(NOW, NOW)).toBe(0);
  });
});

describe('eat day keys', () => {
  it('is three hours ahead of UTC', () => {
    expect(EAT_OFFSET_MS).toBe(3 * 60 * 60 * 1000);
  });

  it('puts late-evening UTC into the next EAT day', () => {
    // 21:00 UTC is midnight in Dar es Salaam. Naive UTC bucketing would file a
    // collector's 00:30 EAT call under the previous day.
    expect(eatDayKey(new Date('2026-09-25T20:59:59Z'))).toBe('2026-09-25');
    expect(eatDayKey(new Date('2026-09-25T21:00:00Z'))).toBe('2026-09-26');
  });

  it('puts early-morning EAT work into the correct local day', () => {
    // The old setHours(0,0,0,0) on a UTC host started the day at 03:00 EAT, so work
    // between 00:00 and 03:00 EAT landed in the previous day's numbers.
    expect(eatDayKey(new Date('2026-09-25T01:00:00Z'))).toBe('2026-09-25');
  });

  it('round-trips a day key through its starting instant', () => {
    expect(eatDayStart('2026-09-25').toISOString()).toBe('2026-09-24T21:00:00.000Z');
    expect(eatDayKey(eatDayStart('2026-09-25'))).toBe('2026-09-25');
  });

  it('rejects an unparseable day key', () => {
    expect(() => eatDayStart('nonsense')).toThrow(/Invalid day key/);
  });

  it('startOfEatDay lands on the local midnight containing now', () => {
    expect(startOfEatDay(NOW).toISOString()).toBe('2026-09-24T21:00:00.000Z');
  });
});

describe('resolveDateRange', () => {
  it('produces a half-open range covering the whole of the "to" day', () => {
    const range = resolveDateRange('2026-09-01', '2026-09-25', NOW);
    expect(range.from.toISOString()).toBe('2026-08-31T21:00:00.000Z');
    expect(range.to.toISOString()).toBe('2026-09-25T21:00:00.000Z');
    expect(range.fromKey).toBe('2026-09-01');
    expect(range.toKey).toBe('2026-09-25');
  });

  it('accepts a single day', () => {
    const range = resolveDateRange('2026-09-25', '2026-09-25', NOW);
    expect(range.to.getTime() - range.from.getTime()).toBe(86_400_000);
  });

  it('defaults to the trailing 30 EAT days ending today', () => {
    const range = resolveDateRange(undefined, undefined, NOW);
    expect(range.toKey).toBe('2026-09-25');
    expect(range.fromKey).toBe('2026-08-27');
    expect(range.to.getTime() - range.from.getTime()).toBe(30 * 86_400_000);
  });

  it('rejects an inverted range', () => {
    expect(() => resolveDateRange('2026-09-25', '2026-09-01', NOW)).toThrow(/must not be after/);
  });

  it('rejects a span that would scan years', () => {
    expect(() => resolveDateRange('2020-01-01', '2026-09-25', NOW)).toThrow(
      new RegExp(`must not exceed ${MAX_RANGE_DAYS} days`),
    );
  });

  it('allows exactly the maximum span', () => {
    expect(() => resolveDateRange('2025-09-25', '2026-09-24', NOW)).not.toThrow();
  });
});

describe('todayRange', () => {
  it('covers exactly the EAT day containing now', () => {
    const range = todayRange(NOW);
    expect(range.fromKey).toBe('2026-09-25');
    expect(range.toKey).toBe('2026-09-25');
    expect(range.from.toISOString()).toBe('2026-09-24T21:00:00.000Z');
    expect(range.to.getTime() - range.from.getTime()).toBe(86_400_000);
  });

  it('includes work done just after local midnight', () => {
    const justAfterLocalMidnight = new Date('2026-09-25T21:30:00Z');
    const range = todayRange(justAfterLocalMidnight);
    expect(range.fromKey).toBe('2026-09-26');
    expect(justAfterLocalMidnight >= range.from).toBe(true);
    expect(justAfterLocalMidnight < range.to).toBe(true);
  });
});

describe('eatDayKeys', () => {
  it('lists every day in the range, inclusive and ordered', () => {
    const keys = eatDayKeys(resolveDateRange('2026-09-23', '2026-09-26', NOW));
    expect(keys).toEqual(['2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26']);
  });

  it('returns a single key for a one-day range', () => {
    expect(eatDayKeys(todayRange(NOW))).toEqual(['2026-09-25']);
  });
});
