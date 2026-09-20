import type { ReactNode } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  ArrowRight01Icon,
  CheckmarkCircle02Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons';
import { statusTone } from '../lib/format';

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-7 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
      <div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl font-semibold tracking-[-0.05em] text-zinc-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600 dark:text-zinc-400">
          {description}
        </p>
      </div>
      {action}
    </div>
  );
}

export function Panel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:shadow-none ${className}`}
    >
      {children}
    </section>
  );
}

export function PanelHeading({
  title,
  detail,
  action,
}: {
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-center justify-between gap-4">
      <div>
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {detail}
        </p>
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  title,
  detail,
  icon = <HugeiconsIcon icon={CheckmarkCircle02Icon} size={18} />,
}: {
  title: string;
  detail: string;
  icon?: ReactNode;
}) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center text-center">
      <span className="mb-3 grid size-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
        {icon}
      </span>
      <strong className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
        {title}
      </strong>
      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
        {detail}
      </p>
    </div>
  );
}

export function LoadingState() {
  return (
    <div className="grid min-h-[55vh] place-items-center text-sm text-zinc-500 dark:text-zinc-400">
      <span className="flex items-center gap-3">
        <HugeiconsIcon icon={Loading03Icon} size={18} className="animate-spin text-emerald-500" />
        Loading operations data…
      </span>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${statusTone(
        status
      )}`}
    >
      {status}
    </span>
  );
}

export function ViewButton({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
    >
      {children}
      <HugeiconsIcon icon={ArrowRight01Icon} size={14} />
    </button>
  );
}
