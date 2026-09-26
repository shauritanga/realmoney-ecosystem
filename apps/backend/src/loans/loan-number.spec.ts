import { describe, it, expect } from 'vitest';
import {
  CASE_NUMBER_MAX,
  CASE_NUMBER_MIN,
  CASE_NUMBER_SPACE,
  CaseNumberSpaceExhaustedError,
  nextCaseNumber,
  randomCaseNumber,
} from './loan-number.js';

/** A stand-in for Math.random that walks a fixed sequence. */
const sequence = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};

describe('randomCaseNumber', () => {
  it('is always four digits', () => {
    for (const r of [0, 0.5, 0.999999]) {
      const n = randomCaseNumber(() => r);
      expect(n).toMatch(/^\d{4}$/);
      expect(Number(n)).toBeGreaterThanOrEqual(CASE_NUMBER_MIN);
      expect(Number(n)).toBeLessThanOrEqual(CASE_NUMBER_MAX);
    }
  });

  it('never starts with a zero, so it reads as a whole number aloud', () => {
    expect(randomCaseNumber(() => 0)).toBe('1000');
    expect(randomCaseNumber(() => 0.999999)).toBe('9999');
  });
});

describe('nextCaseNumber', () => {
  const free = async () => false;

  it('returns a free number on the first try', async () => {
    expect(await nextCaseNumber(free, 0, 12, () => 0.5)).toBe('5500');
  });

  it('retries past a number already in use', async () => {
    const taken = new Set(['1000']);
    const number = await nextCaseNumber(
      async (candidate) => taken.has(candidate),
      1,
      12,
      sequence([0, 0.999999]),
    );
    expect(number).toBe('9999');
  });

  it('gives up rather than looping once the space is crowded', async () => {
    // Every candidate collides: that means the space is full, not bad luck.
    await expect(nextCaseNumber(async () => true, 8000)).rejects.toThrow(
      CaseNumberSpaceExhaustedError,
    );
  });

  it('refuses before drawing when every number is allocated', async () => {
    // A named error beats an infinite retry loop in production.
    await expect(nextCaseNumber(free, CASE_NUMBER_SPACE)).rejects.toThrow(
      /Widen the format to 5 digits/,
    );
  });

  it('reports how much of the space is used, so the message is actionable', async () => {
    await expect(nextCaseNumber(free, CASE_NUMBER_SPACE)).rejects.toThrow(
      new RegExp(`${CASE_NUMBER_SPACE} of ${CASE_NUMBER_SPACE}`),
    );
  });
});
