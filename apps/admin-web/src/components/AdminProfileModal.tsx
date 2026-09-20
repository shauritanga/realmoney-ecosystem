import { useEffect, useRef } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Copy01Icon,
  Key01Icon,
  ShieldCheckIcon,
} from '@hugeicons/core-free-icons';
import { useClickOutside } from '../hooks/useClickOutside';
import { useAuth } from '../hooks/useAuth';

interface AdminProfileModalProps {
  open: boolean;
  onClose: () => void;
  token: string | null;
  onNotify: (msg: string) => void;
}

export function AdminProfileModal({
  open,
  onClose,
  token,
  onNotify,
}: AdminProfileModalProps) {
  const { user } = useAuth();
  const modalRef = useRef<HTMLDivElement>(null);

  useClickOutside(modalRef, onClose, open);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AS';

  const copyTokenSnippet = () => {
    if (!token) return;
    navigator.clipboard.writeText(token);
    onNotify('Access token copied to clipboard');
  };

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="profile-title"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-zinc-200 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-150 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_20px_50px_rgba(0,0,0,0.85)]"
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div>
              <span className="grid size-12 place-items-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-500 text-base font-bold text-black shadow-md">
                {userInitials}
              </span>
            </div>
            <div>
              <h3 id="profile-title" className="text-base font-semibold text-zinc-900 dark:text-white">
                {user?.fullName || 'Athanas Shauritanga'}
              </h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">{user?.email || 'shauritangaathanas@gmail.com'}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid size-8 place-items-center rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        {/* Roles & Status */}
        <div className="mt-5 rounded-2xl border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800/80 dark:bg-black">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Assigned Role</span>
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 dark:border-emerald-800/80 dark:bg-emerald-950/60 dark:text-emerald-300">
              <HugeiconsIcon icon={ShieldCheckIcon} size={13} />
              System Administrator
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-200 pt-2.5 dark:border-zinc-800/80">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Environment</span>
            <span className="text-xs font-medium text-zinc-900 dark:text-zinc-200">
              realMoney Microfinance TZ (Production)
            </span>
          </div>
          <div className="mt-2.5 flex items-center justify-between border-t border-zinc-200 pt-2.5 dark:border-zinc-800/80">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">Session Security</span>
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <span className="size-2 rounded-full bg-emerald-500 dark:bg-emerald-400 animate-pulse" />
              Authenticated (JWT Bearer)
            </span>
          </div>
        </div>

        {/* Permissions & Capabilities */}
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            Console Privileges
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Credit Underwriting</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Loan Disbursement</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Selcom USSD Push</span>
            </div>
            <div className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 p-2 text-zinc-700 dark:border-zinc-800/80 dark:bg-zinc-900/60 dark:text-zinc-300">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
              <span>Double-entry Ledger</span>
            </div>
          </div>
        </div>

        {/* Token Info Snippet */}
        {token && (
          <div className="mt-4 rounded-2xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800/80 dark:bg-black">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                <HugeiconsIcon icon={Key01Icon} size={13} /> Active Session Token
              </span>
              <button
                type="button"
                onClick={copyTokenSnippet}
                className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
              >
                <HugeiconsIcon icon={Copy01Icon} size={12} /> Copy
              </button>
            </div>
            <p className="mt-1.5 truncate font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
              {token.slice(0, 42)}…
            </p>
          </div>
        )}

        {/* Action Button */}
        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-zinc-200 bg-zinc-100 px-4 py-2 text-xs font-semibold text-zinc-800 transition hover:bg-zinc-200 dark:border-zinc-800 dark:bg-zinc-900 dark:text-white dark:hover:bg-zinc-800"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
