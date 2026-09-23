/**
 * Daily collection levels, computed from a loan's due date.
 *
 * Pre-due (reminder) stages:
 *  - M2   ("-2"): due in 2 days
 *  - M1   ("-1"): due tomorrow
 *  - ZERO ("0"):  due today
 * Overdue stages:
 *  - T1: 1 day overdue
 *  - T2: 2 days overdue
 *  - T3: 3+ days overdue
 * Loans due further out are UPCOMING and never enter a daily work queue.
 *
 * Rule: one collector works ONE level per day — levels must never be mixed
 * within a collector's active assignments.
 */
export enum CollectionLevel {
  M2 = 'M2',
  M1 = 'M1',
  ZERO = 'ZERO',
  T1 = 'T1',
  T2 = 'T2',
  T3 = 'T3',
  UPCOMING = 'UPCOMING',
}

export const COLLECTION_LEVELS: CollectionLevel[] = [
  CollectionLevel.M2,
  CollectionLevel.M1,
  CollectionLevel.ZERO,
  CollectionLevel.T1,
  CollectionLevel.T2,
  CollectionLevel.T3,
];

export const LEVEL_LABEL: Record<CollectionLevel, string> = {
  [CollectionLevel.M2]: 'T-2',
  [CollectionLevel.M1]: 'T-1',
  [CollectionLevel.ZERO]: 'T0',
  [CollectionLevel.T1]: 'T1',
  [CollectionLevel.T2]: 'T2',
  [CollectionLevel.T3]: 'S',
  [CollectionLevel.UPCOMING]: 'Upcoming',
};

export const LEVEL_DESCRIPTION: Record<CollectionLevel, string> = {
  [CollectionLevel.M2]: 'Due in 2 days — friendly early reminder (max 45).',
  [CollectionLevel.M1]: 'Due tomorrow — payment reminder, offer USSD push (max 45).',
  [CollectionLevel.ZERO]: 'Due TODAY — collect a promise, push USSD (max 45).',
  [CollectionLevel.T1]: '1 day overdue — firm follow-up (max 45).',
  [CollectionLevel.T2]: '2 days overdue — escalate tone, push USSD (max 45).',
  [CollectionLevel.T3]: '3+ days overdue — intensive recovery (S tier, unlimited).',
  [CollectionLevel.UPCOMING]: 'Not yet due — not in any daily queue.',
};

/**
 * Enforces per-collector capacity:
 * Up to 45 borrowers/loans for tiers T-2, T-1, T0, T1, T2.
 * Tier S (3+ days past due) has no 45 limit.
 */
export function maxCapacityForLevel(level: CollectionLevel): number | null {
  if (level === CollectionLevel.T3) return null;
  return 45;
}

/** UTC calendar-day truncation: levels must not depend on server timezone. */
function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Whole calendar days from `now` until `dueDate` (negative = overdue). */
export function daysToDue(dueDate: Date, now: Date = new Date()): number {
  return Math.round(
    (startOfDay(new Date(dueDate)).getTime() - startOfDay(now).getTime()) /
      86_400_000,
  );
}

export function getCollectionLevel(
  dueDate: Date | string,
  now: Date = new Date(),
): CollectionLevel {
  const diff = daysToDue(new Date(dueDate), now);
  if (diff > 2) return CollectionLevel.UPCOMING;
  if (diff === 2) return CollectionLevel.M2;
  if (diff === 1) return CollectionLevel.M1;
  if (diff === 0) return CollectionLevel.ZERO;
  if (diff === -1) return CollectionLevel.T1;
  if (diff === -2) return CollectionLevel.T2;
  return CollectionLevel.T3;
}

export function isQueueableLevel(level: CollectionLevel): boolean {
  return level !== CollectionLevel.UPCOMING;
}

/**
 * Enforces the no-mix rule. Throws a plain Error (callers map it to
 * BadRequestException) when the new assignment would mix levels.
 */
export function assertNoLevelMix(
  existingLevels: CollectionLevel[],
  newLevel: CollectionLevel,
): void {
  const worked = new Set(existingLevels.filter(isQueueableLevel));
  if (worked.size > 1) {
    throw new Error(
      `Collector already holds mixed levels (${[...worked].map((l) => LEVEL_LABEL[l]).join(', ')}). Reassign first.`,
    );
  }
  const [current] = [...worked];
  if (current && current !== newLevel) {
    throw new Error(
      `Level mix forbidden: collector works ${LEVEL_LABEL[current]} today, cannot take ${LEVEL_LABEL[newLevel]}.`,
    );
  }
}
