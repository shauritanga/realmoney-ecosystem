import { HugeiconsIcon } from '@hugeicons/react';
import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { EmptyState, LoadingState, PageHeading, Panel } from '../components/ui';
import { useDashboardData } from '../hooks';
import type { LedgerEntry } from '../types';

export function LedgerPage() {
  const { ledger, loading } = useDashboardData();
  const accountLabel = (account: string) => account === 'CASH_CLICKPESA' ? 'CASH_CLICKPESA' : account === 'CASH_SELCOM' ? 'CASH_SELCOM (legacy)' : account;

  if (ledger.length === 0 && loading) {
    return <LoadingState />;
  }

  return (
    <div>
      <PageHeading
        eyebrow="Accounting controls"
        title="Financial ledger"
        description="Double-entry records for disbursements, repayments and balance movements."
        action={
          <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <HugeiconsIcon icon={BookOpen01Icon} size={14} className="text-emerald-600 dark:text-emerald-400" /> {ledger.length} entries
          </span>
        }
      />

      <Panel>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead>
              <tr className="border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="pb-3">Time</th>
                <th className="pb-3">Loan</th>
                <th className="pb-3">Account</th>
                <th className="pb-3">Debit</th>
                <th className="pb-3">Credit</th>
                <th className="pb-3">Description</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {ledger.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <EmptyState
                      title="Ledger is empty"
                      detail="Entries appear after financial activity."
                    />
                  </td>
                </tr>
              ) : (
                ledger.map((entry: LedgerEntry) => (
                  <tr key={entry.id}>
                    <td className="py-3 font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
                      {entry.loan?.loanNumber || '—'}
                    </td>
                    <td>
                      <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-1 font-mono text-[10px] font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                        {accountLabel(entry.accountType)}
                      </span>
                    </td>
                    <td className="font-semibold text-emerald-700 dark:text-emerald-400">
                      {Number(entry.debit) > 0 ? money(entry.debit) : '—'}
                    </td>
                    <td className="font-semibold text-amber-700 dark:text-amber-400">
                      {Number(entry.credit) > 0 ? money(entry.credit) : '—'}
                    </td>
                    <td className="text-zinc-600 dark:text-zinc-400">{entry.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
