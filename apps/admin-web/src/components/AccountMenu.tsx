import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowDown01Icon,
  ArrowUp01Icon,
  Logout01Icon,
  Settings02Icon,
  UserIcon,
} from '@hugeicons/core-free-icons';
import { useClickOutside, useAuth } from '../hooks';

interface AccountMenuProps {
  variant: 'sidebar' | 'header';
  collapsed?: boolean;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

export function AccountMenu({
  variant,
  collapsed = false,
  open,
  onToggle,
  onClose,
  onOpenProfile,
  onLogout,
}: AccountMenuProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const containerRef = useRef<HTMLDivElement>(null);

  useClickOutside(containerRef, onClose, open);

  const handleNavigate = (to: string) => {
    navigate(to);
    onClose();
  };

  const handleAction = (action: () => void) => {
    action();
    onClose();
  };

  const isSidebar = variant === 'sidebar';
  const menuPosition = isSidebar
    ? collapsed
      ? 'bottom-0 left-full ml-2.5 w-52'
      : 'bottom-full left-0 right-0 mb-2 w-full'
    : 'top-full right-0 mt-2 w-52';

  const userInitials = user?.fullName
    ? user.fullName
        .split(' ')
        .map((n: string) => n[0])
        .join('')
        .slice(0, 2)
        .toUpperCase()
    : 'AS';

  return (
    <div ref={containerRef} className="relative select-none">
      {/* Trigger Button */}
      {isSidebar ? (
        collapsed ? (
          /* Collapsed sidebar trigger: only the circular avatar */
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Account menu"
            title={user?.fullName || 'Account menu'}
            className="mx-auto flex items-center justify-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
          >
            <span className="grid size-9 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-black shadow-xs ring-1 ring-transparent transition hover:ring-emerald-400/40">
              {userInitials}
            </span>
          </button>
        ) : (
          /* Expanded sidebar trigger: full user pill */
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            aria-haspopup="menu"
            aria-label="Account menu"
            className={`group flex w-full items-center gap-2.5 rounded-2xl border p-2 text-left transition-all duration-200 ${
              open
                ? 'border-emerald-500/50 bg-zinc-100 shadow-sm ring-1 ring-emerald-500/20 dark:border-emerald-500/40 dark:bg-zinc-900 dark:shadow-md'
                : 'border-zinc-200 bg-zinc-50 hover:border-zinc-300 hover:bg-zinc-100 dark:border-zinc-800/80 dark:bg-zinc-950 dark:hover:border-zinc-700 dark:hover:bg-zinc-900'
            }`}
          >
            <div>
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-xs font-bold text-black shadow-xs">
                {userInitials}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <strong className="block truncate text-xs font-medium text-zinc-900 dark:text-zinc-100">
                {user?.fullName || 'Athanas Shauritanga'}
              </strong>
              <span className="block truncate text-[10px] text-zinc-500 dark:text-zinc-400">
                {user?.email || 'shauritangaathanas@gmail.com'}
              </span>
            </div>
            <span className="grid size-6 place-items-center rounded-lg text-zinc-400 transition-colors group-hover:text-zinc-600 dark:text-zinc-400 dark:group-hover:text-zinc-200">
              {open ? (
                <HugeiconsIcon icon={ArrowDown01Icon} size={14} className="rotate-180 transition-transform duration-200" />
              ) : (
                <HugeiconsIcon icon={ArrowUp01Icon} size={14} className="transition-transform duration-200" />
              )}
            </span>
          </button>
        )
      ) : (
        /* Header circular avatar button - reduced size, no online dot, no surrounding container */
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label="Account menu"
          className="relative ml-1 flex items-center rounded-full transition-transform active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          <span className="grid size-7.5 place-items-center rounded-full bg-gradient-to-br from-emerald-400 to-teal-500 text-[11px] font-bold text-black shadow-xs ring-1 ring-transparent transition hover:ring-emerald-400/40">
            {userInitials}
          </span>
        </button>
      )}

      {/* Standard Clean Popup Menu (3 links: Profile, Settings, Logout) */}
      {open && (
        <div
          role="menu"
          tabIndex={-1}
          className={`absolute z-[100] overflow-hidden rounded-xl border border-zinc-200 bg-white p-1.5 shadow-xl backdrop-blur-xl transition-all duration-150 animate-in fade-in zoom-in-95 dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-[0_12px_36px_rgba(0,0,0,0.85)] ${menuPosition}`}
        >
          {/* User info header */}
          <div className="border-b border-zinc-100 px-2.5 py-2 dark:border-zinc-800/80">
            <p className="truncate text-xs font-semibold text-zinc-900 dark:text-white">
              {user?.fullName || 'Athanas Shauritanga'}
            </p>
            <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">
              {user?.email || 'shauritangaathanas@gmail.com'}
            </p>
          </div>

          {/* Three links: Profile, Settings, Logout */}
          <div className="pt-1">
            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onOpenProfile)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
            >
              <HugeiconsIcon icon={UserIcon} size={15} className="text-zinc-500 dark:text-zinc-400" />
              <span>Profile</span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => handleNavigate('/settings')}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-900 dark:hover:text-white"
            >
              <HugeiconsIcon icon={Settings02Icon} size={15} className="text-zinc-500 dark:text-zinc-400" />
              <span>Settings</span>
            </button>

            <div className="my-1 border-t border-zinc-100 dark:border-zinc-800/80" />

            <button
              type="button"
              role="menuitem"
              onClick={() => handleAction(onLogout)}
              className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
            >
              <HugeiconsIcon icon={Logout01Icon} size={15} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
