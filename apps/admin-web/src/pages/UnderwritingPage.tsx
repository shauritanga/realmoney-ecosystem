import { useState, useEffect } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { Clock01Icon, FilterHorizontalIcon, UserCheck01Icon } from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { BorrowerReview } from '../BorrowerReview';
import { EmptyState, PageHeading, Panel, StatusBadge } from '../components/ui';
import { useDashboardData, useAuth } from '../hooks';
import type { Loan } from '../types';

export function UnderwritingPage() {
  const { loans, approveOrDisburse } = useDashboardData();
  const { token } = useAuth();
  const [tab, setTab] = useState<'loans' | 'kyc'>('kyc');
  const [kycQueue, setKycQueue] = useState<any[]>([]);
  const [loadingKyc, setLoadingKyc] = useState(false);

  const pendingLoans = loans.filter((loan: Loan) => loan.status === 'PENDING').length;

  async function fetchKycQueue() {
    if (!token) return;
    setLoadingKyc(true);
    try {
      const res = await fetch('/api/v1/admin/borrowers/kyc-queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setKycQueue(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoadingKyc(false);
    }
  }

  useEffect(() => {
    void fetchKycQueue();
  }, [token]);

  const reviewBorrowers = kycQueue.filter(
    (b) => b.identityVerification?.status === 'review' || b.kycStatus === 'PENDING' || !b.identityVerified
  );

  return (
    <div>
      <PageHeading
        eyebrow="Credit operations"
        title="Underwriting desk"
        description="Review borrower readiness, approve credit and release funds through ClickPesa."
        action={
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <HugeiconsIcon icon={Clock01Icon} size={14} className="text-emerald-600 dark:text-emerald-400" /> {pendingLoans} loans pending
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200">
              <HugeiconsIcon icon={UserCheck01Icon} size={14} className="text-amber-600 dark:text-amber-400" /> {reviewBorrowers.length} KYC review
            </span>
          </div>
        }
      />

      {/* Tabs navigation */}
      <div className="mb-4 flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setTab('kyc')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'kyc'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={UserCheck01Icon} size={16} />
          Borrower KYC Queue ({reviewBorrowers.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('loans')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            tab === 'loans'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={Clock01Icon} size={16} />
          Loan Applications ({loans.length})
        </button>
      </div>

      <Panel>
        {tab === 'kyc' ? (
          <div>
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Identity &amp; KYC Verification Queue</h3>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Registered borrowers undergoing document OCR and selfie liveness verification.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void fetchKycQueue()}
                className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                {loadingKyc ? 'Refreshing...' : 'Refresh Queue'}
              </button>
            </div>

            {kycQueue.length === 0 ? (
              <EmptyState
                title="No borrowers registered"
                detail="There are currently no borrowers in the system."
              />
            ) : (
              <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {kycQueue.map((borrower) => {
                  const status = borrower.identityVerification?.status || borrower.kycStatus || 'pending';
                  const isReview = status === 'review';
                  return (
                    <article key={borrower.id} className="py-5">
                      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                        <div className="flex items-center gap-3">
                          <span className={`grid size-10 place-items-center rounded-xl font-bold ${
                            isReview
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                              : borrower.identityVerified
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}>
                            {borrower.fullName ? borrower.fullName.slice(0, 1) : 'B'}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                                {borrower.fullName}
                              </strong>
                              <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                                isReview
                                  ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                  : borrower.identityVerified
                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                                  : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                              }`}>
                                {status.replaceAll('_', ' ')}
                              </span>
                            </div>
                            <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                              {borrower.phone} · ID: {borrower.nationalId || 'N/A'} · Registered {new Date(borrower.createdAt).toLocaleDateString()}
                            </span>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Liveness:{' '}
                            <strong className={borrower.identityVerification?.checks?.liveness ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}>
                              {borrower.identityVerification?.checks?.liveness ? 'Passed' : 'Pending'}
                            </strong>
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Face Match:{' '}
                            <strong className={borrower.identityVerification?.checks?.faceMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-700 dark:text-zinc-300'}>
                              {borrower.identityVerification?.checks?.faceMatch ? 'Passed' : 'Pending'}
                            </strong>
                          </span>
                          <span className="text-zinc-500 dark:text-zinc-400">
                            Readiness:{' '}
                            <strong className={borrower.canApply ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>
                              {borrower.canApply ? 'Can Apply' : 'Incomplete'}
                            </strong>
                          </span>
                        </div>
                      </div>

                      {/* Borrower Review with Images Displayed Inline */}
                      <BorrowerReview borrowerId={borrower.id} token={token} defaultOpen={true} />
                    </article>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          <div>
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
          </div>
        )}
      </Panel>
    </div>
  );
}
