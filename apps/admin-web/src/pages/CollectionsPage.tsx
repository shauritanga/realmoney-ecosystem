import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, SentIcon } from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { EmptyState, PageHeading, Panel, PanelHeading } from '../components/ui';
import { useDashboardData } from '../hooks';
import type { Loan } from '../types';

export function CollectionsPage() {
  const { overdueLoans, pushPayment } = useDashboardData();

  return (
    <div>
      <PageHeading
        eyebrow="Repayment operations"
        title="Collection operations"
        description="Prioritise overdue accounts and send payment prompts to borrower wallets."
        action={
          <span className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs dark:border-rose-900/80 dark:bg-rose-950/30 dark:text-rose-300">
            <HugeiconsIcon icon={Alert02Icon} size={14} /> {overdueLoans.length} overdue
          </span>
        }
      />

      <Panel>
        <PanelHeading
          title="Recovery queue"
          detail="Accounts requiring contact or payment follow-up"
        />

        {overdueLoans.length === 0 ? (
          <EmptyState
            title="No overdue accounts"
            detail="The collection queue is clear."
          />
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {overdueLoans.map((loan: Loan) => (
              <div
                key={loan.id}
                className="flex flex-col gap-4 py-5 lg:flex-row lg:items-center"
              >
                <span className="grid size-9 place-items-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  <HugeiconsIcon icon={Alert02Icon} size={16} />
                </span>

                <div className="min-w-0 flex-1">
                  <strong className="block text-sm text-zinc-900 dark:text-zinc-100">
                    {loan.borrower.fullName}
                  </strong>
                  <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                    {loan.loanNumber} · {loan.borrower.phone} ·{' '}
                    {loan.daysOverdue} days overdue
                  </span>
                  <small className="mt-1 block text-[10px] text-zinc-400 dark:text-zinc-500">
                    {loan.assignments?.[0]?.collector?.fullName
                      ? `Assigned to ${loan.assignments[0].collector.fullName}`
                      : 'Unassigned account'}
                  </small>
                </div>

                <div className="lg:text-right">
                  <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">
                    Outstanding
                  </span>
                  <strong className="mt-1 block text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {money(loan.outstandingBalance)}
                  </strong>
                </div>

                <button
                  type="button"
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300"
                  onClick={() =>
                    void pushPayment(loan.id, Number(loan.outstandingBalance))
                  }
                >
                  <HugeiconsIcon icon={SentIcon} size={14} /> Push USSD
                </button>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
