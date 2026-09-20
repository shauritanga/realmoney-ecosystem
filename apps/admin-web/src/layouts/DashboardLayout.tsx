import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import { Alert02Icon, Cancel01Icon, CheckmarkCircle02Icon } from '@hugeicons/core-free-icons';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { AdminProfileModal } from '../components/AdminProfileModal';
import { LogoutModal } from '../components/LogoutModal';
import { useAuth, useTheme, useDashboardData } from '../hooks';

export function DashboardLayout() {
  const navigate = useNavigate();
  const { isDark } = useTheme();
  const { token, logout } = useAuth();
  const { error, notice, notify, dismissNotice, refresh } = useDashboardData();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeMenu, setActiveMenu] = useState<'sidebar' | 'header' | 'notifications' | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutModalOpen, setLogoutModalOpen] = useState(false);

  const handleToggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileNavOpen((prev) => !prev);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  };

  const handleLogout = () => {
    logout();
    setActiveMenu(null);
    notify('You have been signed out.');
    navigate('/login', { replace: true });
  };

  return (
    <div
      className={`min-h-screen selection:bg-emerald-300 selection:text-black ${
        isDark ? 'bg-black text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      {/* Toast Notification Alert */}
      {notice && (
        <div
          className="fixed right-5 top-5 z-[200] flex max-w-sm items-center gap-2.5 rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-xs text-emerald-900 shadow-2xl backdrop-blur-md animate-in slide-in-from-top-2 dark:border-emerald-700/80 dark:bg-emerald-950/95 dark:text-emerald-100"
          role="status"
        >
          <HugeiconsIcon icon={CheckmarkCircle02Icon} size={17} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
          <span className="flex-1 font-medium">{notice}</span>
          <button
            type="button"
            onClick={dismissNotice}
            aria-label="Dismiss notification"
            className="rounded-lg p-1 text-emerald-700 hover:bg-emerald-100 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
          >
            <HugeiconsIcon icon={Cancel01Icon} size={14} />
          </button>
        </div>
      )}

      {/* Sidebar Component */}
      <Sidebar
        desktopOpen={sidebarOpen}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        accountMenuOpen={activeMenu === 'sidebar'}
        onToggleAccountMenu={() =>
          setActiveMenu((prev) => (prev === 'sidebar' ? null : 'sidebar'))
        }
        onCloseAccountMenu={() =>
          setActiveMenu((prev) => (prev === 'sidebar' ? null : prev))
        }
        onOpenProfile={() => setProfileOpen(true)}
        onLogout={() => setLogoutModalOpen(true)}
      />

      {/* Main Content Area */}
      <div className={`transition-all duration-200 ease-in-out ${sidebarOpen ? 'md:pl-64' : 'md:pl-16'}`}>
        {/* Header Component */}
        <Header
          sidebarOpen={sidebarOpen}
          onToggleSidebar={handleToggleSidebar}
          notificationsOpen={activeMenu === 'notifications'}
          onToggleNotifications={() =>
            setActiveMenu((prev) =>
              prev === 'notifications' ? null : 'notifications'
            )
          }
          onCloseNotifications={() =>
            setActiveMenu((prev) => (prev === 'notifications' ? null : prev))
          }
          accountMenuOpen={activeMenu === 'header'}
          onToggleAccountMenu={() =>
            setActiveMenu((prev) => (prev === 'header' ? null : 'header'))
          }
          onCloseAccountMenu={() =>
            setActiveMenu((prev) => (prev === 'header' ? null : prev))
          }
          onOpenProfile={() => setProfileOpen(true)}
          onLogout={() => setLogoutModalOpen(true)}
        />

        {/* Routed Views */}
        <main className="mx-auto max-w-[1440px] p-4 pb-12 sm:p-6 lg:p-9">
          {error && (
            <div
              className="mb-5 flex items-center gap-2.5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900/80 dark:bg-rose-950/40 dark:text-rose-200"
              role="alert"
            >
              <HugeiconsIcon icon={Alert02Icon} size={17} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={() => void refresh()}
                className="rounded-lg bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-900 hover:bg-rose-200 dark:bg-rose-900/60 dark:text-rose-100 dark:hover:bg-rose-800"
              >
                Retry
              </button>
            </div>
          )}

          <Outlet />
        </main>
      </div>

      {/* Admin Profile Modal */}
      <AdminProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        token={token}
        onNotify={notify}
      />

      {/* Sign Out Confirmation Modal */}
      <LogoutModal
        open={logoutModalOpen}
        onClose={() => setLogoutModalOpen(false)}
        onConfirm={handleLogout}
      />
    </div>
  );
}
