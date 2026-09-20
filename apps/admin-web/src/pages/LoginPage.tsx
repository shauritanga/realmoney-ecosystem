import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  AlertCircleIcon,
  Loading03Icon,
  Moon02Icon,
  Sun01Icon,
  ViewIcon,
  ViewOffSlashIcon,
} from '@hugeicons/core-free-icons';
import { useAuth, useTheme } from '../hooks';

export function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, loading, error } = useAuth();
  const { isDark, toggleTheme } = useTheme();

  const [email, setEmail] = useState('shauritangaathanas@gmail.com');
  const [password, setPassword] = useState('Athanas@2015');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLocalError(null);

    if (!email.trim()) {
      setLocalError('Please enter your email.');
      return;
    }

    if (!password) {
      setLocalError('Please enter your password.');
      return;
    }

    const success = await login(email, password);
    if (success) {
      navigate(from, { replace: true });
    }
  };

  const displayError = localError || error;

  return (
    <div
      className={`relative flex min-h-screen flex-col items-center justify-center p-4 selection:bg-emerald-300 selection:text-black ${
        isDark ? 'bg-black text-zinc-100' : 'bg-zinc-50 text-zinc-900'
      }`}
    >
      {/* Theme Toggle */}
      <div className="absolute right-5 top-5">
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme mode"
          className="grid size-9 place-items-center rounded-xl border border-zinc-200 bg-white text-zinc-600 shadow-xs transition hover:border-zinc-300 hover:bg-zinc-100 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400 dark:hover:border-zinc-700 dark:hover:bg-zinc-900 dark:hover:text-white"
        >
          {isDark ? (
            <HugeiconsIcon icon={Sun01Icon} size={16} />
          ) : (
            <HugeiconsIcon icon={Moon02Icon} size={16} />
          )}
        </button>
      </div>

      <div className="w-full max-w-[360px]">
        {/* Brand Header */}
        <div className="mb-6 text-center">
          <img src="/logo.png" alt="RealMoney" className="mx-auto mb-3 size-14 object-contain" />
          <div className="flex justify-center">
            <img src="/logo_text.png" alt="RealMoney" className="h-7 object-contain dark:hidden" />
            <img src="/logo_text_light.png" alt="RealMoney" className="hidden h-7 object-contain dark:block" />
          </div>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
            Sign in to your account
          </p>
        </div>

        {/* Card Form */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
          {displayError && (
            <div
              className="mb-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300"
              role="alert"
            >
              <HugeiconsIcon icon={AlertCircleIcon} size={15} className="shrink-0 text-rose-600 dark:text-rose-400" />
              <span className="flex-1">{displayError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email Field */}
            <div>
              <label
                htmlFor="email"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@realmoney.tz"
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 text-xs text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder-zinc-600 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
              />
            </div>

            {/* Password Field */}
            <div>
              <label
                htmlFor="password"
                className="block text-xs font-semibold text-zinc-700 dark:text-zinc-300"
              >
                Password
              </label>
              <div className="relative mt-1.5">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="block w-full rounded-xl border border-zinc-300 bg-white px-3.5 py-2.5 pr-10 text-xs text-zinc-900 placeholder-zinc-400 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-800 dark:bg-black dark:text-white dark:placeholder-zinc-600 dark:focus:border-emerald-400 dark:focus:ring-emerald-400/30"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute inset-y-0 right-0 grid w-10 place-items-center text-zinc-400 transition hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300"
                >
                  {showPassword ? (
                    <HugeiconsIcon icon={ViewOffSlashIcon} size={15} />
                  ) : (
                    <HugeiconsIcon icon={ViewIcon} size={15} />
                  )}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={loading}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-400 py-2.5 text-xs font-bold text-black transition hover:bg-emerald-300 disabled:opacity-50 shadow-xs"
            >
              {loading && <HugeiconsIcon icon={Loading03Icon} size={14} className="animate-spin" />}
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
