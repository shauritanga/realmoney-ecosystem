import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import type { IconSvgElement } from '@hugeicons/react';

export type KpiTone = 'emerald' | 'blue' | 'amber' | 'rose' | 'violet' | 'zinc';

const TONES: Record<KpiTone, string> = {
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
  violet: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  zinc: 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-400',
};

/**
 * A single headline figure.
 *
 * Extracted from OverviewPage's local `Metric`, minus its hardcoded up-arrow beside
 * the helper text — that arrow is actively wrong on a tile like "Broken promises",
 * where a rise is bad news.
 */
export function KpiCard({
  label,
  value,
  helper,
  icon,
  tone = 'emerald',
  alert = false,
}: {
  label: string;
  value: ReactNode;
  helper?: ReactNode;
  icon?: IconSvgElement;
  tone?: KpiTone;
  alert?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border bg-white p-5 shadow-xs dark:bg-zinc-950 dark:shadow-none ${
        alert
          ? 'border-rose-300 dark:border-rose-900'
          : 'border-zinc-200 dark:border-zinc-800'
      }`}
    >
      <div className="flex items-start justify-between gap-3 text-xs text-zinc-500 dark:text-zinc-400">
        <span className="min-w-0 leading-snug">{label}</span>
        {icon && (
          <span className={`grid size-8 shrink-0 place-items-center rounded-lg ${TONES[tone]}`}>
            <HugeiconsIcon icon={icon} size={16} />
          </span>
        )}
      </div>
      <strong className="mt-3 block font-display text-2xl tracking-[-0.04em] text-zinc-900 dark:text-white">
        {value}
      </strong>
      {helper && (
        <span className="mt-1 block text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
          {helper}
        </span>
      )}
    </div>
  );
}
