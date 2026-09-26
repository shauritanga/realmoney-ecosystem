/**
 * Minimal CSS chart primitives.
 *
 * No charting library on purpose: the only visuals these reports need are a daily
 * series, a channel split, and per-row meters — all of which are a few divs. Recharts
 * is ~110 kB gzipped and, with this app's CSS-first Tailwind v4 setup (no
 * tailwind.config.js), would need a hand-written light/dark theme bridge as well.
 */

/** A daily series. Heights are relative to the largest value in the set. */
export function Sparkbars({
  data,
  valueKey = 'value',
  labelKey = 'label',
  format,
  height = 64,
}: {
  data: Array<Record<string, unknown>>;
  valueKey?: string;
  labelKey?: string;
  format?: (value: number) => string;
  height?: number;
}) {
  const values = data.map((row) => Number(row[valueKey] || 0));
  const max = Math.max(...values, 1);

  if (!data.length) {
    return (
      <p className="py-6 text-center text-[11px] text-zinc-500 dark:text-zinc-400">
        No activity in this range.
      </p>
    );
  }

  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((row, index) => {
        const value = values[index];
        const label = String(row[labelKey] ?? '');
        return (
          <div
            key={label || index}
            title={`${label}: ${format ? format(value) : value}`}
            className="group flex min-w-0 flex-1 items-end"
            style={{ height: '100%' }}
          >
            <div
              className={`w-full rounded-t transition ${
                value > 0
                  ? 'bg-emerald-500/70 group-hover:bg-emerald-500'
                  : 'bg-zinc-200 dark:bg-zinc-800'
              }`}
              // A zero day still shows a 2px sliver, so gaps read as "nothing
              // happened" rather than as missing bars.
              style={{ height: value > 0 ? `${Math.max((value / max) * 100, 4)}%` : '2px' }}
            />
          </div>
        );
      })}
    </div>
  );
}

/** A proportional split across categories. */
export function StackedBar({
  segments,
}: {
  segments: Array<{ label: string; value: number; className: string }>;
}) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return <div className="h-2 w-full rounded-full bg-zinc-100 dark:bg-zinc-800" />;
  }
  return (
    <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
      {segments
        .filter((segment) => segment.value > 0)
        .map((segment) => (
          <div
            key={segment.label}
            title={`${segment.label}: ${segment.value}`}
            className={segment.className}
            style={{ width: `${(segment.value / total) * 100}%` }}
          />
        ))}
    </div>
  );
}

/**
 * A single proportion, coloured by how good the number is.
 *
 * `invert` flips the thresholds for metrics where high is bad. Reuses the capacity
 * meter idiom already in CollectorsPage.
 */
export function Meter({
  value,
  invert = false,
  width = 'w-20',
}: {
  value: number | null;
  invert?: boolean;
  width?: string;
}) {
  // A null rate is rendered as a dash by the accompanying number, so draw nothing
  // here rather than a second dash beside it.
  if (value === null || !Number.isFinite(value)) return null;
  const percent = Math.max(0, Math.min(value * 100, 100));
  const good = invert ? percent < 25 : percent >= 75;
  const fair = invert ? percent < 50 : percent >= 50;
  const fill = good ? 'bg-emerald-500' : fair ? 'bg-amber-500' : 'bg-rose-500';

  return (
    <div className={`h-2 ${width} overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800`}>
      <div className={`h-full transition-all duration-300 ${fill}`} style={{ width: `${percent}%` }} />
    </div>
  );
}
