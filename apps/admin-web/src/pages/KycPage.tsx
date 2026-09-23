import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  CheckmarkCircle02Icon,
  RefreshIcon,
  Search01Icon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { BorrowerReview } from '../BorrowerReview';
import { EmptyState, PageHeading, Panel } from '../components/ui';
import { useAuth } from '../hooks';

interface BorrowerKycItem {
  id: string;
  fullName: string;
  phone: string;
  email?: string;
  nationalId?: string;
  kycStatus: string;
  createdAt: string;
  identityVerified: boolean;
  canApply: boolean;
  registrationComplete: boolean;
  walletVerified: boolean;
  financialComplete: boolean;
  identityVerification?: {
    status: string;
    mode?: string;
    sessionReference?: string;
    checks?: Record<string, boolean>;
  };
  onboarding?: {
    region?: string;
    district?: string;
    ward?: string;
    street?: string;
  };
}

export function KycPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kycQueue, setKycQueue] = useState<BorrowerKycItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'review' | 'verified' | 'incomplete'>('review');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');

  async function fetchKycQueue() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/borrowers/kyc-queue', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setKycQueue(data);
      }
    } catch {
      // silently handle network errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchKycQueue();
  }, [token]);

  // Sync search query from URL parameter if present
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null && q !== searchQuery) {
      setSearchQuery(q);
      if (q.trim()) setFilter('all');
    }
  }, [searchParams]);

  const reviewBorrowers = useMemo(
    () =>
      kycQueue.filter(
        (b) =>
          b.identityVerification?.status === 'review' ||
          b.kycStatus === 'PENDING' ||
          (!b.identityVerified && b.identityVerification?.sessionReference)
      ),
    [kycQueue]
  );

  const verifiedBorrowers = useMemo(
    () => kycQueue.filter((b) => b.identityVerified || b.kycStatus === 'VERIFIED'),
    [kycQueue]
  );

  const incompleteBorrowers = useMemo(
    () =>
      kycQueue.filter(
        (b) =>
          !b.identityVerified &&
          b.kycStatus !== 'VERIFIED' &&
          b.identityVerification?.status !== 'review'
      ),
    [kycQueue]
  );

  const filteredBorrowers = useMemo(() => {
    let list: BorrowerKycItem[] = [];
    if (filter === 'all') list = kycQueue;
    else if (filter === 'review') list = reviewBorrowers;
    else if (filter === 'verified') list = verifiedBorrowers;
    else if (filter === 'incomplete') list = incompleteBorrowers;

    if (!searchQuery.trim()) return list;

    const term = searchQuery.toLowerCase().trim();
    return list.filter(
      (b) =>
        b.fullName?.toLowerCase().includes(term) ||
        b.phone?.toLowerCase().includes(term) ||
        b.nationalId?.toLowerCase().includes(term)
    );
  }, [kycQueue, reviewBorrowers, verifiedBorrowers, incompleteBorrowers, filter, searchQuery]);

  return (
    <div>
      <PageHeading
        eyebrow="Compliance & verification"
        title="Identity & KYC"
        description="Inspect borrower identities, examine document OCR evidence and live selfie comparisons, and manage compliance approvals."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 shadow-xs dark:border-amber-800/80 dark:bg-amber-950/60 dark:text-amber-200">
              <HugeiconsIcon icon={UserCheck01Icon} size={14} className="text-amber-600 dark:text-amber-400" />
              {reviewBorrowers.length} review required
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800 shadow-xs dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-200">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="text-emerald-600 dark:text-emerald-400" />
              {verifiedBorrowers.length} verified
            </span>
            <button
              type="button"
              onClick={() => void fetchKycQueue()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <HugeiconsIcon
                icon={RefreshIcon}
                size={14}
                className={loading ? 'animate-spin text-emerald-600 dark:text-emerald-400' : 'text-zinc-500'}
              />
              {loading ? 'Refreshing…' : 'Refresh Queue'}
            </button>
          </div>
        }
      />

      <Panel>
        {/* Filters and Search Bar */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
          {/* Tab Filters */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setFilter('review')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'review'
                  ? 'bg-amber-100 text-amber-900 shadow-xs dark:bg-amber-950 dark:text-amber-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Needs Review ({reviewBorrowers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'all'
                  ? 'bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-black font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              All Borrowers ({kycQueue.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('verified')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'verified'
                  ? 'bg-emerald-100 text-emerald-900 shadow-xs dark:bg-emerald-950 dark:text-emerald-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Verified ({verifiedBorrowers.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('incomplete')}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                filter === 'incomplete'
                  ? 'bg-zinc-200 text-zinc-900 shadow-xs dark:bg-zinc-800 dark:text-zinc-200 font-semibold'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800'
              }`}
            >
              Incomplete ({incompleteBorrowers.length})
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
              placeholder="Search name, phone, NIDA..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (e.target.value.trim()) {
                  setSearchParams({ search: e.target.value.trim() }, { replace: true });
                } else {
                  setSearchParams({}, { replace: true });
                }
              }}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-9 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:focus:border-emerald-400"
            />
          </div>
        </div>

        {/* Queue Items */}
        {filteredBorrowers.length === 0 ? (
          <EmptyState
            title={searchQuery ? 'No matching borrowers' : 'Queue is clear'}
            detail={
              searchQuery
                ? `No borrowers found matching "${searchQuery}".`
                : filter === 'review'
                ? 'No borrowers currently require manual KYC inspection.'
                : 'No borrower records in this category.'
            }
          />
        ) : (
          <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {filteredBorrowers.map((borrower) => {
              const status = borrower.identityVerification?.status || borrower.kycStatus || 'pending';
              const isReview = status === 'review';
              const isVerified = borrower.identityVerified || status === 'verified';

              return (
                <article key={borrower.id} className="py-5">
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div className="flex items-center gap-3">
                      <span
                        className={`grid size-10 place-items-center rounded-xl font-bold ${
                          isReview
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                            : isVerified
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                            : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {borrower.fullName ? borrower.fullName.slice(0, 1) : 'B'}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {borrower.fullName}
                          </strong>
                          <span
                            className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              isReview
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                                : isVerified
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                                : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}
                          >
                            {status.replaceAll('_', ' ')}
                          </span>
                        </div>
                        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                          {borrower.phone} · ID: {borrower.nationalId || 'N/A'} · Registered{' '}
                          {new Date(borrower.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs">
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Liveness:{' '}
                        <strong
                          className={
                            borrower.identityVerification?.checks?.liveness
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-700 dark:text-zinc-300'
                          }
                        >
                          {borrower.identityVerification?.checks?.liveness ? 'Passed' : 'Pending'}
                        </strong>
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Face Match:{' '}
                        <strong
                          className={
                            borrower.identityVerification?.checks?.faceMatch
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-zinc-700 dark:text-zinc-300'
                          }
                        >
                          {borrower.identityVerification?.checks?.faceMatch ? 'Passed' : 'Pending'}
                        </strong>
                      </span>
                      <span className="text-zinc-500 dark:text-zinc-400">
                        Readiness:{' '}
                        <strong
                          className={
                            borrower.canApply
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {borrower.canApply ? 'Can Apply' : 'Incomplete'}
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Inline KYC verification documents, evidence & action controls */}
                  <BorrowerReview
                    borrowerId={borrower.id}
                    token={token}
                    defaultOpen={isReview}
                    mode="kyc"
                    onActionComplete={() => void fetchKycQueue()}
                  />
                </article>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}
