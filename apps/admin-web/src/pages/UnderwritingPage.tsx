import { HugeiconsIcon } from '@hugeicons/react';
import { Clock01Icon, FilterHorizontalIcon } from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { BorrowerReview } from '../BorrowerReview';
import { EmptyState, PageHeading, Panel, StatusBadge } from '../components/ui';
import { useDashboardData, useAuth } from '../hooks';
import type { Loan } from '../types';

export function UnderwritingPage() {
  const { loans, approveOrDisburse } = useDashboardData();
  const { token } = useAuth();

  const pending = loans.filter((loan: Loan) => loan.status === 'PENDING').length;

  return (
    <div>
      <PageHeading
        eyebrow="Credit operations"
        title="Underwriting desk"
        description="Review borrower readiness, approve credit and release funds through ClickPesa."
        action={
          <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <HugeiconsIcon icon={Clock01Icon} size={14} className="text-emerald-600 dark:text-emerald-400" /> {pending} pending
          </span>
        }
      />

      <Panel>
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Application queue</h3>
            <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
              All loan requests sorted by newest first.
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-white"
          >
            <HugeiconsIcon icon={FilterHorizontalIcon} size={14} /> Filters
          </button>
        </div>

        {loans.length === 0 ? (
          <EmptyState
            title="Queue is clear"
            detail="There are no loan applications to review."
          />
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {loans.map((loan: Loan) => (
              <article
                key={loan.id}
                className="flex flex-col justify-between gap-5 py-5 lg:flex-row lg:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400">
                      {loan.borrower.fullName.slice(0, 1)}
                    </span>
                    <div>
                      <strong className="block text-sm text-zinc-900 dark:text-zinc-100">
                        {loan.borrower.fullName}
                      </strong>
                      <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                        {loan.loanNumber} · {loan.product.name} ·{' '}
                        {loan.borrower.phone}
                      </span>
                    </div>
                  </div>
                  <BorrowerReview borrowerId={loan.borrower.id} token={token} />
                </div>

                <div className="flex flex-wrap items-center gap-5">
                  <div>
                    <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Requested</span>
                    <strong className="mt-1 block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {money(loan.principalAmount)}
                    </strong>
                  </div>
                  <div>
                    <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Tenure</span>
                    <strong className="mt-1 block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {loan.tenureDays} days
                    </strong>
                  </div>

                  <StatusBadge status={loan.status} />

                  {loan.status === 'PENDING' && (
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300"
                      onClick={() =>
                        void approveOrDisburse(`/loans/${loan.id}/approve`)
                      }
                    >
                      Approve
                    </button>
                  )}

                  {loan.status === 'APPROVED' && (
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300"
                      onClick={() =>
                        void approveOrDisburse(`/loans/${loan.id}/disburse`)
                      }
                    >
                      Disburse
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
