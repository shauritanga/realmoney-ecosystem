/**
 * Daily collection tiers, derived from a loan's due date.
 *
 * Mirrors `apps/backend/src/collections/collection-level.ts`. This table and the
 * derivation below were previously copy-pasted into both CollectionsPage and
 * CollectorsPage; keeping one frontend copy still duplicates the backend, which is
 * unavoidable without a shared package, but three copies drifting was not.
 *
 * Note the label for T3 is "S", matching the backend's LEVEL_LABEL.
 */
export type CollectionTier = 'M2' | 'M1' | 'ZERO' | 'T1' | 'T2' | 'T3';

export const TIERS: { key: CollectionTier; label: string; desc: string; max: number | null }[] = [
  { key: 'M2', label: 'T-2', desc: 'Due in 2 days (max 45)', max: 45 },
  { key: 'M1', label: 'T-1', desc: 'Due tomorrow (max 45)', max: 45 },
  { key: 'ZERO', label: 'T0', desc: 'Due today (max 45)', max: 45 },
  { key: 'T1', label: 'T1', desc: '1 day overdue (max 45)', max: 45 },
  { key: 'T2', label: 'T2', desc: '2 days overdue (max 45)', max: 45 },
  { key: 'T3', label: 'S', desc: '3+ days overdue (unlimited)', max: null },
];

export const TIER_LABEL: Record<CollectionTier, string> = TIERS.reduce(
  (acc, tier) => ({ ...acc, [tier.key]: tier.label }),
  {} as Record<CollectionTier, string>,
);

/** UTC day truncation, matching the backend so client and server agree on a tier. */
function startOfUtcDay(date: Date) {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

/**
 * The tier a loan sits in, or null when it is not yet due enough to be worked.
 */
export function getLoanTier(
  dueDateStr: string,
  now: Date = new Date(),
): { key: CollectionTier; label: string } | null {
  if (!dueDateStr) return null;
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime())) return null;
  const diffDays = Math.round((startOfUtcDay(due) - startOfUtcDay(now)) / 86_400_000);

  if (diffDays > 2) return null;
  if (diffDays === 2) return { key: 'M2', label: 'T-2' };
  if (diffDays === 1) return { key: 'M1', label: 'T-1' };
  if (diffDays === 0) return { key: 'ZERO', label: 'T0' };
  if (diffDays === -1) return { key: 'T1', label: 'T1' };
  if (diffDays === -2) return { key: 'T2', label: 'T2' };
  return { key: 'T3', label: 'S' };
}

/** Pre-due tiers are reminders; the rest are recovery. */
export function tierTone(tier: CollectionTier) {
  if (tier === 'M2' || tier === 'M1' || tier === 'ZERO') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (tier === 'T3') return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30';
  return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
}
