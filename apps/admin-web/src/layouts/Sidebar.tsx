import { NavLink } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BookOpen01Icon,
  CallIcon,
  Cancel01Icon,
  Coins01Icon,
  DashboardSquare01Icon,
  UserCheck01Icon,
} from '@hugeicons/core-free-icons';
import { AccountMenu } from '../components/AccountMenu';
import { useDashboardData } from '../hooks';

interface SidebarProps {
  desktopOpen: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  accountMenuOpen: boolean;
  onToggleAccountMenu: () => void;
  onCloseAccountMenu: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

const navItems = [
  { to: '/', label: 'Portfolio overview', icon: DashboardSquare01Icon },
  { to: '/kyc', label: 'Identity & KYC', icon: UserCheck01Icon },
  { to: '/underwriting', label: 'Loan Underwriting', icon: Coins01Icon, badge: 'loans' },
  { to: '/collections', label: 'Collection operations', icon: CallIcon, badge: 'collections' },
  { to: '/ledger', label: 'Financial ledger', icon: BookOpen01Icon },
];

export function Sidebar({
  desktopOpen,
  mobileOpen,
  onCloseMobile,
  accountMenuOpen,
  onToggleAccountMenu,
  onCloseAccountMenu,
  onOpenProfile,
  onLogout,
}: SidebarProps) {
  const { overdueLoans, pendingLoans } = useDashboardData();

  return (
    <>
      {/* Mobile Drawer Backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/60 backdrop-blur-xs md:hidden"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      {/* Sidebar Aside (Collapsible on desktop: w-64 expanded, w-16 icon-only) */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex -translate-x-full flex-col border-r border-zinc-200 bg-white py-5 transition-all duration-200 ease-in-out dark:border-zinc-800 dark:bg-black md:translate-x-0 ${
          desktopOpen ? 'w-64 px-4' : 'w-16 px-2'
        } ${mobileOpen ? 'translate-x-0 !w-64 !px-4' : ''}`}
      >
        {/* Brand Header */}
        <div className={`flex items-center gap-3 ${desktopOpen ? 'px-2' : 'justify-center px-0'}`}>
          <img src="/logo.png" alt="RealMoney" className="size-9 shrink-0 object-contain" />
          {desktopOpen && (
            <div className="min-w-0 flex-1">
              <img src="/logo_text.png" alt="RealMoney" className="h-[18px] object-contain dark:hidden" />
              <img src="/logo_text_light.png" alt="RealMoney" className="hidden h-[18px] object-contain dark:block" />
              <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                Admin console
              </span>
            </div>
          )}
          <button
            type="button"
            className="ml-auto rounded-lg p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white md:hidden"
            onClick={onCloseMobile}
            aria-label="Close navigation"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={18} />
          </button>
        </div>

        {/* Primary Links */}
        <nav
          className="mt-7 flex flex-1 flex-col gap-1 overflow-y-auto"
          aria-label="Primary navigation"
        >
          {navItems.map(({ to, label, icon: Icon, badge }) => {
            const badgeCount =
              badge === 'loans'
                ? pendingLoans.length
                : badge === 'collections'
                ? overdueLoans.length
                : 0;
            const badgeColor =
              badge === 'loans'
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                : 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300';
            const dotColor = badge === 'loans' ? 'bg-amber-500' : 'bg-rose-500';

            return (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={onCloseMobile}
                title={!desktopOpen ? label : undefined}
                className={({ isActive }) =>
                  `relative flex items-center rounded-xl text-xs transition ${
                    desktopOpen
                      ? 'gap-3 px-3 py-2.5 text-left'
                      : 'justify-center p-2.5'
                  } ${
                    isActive
                      ? 'border border-emerald-300 bg-emerald-50/90 font-semibold text-emerald-800 shadow-xs dark:border-emerald-800/80 dark:bg-emerald-950/40 dark:text-emerald-400'
                      : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white'
                  }`
                }
              >
                <HugeiconsIcon icon={Icon} size={18} className="shrink-0" />
                {desktopOpen ? (
                  <>
                    <span className="min-w-0 flex-1 truncate">{label}</span>
                    {badgeCount > 0 && (
                      <b className={`rounded-full px-2 py-0.5 text-[10px] ${badgeColor}`}>
                        {badgeCount}
                      </b>
                    )}
                  </>
                ) : (
                  badgeCount > 0 && (
                    <span
                      className={`absolute right-1.5 top-1.5 size-2 rounded-full ${dotColor} ring-2 ring-white dark:ring-black`}
                      title={`${badgeCount} items`}
                    />
                  )
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* Bottom of Sidebar: Popup Account Menu Dock */}
        <div className={`relative mt-auto border-t border-zinc-200 dark:border-zinc-800 ${desktopOpen ? 'pt-4' : 'pt-3'}`}>
          <AccountMenu
            variant="sidebar"
            collapsed={!desktopOpen}
            open={accountMenuOpen}
            onToggle={onToggleAccountMenu}
            onClose={onCloseAccountMenu}
            onOpenProfile={onOpenProfile}
            onLogout={onLogout}
          />
        </div>
      </aside>
    </>
  );
}
