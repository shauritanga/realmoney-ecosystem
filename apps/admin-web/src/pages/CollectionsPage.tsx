import { useState, useEffect, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  CallIcon,
  CheckmarkCircle02Icon,
  RefreshIcon,
  Search01Icon,
  SentIcon,
  UserAccountIcon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { EmptyState, PageHeading, Panel } from '../components/ui';
import { useDashboardData, useAuth } from '../hooks';
import type { Loan } from '../types';

interface Collector {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  activeAssignmentsCount: number;
  workedLevel: string | null;
  workedLevelLabel: string | null;
  maxCapacity: number | null;
}

type CollectionTier = 'M2' | 'M1' | 'ZERO' | 'T1' | 'T2' | 'T3';

const TIERS: { key: CollectionTier; label: string; desc: string; max: number | null }[] = [
  { key: 'M2', label: 'T-2', desc: 'Due in 2 days (max 45)', max: 45 },
  { key: 'M1', label: 'T-1', desc: 'Due tomorrow (max 45)', max: 45 },
  { key: 'ZERO', label: 'T0', desc: 'Due today (max 45)', max: 45 },
  { key: 'T1', label: 'T1', desc: '1 day overdue (max 45)', max: 45 },
  { key: 'T2', label: 'T2', desc: '2 days overdue (max 45)', max: 45 },
  { key: 'T3', label: 'S', desc: '3+ days overdue (unlimited)', max: null },
];

function getLoanTier(dueDateStr: string): { key: CollectionTier; label: string } | null {
  if (!dueDateStr) return null;
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime();
  const due = new Date(dueDateStr);
  const dueDay = new Date(Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())).getTime();
  const diffDays = Math.round((dueDay - today) / 86400000);

  if (diffDays > 2) return null; // Far future / UPCOMING
  if (diffDays === 2) return { key: 'M2', label: 'T-2' };
  if (diffDays === 1) return { key: 'M1', label: 'T-1' };
  if (diffDays === 0) return { key: 'ZERO', label: 'T0' };
  if (diffDays === -1) return { key: 'T1', label: 'T1' };
  if (diffDays === -2) return { key: 'T2', label: 'T2' };
  return { key: 'T3', label: 'S' };
}

