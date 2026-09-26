import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  ArrowLeft01Icon,
  CallIcon,
  Clock01Icon,
  HandshakeIcon,
  RefreshIcon,
  Coins01Icon,
} from '@hugeicons/core-free-icons';
import { EmptyState, PageHeading, Panel, PanelHeading } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { DateRangePicker } from '../components/DateRangePicker';
import { useDateRange } from '../hooks/useDateRange';
import { Meter, Sparkbars } from '../components/Bars';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks';
import {
  DISPOSITION_LABEL,
  dispositionTone,
  formatDate,
  formatDuration,
  formatRelative,
  money,
  percent,
  ptpTone,
} from '../lib/format';
import type { CollectionActivityReport, CollectorActivity } from '../types';

/**
 * One collector's productivity over a date range.
 *
 * A separate route from CollectorsPage on purpose: that page is about workload and
 * capacity — who holds which accounts, tier caps, enabling and disabling agents — and
 * is already 800 lines. Performance is a different question on a different time axis,
 * with its own URL state.
 */
export function CollectorPerformancePage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const range = useDateRange('30d');

  const [report, setReport] = useState<CollectionActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token || !id) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<CollectionActivityReport>(
        `/admin/collections/collectors/${id}/performance?${range.qs}`,
        { token },
      );
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load this collector’s performance.');
    } finally {
      setLoading(false);
    }
  }, [token, id, range.qs]);

  useEffect(() => {
    void load();
  }, [load]);

  // The performance endpoint narrows the team report to one collector, so the roster
  // still contains every agent; pick out the one being viewed.
  const collector: CollectorActivity | undefined = report?.byCollector.find(
    (row) => row.collectorId === id,
  );
  const totals = report?.totals;
  const ptps = report?.ptps;

  return (
    <div className="space-y-6">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs">
        <Link
          to="/collectors"
          className="inline-flex items-center gap-1.5 font-medium text-emerald-600 transition hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={14} />
          Collectors
        </Link>
        <span className="text-zinc-400 dark:text-zinc-600">/</span>
        <span className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
          {collector?.fullName || 'Performance'}
        </span>
      </nav>

      <PageHeading
        eyebrow="Collector performance"
        title={collector?.fullName || 'Collector'}
        description={
          collector
            ? `${collector.phone}${collector.isActive ? '' : ' · account disabled'} — follow-up productivity and recovery.`
            : 'Follow-up productivity and recovery over the selected range.'
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <DateRangePicker {...range} />
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
            >
              <HugeiconsIcon icon={RefreshIcon} size={14} className={loading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        }
      />

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {!report && loading && (
        <Panel>
          <p className="py-10 text-center text-xs text-zinc-500 dark:text-zinc-400">Loading…</p>
        </Panel>
      )}

      {report && !collector && !loading && (
        <Panel>
          <EmptyState
            title="Collector not found"
            detail="This account may have been removed, or the id in the link is wrong."
          />
        </Panel>
      )}

      {report && collector && totals && ptps && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Calls placed"
              value={collector.calls.toLocaleString()}
              helper={`${collector.callsConnected} connected · ${percent(collector.contactRate)} contact rate`}
              icon={CallIcon}
              tone="blue"
            />
            <KpiCard
              label="Talk time"
              value={formatDuration(collector.talkTimeSeconds)}
              helper={
                collector.verifiedShare === null
                  ? 'No duration recorded'
                  : `${percent(collector.verifiedShare)} verified · avg ${formatDuration(collector.averageCallSeconds)}`
              }
              icon={Clock01Icon}
              tone="violet"
            />
            <KpiCard
              label="Promises secured"
              value={collector.ptps.created.toLocaleString()}
              helper={
                collector.ptps.keptRate === null
                  ? `${money(collector.ptps.promisedAmount)} promised · none concluded`
                  : `${percent(collector.ptps.keptRate)} kept · ${money(collector.ptps.promisedAmount)} promised`
              }
              icon={HandshakeIcon}
              tone="emerald"
            />
            <KpiCard
              label="Recovered"
              value={money(collector.recoveredInitiatedAmount)}
              helper="Payments this collector triggered"
              icon={Coins01Icon}
              tone="amber"
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-3">
            <div className="space-y-6 lg:col-span-2">
              <Panel>
                <PanelHeading
                  title="Daily activity"
                  detail={`${report.range.from} to ${report.range.to} · ${report.range.timezone}`}
                />
                <div className="mt-4">
                  <Sparkbars
                    data={report.byDay.map((day) => ({ label: day.day, value: day.interactions }))}
                    format={(value) => `${value} touch${value === 1 ? '' : 'es'}`}
                  />
                  <div className="mt-2 flex justify-between text-[10px] text-zinc-400 dark:text-zinc-600">
                    <span>{report.byDay[0]?.day}</span>
                    <span>{report.byDay[report.byDay.length - 1]?.day}</span>
                  </div>
                </div>
              </Panel>

              <Panel>
                <PanelHeading title="Action mix" detail="What this collector recorded on each touch" />
                {report.byDisposition.length === 0 ? (
                  <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                    No touches logged in this range.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {report.byDisposition.map((row) => (
                      <div key={row.disposition} className="flex items-center gap-3">
                        <span className={`inline-flex w-36 shrink-0 justify-center rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${dispositionTone(row.disposition)}`}>
                          {DISPOSITION_LABEL[row.disposition] ?? row.disposition}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full bg-zinc-400 dark:bg-zinc-600"
                            style={{
                              width: `${(row.count / Math.max(...report.byDisposition.map((d) => d.count))) * 100}%`,
                            }}
                          />
                        </div>
                        <strong className="w-8 shrink-0 text-right font-mono text-xs">
                          {row.count}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </Panel>

              <Panel>
                <PanelHeading
                  title="Borrowers worked"
                  detail="Customers this collector contacted in the range"
                />
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] [&_th]:px-2 [&_td]:px-2 text-left text-xs">
                    <thead>
                      <tr className="whitespace-nowrap border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <th className="pb-3 pl-2">Borrower</th>
                        <th className="pb-3 text-right">Calls</th>
                        <th className="pb-3 text-right">Talk time</th>
                        <th className="pb-3 text-right">SMS · WA</th>
                        <th className="pb-3 pr-2 text-right">Last contact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                      {report.byBorrower.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5}>
                            <EmptyState
                              title="No borrowers contacted"
                              detail="This collector logged no touches in the selected range."
                            />
                          </td>
                        </tr>
                      ) : (
                        report.byBorrower.rows.map((row) => (
                          <tr key={row.borrowerId} className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40">
                            <td className="py-2.5 pl-2">
                              <strong className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                {row.fullName}
                              </strong>
                              <span className="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                                {row.phone}
                              </span>
                            </td>
                            <td className="py-2.5 text-right font-mono">{row.calls}</td>
                            <td className="py-2.5 text-right font-mono">
                              {formatDuration(row.talkTimeSeconds)}
                            </td>
                            <td className="py-2.5 text-right font-mono text-zinc-500 dark:text-zinc-400">
                              {row.smsInitiated} · {row.whatsappInitiated}
                            </td>
                            <td className="py-2.5 pr-2 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                              {formatRelative(row.lastContactAt)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </div>

            <div className="space-y-6">
              <Panel>
                <PanelHeading title="Promise outcomes" detail="Commitments this collector secured" />
                <dl className="mt-4 space-y-2.5 text-xs">
                  {[
                    ['Secured', collector.ptps.created],
                    ['Still pending', collector.ptps.pending],
                    ['Kept', collector.ptps.honored],
                    ['Broken', collector.ptps.brokenTracked],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                      <dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {value}
                      </dd>
                    </div>
                  ))}
                </dl>
                <div className="mt-4 flex items-center gap-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Kept rate</span>
                  <Meter value={collector.ptps.keptRate} width="w-20" />
                  <strong className="font-mono text-xs">{percent(collector.ptps.keptRate)}</strong>
                </div>
                {collector.ptps.superseded > 0 && (
                  <p className="mt-2 text-[10px] leading-snug text-zinc-500 dark:text-zinc-500">
                    {collector.ptps.superseded} renegotiated promise
                    {collector.ptps.superseded === 1 ? '' : 's'} excluded — replaced by a new
                    commitment rather than missed.
                  </p>
                )}
              </Panel>

              <Panel>
                <PanelHeading title="Reach" detail="Coverage in this range" />
                <dl className="mt-4 space-y-2.5 text-xs">
                  {[
                    ['Touches logged', collector.interactions],
                    ['Cases worked', collector.casesTouched],
                    ['Borrowers reached', collector.borrowersTouched],
                    ['SMS initiated', collector.smsInitiated],
                    ['WhatsApp initiated', collector.whatsappInitiated],
                  ].map(([label, value]) => (
                    <div key={String(label)} className="flex items-center justify-between">
                      <dt className="text-zinc-500 dark:text-zinc-400">{label}</dt>
                      <dd className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                        {value}
                      </dd>
                    </div>
                  ))}
                  <div className="flex items-center justify-between border-t border-zinc-200 pt-2.5 dark:border-zinc-800">
                    <dt className="text-zinc-500 dark:text-zinc-400">Last active</dt>
                    <dd className="text-[11px] font-semibold text-zinc-900 dark:text-zinc-100">
                      {collector.lastActivityAt ? formatRelative(collector.lastActivityAt) : 'never'}
                    </dd>
                  </div>
                </dl>
              </Panel>

              {ptps.brokenNeedingEscalation.length > 0 && (
                <Panel className="border-rose-300 dark:border-rose-900">
                  <PanelHeading
                    title="Needs escalation"
                    detail="Broken promises still owing"
                    action={
                      <HugeiconsIcon
                        icon={Alert02Icon}
                        size={16}
                        className="text-rose-600 dark:text-rose-400"
                      />
                    }
                  />
                  <div className="mt-3 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {ptps.brokenNeedingEscalation.slice(0, 8).map((row) => (
                      <div key={row.ptpId} className="py-2">
                        <div className="flex items-center justify-between gap-2">
                          <strong className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.borrowerName || 'Borrower'}
                          </strong>
                          <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase ring-1 ring-inset ${ptpTone('BROKEN')}`}>
                            broken
                          </span>
                        </div>
                        <span className="mt-0.5 block text-[11px] text-zinc-500 dark:text-zinc-400">
                          {money(row.promisedAmount)} promised for {formatDate(row.promisedDate)} ·{' '}
                          {money(row.outstandingBalance)} still owing
                        </span>
                      </div>
                    ))}
                  </div>
                </Panel>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
