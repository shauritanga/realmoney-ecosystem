import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Date-range state for the activity reports, held in the URL.
 *
 * Keeping it in the query string rather than component state means a range a
 * supervisor is looking at can be bookmarked, shared with a colleague, and survives a
 * refresh — which matters when someone is asked to explain a figure they were
 * looking at.
 *
 * Days are EAT calendar days, matching the backend's report bucketing; the API takes
 * plain YYYY-MM-DD and resolves the boundaries itself.
 */
export type RangePreset = 'today' | '7d' | '30d' | 'month' | 'custom';

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** The EAT calendar day an instant falls in. */
export function eatDayKey(date: Date) {
  return new Date(date.getTime() + EAT_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDays(dayKey: string, days: number) {
  return new Date(new Date(`${dayKey}T00:00:00Z`).getTime() + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function presetRange(preset: RangePreset, now = new Date()): { from: string; to: string } {
  const today = eatDayKey(now);
  if (preset === 'today') return { from: today, to: today };
  if (preset === '7d') return { from: shiftDays(today, -6), to: today };
  if (preset === 'month') return { from: `${today.slice(0, 7)}-01`, to: today };
  return { from: shiftDays(today, -29), to: today };
}

export interface DateRangeState {
  from: string;
  to: string;
  preset: RangePreset;
  /** Query string fragment to append to an API call. */
  qs: string;
}

export function useDateRange(defaultPreset: RangePreset = '30d') {
  const [params, setParams] = useSearchParams();

  const state = useMemo<DateRangeState>(() => {
    const preset = (params.get('preset') as RangePreset) || defaultPreset;
    const fallback = presetRange(preset === 'custom' ? defaultPreset : preset);
    const from = params.get('from') || fallback.from;
    const to = params.get('to') || fallback.to;
    return { from, to, preset, qs: `from=${from}&to=${to}` };
  }, [params, defaultPreset]);

  const setPreset = useCallback(
    (preset: RangePreset) => {
      const next = new URLSearchParams(params);
      next.set('preset', preset);
      if (preset !== 'custom') {
        const { from, to } = presetRange(preset);
        next.set('from', from);
        next.set('to', to);
      }
      // A new range invalidates the page position.
      next.delete('offset');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const setCustom = useCallback(
    (field: 'from' | 'to', value: string) => {
      const next = new URLSearchParams(params);
      next.set('preset', 'custom');
      next.set(field, value);
      // Keep the range ordered, so the API never sees from > to.
      const from = field === 'from' ? value : next.get('from') || value;
      const to = field === 'to' ? value : next.get('to') || value;
      if (from > to) next.set(field === 'from' ? 'to' : 'from', value);
      next.delete('offset');
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  return { ...state, setPreset, setCustom };
}