export function CollectionsPage() {
  const { loans, pushPayment, refresh } = useDashboardData();
  const { token } = useAuth();

  const [activeTab, setActiveTab] = useState<'queue' | 'collectors'>('queue');
  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loadingCollectors, setLoadingCollectors] = useState(false);
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Action States
  const [showCreateCollectorModal, setShowCreateCollectorModal] = useState(false);
  const [showAutoAssignModal, setShowAutoAssignModal] = useState(false);
  const [showAssignSingleModal, setShowAssignSingleModal] = useState<{ loanId: string; loanNumber: string; tierLabel: string } | null>(null);

  // Forms
  const [collectorForm, setCollectorForm] = useState({ fullName: '', phone: '', email: '', password: '' });
  const [autoAssignForm, setAutoAssignForm] = useState<{ collectorId: string; level: CollectionTier; limit: number }>({
    collectorId: '',
    level: 'T1',
    limit: 45,
  });
  const [singleAssignCollectorId, setSingleAssignCollectorId] = useState('');

  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  async function fetchCollectors() {
    if (!token) return;
    setLoadingCollectors(true);
    try {
      const res = await fetch('/api/v1/admin/collectors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setCollectors(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoadingCollectors(false);
    }
  }

  useEffect(() => {
    void fetchCollectors();
  }, [token]);

  function triggerNotice(type: 'success' | 'error', message: string) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 5000);
  }

  // Workable collections queue: loans with outstandingBalance > 0 in active/overdue/defaulted
  const collectionLoans = useMemo(() => {
    return loans
      .filter((l: Loan) => Number(l.outstandingBalance) > 0 && ['ACTIVE', 'OVERDUE', 'DEFAULTED'].includes(l.status))
      .map((l: Loan) => {
        const tier = getLoanTier(l.dueDate);
        return {
          ...l,
          tier,
          tierKey: tier?.key || 'UPCOMING',
          tierLabel: tier?.label || 'Upcoming',
        };
      })
      .filter((l) => l.tier !== null); // Only loans in T-2..S
  }, [loans]);

  // Filtered loans list
  const filteredLoans = useMemo(() => {
    let list = collectionLoans;
    if (selectedTierFilter !== 'all') {
      list = list.filter((l) => l.tierKey === selectedTierFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (l) =>
          l.borrower?.fullName?.toLowerCase().includes(q) ||
          l.borrower?.phone?.toLowerCase().includes(q) ||
          l.loanNumber?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [collectionLoans, selectedTierFilter, searchQuery]);

  async function handleCreateCollector(e: React.FormEvent) {
    e.preventDefault();
    if (!token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/admin/collectors', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(collectorForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to create collector');
      triggerNotice('success', `Collector ${collectorForm.fullName} created successfully.`);
      setShowCreateCollectorModal(false);
      setCollectorForm({ fullName: '', phone: '', email: '', password: '' });
      await fetchCollectors();
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error creating collector');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAutoAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/collections/auto-assign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(autoAssignForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Auto-assignment failed');
      triggerNotice('success', `Assigned ${data.assigned} accounts in tier ${data.levelLabel}.`);
      setShowAutoAssignModal(false);
      await Promise.all([fetchCollectors(), refresh()]);
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error auto-assigning queue');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleAssignSingle(loanId: string, collectorId: string) {
    if (!token || actionLoading || !collectorId) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/collections/assign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId, collectorId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to assign loan');
      triggerNotice('success', 'Loan assigned successfully.');
      setShowAssignSingleModal(null);
      setSingleAssignCollectorId('');
      await Promise.all([fetchCollectors(), refresh()]);
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error assigning loan');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnassign(loanId: string) {
    if (!token || actionLoading) return;
    if (!window.confirm('Are you sure you want to unassign this loan?')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/collections/unassign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId }),
      });
      if (!res.ok) throw new Error('Failed to unassign loan');
      triggerNotice('success', 'Loan unassigned.');
      await Promise.all([fetchCollectors(), refresh()]);
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error unassigning loan');
    } finally {
      setActionLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Repayment operations"
        title="Collections"
        description="Monitor repayment schedules from T-2 to S, create collectors, and manage account assignments."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-xs dark:border-rose-900/80 dark:bg-rose-950/30 dark:text-rose-300">
              <HugeiconsIcon icon={Alert02Icon} size={14} />
              {collectionLoans.length} accounts in follow-up
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
              <HugeiconsIcon icon={UserCheck01Icon} size={14} className="text-emerald-600 dark:text-emerald-400" />
              {collectors.length} collectors
            </span>
            <button
              type="button"
              onClick={() => setShowCreateCollectorModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500"
            >
              <HugeiconsIcon icon={Add01Icon} size={14} />
              Add Collector
            </button>
          </div>
        }
      />

      {/* Notice Message */}
      {notice && (
        <div
          className={`flex items-center gap-2 rounded-xl p-3 text-xs font-medium ${
            notice.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
              : 'border border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
          }`}
        >
          <HugeiconsIcon
            icon={notice.type === 'success' ? CheckmarkCircle02Icon : Alert02Icon}
            size={16}
            className="shrink-0"
          />
          <span>{notice.message}</span>
        </div>
      )}

      {/* Main Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'queue'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={CallIcon} size={15} />
          Follow-up &amp; Recovery Queue ({collectionLoans.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('collectors')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'collectors'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={UserAccountIcon} size={15} />
          Collectors &amp; Capacity ({collectors.length})
        </button>
      </div>

      {/* TAB 1: FOLLOW-UP QUEUE */}
      {activeTab === 'queue' && (
        <Panel>
          {/* Tier Filters & Search Bar */}
          <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
            {/* Tier filter buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedTierFilter('all')}
                className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                  selectedTierFilter === 'all'
                    ? 'bg-zinc-900 text-white font-semibold shadow-xs dark:bg-white dark:text-black'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400'
                }`}
              >
                All Tiers ({collectionLoans.length})
              </button>
              {TIERS.map(({ key, label }) => {
                const count = collectionLoans.filter((l) => l.tierKey === key).length;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedTierFilter(key)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                      selectedTierFilter === key
                        ? 'bg-emerald-600 text-white font-semibold shadow-xs'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400'
                    }`}
                  >
                    {label} ({count})
                  </button>
                );
              })}
            </div>

            {/* Search box */}
            <div className="relative min-w-[240px]">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                placeholder="Search borrower, phone, loan #..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          {filteredLoans.length === 0 ? (
            <EmptyState
              title={searchQuery ? 'No matching accounts' : 'Queue is clear'}
              detail={
                searchQuery
                  ? `No accounts found matching "${searchQuery}".`
                  : 'There are no accounts in this collection tier.'
              }
            />
          ) : (
            <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {filteredLoans.map((loan) => {
                const assignedCollector = loan.assignments?.[0]?.collector;
                return (
                  <div
                    key={loan.id}
                    className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center justify-between"
                  >
                    {/* Left: Borrower & Loan Details */}
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <span
                        className={`grid size-9 shrink-0 place-items-center rounded-xl font-bold text-xs ${
                          loan.tierKey === 'T3'
                            ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                            : loan.daysOverdue > 0
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {loan.tierLabel}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <strong className="block text-sm text-zinc-900 dark:text-zinc-100 truncate">
                            {loan.borrower?.fullName || 'Borrower'}
                          </strong>
                          <span className="rounded-md border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
                            {loan.loanNumber}
                          </span>
                        </div>
                        <span className="mt-0.5 block text-xs text-zinc-500 dark:text-zinc-400">
                          {loan.borrower?.phone} · Due: {new Date(loan.dueDate).toLocaleDateString()}
                          {loan.daysOverdue > 0 ? (
                            <span className="ml-1 font-semibold text-rose-600 dark:text-rose-400">
                              ({loan.daysOverdue}d overdue)
                            </span>
                          ) : (
                            <span className="ml-1 text-emerald-600 dark:text-emerald-400">
                              (Pre-due reminder)
                            </span>
                          )}
                        </span>
                      </div>
                    </div>

                    {/* Middle: Collector Assignment Badge & Controls */}
                    <div className="flex items-center gap-3">
                      {assignedCollector ? (
                        <div className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
                          <HugeiconsIcon icon={UserCheck01Icon} size={14} className="text-emerald-600" />
                          <span className="text-zinc-700 dark:text-zinc-300">
                            {assignedCollector.fullName}
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleUnassign(loan.id)}
                            title="Unassign"
                            className="text-zinc-400 hover:text-rose-600 ml-1"
                          >
                            ✕
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() =>
                            setShowAssignSingleModal({
                              loanId: loan.id,
                              loanNumber: loan.loanNumber,
                              tierLabel: loan.tierLabel,
                            })
                          }
                          className="rounded-lg border border-dashed border-zinc-300 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-emerald-500 hover:text-emerald-600 dark:border-zinc-700 dark:text-zinc-400"
                        >
                          + Assign Collector
                        </button>
                      )}
                    </div>

                    {/* Right: Balance & USSD Push */}
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <span className="block text-[10px] text-zinc-500 dark:text-zinc-400">Outstanding</span>
                        <strong className="block text-sm font-semibold text-rose-600 dark:text-rose-400">
                          {money(loan.outstandingBalance)}
                        </strong>
                      </div>

                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-bold text-black shadow-xs transition hover:bg-emerald-300"
                        onClick={() => void pushPayment(loan.id, Number(loan.outstandingBalance))}
                      >
                        <HugeiconsIcon icon={SentIcon} size={13} />
                        Push USSD
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>
      )}

      {/* TAB 2: COLLECTORS & CAPACITY DESK */}
      {activeTab === 'collectors' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Collector Team &amp; Work Queue Capacities
              </h3>
              <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                Each collector can be assigned up to 45 accounts for tiers T-2 through T2, and unlimited for tier S.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowAutoAssignModal(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                Auto-Assign Work Queue
              </button>
              <button
                type="button"
                onClick={() => void fetchCollectors()}
                className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
              >
                <HugeiconsIcon icon={RefreshIcon} size={14} className={loadingCollectors ? 'animate-spin' : ''} />
                Refresh
              </button>
            </div>
          </div>

          <Panel>
            {collectors.length === 0 ? (
              <EmptyState
                title="No collectors registered"
                detail="Click 'Add Collector' above to onboard your recovery agents."
              />
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                {collectors.map((col) => {
                  const maxCap = col.maxCapacity;
                  const isUnlimited = maxCap === null;
                  const count = col.activeAssignmentsCount;
                  const percent = isUnlimited ? Math.min(100, (count / 60) * 100) : Math.min(100, (count / (maxCap || 45)) * 100);

                  return (
                    <div
                      key={col.id}
                      className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-4 shadow-xs dark:border-zinc-800 dark:bg-zinc-900"
                    >
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <strong className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            {col.fullName}
                          </strong>
                          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                            ACTIVE
                          </span>
                        </div>
                        <span className="block font-mono text-xs text-zinc-500 dark:text-zinc-400">
                          {col.phone} {col.email ? `· ${col.email}` : ''}
                        </span>

                        {/* Assigned Tier */}
                        <div className="mt-3 flex items-center justify-between text-xs">
                          <span className="text-zinc-500 dark:text-zinc-400">Assigned Tier:</span>
                          <strong className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                            {col.workedLevelLabel || 'Unassigned'}
                          </strong>
                        </div>

                        {/* Capacity meter */}
                        <div className="mt-3">
                          <div className="flex items-center justify-between text-[11px] mb-1">
                            <span className="text-zinc-500 dark:text-zinc-400">Workload Capacity</span>
                            <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                              {count} {isUnlimited ? 'assigned (Unlimited / S)' : `/ ${maxCap || 45} max`}
                            </span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            <div
                              className={`h-full transition-all duration-300 ${
                                percent >= 100
                                  ? 'bg-rose-500'
                                  : percent >= 75
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Quick action button */}
                      <button
                        type="button"
                        onClick={() => {
                          setAutoAssignForm({
                            collectorId: col.id,
                            level: (col.workedLevel as CollectionTier) || 'T1',
                            limit: isUnlimited ? 45 : Math.max(1, 45 - count),
                          });
                          setShowAutoAssignModal(true);
                        }}
                        className="mt-4 w-full rounded-lg border border-zinc-200 py-1.5 text-xs font-semibold text-zinc-700 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-800 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                      >
                        Assign Tier Queue
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* MODAL 1: ADD COLLECTOR */}
      {showCreateCollectorModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Add New Collector</h3>
              <button
                type="button"
                onClick={() => setShowCreateCollectorModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateCollector} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Neema Mwangi"
                  value={collectorForm.fullName}
                  onChange={(e) => setCollectorForm({ ...collectorForm, fullName: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Phone Number</label>
                <input
                  type="tel"
                  required
                  placeholder="e.g. 0712345678 or +255..."
                  value={collectorForm.phone}
                  onChange={(e) => setCollectorForm({ ...collectorForm, phone: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="e.g. neema@realmoney.tz"
                  value={collectorForm.email}
                  onChange={(e) => setCollectorForm({ ...collectorForm, email: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Password</label>
                <input
                  type="password"
                  required
                  placeholder="Min 6 characters"
                  value={collectorForm.password}
                  onChange={(e) => setCollectorForm({ ...collectorForm, password: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateCollectorModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Creating…' : 'Create Collector'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: AUTO-ASSIGN WORK QUEUE */}
      {showAutoAssignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Auto-Assign Work Queue</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                  Bulk assign unassigned cases of a single tier to a collector.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoAssignModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAutoAssign} className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Select Collector</label>
                <select
                  required
                  value={autoAssignForm.collectorId}
                  onChange={(e) => setAutoAssignForm({ ...autoAssignForm, collectorId: e.target.value })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                >
                  <option value="">-- Choose Collector --</option>
                  {collectors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.fullName} ({c.activeAssignmentsCount} assigned {c.workedLevelLabel ? `· works ${c.workedLevelLabel}` : '· free'})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">Collection Tier</label>
                <select
                  value={autoAssignForm.level}
                  onChange={(e) => setAutoAssignForm({ ...autoAssignForm, level: e.target.value as CollectionTier })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                >
                  {TIERS.map(({ key, label, desc }) => (
                    <option key={key} value={key}>
                      {label} — {desc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-zinc-700 dark:text-zinc-300 mb-1">
                  Batch Limit (Up to 45 for T-2..T2; unlimited for S)
                </label>
                <input
                  type="number"
                  min="1"
                  max={autoAssignForm.level === 'T3' ? 500 : 45}
                  value={autoAssignForm.limit}
                  onChange={(e) => setAutoAssignForm({ ...autoAssignForm, limit: Number(e.target.value) })}
                  className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAutoAssignModal(false)}
                  className="rounded-xl border border-zinc-200 px-4 py-2 font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || !autoAssignForm.collectorId}
                  className="rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
                >
                  {actionLoading ? 'Assigning…' : 'Execute Assignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: ASSIGN SINGLE LOAN */}
      {showAssignSingleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-white mb-1">
              Assign Loan {showAssignSingleModal.loanNumber}
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-4">
              Tier: <strong className="text-emerald-600">{showAssignSingleModal.tierLabel}</strong>. Choose an agent working this tier with capacity.
            </p>

            <select
              value={singleAssignCollectorId}
              onChange={(e) => setSingleAssignCollectorId(e.target.value)}
              className="w-full rounded-xl border border-zinc-200 bg-zinc-50 p-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-800 dark:text-white focus:outline-hidden focus:border-emerald-500 mb-4"
            >
              <option value="">-- Choose Collector --</option>
              {collectors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.fullName} ({c.activeAssignmentsCount} assigned {c.workedLevelLabel ? `· works ${c.workedLevelLabel}` : '· free'})
                </option>
              ))}
            </select>

            <div className="flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => {
                  setShowAssignSingleModal(null);
                  setSingleAssignCollectorId('');
                }}
                className="rounded-xl border border-zinc-200 px-3.5 py-2 font-semibold text-zinc-600 dark:border-zinc-700 dark:text-zinc-300"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading || !singleAssignCollectorId}
                onClick={() => handleAssignSingle(showAssignSingleModal.loanId, singleAssignCollectorId)}
                className="rounded-xl bg-emerald-600 px-3.5 py-2 font-bold text-white shadow-xs hover:bg-emerald-500 disabled:opacity-50"
              >
                {actionLoading ? 'Assigning…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
