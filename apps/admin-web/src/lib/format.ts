export const money = (value: unknown) => `TZS ${Number(value || 0).toLocaleString()}`;

export function statusTone(status: string) {
  if (status === 'ACTIVE') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 ring-blue-500/30';
  }
  if (status === 'OVERDUE' || status === 'DEFAULTED') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 ring-rose-500/30';
  }
  if (status === 'SETTLED') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-emerald-500/30';
  }
  if (status === 'PENDING' || status === 'APPROVED') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-amber-500/30';
  }
  return 'bg-zinc-500/10 text-zinc-700 dark:text-zinc-400 ring-zinc-500/30';
}
