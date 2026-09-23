import { useState, useEffect, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Add01Icon,
  Alert02Icon,
  CheckmarkCircle02Icon,
  RefreshIcon,
  Search01Icon,
  UserCheck01Icon,
  UserGroupIcon,
  ViewIcon,
} from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { EmptyState, PageHeading, Panel } from '../components/ui';
import { useAuth, useDashboardData } from '../hooks';

interface AssignedLoan {
  id: string;
  loanId: string;
  loanNumber: string;
  borrowerName: string;
  borrowerPhone: string;
  outstandingBalance: number;
  dueDate: string;
  assignedAt: string;
}

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
  assignedLoans?: AssignedLoan[];
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

export function CollectorsPage() {
  const { token } = useAuth();
  const { refresh: refreshDashboard } = useDashboardData();

  const [collectors, setCollectors] = useState<Collector[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTierFilter, setSelectedTierFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAutoAssignModal, setShowAutoAssignModal] = useState(false);
  const [viewingCollector, setViewingCollector] = useState<Collector | null>(null);

  // Forms
  const [collectorForm, setCollectorForm] = useState({ fullName: '', phone: '', email: '', password: '' });
  const [autoAssignForm, setAutoAssignForm] = useState<{ collectorId: string; level: CollectionTier; limit: number }>({
    collectorId: '',
    level: 'T1',
    limit: 45,
  });

  const [actionLoading, setActionLoading] = useState(false);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  function triggerNotice(type: 'success' | 'error', message: string) {
    setNotice({ type, message });
    setTimeout(() => setNotice(null), 5000);
  }

  async function fetchCollectors() {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch('/api/v1/admin/collectors', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: Collector[] = await res.json();
        setCollectors(data);
        // If viewing collector modal is open, refresh that collector's data
        if (viewingCollector) {
          const updated = data.find((c) => c.id === viewingCollector.id);
          if (updated) setViewingCollector(updated);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchCollectors();
  }, [token]);

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
      setShowCreateModal(false);
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
      await Promise.all([fetchCollectors(), refreshDashboard()]);
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error auto-assigning queue');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleToggleStatus(collectorId: string) {
    if (!token || actionLoading) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/v1/admin/collectors/${collectorId}/status`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to update collector status');
      triggerNotice('success', 'Collector status updated.');
      await fetchCollectors();
    } catch (err: any) {
      triggerNotice('error', err.message || 'Failed to toggle status');
    } finally {
      setActionLoading(false);
    }
  }

  async function handleUnassignLoan(loanId: string) {
    if (!token || actionLoading) return;
    if (!window.confirm('Are you sure you want to unassign this loan from the collector?')) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/v1/collections/unassign', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanId }),
      });
      if (!res.ok) throw new Error('Failed to unassign loan');
      triggerNotice('success', 'Loan unassigned from collector.');
      await Promise.all([fetchCollectors(), refreshDashboard()]);
    } catch (err: any) {
      triggerNotice('error', err.message || 'Error unassigning loan');
    } finally {
      setActionLoading(false);
    }
  }

  // Summary Metrics
  const totalCollectors = collectors.length;
  const activeCollectors = collectors.filter((c) => c.isActive).length;
  const frontTierCollectors = collectors.filter((c) => c.workedLevel && c.workedLevel !== 'T3').length;
  const deepRecoveryCollectors = collectors.filter((c) => c.workedLevel === 'T3').length;
  const totalAssignedLoans = collectors.reduce((sum, c) => sum + c.activeAssignmentsCount, 0);

  // Filtered Collectors
  const filteredCollectors = useMemo(() => {
    return collectors.filter((c) => {
      // Tier filter
      if (selectedTierFilter !== 'all') {
        if (selectedTierFilter === 'unassigned' && c.workedLevel !== null) return false;
        if (selectedTierFilter !== 'unassigned' && c.workedLevel !== selectedTierFilter) return false;
      }
      // Status filter
      if (statusFilter === 'active' && !c.isActive) return false;
      if (statusFilter === 'inactive' && c.isActive) return false;
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = c.fullName?.toLowerCase().includes(q);
        const matchesPhone = c.phone?.toLowerCase().includes(q);
        const matchesEmail = c.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesPhone && !matchesEmail) return false;
      }
      return true;
    });
  }, [collectors, selectedTierFilter, statusFilter, searchQuery]);

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Recovery Team Management"
        title="Collectors"
        description="Manage recovery agents, monitor workload capacities (max 45 accounts for T-2 to T2; unlimited for S), and assign work tiers."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void fetchCollectors()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
            <button
              type="button"
              onClick={() => setShowAutoAssignModal(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              Auto-Assign Queue
            </button>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
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

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Collectors</span>
            <HugeiconsIcon icon={UserGroupIcon} size={15} className="text-zinc-400" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{totalCollectors}</strong>
            <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
              ({activeCollectors} active)
            </span>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="flex items-center justify-between">
            <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Front-Tier Agents (T-2..T2)</span>
            <HugeiconsIcon icon={UserCheck01Icon} size={15} className="text-emerald-500" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{frontTierCollectors}</strong>
            <span className="text-[11px] text-zinc-500">Max 45/collector</span>
          </div>
        </Panel>

        <Panel className="p-4">
          <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Deep Recovery (S Tier)</span>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{deepRecoveryCollectors}</strong>
            <span className="text-[11px] text-zinc-500">Unlimited pool</span>
          </div>
        </Panel>

        <Panel className="p-4">
          <span className="block text-[11px] font-medium text-zinc-500 dark:text-zinc-400">Total Accounts Assigned</span>
          <div className="mt-1 flex items-baseline gap-2">
            <strong className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{totalAssignedLoans}</strong>
            <span className="text-[11px] text-zinc-500">borrowers active</span>
          </div>
        </Panel>
      </div>

      {/* Search & Filters */}
      <Panel className="p-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Tier Buttons */}
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
              All Collectors ({collectors.length})
            </button>
            {TIERS.map(({ key, label }) => {
              const count = collectors.filter((c) => c.workedLevel === key).length;
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
            <button
              type="button"
              onClick={() => setSelectedTierFilter('unassigned')}
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                selectedTierFilter === 'unassigned'
                  ? 'bg-zinc-800 text-white font-semibold shadow-xs'
                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-900 dark:text-zinc-400'
              }`}
            >
              Free ({collectors.filter((c) => c.workedLevel === null).length})
            </button>
          </div>

          {/* Search box & status filter */}
          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 px-2.5 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 focus:outline-hidden focus:border-emerald-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive</option>
            </select>

            <div className="relative min-w-[220px]">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                placeholder="Search collector name, phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Collectors Grid */}
      {filteredCollectors.length === 0 ? (
        <EmptyState
          title={searchQuery ? 'No matching collectors found' : 'No collectors onboarded yet'}
          detail={
            searchQuery
              ? `No collectors matching query "${searchQuery}".`
              : 'Click "Add Collector" above to add your first recovery agent.'
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredCollectors.map((col) => {
            const maxCap = col.maxCapacity;
            const isUnlimited = maxCap === null;
            const count = col.activeAssignmentsCount;
            const percent = isUnlimited
              ? Math.min(100, (count / 60) * 100)
              : Math.min(100, (count / (maxCap || 45)) * 100);

            const isAtCapacity = !isUnlimited && count >= (maxCap || 45);

            return (
              <div
                key={col.id}
                className={`flex flex-col justify-between rounded-2xl border bg-white p-5 shadow-xs transition dark:bg-zinc-900 ${
                  col.isActive
                    ? 'border-zinc-200 dark:border-zinc-800'
                    : 'border-zinc-200/60 opacity-60 dark:border-zinc-800/60'
                }`}
              >
                <div>
                  {/* Top: Name & Active Status Toggle */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <strong className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                          {col.fullName}
                        </strong>
                      </div>
                      <span className="block font-mono text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                        {col.phone} {col.email ? `· ${col.email}` : ''}
                      </span>
                    </div>

                    <button
                      type="button"
                      onClick={() => void handleToggleStatus(col.id)}
                      disabled={actionLoading}
                      title={col.isActive ? 'Click to deactivate' : 'Click to activate'}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold transition ${
                        col.isActive
                          ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300'
                          : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400'
                      }`}
                    >
                      {col.isActive ? 'ACTIVE' : 'INACTIVE'}
                    </button>
                  </div>

                  {/* Assigned Tier Badge */}
                  <div className="mt-4 flex items-center justify-between text-xs">
                    <span className="text-zinc-500 dark:text-zinc-400">Assigned Tier:</span>
                    {col.workedLevelLabel ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2.5 py-0.5 font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                        {col.workedLevelLabel}
                        {col.workedLevel === 'T3' && ' (S Tier)'}
                      </span>
                    ) : (
                      <span className="rounded-md bg-zinc-100 px-2 py-0.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                        Free / Unassigned
                      </span>
                    )}
                  </div>

                  {/* Capacity Meter */}
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-[11px] mb-1.5">
                      <span className="text-zinc-500 dark:text-zinc-400">Workload Capacity</span>
                      <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                        {count}{' '}
                        {isUnlimited ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            assigned (Unlimited / S)
                          </span>
                        ) : (
                          `/ ${maxCap || 45} max`
                        )}
                      </span>
                    </div>

                    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isAtCapacity
                            ? 'bg-rose-500'
                            : percent >= 75
                            ? 'bg-amber-500'
                            : 'bg-emerald-500'
                        }`}
                        style={{ width: `${percent}%` }}
                      />
                    </div>

                    <div className="mt-1 flex justify-between text-[10px] text-zinc-400">
                      <span>
                        {isUnlimited
                          ? 'No upper limit for S pool'
                          : isAtCapacity
                          ? 'Reached maximum 45 capacity'
                          : `${(maxCap || 45) - count} slots available`}
                      </span>
                      <span>{Math.round(percent)}%</span>
                    </div>
                  </div>
                </div>

                {/* Bottom Actions */}
                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-zinc-100 pt-3 dark:border-zinc-800/80">
                  <button
                    type="button"
                    onClick={() => setViewingCollector(col)}
                    className="inline-flex items-center justify-center gap-1 rounded-xl border border-zinc-200 py-1.5 px-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    <HugeiconsIcon icon={ViewIcon} size={13} />
                    Accounts ({count})
                  </button>

                  <button
                    type="button"
                    disabled={!col.isActive}
                    onClick={() => {
                      setAutoAssignForm({
                        collectorId: col.id,
                        level: (col.workedLevel as CollectionTier) || 'T1',
                        limit: isUnlimited ? 45 : Math.max(1, 45 - count),
                      });
                      setShowAutoAssignModal(true);
                    }}
                    className="inline-flex items-center justify-center gap-1 rounded-xl bg-emerald-600 py-1.5 px-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Assign Queue
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: ADD COLLECTOR */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-white">Add New Collector</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white text-base"
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
                  onClick={() => setShowCreateModal(false)}
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
                  Assign overdue queue by tier with capacity validation.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowAutoAssignModal(false)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white text-base"
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
                  {collectors
                    .filter((c) => c.isActive)
                    .map((c) => (
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

      {/* MODAL 3: VIEW ASSIGNED BORROWERS FOR A COLLECTOR */}
      {viewingCollector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-200 p-5 dark:border-zinc-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-zinc-900 dark:text-white">
                    {viewingCollector.fullName}'s Assigned Accounts
                  </h3>
                  <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                    {viewingCollector.activeAssignmentsCount} Assigned
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                  Phone: {viewingCollector.phone} · Tier:{' '}
                  <strong>{viewingCollector.workedLevelLabel || 'Unassigned'}</strong>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewingCollector(null)}
                className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white text-base"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5">
              {!viewingCollector.assignedLoans || viewingCollector.assignedLoans.length === 0 ? (
                <EmptyState
                  title="No active loans assigned"
                  detail="This collector currently has zero active accounts. Use 'Assign Queue' to allocate accounts."
                />
              ) : (
                <div className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {viewingCollector.assignedLoans.map((item) => (
                    <div key={item.id} className="flex items-center justify-between py-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <strong className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {item.borrowerName}
                          </strong>
                          <span className="rounded font-mono text-[10px] text-zinc-500">
                            {item.loanNumber}
                          </span>
                        </div>
                        <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {item.borrowerPhone} · Due: {new Date(item.dueDate).toLocaleDateString()}
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <strong className="block text-xs font-semibold text-rose-600 dark:text-rose-400">
                            {money(item.outstandingBalance)}
                          </strong>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleUnassignLoan(item.loanId)}
                          disabled={actionLoading}
                          className="rounded-lg border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end border-t border-zinc-200 p-4 dark:border-zinc-800">
              <button
                type="button"
                onClick={() => setViewingCollector(null)}
                className="rounded-xl bg-zinc-900 px-4 py-2 text-xs font-semibold text-white dark:bg-white dark:text-black"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
