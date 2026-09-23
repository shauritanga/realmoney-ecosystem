import { useState, useMemo } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  BookOpen01Icon,
  CheckmarkCircle02Icon,
  Coins01Icon,
  Download01Icon,
  Search01Icon,
  Wallet02Icon,
} from '@hugeicons/core-free-icons';
import { money } from '../lib/format';
import { EmptyState, LoadingState, PageHeading, Panel } from '../components/ui';
import { useDashboardData } from '../hooks';
import type { LedgerEntry } from '../types';

export function LedgerPage() {
  const { ledger, loading, stats } = useDashboardData();

  const [activeTab, setActiveTab] = useState<'journal' | 'trial-balance' | 'overview'>('journal');
  const [selectedAccount, setSelectedAccount] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Account Type configurations
  const ACCOUNT_CONFIG: Record<
    string,
    { label: string; class: 'Asset' | 'Liability' | 'Revenue' | 'Expense'; normal: 'Debit' | 'Credit' }
  > = {
    CASH_CLICKPESA: { label: 'ClickPesa Mobile Money Float', class: 'Asset', normal: 'Debit' },
    LOAN_RECEIVABLE: { label: 'Loans Principal Receivable', class: 'Asset', normal: 'Debit' },
    CASH_SELCOM: { label: 'Selcom Clearing (Legacy)', class: 'Asset', normal: 'Debit' },
    INTEREST_INCOME: { label: 'Interest Income Recognized', class: 'Revenue', normal: 'Credit' },
    PENALTY_INCOME: { label: 'Penalty & Late Fee Revenue', class: 'Revenue', normal: 'Credit' },
    FEE_INCOME: { label: 'Origination & Service Fees', class: 'Revenue', normal: 'Credit' },
  };

  // Compute metrics and trial balances
  const { totalDebits, totalCredits, accountBalances } = useMemo(() => {
    let debits = 0;
    let credits = 0;
    const balances: Record<string, { debit: number; credit: number; balance: number }> = {};

    for (const entry of ledger) {
      const d = Number(entry.debit) || 0;
      const c = Number(entry.credit) || 0;
      debits += d;
      credits += c;

      if (!balances[entry.accountType]) {
        balances[entry.accountType] = { debit: 0, credit: 0, balance: 0 };
      }
      balances[entry.accountType].debit += d;
      balances[entry.accountType].credit += c;
    }

    for (const [acc, val] of Object.entries(balances)) {
      const cfg = ACCOUNT_CONFIG[acc];
      if (cfg && cfg.normal === 'Debit') {
        val.balance = val.debit - val.credit;
      } else {
        val.balance = val.credit - val.debit;
      }
    }

    return { totalDebits: debits, totalCredits: credits, accountBalances: balances };
  }, [ledger]);

  // Filtered ledger entries for Journal tab
  const filteredEntries = useMemo(() => {
    let list = ledger;
    if (selectedAccount !== 'all') {
      list = list.filter((e) => e.accountType === selectedAccount);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (e) =>
          e.loan?.loanNumber?.toLowerCase().includes(q) ||
          e.description?.toLowerCase().includes(q) ||
          e.accountType?.toLowerCase().includes(q)
      );
    }
    return list;
  }, [ledger, selectedAccount, searchQuery]);

  function exportCsv() {
    const headers = ['ID', 'Date', 'Loan Number', 'Account Type', 'Debit (TZS)', 'Credit (TZS)', 'Description'];
    const rows = filteredEntries.map((e) => [
      e.id,
      new Date(e.createdAt).toISOString(),
      e.loan?.loanNumber || 'N/A',
      e.accountType,
      e.debit,
      e.credit,
      `"${(e.description || '').replaceAll('"', '""')}"`,
    ]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `realmoney-accounting-journal-${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  if (ledger.length === 0 && loading) {
    return <LoadingState />;
  }

  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Financial controls"
        title="Accounting"
        description="Double-entry journal, chart of accounts, trial balance reconciliation, and financial auditing."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold shadow-xs ${
                isBalanced
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                  : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950/60 dark:text-rose-200'
              }`}
            >
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={14} className={isBalanced ? 'text-emerald-600' : 'text-rose-600'} />
              {isBalanced ? 'Books in Balance (Debits = Credits)' : 'Reconciliation Discrepancy'}
            </span>
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <HugeiconsIcon icon={Download01Icon} size={14} />
              Export CSV
            </button>
          </div>
        }
      />

      {/* KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Cash ClickPesa */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Float &amp; Mobile Float</span>
            <span className="grid size-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <HugeiconsIcon icon={Wallet02Icon} size={16} />
            </span>
          </div>
          <strong className="mt-3 block font-display text-2xl tracking-[-0.04em] text-zinc-900 dark:text-white">
            {money(accountBalances['CASH_CLICKPESA']?.balance || 0)}
          </strong>
          <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
            ClickPesa net clearing account
          </span>
        </div>

        {/* Loans Receivable */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Loans Principal Asset</span>
            <span className="grid size-8 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <HugeiconsIcon icon={Coins01Icon} size={16} />
            </span>
          </div>
          <strong className="mt-3 block font-display text-2xl tracking-[-0.04em] text-zinc-900 dark:text-white">
            {money(accountBalances['LOAN_RECEIVABLE']?.balance || stats?.totalOutstandingAmount || 0)}
          </strong>
          <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
            Current outstanding loan asset
          </span>
        </div>

        {/* Revenue */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Interest &amp; Fee Revenue</span>
            <span className="grid size-8 place-items-center rounded-lg bg-violet-500/10 text-violet-600 dark:text-violet-400">
              <HugeiconsIcon icon={BookOpen01Icon} size={16} />
            </span>
          </div>
          <strong className="mt-3 block font-display text-2xl tracking-[-0.04em] text-zinc-900 dark:text-white">
            {money(
              (accountBalances['INTEREST_INCOME']?.balance || 0) +
                (accountBalances['PENALTY_INCOME']?.balance || 0) +
                (accountBalances['FEE_INCOME']?.balance || 0)
            )}
          </strong>
          <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
            Recognized earnings across book
          </span>
        </div>

        {/* Volume */}
        <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-xs dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
            <span>Total Journal Debits</span>
            <span className="grid size-8 place-items-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <HugeiconsIcon icon={CheckmarkCircle02Icon} size={16} />
            </span>
          </div>
          <strong className="mt-3 block font-display text-2xl tracking-[-0.04em] text-zinc-900 dark:text-white">
            {money(totalDebits)}
          </strong>
          <span className="mt-1 block text-[11px] text-zinc-500 dark:text-zinc-400">
            {ledger.length} posted double-entry records
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => setActiveTab('journal')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'journal'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={BookOpen01Icon} size={15} />
          General Ledger Journal ({ledger.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('trial-balance')}
          className={`flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition ${
            activeTab === 'trial-balance'
              ? 'border-emerald-500 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200'
          }`}
        >
          <HugeiconsIcon icon={Coins01Icon} size={15} />
          Trial Balance &amp; Chart of Accounts
        </button>
      </div>

      {/* TAB 1: JOURNAL */}
      {activeTab === 'journal' && (
        <Panel>
          <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-200 pb-4 dark:border-zinc-800">
            {/* Filter by Account */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-zinc-500 dark:text-zinc-400">Account:</span>
              <select
                value={selectedAccount}
                onChange={(e) => setSelectedAccount(e.target.value)}
                className="rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-200 focus:outline-hidden focus:border-emerald-500"
              >
                <option value="all">All Accounts ({ledger.length})</option>
                {Object.keys(ACCOUNT_CONFIG).map((acc) => (
                  <option key={acc} value={acc}>
                    {ACCOUNT_CONFIG[acc]?.label || acc}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div className="relative min-w-[240px]">
              <HugeiconsIcon
                icon={Search01Icon}
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="search"
                placeholder="Search loan #, description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="pb-3 pl-2">Timestamp</th>
                  <th className="pb-3">Reference / Loan</th>
                  <th className="pb-3">Account Type</th>
                  <th className="pb-3">Debit (TZS)</th>
                  <th className="pb-3">Credit (TZS)</th>
                  <th className="pb-3 pr-2">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {filteredEntries.length === 0 ? (
                  <tr>
                    <td colSpan={6}>
                      <EmptyState
                        title="No ledger entries found"
                        detail={searchQuery ? 'Try adjusting your search criteria.' : 'Transactions will post here as money moves.'}
                      />
                    </td>
                  </tr>
                ) : (
                  filteredEntries.map((entry: LedgerEntry) => (
                    <tr key={entry.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40 transition">
                      <td className="py-3 pl-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                        {new Date(entry.createdAt).toLocaleString()}
                      </td>
                      <td className="py-3 font-mono font-medium text-zinc-700 dark:text-zinc-300">
                        {entry.loan?.loanNumber || <span className="text-zinc-400">—</span>}
                      </td>
                      <td className="py-3">
                        <span className="rounded-md border border-zinc-200 bg-zinc-100 px-2 py-0.5 font-mono text-[10px] font-medium text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
                          {ACCOUNT_CONFIG[entry.accountType]?.label || entry.accountType}
                        </span>
                      </td>
                      <td className="py-3 font-semibold text-emerald-700 dark:text-emerald-400">
                        {Number(entry.debit) > 0 ? money(entry.debit) : '—'}
                      </td>
                      <td className="py-3 font-semibold text-amber-700 dark:text-amber-400">
                        {Number(entry.credit) > 0 ? money(entry.credit) : '—'}
                      </td>
                      <td className="py-3 pr-2 text-zinc-600 dark:text-zinc-400">{entry.description}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* TAB 2: TRIAL BALANCE & CHART OF ACCOUNTS */}
      {activeTab === 'trial-balance' && (
        <Panel>
          <div className="mb-4">
            <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
              Trial Balance Reconciliation
            </h3>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              Summarized debit and credit activity verifying that total debits match total credits across all accounts.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-left text-xs">
              <thead>
                <tr className="border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                  <th className="pb-3 pl-2">Account Code</th>
                  <th className="pb-3">Classification</th>
                  <th className="pb-3">Normal Side</th>
                  <th className="pb-3 text-right">Debit Total (TZS)</th>
                  <th className="pb-3 text-right">Credit Total (TZS)</th>
                  <th className="pb-3 pr-2 text-right">Ending Balance (TZS)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {Object.keys(ACCOUNT_CONFIG).map((acc) => {
                  const cfg = ACCOUNT_CONFIG[acc];
                  const vals = accountBalances[acc] || { debit: 0, credit: 0, balance: 0 };
                  return (
                    <tr key={acc} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                      <td className="py-3 pl-2">
                        <strong className="block text-zinc-900 dark:text-zinc-100">{cfg.label}</strong>
                        <span className="font-mono text-[10px] text-zinc-400">{acc}</span>
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-md px-2 py-0.5 text-[10px] font-semibold ${
                            cfg.class === 'Asset'
                              ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                              : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                          }`}
                        >
                          {cfg.class}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-zinc-500">{cfg.normal}</td>
                      <td className="py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                        {vals.debit > 0 ? money(vals.debit) : '0.00'}
                      </td>
                      <td className="py-3 text-right font-medium text-zinc-700 dark:text-zinc-300">
                        {vals.credit > 0 ? money(vals.credit) : '0.00'}
                      </td>
                      <td className="py-3 pr-2 text-right font-bold text-zinc-900 dark:text-zinc-100">
                        {money(vals.balance)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-zinc-900 dark:border-white font-bold text-xs bg-zinc-50/50 dark:bg-zinc-900/50">
                  <td colSpan={3} className="py-3 pl-2 uppercase tracking-wider">
                    Total Reconciled
                  </td>
                  <td className="py-3 text-right text-emerald-600 dark:text-emerald-400">
                    {money(totalDebits)}
                  </td>
                  <td className="py-3 text-right text-emerald-600 dark:text-emerald-400">
                    {money(totalCredits)}
                  </td>
                  <td className="py-3 pr-2 text-right">
                    <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                      ✓ BALANCED
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Panel>
      )}
    </div>
  );
}
