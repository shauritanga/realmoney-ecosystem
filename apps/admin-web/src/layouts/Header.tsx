import { useLocation } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { Moon02Icon, SidebarLeftIcon, Sun01Icon } from '@hugeicons/core-free-icons';
import { AccountMenu } from '../components/AccountMenu';
import { NotificationsMenu } from '../components/NotificationsMenu';
import { useTheme } from '../hooks';

interface HeaderProps {
  sidebarOpen: boolean;
  onToggleSidebar: () => void;
  notificationsOpen: boolean;
  onToggleNotifications: () => void;
  onCloseNotifications: () => void;
  accountMenuOpen: boolean;
  onToggleAccountMenu: () => void;
  onCloseAccountMenu: () => void;
  onOpenProfile: () => void;
  onLogout: () => void;
}

const pageTitles: Record<string, string> = {
  '/': 'Portfolio overview',
  '/kyc': 'Identity & KYC',
  '/underwriting': 'Loan Underwriting',
  '/collections': 'Collection operations',
  '/ledger': 'Financial ledger',
  '/settings': 'Lending settings',
};

export function Header({
  sidebarOpen,
  onToggleSidebar,
  notificationsOpen,
  onToggleNotifications,
  onCloseNotifications,
  accountMenuOpen,
  onToggleAccountMenu,
  onCloseAccountMenu,
  onOpenProfile,
  onLogout,
}: HeaderProps) {
  const location = useLocation();
  const { isDark, toggleTheme } = useTheme();

  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200 bg-white/90 px-4 backdrop-blur dark:border-zinc-800 dark:bg-black/90 md:px-8">
      {/* Left: Sidebar Collapse/Expand Toggle & Page Title */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          className="grid size-8 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          <HugeiconsIcon icon={SidebarLeftIcon} size={18} />
        </button>
        <h1 className="font-display text-base font-semibold tracking-[-0.03em] text-zinc-900 dark:text-white">
          {title}
        </h1>
      </div>

      {/* Right: Actions Toolbar (Clean, unbordered ghost icons) */}
      <div className="flex items-center gap-1 sm:gap-1.5">
        {/* Notifications Dropdown */}
        <NotificationsMenu
          open={notificationsOpen}
          onToggle={onToggleNotifications}
          onClose={onCloseNotifications}
        />

        {/* Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme mode"
          className="grid size-8.5 place-items-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          {isDark ? (
            <HugeiconsIcon icon={Sun01Icon} size={17} />
          ) : (
            <HugeiconsIcon icon={Moon02Icon} size={17} />
          )}
        </button>

        {/* Header Account Menu Dropdown */}
        <AccountMenu
          variant="header"
          open={accountMenuOpen}
          onToggle={onToggleAccountMenu}
          onClose={onCloseAccountMenu}
          onOpenProfile={onOpenProfile}
          onLogout={onLogout}
        />
      </div>
    </header>
  );
}
