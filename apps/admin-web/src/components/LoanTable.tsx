import { HugeiconsIcon } from '@hugeicons/react';
import { BookOpen01Icon } from '@hugeicons/core-free-icons';
import type { Loan } from '../types';
import { money } from '../lib/format';
import { EmptyState, StatusBadge } from './ui';

export function LoanTable({ loans }: { loans: Loan[] }) {
  if (!loans.length) {
    return (
      <EmptyState
        title="No loan records"
        detail="New applications will appear here."
        icon={<HugeiconsIcon icon={BookOpen01Icon} size={18} />}
      />
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[680px] text-left text-xs">
        <thead>
          <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
            <th className="pb-3">Borrower</th>
            <th className="pb-3">Loan</th>
            <th className="pb-3">Principal</th>
            <th className="pb-3">Outstanding</th>
            <th className="pb-3">Status</th>
            <th className="pb-3">Due</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800/80">
          {loans.map((loan) => (
            <tr
              key={loan.id}
              className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <td className="py-3">
                <div className="flex items-center gap-2">
                  <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 font-semibold text-emerald-700 dark:text-emerald-400">
                    {loan.borrower.fullName.slice(0, 1)}
                  </span>
                  <div>
                    <strong className="block text-zinc-900 dark:text-zinc-100">
                      {loan.borrower.fullName}
                    </strong>
                    <small className="mt-0.5 block text-zinc-500 dark:text-zinc-400">
                      {loan.borrower.phone}
                    </small>
                  </div>
                </div>
              </td>
              <td className="font-mono text-zinc-600 dark:text-zinc-400">
                {loan.loanNumber}
              </td>
              <td className="text-zinc-700 dark:text-zinc-300">
                {money(loan.principalAmount)}
              </td>
              <td className="font-semibold text-zinc-900 dark:text-zinc-100">
                {money(loan.outstandingBalance)}
              </td>
              <td>
                <StatusBadge status={loan.status} />
              </td>
              <td className="text-zinc-500 dark:text-zinc-400">
                {loan.dueDate ? new Date(loan.dueDate).toLocaleDateString() : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
