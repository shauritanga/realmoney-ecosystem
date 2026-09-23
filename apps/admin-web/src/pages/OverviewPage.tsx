import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Activity01Icon,
  Alert02Icon,
  ArrowDownRight01Icon,
  ArrowRight01Icon,
  ArrowUpRight01Icon,
  DollarCircleIcon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { LoanTable } from '../components/LoanTable';
import { EmptyState, LoadingState, PageHeading, Panel, PanelHeading, ViewButton } from '../components/ui';
import { useDashboardData } from '../hooks';
import type { Loan } from '../types';

interface MetricProps {
  label: string;
  value: string;
  helper: string;
  icon: ReactNode;
  tone: string;
  alert?: boolean;
}

function Metric({ label, value, helper, icon, tone, alert }: MetricProps) {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none">
      <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
        <span>{label}</span>
        <span className={`grid size-8 place-items-center rounded-lg ${tone}`}>
          {icon}
        </span>
      </div>
      <strong
        className={`mt-4 block font-display text-2xl tracking-[-0.04em] ${
          alert
            ? 'text-amber-600 dark:text-amber-300'
            : 'text-zinc-900 dark:text-white'
        }`}
      >
        {value}
      </strong>
      <span className="mt-2 flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        <HugeiconsIcon icon={ArrowUpRight01Icon} size={13} className="text-emerald-600 dark:text-emerald-400" />
        {helper}
      </span>
    </div>
  );
}

interface QueuePanelProps {
  title: string;
  detail: string;
  action: string;
  onClick: () => void;
  loans: Loan[];
  recovery?: boolean;
  emptyTitle: string;
  emptyDetail: string;
}

function QueuePanel({
  title,
  detail,
  action,
  onClick,
  loans,
  recovery,
  emptyTitle,
  emptyDetail,
}: QueuePanelProps) {
  return (
    <Panel>
      <PanelHeading
        title={title}
        detail={detail}
        action={<ViewButton onClick={onClick}>{action}</ViewButton>}
      />
      {loans.length === 0 ? (
        <EmptyState title={emptyTitle} detail={emptyDetail} />
      ) : (
        <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {loans.slice(0, 4).map((loan: Loan) => (
            <div key={loan.id} className="flex items-center gap-3 py-3">
              <span
                className={`grid size-8 place-items-center rounded-lg ${
                  recovery
                    ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                    : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {recovery ? (
                  <HugeiconsIcon icon={Alert02Icon} size={15} />
                ) : (
                  loan.borrower.fullName.slice(0, 1)
                )}
              </span>
              <div className="min-w-0 flex-1">
                <strong className="block truncate text-xs text-zinc-800 dark:text-zinc-200">
                  {loan.borrower.fullName}
                </strong>
                <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {recovery
                    ? `${loan.daysOverdue} days overdue · ${loan.agingBucket}`
                    : `${loan.loanNumber} · ${loan.product.name}`}
                </span>
              </div>
              <div className="text-right">
                <strong
                  className={`block text-[11px] ${
                    recovery
                      ? 'text-rose-600 dark:text-rose-400 font-semibold'
                      : 'text-zinc-800 dark:text-zinc-200'
                  }`}
                >
                  {money(
                    recovery ? loan.outstandingBalance : loan.principalAmount
                  )}
                </strong>
                <span className="mt-0.5 block text-[10px] text-zinc-500 dark:text-zinc-400">
                  {recovery ? 'outstanding' : `${loan.tenureDays} days`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

export function OverviewPage() {
  const navigate = useNavigate();
  const {
    stats,
    loans,
    overdueLoans,
    pendingLoans,
    recoveryRate,
    loading,
  } = useDashboardData();

  if (!stats && loading) {
    return <LoadingState />;
  }

  if (!stats) {
    return (
      <EmptyState
        title="No portfolio data"
        detail="Operations data has not yet been loaded. Check API connectivity."
      />
    );
  }

  return (
    <div>
      <PageHeading
        eyebrow="Monday, 20 September 2026"
        title="Good morning, team."
        description="Here is the latest view of your lending book and today's decisions."
        action={
          <button
            type="button"
            onClick={() => navigate('/underwriting')}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-400 px-4 py-3 text-xs font-bold text-black transition hover:bg-emerald-300 shadow-xs"
          >
            <HugeiconsIcon icon={UserCheck01Icon} size={16} /> Review applications <HugeiconsIcon icon={ArrowRight01Icon} size={15} />
          </button>
        }
      />

      {/* Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Disbursed portfolio"
          value={money(stats.totalDisbursedAmount)}
          helper="Lifetime principal released"
          icon={<HugeiconsIcon icon={DollarCircleIcon} size={18} />}
          tone="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
        />
        <Metric
          label="Outstanding balance"
          value={money(stats.totalOutstandingAmount)}
          helper={`${stats.activeLoans} active accounts`}
          icon={<HugeiconsIcon icon={Activity01Icon} size={18} />}
          tone="bg-blue-500/10 text-blue-600 dark:text-blue-400"
        />
        <Metric
          label="Recovery to date"
          value={money(stats.totalRepaymentsAmount)}
          helper={`${recoveryRate}% of disbursed principal`}
          icon={<HugeiconsIcon icon={ArrowDownRight01Icon} size={18} />}
          tone="bg-violet-500/10 text-violet-600 dark:text-violet-400"
        />
        <Metric
          label="Overdue accounts"
          value={String(stats.overdueLoans)}
          helper="Need collection attention"
          icon={<HugeiconsIcon icon={Alert02Icon} size={18} />}
          tone="bg-amber-500/10 text-amber-600 dark:text-amber-400"
          alert
        />
      </div>

      {/* Operational Queues */}
      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <QueuePanel
          title="Decisions waiting"
          detail={`${pendingLoans.length} pending applications`}
          action="Open underwriting"
          onClick={() => navigate('/underwriting')}
          loans={pendingLoans}
          emptyTitle="No pending decisions"
          emptyDetail="The loan underwriting queue is clear."
        />
        <QueuePanel
          title="Recovery watch"
          detail={`${overdueLoans.length} accounts overdue`}
          action="View queue"
          onClick={() => navigate('/collections')}
          loans={overdueLoans}
          recovery
          emptyTitle="No overdue accounts"
          emptyDetail="Your recovery queue is clear."
        />
      </div>

      {/* Full Loan Book */}
      <Panel className="mt-5">
        <PanelHeading
          title="Loan book"
          detail={`${loans.length} records across all statuses`}
          action={
            <ViewButton onClick={() => navigate('/underwriting')}>
              View loan underwriting
            </ViewButton>
          }
        />
        <LoanTable loans={loans.slice(0, 8)} />
      </Panel>
    </div>
  );
}
