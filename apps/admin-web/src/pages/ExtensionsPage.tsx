import { useCallback, useEffect, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  Calendar03Icon,
  Coins01Icon,
  RefreshIcon,
  RepeatIcon,
} from '@hugeicons/core-free-icons';
import { EmptyState, LoadingState, PageHeading, Panel, PanelHeading } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks';
import { formatDate, formatRelative, money } from '../lib/format';

interface ExtensionRow {
  id: string;
  loanId: string;
  loanNumber: string | null;
  borrowerName: string | null;
  borrowerPhone: string | null;
  previousDueDate: string;
  newDueDate: string;
  feeAmount: number;
  outstandingAtExtension: number;
  grantedBy: string | null;
  createdAt: string;
  extensionsOnLoan: number;
  loanStatus: string | null;
  outstandingNow: number | null;
}

interface ExtensionReport {
  items: ExtensionRow[];
  totals: {
    extensions: number;
    loans: number;
    feesCollected: number;
    repeatLoans: number;
  };
}

/**
 * Every extension granted, so repeat rolling is visible rather than discovered.
 *
 * An extension is a service when it is occasional and a trap when it is habitual, and
 * the difference is only legible in aggregate: a borrower on their second extension is
 * otherwise visible only to whoever happens to open that one case. The repeat count is
 * the number on this page worth watching.
 */
export function ExtensionsPage() {
  const { token } = useAuth();
  const [report, setReport] = useState<ExtensionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await apiClient<ExtensionReport>('/admin/extensions', { token }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load extensions.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const totals = report?.totals;

  return (
    <section>
      <PageHeading
        eyebrow="Collections"
        title="Loan extensions"
        description="Borrowers who paid a fee to move their due date. The fee buys time only — it never reduces the debt — so a loan that keeps appearing here is not getting closer to settling."
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-3.5 py-2 text-xs font-semibold text-zinc-600 transition hover:border-emerald-400 dark:border-zinc-800 dark:text-zinc-300"
          >
            <HugeiconsIcon icon={RefreshIcon} size={14} />
            Refresh
          </button>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Extensions granted"
          value={totals?.extensions ?? '—'}
          helper="In the window shown below"
          icon={Calendar03Icon}
        />
        <KpiCard
          label="Loans extended"
          value={totals?.loans ?? '—'}
          helper="Distinct borrowers affected"
          icon={Calendar03Icon}
        />
        <KpiCard
          label="Fees collected"
          value={totals ? money(totals.feesCollected) : '—'}
          helper="Recognised as fee income"
          icon={Coins01Icon}
        />
        <KpiCard
          label="Extended more than once"
          value={totals?.repeatLoans ?? '—'}
          helper="The number to watch"
          icon={RepeatIcon}
          tone="amber"
          alert={(totals?.repeatLoans ?? 0) > 0}
        />
      </div>

      <Panel>
        <PanelHeading
          title="Every extension, newest first"
          detail="A ×N badge marks a loan that has been rolled more than once."
        />

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
            <HugeiconsIcon icon={Alert02Icon} size={15} className="shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {loading ? (
          <LoadingState />
        ) : !report?.items.length ? (
          <EmptyState
            title="No extensions granted"
            detail="Nobody has paid to move a due date yet."
          />
        ) : (
          /* Tables are the one thing allowed to be wider than the page, in their own
             scroll container. */
          <div className="overflow-x-auto">
            <table className="w-full min-w-3xl text-left text-xs">
              <thead className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800">
                <tr>
                  <th className="pb-2 pr-4 font-semibold">Case</th>
                  <th className="pb-2 pr-4 font-semibold">Borrower</th>
                  <th className="pb-2 pr-4 font-semibold">Moved</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Fee</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Owed then</th>
                  <th className="pb-2 pr-4 text-right font-semibold">Owed now</th>
                  <th className="pb-2 pr-4 font-semibold">Granted by</th>
                  <th className="pb-2 font-semibold">When</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/60">
                {report.items.map((row) => (
                  <tr key={row.id} className="align-top">
                    <td className="py-3 pr-4">
                      {/* Plain text, not a link: there is no per-loan route in the
                          admin app yet, and a link that goes nowhere is worse than
                          none. The case number is what a collector searches on. */}
                      <span className="font-mono font-semibold text-zinc-800 dark:text-zinc-200">
                        {row.loanNumber ?? '—'}
                      </span>
                      {row.extensionsOnLoan > 1 && (
                        <span className="ml-2 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-amber-950/60 dark:text-amber-400">
                          ×{row.extensionsOnLoan}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <span className="block font-medium text-zinc-800 dark:text-zinc-200">
                        {row.borrowerName ?? '—'}
                      </span>
                      <span className="block font-mono text-[11px] text-zinc-500">
                        {row.borrowerPhone ?? ''}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {formatDate(row.previousDueDate)} → {formatDate(row.newDueDate)}
                    </td>
                    <td className="py-3 pr-4 text-right font-semibold text-zinc-800 dark:text-zinc-200">
                      {money(row.feeAmount)}
                    </td>
                    <td className="py-3 pr-4 text-right text-zinc-600 dark:text-zinc-400">
                      {money(row.outstandingAtExtension)}
                    </td>
                    <td className="py-3 pr-4 text-right">
                      {/* Side by side with what was owed then, because an extension
                          that bought time without reducing the balance at all is the
                          shape of a problem. */}
                      <span
                        className={
                          row.loanStatus === 'SETTLED'
                            ? 'font-semibold text-emerald-600 dark:text-emerald-400'
                            : 'text-zinc-600 dark:text-zinc-400'
                        }
                      >
                        {row.loanStatus === 'SETTLED'
                          ? 'Settled'
                          : row.outstandingNow === null
                            ? '—'
                            : money(row.outstandingNow)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-zinc-600 dark:text-zinc-400">
                      {row.grantedBy ?? 'System'}
                    </td>
                    <td className="py-3 text-zinc-500">{formatRelative(row.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </section>
  );
}
