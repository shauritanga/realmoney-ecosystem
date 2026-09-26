import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { Panel } from './components/ui';

/**
 * The lending policy knobs, as one form.
 *
 * Grew from a single interest rate when extensions arrived: the extension fee and the
 * penalty ceiling are the same kind of decision and belong beside it, rather than as
 * constants somebody has to redeploy to change. The server accepts a partial update,
 * so only fields that were actually edited are sent.
 */
interface Field {
  key: string;
  label: string;
  help: string;
  min: number;
  max: number;
  step: string;
  integer?: boolean;
}

const FIELDS: Field[] = [
  {
    key: 'interestRateMonthly',
    label: '7-day interest rate (%)',
    help: 'Enter 0–100, with up to two decimal places. Interest is prorated by loan duration in 7-day blocks. Processing fees are separate.',
    min: 0,
    max: 100,
    step: '0.01',
  },
  {
    key: 'extensionFeePercent',
    label: 'Extension fee (% of outstanding)',
    help: 'What a borrower pays to move their due date out by one more full tenure. The fee buys time only — it does not reduce the debt.',
    min: 0,
    max: 100,
    step: '0.01',
  },
  {
    key: 'maxExtensions',
    label: 'Maximum extensions per loan',
    help: 'The main guard against a debt trap. Set to 0 to switch extensions off entirely.',
    min: 0,
    max: 12,
    step: '1',
    integer: true,
  },
  {
    key: 'maxPenaltyPercentOfPrincipal',
    label: 'Penalty ceiling (% of principal)',
    help: 'Total late penalties stop accruing here. At 1%/day an uncapped penalty passes the principal itself inside four months. Set to 0 to remove the ceiling.',
    min: 0,
    max: 1000,
    step: '0.01',
  },
];

type Values = Record<string, string>;

function isValid(field: Field, raw: string): boolean {
  if (raw.trim() === '') return false;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < field.min || value > field.max) return false;
  return field.integer ? /^\d+$/.test(raw) : /^\d+(\.\d{1,2})?$/.test(raw);
}

export function LendingSettings({ token }: { token: string | null }) {
  const [values, setValues] = useState<Values>({});
  const [saved, setSaved] = useState<Values>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    fetch('/api/v1/admin/settings', {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('Unable to load settings. Please retry.');
        const data = await response.json();
        const next: Values = {};
        for (const field of FIELDS) next[field.key] = String(data[field.key] ?? '');
        setValues(next);
        setSaved(next);
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, retry]);

  const loaded = Object.keys(saved).length > 0;
  const changed = FIELDS.filter((field) => values[field.key] !== saved[field.key]);
  const allValid = changed.every((field) => isValid(field, values[field.key] ?? ''));
  const canSave = loaded && !loading && !saving && changed.length > 0 && allValid;

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !token) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      // Only what was edited: the server merges a partial patch, so an untouched
      // field cannot be overwritten by a stale value this form was holding.
      const body: Record<string, number> = {};
      for (const field of changed) body[field.key] = Number(values[field.key]);

      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Unable to save settings. Please retry.');

      const next: Values = {};
      for (const field of FIELDS) next[field.key] = String(data[field.key] ?? '');
      setValues(next);
      setSaved(next);
      setMessage('Settings saved. New loans and offers will use these values.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  const rate = values.interestRateMonthly ?? '';

  return (
    <Panel className="max-w-2xl space-y-6">
      <div>
        <h2 id="settings-heading" className="text-xl font-semibold text-zinc-900 dark:text-white">
          Settings
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Configure platform lending rates and loan application parameters.
        </p>
      </div>

      <dl className="flex flex-wrap gap-x-12 gap-y-4 border-y border-zinc-200 py-4 text-xs dark:border-zinc-800">
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Starting borrowing limit</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">TZS 8,000</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">On-time repayment increase</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">25%</dd>
        </div>
        <div>
          <dt className="text-zinc-500 dark:text-zinc-400">Late penalty</dt>
          <dd className="mt-1 font-semibold text-zinc-900 dark:text-white">1% / day</dd>
        </div>
      </dl>

      {loading ? (
        <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
          {token ? 'Loading settings…' : 'Waiting for admin authentication…'}
        </p>
      ) : (
        <form onSubmit={save} className="space-y-6">
          {FIELDS.map((field) => {
            const value = values[field.key] ?? '';
            const invalid = value !== '' && !isValid(field, value);
            return (
              <div key={field.key}>
                <label
                  htmlFor={field.key}
                  className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
                >
                  {field.label}
                </label>
                <input
                  id={field.key}
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  required
                  value={value}
                  disabled={saving || !loaded}
                  onChange={(event) => {
                    setValues({ ...values, [field.key]: event.target.value });
                    setMessage('');
                  }}
                  aria-describedby={`${field.key}-help`}
                  aria-invalid={invalid}
                  className="mt-2 w-full max-w-xs rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                />
                <p
                  id={`${field.key}-help`}
                  className="mt-2 text-xs text-zinc-500 dark:text-zinc-400"
                >
                  {field.help}
                </p>
              </div>
            );
          })}

          {isValid(FIELDS[0], rate) && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Example: TZS 8,000 for 7 days at {rate}% adds TZS{' '}
              {Math.round((8000 * Number(rate)) / 100).toLocaleString()} in interest, before fees.
            </p>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Existing loan amounts and repayment obligations stay unchanged. Extensions
            already granted keep the terms they were granted under.
          </p>

          <button
            type="submit"
            disabled={!canSave}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </form>
      )}

      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
        >
          <HugeiconsIcon icon={Alert02Icon} size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
          <span className="flex-1">{error}</span>
          {!loaded && (
            <button
              type="button"
              className="ml-3 font-semibold underline"
              onClick={() => setRetry(retry + 1)}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {message && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-medium text-emerald-800 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={15} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span>{message}</span>
        </p>
      )}
    </Panel>
  );
}
