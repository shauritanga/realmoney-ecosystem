import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  CallIcon,
  CheckmarkCircle02Icon,
  Notification01Icon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { useClickOutside, useDashboardData } from '../hooks';

interface NotificationsMenuProps {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}

export function NotificationsMenu({
  open,
  onToggle,
  onClose,
}: NotificationsMenuProps) {
  const navigate = useNavigate();
  const { overdueLoans, pendingLoans } = useDashboardData();
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, onClose, open);

  const overdueCount = overdueLoans.length;
  const pendingCount = pendingLoans.length;
  const totalAlerts = overdueCount + pendingCount;

  const handleAction = (path: string) => {
    navigate(path);
    onClose();
  };

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Notifications Trigger Button */}
      <button
        type="button"
        onClick={onToggle}
        aria-label="View notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`relative grid size-8.5 place-items-center rounded-lg transition-colors ${
          open
            ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-900 dark:text-white'
            : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white'
        }`}
      >
        <HugeiconsIcon icon={Notification01Icon} size={17} />
        {totalAlerts > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold leading-none text-white shadow-xs">
            {totalAlerts > 9 ? '9+' : totalAlerts}
          </span>
        )}
      </button>

      {/* Notifications Dropdown Card */}
      {open && (
        <div
          role="dialog"
          aria-label="Notifications panel"
          className="absolute right-0 top-full mt-2 z-50 w-80 sm:w-88 overflow-hidden rounded-2xl border border-zinc-200 bg-white p-3 shadow-2xl backdrop-blur-xl transition-all duration-150 animate-in fade-in zoom-in-95 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_20px_50px_rgba(0,0,0,0.85)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-200 pb-2.5 px-1 dark:border-zinc-800">
            <div className="flex items-center gap-2">
              <strong className="text-xs font-semibold text-zinc-900 dark:text-white">
                Notifications
              </strong>
              {totalAlerts > 0 && (
                <span className="rounded-full bg-rose-50 border border-rose-200 px-2 py-0.5 text-[10px] font-bold text-rose-700 dark:bg-rose-950/80 dark:border-rose-800/80 dark:text-rose-300">
                  {totalAlerts} active
                </span>
              )}
            </div>
            <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Live operational feed
            </span>
          </div>

          {/* List of items */}
          <div className="mt-2.5 flex flex-col gap-2">
            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => handleAction('/collections')}
                className="group flex w-full items-start gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-2.5 text-left transition-all hover:border-rose-300 hover:bg-rose-100/70 dark:border-rose-950/80 dark:bg-rose-950/20 dark:hover:border-rose-800 dark:hover:bg-rose-950/40"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-rose-100 text-rose-700 dark:bg-rose-950/80 dark:text-rose-400">
                  <HugeiconsIcon icon={CallIcon} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-medium text-rose-900 dark:text-rose-200">
                      Overdue Loans
                    </strong>
                    <span className="text-[10px] font-bold text-rose-700 dark:text-rose-400">
                      {overdueCount} {overdueCount === 1 ? 'account' : 'accounts'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    Delinquent loans require collection reminders or USSD push triggers.
                  </p>
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="mt-1 text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-white" />
              </button>
            )}

            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => handleAction('/underwriting')}
                className="group flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-left transition-all hover:border-amber-300 hover:bg-amber-100/70 dark:border-amber-950/80 dark:bg-amber-950/20 dark:hover:border-amber-800 dark:hover:bg-amber-950/40"
              >
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/80 dark:text-amber-400">
                  <HugeiconsIcon icon={UserCheck01Icon} size={14} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <strong className="text-xs font-medium text-amber-900 dark:text-amber-200">
                      Pending Underwriting
                    </strong>
                    <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400">
                      {pendingCount} new
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400 line-clamp-2">
                    Loan applications awaiting credit assessment and manual approval.
                  </p>
                </div>
                <HugeiconsIcon icon={ArrowRight01Icon} size={14} className="mt-1 text-zinc-400 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-white" />
              </button>
            )}

            {totalAlerts === 0 && (
              <div className="flex flex-col items-center justify-center py-6 text-center">
                <span className="mb-2 grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />
                </span>
                <strong className="text-xs text-zinc-800 dark:text-zinc-200">
                  Everything is in order
                </strong>
                <p className="mt-1 max-w-[220px] text-[11px] text-zinc-500 dark:text-zinc-400">
                  All active portfolios are in good standing with no pending underwriting queues.
                </p>
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="mt-2.5 border-t border-zinc-200 pt-2 text-center text-[10px] text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            Click an alert to open the respective operations desk
          </div>
        </div>
      )}
    </div>
  );
}
