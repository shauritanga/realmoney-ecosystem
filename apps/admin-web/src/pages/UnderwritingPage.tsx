import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BanknoteIcon,
  Clock01Icon,
  Coins01Icon,
  Search01Icon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { BorrowerReview } from '../BorrowerReview';
import { EmptyState, PageHeading, Panel, StatusBadge } from '../components/ui';
import { useDashboardData, useAuth } from '../hooks';
import type { Loan } from '../types';

export function UnderwritingPage() {
  const { loans, approveOrDisburse } = useDashboardData();
  const { token } = useAuth();
  const [filter, setFilter] = useState<'all' | 'PENDING' | 'APPROVED' | 'DISBURSED' | 'SETTLED'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const pendingLoans = useMemo(
    () => loans.filter((l: Loan) => l.status === 'PENDING'),
    [loans]
  );

  const approvedLoans = useMemo(
    () => loans.filter((l: Loan) => l.status === 'APPROVED'),
    [loans]
  );

  const filteredLoans = useMemo(() => {
    let list = loans;
    if (filter !== 'all') {
      list = loans.filter((l: Loan) => l.status === filter);
    }

    if (!searchQuery.trim()) return list;

    const term = searchQuery.toLowerCase().trim();
    return list.filter(
      (l: Loan) =>
        l.borrower?.fullName?.toLowerCase().includes(term) ||
        l.borrower?.phone?.toLowerCase().includes(term) ||
        l.loanNumber?.toLowerCase().includes(term) ||
        l.product?.name?.toLowerCase().includes(term)
    );
  }, [loans, filter, searchQuery]);

  async function handleApproveOrDisburse(loanId: string, path: string) {
    setActionInProgress(loanId);
    try {
      await approveOrDisburse(path);
    } finally {
      setActionInProgress(null);
    }
  }

  return (
    <div>
      <PageHeading
        eyebrow="Credit operations"
        title="Loan Underwriting"
        description="Evaluate borrower creditworthiness and affordability, approve loan applications, and release funds via ClickPesa."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <HugeiconsIcon icon={Clock01Icon} size={14} className="text-amber-600 dark:text-amber-400" />
              {pendingLoans.length} pending approval
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 shadow-xs dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200">
              <HugeiconsIcon icon={Coins01Icon} size={14} className="text-emerald-600 dark:text-emerald-400" />
              {approvedLoans.length} ready to disburse
            </span>
            <Link
              to="/kyc"
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs transition hover:bg-zinc-50 hover:text-emerald-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-emerald-400"
            >
              <HugeiconsIcon icon={UserCheck01Icon} size={14} />
              Identity &amp; KYC Queue ↗
            </Link>
          </div>
        }
      />

      <Panel>
        {/* Search & Filter Header */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
          {/* Status Filter Tabs */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'all'
                  ? 'bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-black font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              All Applications ({loans.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('PENDING')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'PENDING'
                  ? 'bg-amber-100 text-amber-900 shadow-xs dark:bg-amber-950 dark:text-amber-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Pending Approval ({pendingLoans.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('APPROVED')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'APPROVED'
                  ? 'bg-emerald-100 text-emerald-900 shadow-xs dark:bg-emerald-950 dark:text-emerald-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Ready to Disburse ({approvedLoans.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('DISBURSED')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'DISBURSED'
                  ? 'bg-blue-100 text-blue-900 shadow-xs dark:bg-blue-950 dark:text-blue-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Active / Disbursed
            </button>
          </div>

          {/* Search box */}
          <div className="relative min-w-[240px]">
            <HugeiconsIcon
              icon={Search01Icon}
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              type="search"
              placeholder="Search borrower, phone, loan #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-9 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Loan Queue List */}
        {filteredLoans.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matching loan applications' : 'Queue is clear'}
            detail={
              searchQuery
                ? `No loan records found matching "${searchQuery}".`
                : filter === 'PENDING'
                ? 'There are no pending loan applications awaiting underwriting assessment.'
                : 'No loan records found in this category.'
            }
          />
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredLoans.map((loan: Loan) => {
              const isWorking = actionInProgress === loan.id;

              return (
                <article
                  key={loan.id}
                  className="flex flex-col justify-between gap-5 py-5 lg:flex-row lg:items-center"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <span className="grid size-9 place-items-center rounded-xl bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400">
                        {loan.borrower?.fullName ? loan.borrower.fullName.slice(0, 1) : 'L'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="block text-sm text-zinc-900 dark:text-zinc-100">
                            {loan.borrower?.fullName || 'Borrower'}
                          </strong>
                          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                            {loan.loanNumber}
                          </span>
                        </div>
                        <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {loan.product?.name || 'Standard Loan'} · {loan.borrower?.phone}
                        </span>
                      </div>
                    </div>

                    {/* Affordability & Income Assessment */}
                    {loan.borrower?.id && (
                      <BorrowerReview
                        borrowerId={loan.borrower.id}
                        token={token}
                        mode="affordability"
                      />
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-5">
                    <div>
                      <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Requested Principal</span>
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
                        disabled={isWorking}
                        className="rounded-lg bg-emerald-400 px-3.5 py-2 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300 disabled:opacity-50"
                        onClick={() =>
                          void handleApproveOrDisburse(loan.id, `/loans/${loan.id}/approve`)
                        }
                      >
                        {isWorking ? 'Approving…' : 'Approve'}
                      </button>
                    )}

                    {loan.status === 'APPROVED' && (
                      <button
                        type="button"
                        disabled={isWorking}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-400 disabled:opacity-50"
                        onClick={() =>
                          void handleApproveOrDisburse(loan.id, `/loans/${loan.id}/disburse`)
                        }
                      >
                        <HugeiconsIcon icon={BanknoteIcon} size={14} />
                        {isWorking ? 'Disbursing…' : 'Disburse'}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
