import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
  Search01Icon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [kycQueue, setKycQueue] = useState<BorrowerKycItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'review' | 'all' | 'verified' | 'incomplete'>('review');
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
      // ignore network errors
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchKycQueue();
  }, [token]);

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
        b.nationalId?.toLowerCase().includes(term) ||
        b.email?.toLowerCase().includes(term)
    );
  }, [kycQueue, reviewBorrowers, verifiedBorrowers, incompleteBorrowers, filter, searchQuery]);

  return (
    <div>
      <PageHeading
        eyebrow="Compliance & verification"
        title="Identity & KYC"
        description="Inspect borrower identities, examine document OCR evidence, and manage compliance approvals."
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
        {/* Filters & Search Header */}
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
          <div className="relative min-w-[260px]">
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

        {/* KYC Borrowers Table */}
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
          <div className="overflow-x-auto">
            <table className="w-full min-w-[840px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="pb-3 pl-2">Borrower</th>
                  <th className="pb-3">National ID (NIDA)</th>
                  <th className="pb-3">Registration Date</th>
                  <th className="pb-3">Liveness &amp; Face</th>
                  <th className="pb-3">Credit Eligibility</th>
                  <th className="pb-3">Status</th>
                  <th className="pb-3 pr-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredBorrowers.map((borrower) => {
                  const status =
                    borrower.identityVerification?.status || borrower.kycStatus || 'pending';
                  const isRev = status === 'review';
                  const isVer = borrower.identityVerified || status === 'verified';
                  const livenessPassed = Boolean(borrower.identityVerification?.checks?.liveness);
                  const faceMatchPassed = Boolean(borrower.identityVerification?.checks?.faceMatch);

                  return (
                    <tr
                      key={borrower.id}
                      onClick={() => navigate(`/kyc/${borrower.id}`)}
                      className="group cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                    >
                      {/* Borrower */}
                      <td className="py-4 pl-2">
                        <div className="flex items-center gap-3">
                          <span
                            className={`grid size-9 place-items-center rounded-xl font-bold ${
                              isRev
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300'
                                : isVer
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300'
                                : 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-300'
                            }`}
                          >
                            {borrower.fullName ? borrower.fullName.slice(0, 1) : 'B'}
                          </span>
                          <div>
                            <strong className="block font-semibold text-zinc-900 group-hover:text-emerald-600 dark:text-zinc-100 dark:group-hover:text-emerald-400 transition-colors">
                              {borrower.fullName}
                            </strong>
                            <span className="mt-0.5 block font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                              {borrower.phone}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* National ID */}
                      <td className="py-4 font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        {borrower.nationalId || <span className="text-zinc-400">—</span>}
                      </td>

                      {/* Registration Date */}
                      <td className="py-4 text-zinc-500 dark:text-zinc-400">
                        {new Date(borrower.createdAt).toLocaleDateString()}
                      </td>

                      {/* Liveness & Face Match */}
                      <td className="py-4">
                        <div className="flex flex-col gap-1 text-[11px]">
                          <span className="flex items-center gap-1">
                            <span className="text-zinc-500 dark:text-zinc-400">Liveness:</span>
                            <strong
                              className={
                                livenessPassed
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-zinc-500 dark:text-zinc-400 font-normal'
                              }
                            >
                              {livenessPassed ? '✓ Passed' : 'Pending'}
                            </strong>
                          </span>
                          <span className="flex items-center gap-1">
                            <span className="text-zinc-500 dark:text-zinc-400">Face Match:</span>
                            <strong
                              className={
                                faceMatchPassed
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-zinc-500 dark:text-zinc-400 font-normal'
                              }
                            >
                              {faceMatchPassed ? '✓ Passed' : 'Pending'}
                            </strong>
                          </span>
                        </div>
                      </td>

                      {/* Readiness */}
                      <td className="py-4">
                        <span
                          className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            borrower.canApply
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {borrower.canApply ? 'Eligible' : 'Incomplete'}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-4">
                        <span
                          className={`inline-flex rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                            isRev
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200'
                              : isVer
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200'
                              : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                          }`}
                        >
                          {status.replaceAll('_', ' ')}
                        </span>
                      </td>

                      {/* Action */}
                      <td className="py-4 pr-2 text-right">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/kyc/${borrower.id}`);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/40 dark:hover:text-emerald-300"
                        >
                          <span>Review</span>
                          <HugeiconsIcon icon={ArrowRight01Icon} size={13} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
