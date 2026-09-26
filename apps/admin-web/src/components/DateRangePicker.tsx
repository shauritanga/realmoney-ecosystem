import type { RangePreset } from '../hooks/useDateRange';

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

function eatDayKey(date: Date) {
  return new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

const PRESETS: Array<{ key: RangePreset; label: string }> = [
  { key: 'today', label: 'Today' },
  { key: '7d', label: '7 days' },
  { key: '30d', label: '30 days' },
  { key: 'month', label: 'This month' },
];

/** Presets plus two date inputs. All range state lives in the URL; see useDateRange. */
export function DateRangePicker({
  from,
  to,
  preset,
  setPreset,
  setCustom,
}: {
  from: string;
  to: string;
  preset: RangePreset;
  setPreset: (preset: RangePreset) => void;
  setCustom: (field: 'from' | 'to', value: string) => void;
}) {
  const today = eatDayKey(new Date());

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex flex-wrap items-center gap-1.5">
        {PRESETS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setPreset(key)}
            className={`rounded-lg px-2.5 py-1.5 text-[11px] transition ${
              preset === key
                ? 'bg-zinc-900 font-semibold text-white shadow-xs dark:bg-white dark:text-black'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          value={from}
          max={today}
          onChange={(event) => setCustom('from', event.target.value)}
          aria-label="From date"
          className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-[11px] text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
        <span className="text-[11px] text-zinc-400">to</span>
        <input
          type="date"
          value={to}
          max={today}
          onChange={(event) => setCustom('to', event.target.value)}
          aria-label="To date"
          className="rounded-xl border border-zinc-200 bg-zinc-50/50 px-2 py-1.5 text-[11px] text-zinc-900 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
        />
      </div>
    </div>
  );
}
