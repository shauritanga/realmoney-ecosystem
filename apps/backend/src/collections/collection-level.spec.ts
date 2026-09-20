import { describe, it, expect } from 'vitest';
import {
  CollectionLevel,
  getCollectionLevel,
  daysToDue,
  assertNoLevelMix,
  isQueueableLevel,
} from './collection-level.js';

const NOW = new Date('2026-09-09T10:00:00Z');
const dueIn = (days: number) =>
  new Date(NOW.getTime() + days * 86_400_000).toISOString();

describe('collection levels', () => {
  it('maps days-to-due to -2/-1/0/T1/T2/T3', () => {
    expect(getCollectionLevel(dueIn(2), NOW)).toBe(CollectionLevel.M2);
    expect(getCollectionLevel(dueIn(1), NOW)).toBe(CollectionLevel.M1);
    expect(getCollectionLevel(dueIn(0), NOW)).toBe(CollectionLevel.ZERO);
    expect(getCollectionLevel(dueIn(-1), NOW)).toBe(CollectionLevel.T1);
    expect(getCollectionLevel(dueIn(-2), NOW)).toBe(CollectionLevel.T2);
    expect(getCollectionLevel(dueIn(-3), NOW)).toBe(CollectionLevel.T3);
    expect(getCollectionLevel(dueIn(-45), NOW)).toBe(CollectionLevel.T3);
  });

  it('marks far-future loans UPCOMING (never queued)', () => {
    expect(getCollectionLevel(dueIn(3), NOW)).toBe(CollectionLevel.UPCOMING);
    expect(getCollectionLevel(dueIn(30), NOW)).toBe(CollectionLevel.UPCOMING);
    expect(isQueueableLevel(CollectionLevel.UPCOMING)).toBe(false);
    expect(isQueueableLevel(CollectionLevel.T1)).toBe(true);
  });

  it('ignores time-of-day when computing days-to-due', () => {
    expect(daysToDue(new Date('2026-09-11T23:59:00Z'), NOW)).toBe(2);
    expect(daysToDue(new Date('2026-09-08T00:01:00Z'), NOW)).toBe(-1);
  });

  it('allows same-level and empty assignments, forbids mixing', () => {
    expect(() =>
      assertNoLevelMix([], CollectionLevel.T1),
    ).not.toThrow();
    expect(() =>
      assertNoLevelMix([CollectionLevel.T1, CollectionLevel.T1], CollectionLevel.T1),
    ).not.toThrow();
    expect(() =>
      assertNoLevelMix([CollectionLevel.M1], CollectionLevel.T1),
    ).toThrow(/Level mix forbidden/);
    expect(() =>
      assertNoLevelMix([CollectionLevel.UPCOMING], CollectionLevel.T1),
    ).not.toThrow();
  });
});
