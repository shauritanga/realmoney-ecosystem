import { useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, CheckmarkCircle02Icon, Loading03Icon } from '@hugeicons/core-free-icons';
import { Panel } from './components/ui';

export function LendingSettings({ token }: { token: string | null }) {
  const [rate, setRate] = useState('');
  const [savedRate, setSavedRate] = useState('');
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
        setRate(String(data.interestRateMonthly));
        setSavedRate(String(data.interestRateMonthly));
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(err.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [token, retry]);

  const valid =
    rate.trim() !== '' &&
    Number.isFinite(Number(rate)) &&
    Number(rate) >= 0 &&
    Number(rate) <= 100 &&
    /^\d+(\.\d{1,2})?$/.test(rate);

  async function save(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid || !token || saving) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ interestRateMonthly: Number(rate) }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.message || 'Unable to save settings. Please retry.');
      setRate(String(data.interestRateMonthly));
      setSavedRate(String(data.interestRateMonthly));
      setMessage('Interest rate saved. New applications will use this rate.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save settings. Please retry.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Panel className="max-w-2xl space-y-6">
      <div>
        <h2 id="settings-heading" className="text-xl font-semibold text-zinc-900 dark:text-white">
          Lending settings
        </h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          Set the interest rate for new loan applications across all products.
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
      </dl>

      {loading ? (
        <p role="status" className="text-xs text-zinc-500 dark:text-zinc-400">
          {token ? 'Loading settings…' : 'Waiting for admin authentication…'}
        </p>
      ) : (
        <form onSubmit={save} className="space-y-5">
          <div>
            <label
              htmlFor="monthly-interest"
              className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
            >
              7-day interest rate (%)
            </label>
            <input
              id="monthly-interest"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={rate}
              disabled={saving || savedRate === ''}
              onChange={(event) => {
                setRate(event.target.value);
                setMessage('');
              }}
              aria-describedby="rate-help"
              aria-invalid={rate !== '' && !valid}
              className="mt-2 w-full max-w-xs rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs text-zinc-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50 dark:border-zinc-800 dark:bg-black dark:text-white dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
            />
            <p id="rate-help" className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
              Enter 0–100, with up to two decimal places. Interest is prorated by loan duration in 7-day blocks. Processing fees are separate.
            </p>
          </div>

          {valid && (
            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Example: TZS 8,000 for 7 days at {rate}% adds TZS{' '}
              {Math.round((8000 * Number(rate)) / 100).toLocaleString()} in interest, before fees.
            </p>
          )}

          <p className="text-xs text-zinc-500 dark:text-zinc-400">
            Existing loan amounts and repayment obligations stay unchanged.
          </p>

          <button
            type="submit"
            disabled={
              loading ||
              saving ||
              !valid ||
              rate === savedRate ||
              savedRate === ''
            }
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-5 py-2.5 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving && <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />}
            {saving ? 'Saving…' : 'Save interest rate'}
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
          {savedRate === '' && (
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
