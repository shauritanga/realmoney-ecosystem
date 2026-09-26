import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { HugeiconsIcon } from '@hugeicons/react';
import {
  Alert02Icon,
  CallIcon,
  Clock01Icon,
  Download01Icon,
  HandshakeIcon,
  InformationCircleIcon,
  Message01Icon,
  RefreshIcon,
  Search01Icon,
  UserGroupIcon,
} from '@hugeicons/core-free-icons';
import { EmptyState, PageHeading, Panel, PanelHeading } from '../components/ui';
import { KpiCard } from '../components/KpiCard';
import { Modal } from '../components/Modal';
import { DateRangePicker } from '../components/DateRangePicker';
import { useDateRange } from '../hooks/useDateRange';
import { Meter, Sparkbars, StackedBar } from '../components/Bars';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks';
import { csvDownload } from '../lib/csv';
import {
  CHANNEL_LABEL,
  DISPOSITION_LABEL,
  OUTCOME_LABEL,
  channelTone,
  dispositionTone,
  formatDateTime,
  formatDuration,
  formatRelative,
  money,
  percent,
} from '../lib/format';
import type {
  ActivityExport,
  BorrowerActivity,
  CollectionActivityReport,
} from '../types';
import { BorrowerTimelineModal } from './BorrowerTimelineModal';

type SortKey = keyof Pick<
  BorrowerActivity,
  'interactions' | 'calls' | 'callsConnected' | 'talkTimeSeconds' | 'smsInitiated' | 'whatsappInitiated' | 'outstandingBalance' | 'ptpsBroken'
>;

export function CollectionActivityPage() {
  const { token } = useAuth();
  const range = useDateRange('30d');
  const [params, setParams] = useSearchParams();

  const [report, setReport] = useState<CollectionActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('interactions');
  const [openBorrower, setOpenBorrower] = useState<BorrowerActivity | null>(null);

  const offset = Number(params.get('offset') || 0);
  const limit = 50;

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<CollectionActivityReport>(
        `/admin/collections/activity?${range.qs}&limit=${limit}&offset=${offset}`,
        { token },
      );
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Could not load collections activity.');
    } finally {
      setLoading(false);
    }
  }, [token, range.qs, offset]);

  useEffect(() => {
    void load();
  }, [load]);

  const borrowers = useMemo(() => {
    const rows = report?.byBorrower.rows ?? [];
    const term = search.trim().toLowerCase();
    const filtered = term
      ? rows.filter(
          (row) =>
            row.fullName.toLowerCase().includes(term) || row.phone.toLowerCase().includes(term),
        )
      : rows;
    return [...filtered].sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
  }, [report, search, sortKey]);

  function exportSummary() {
    if (!report) return;
    csvDownload(
      `realmoney-collections-by-borrower-${report.range.from}-to-${report.range.to}.csv`,
      [
        'Borrower', 'Phone', 'Loans', 'Outstanding (TZS)', 'Touches', 'Calls',
        'Connected', 'Talk Time (s)', 'Talk Time', 'Verified Talk Time (s)',
        'SMS Initiated', 'WhatsApp Initiated', 'Last Contact', 'PTPs Created', 'PTPs Broken',
      ],
      borrowers.map((row) => [
        row.fullName, row.phone, row.loanCount, row.outstandingBalance, row.interactions,
        row.calls, row.callsConnected, row.talkTimeSeconds, formatDuration(row.talkTimeSeconds),
        row.verifiedTalkTimeSeconds, row.smsInitiated, row.whatsappInitiated,
        row.lastContactAt ? formatDateTime(row.lastContactAt) : '', row.ptpsCreated, row.ptpsBroken,
      ]),
    );
  }

  async function exportRaw() {
    if (!token) return;
    setExporting(true);
    try {
      const data = await apiClient<ActivityExport>(
        `/admin/collections/activity/export?${range.qs}`,
        { token },
      );
      csvDownload(
        `realmoney-collections-interactions-${data.range.from}-to-${data.range.to}.csv`,
        [
          'Timestamp (EAT)', 'Collector', 'Borrower', 'Phone', 'Loan Number', 'Channel',
          'Connected', 'Duration (s)', 'Duration Source', 'Call Outcome', 'Disposition',
          'Customer Response', 'Follow-up At', 'Notes',
        ],
        data.rows.map((row: any) => [
          formatDateTime(row.at), row.collectorName, row.borrowerName, row.borrowerPhone,
          row.loanNumber, row.channel,
          row.connected === null ? 'unknown' : row.connected ? 'yes' : 'no',
          row.durationSeconds, row.durationSource, row.callOutcome, row.disposition,
          row.outcome, row.followUpAt ? formatDateTime(row.followUpAt) : '', row.notes,
        ]),
      );
      if (data.truncated) {
        setError(
          `Export capped at ${data.cap.toLocaleString()} rows. Narrow the date range to get the rest.`,
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Export failed.');
    } finally {
      setExporting(false);
    }
  }

  function goToPage(nextOffset: number) {
    const next = new URLSearchParams(params);
    next.set('offset', String(Math.max(0, nextOffset)));
    setParams(next, { replace: true });
  }

  const totals = report?.totals;
  const ptps = report?.ptps;

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Collections"
        title="Team activity"
        description="Follow-up contact, talk time and promise recovery across the collections team."
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
          <p className="py-10 text-center text-xs text-zinc-500 dark:text-zinc-400">
            Loading collections activity…
          </p>
        </Panel>
      )}

      {report && totals && ptps && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label="Calls placed"
              value={totals.calls.toLocaleString()}
              helper={`${totals.callsConnected.toLocaleString()} connected · ${percent(totals.contactRate)} contact rate`}
              icon={CallIcon}
              tone="blue"
            />
            <KpiCard
              label="Total talk time"
              value={formatDuration(totals.talkTimeSeconds)}
              helper={
                totals.verifiedShare === null
                  ? 'No call duration recorded yet'
                  : `${percent(totals.verifiedShare)} verified from device call logs · avg ${formatDuration(totals.averageCallSeconds)}`
              }
              icon={Clock01Icon}
              tone="violet"
            />
            <KpiCard
              label="Messages initiated"
              value={(totals.smsInitiated + totals.whatsappInitiated).toLocaleString()}
              helper={`SMS ${totals.smsInitiated} · WhatsApp ${totals.whatsappInitiated}`}
              icon={Message01Icon}
              tone="amber"
            />
            <KpiCard
              label="Promises secured"
              value={ptps.created.toLocaleString()}
              helper={
                ptps.keptRate === null
                  ? `${money(ptps.promisedAmount)} promised · none concluded yet`
                  : `${money(ptps.promisedAmount)} promised · ${percent(ptps.keptRate)} kept`
              }
              icon={HandshakeIcon}
              tone="emerald"
            />
          </div>

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

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <PanelHeading title="By channel" detail="Contact attempts and talk time per channel" />
              <div className="mt-4">
                <StackedBar
                  segments={[
                    { label: 'Calls', value: totals.calls, className: 'bg-blue-500' },
                    { label: 'WhatsApp', value: totals.whatsappInitiated, className: 'bg-emerald-500' },
                    { label: 'SMS', value: totals.smsInitiated, className: 'bg-violet-500' },
                  ]}
                />
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[420px] [&_th]:px-2 [&_td]:px-2 text-left text-xs">
                  <thead>
                    <tr className="whitespace-nowrap border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="pb-2">Channel</th>
                      <th className="pb-2 text-right">Touches</th>
                      <th className="pb-2 text-right">Connected</th>
                      <th className="pb-2 text-right">Talk time</th>
                      <th className="pb-2 text-right">Verified</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                    {report.byChannel.map((row) => (
                      <tr key={row.channel}>
                        <td className="py-2">
                          <span className={`inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${channelTone(row.channel)}`}>
                            {CHANNEL_LABEL[row.channel] ?? row.channel}
                          </span>
                        </td>
                        <td className="py-2 text-right font-mono">{row.count}</td>
                        <td className="py-2 text-right font-mono">
                          {row.channel === 'CALL' ? row.connected : '—'}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {row.channel === 'CALL' ? formatDuration(row.talkTimeSeconds) : '—'}
                        </td>
                        <td className="py-2 text-right font-mono">
                          {row.channel === 'CALL' ? formatDuration(row.verifiedTalkTimeSeconds) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-4 flex gap-2 rounded-xl bg-zinc-50 px-3 py-2.5 text-[11px] leading-snug text-zinc-600 dark:bg-zinc-900 dark:text-zinc-400">
                <HugeiconsIcon icon={InformationCircleIcon} size={14} className="mt-px shrink-0" />
                <span>
                  SMS and WhatsApp counts are messages <strong>initiated</strong> from the
                  collector's phone, not confirmed deliveries — the platform hands the message to
                  the device and never learns whether it arrived. Calls with a verified duration are
                  the reliable measure of contact.
                </span>
              </p>
            </Panel>

            <Panel>
              <PanelHeading title="Promise pipeline" detail="Commitments secured and their outcome" />
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  { label: 'Pending', value: ptps.pending, tone: 'text-amber-600 dark:text-amber-400' },
                  { label: 'Kept', value: ptps.honored, tone: 'text-emerald-600 dark:text-emerald-400' },
                  { label: 'Broken', value: ptps.brokenTracked, tone: 'text-rose-600 dark:text-rose-400' },
                ].map((tile) => (
                  <div key={tile.label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900">
                    <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {tile.label}
                    </span>
                    <strong className={`mt-1 block font-display text-xl ${tile.tone}`}>
                      {tile.value}
                    </strong>
                  </div>
                ))}
              </div>

              <div className="mt-4 flex items-center gap-3">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">Kept rate</span>
                <Meter value={ptps.keptRate} width="w-28" />
                <strong className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
                  {percent(ptps.keptRate)}
                </strong>
              </div>

              {(ptps.superseded > 0 || ptps.backfilled > 0) && (
                <p className="mt-3 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  Excluded from the kept rate:{' '}
                  {ptps.superseded > 0 && <>{ptps.superseded} renegotiated</>}
                  {ptps.superseded > 0 && ptps.backfilled > 0 && ' · '}
                  {ptps.backfilled > 0 && <>{ptps.backfilled} predating promise tracking</>}.
                </p>
              )}

              <div className="mt-5">
                <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  <HugeiconsIcon icon={Alert02Icon} size={13} />
                  Broken promises needing escalation
                </span>
                {ptps.brokenNeedingEscalation.length === 0 ? (
                  <p className="mt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                    No broken promises outstanding.
                  </p>
                ) : (
                  <div className="mt-2 divide-y divide-zinc-200 dark:divide-zinc-800">
                    {ptps.brokenNeedingEscalation.slice(0, 6).map((row) => (
                      <div key={row.ptpId} className="flex items-center justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <strong className="block truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                            {row.borrowerName || 'Borrower'}
                          </strong>
                          <span className="block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                            {money(row.promisedAmount)} due {formatRelative(row.promisedDate)}
                            {row.collectorName && ` · ${row.collectorName}`}
                          </span>
                        </div>
                        <strong className="shrink-0 font-mono text-xs text-rose-600 dark:text-rose-400">
                          {money(row.outstandingBalance)}
                        </strong>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>

          <Panel>
            <PanelHeading
              title="By collector"
              detail="Every collector, including those with no activity in this range"
              action={
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {totals.activeCollectors} of {report.byCollector.length} active
                </span>
              }
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[900px] [&_th]:px-2 [&_td]:px-2 text-left text-xs">
                <thead>
                  <tr className="whitespace-nowrap border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="pb-3 pl-2">Collector</th>
                    <th className="pb-3 text-right">Calls</th>
                    <th className="pb-3 text-right">Talk time</th>
                    <th className="pb-3 text-right">Avg</th>
                    <th className="pb-3">Contact rate</th>
                    <th className="pb-3 text-right">SMS · WA</th>
                    <th className="pb-3 text-right">Promises</th>
                    <th className="pb-3">Kept</th>
                    <th className="pb-3 text-right">Recovered</th>
                    <th className="pb-3 pr-2 text-right">Last active</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {report.byCollector.map((row) => (
                    <tr
                      key={row.collectorId}
                      className="transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                    >
                      <td className="py-2.5 pl-2">
                        <strong className="block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {row.fullName}
                        </strong>
                        <span className="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                          {row.phone}
                          {!row.isActive && ' · disabled'}
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono">{row.calls}</td>
                      <td className="py-2.5 text-right font-mono">
                        {formatDuration(row.talkTimeSeconds)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-zinc-500 dark:text-zinc-400">
                        {formatDuration(row.averageCallSeconds)}
                      </td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Meter value={row.contactRate} width="w-12" />
                          <span className="font-mono text-[11px]">{percent(row.contactRate)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono text-zinc-500 dark:text-zinc-400">
                        {row.smsInitiated} · {row.whatsappInitiated}
                      </td>
                      <td className="py-2.5 text-right font-mono">{row.ptps.created}</td>
                      <td className="py-2.5">
                        <div className="flex items-center gap-2 whitespace-nowrap">
                          <Meter value={row.ptps.keptRate} width="w-12" />
                          <span className="font-mono text-[11px]">{percent(row.ptps.keptRate)}</span>
                        </div>
                      </td>
                      <td className="py-2.5 text-right font-mono">
                        {money(row.recoveredInitiatedAmount)}
                      </td>
                      <td className="py-2.5 pr-2 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
                        {row.lastActivityAt ? formatRelative(row.lastActivityAt) : 'never'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
              <strong>Recovered</strong> counts only payments this collector triggered themselves.
              Payments a borrower made unprompted on an assigned case are not attributed here.
            </p>
          </Panel>

          <Panel>
            <PanelHeading
              title="By borrower"
              detail="Calls, talk time and messages sent to each customer"
              action={
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-[200px]">
                    <HugeiconsIcon
                      icon={Search01Icon}
                      size={13}
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-400"
                    />
                    <input
                      value={search}
                      onChange={(event) => setSearch(event.target.value)}
                      placeholder="Search name or phone…"
                      className="w-full rounded-xl border border-zinc-200 bg-zinc-50/50 py-1.5 pl-8 pr-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-emerald-500 focus:bg-white focus:outline-hidden dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={exportSummary}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 shadow-xs hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                  >
                    <HugeiconsIcon icon={Download01Icon} size={14} />
                    CSV
                  </button>
                  <button
                    type="button"
                    onClick={() => void exportRaw()}
                    disabled={exporting}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white shadow-xs transition hover:bg-emerald-500 disabled:opacity-60"
                  >
                    <HugeiconsIcon icon={Download01Icon} size={14} />
                    {exporting ? 'Exporting…' : 'Raw log'}
                  </button>
                </div>
              }
            />

            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[980px] [&_th]:px-2 [&_td]:px-2 text-left text-xs">
                <thead>
                  <tr className="whitespace-nowrap border-b border-zinc-200 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="pb-3 pl-2">Borrower</th>
                    {(
                      [
                        ['calls', 'Calls'],
                        ['callsConnected', 'Conn.'],
                        ['talkTimeSeconds', 'Talk time'],
                        ['smsInitiated', 'SMS'],
                        ['whatsappInitiated', 'WA'],
                        ['ptpsBroken', 'PTP'],
                        ['outstandingBalance', 'Outstanding'],
                      ] as Array<[SortKey, string]>
                    ).map(([key, label]) => (
                      <th key={key} className="pb-3 text-right">
                        <button
                          type="button"
                          onClick={() => setSortKey(key)}
                          className={`transition hover:text-zinc-900 dark:hover:text-zinc-100 ${
                            sortKey === key ? 'text-emerald-600 dark:text-emerald-400' : ''
                          }`}
                        >
                          {label}
                        </button>
                      </th>
                    ))}
                    <th className="pb-3 pr-2 text-right">Last contact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {borrowers.length === 0 ? (
                    <tr>
                      <td colSpan={9}>
                        <EmptyState
                          title="No contact recorded"
                          detail="No collector touches fall in this date range."
                        />
                      </td>
                    </tr>
                  ) : (
                    borrowers.map((row) => (
                      <tr
                        key={row.borrowerId}
                        onClick={() => setOpenBorrower(row)}
                        className="group cursor-pointer transition hover:bg-zinc-50 dark:hover:bg-zinc-900/40"
                      >
                        <td className="py-2.5 pl-2">
                          <strong className="block text-xs font-semibold text-zinc-900 transition group-hover:text-emerald-600 dark:text-zinc-100 dark:group-hover:text-emerald-400">
                            {row.fullName}
                          </strong>
                          <span className="block font-mono text-[10px] text-zinc-500 dark:text-zinc-400">
                            {row.phone}
                            {row.loanCount > 1 && ` · ${row.loanCount} loans`}
                          </span>
                        </td>
                        <td className="py-2.5 text-right font-mono">{row.calls}</td>
                        <td className="py-2.5 text-right font-mono text-zinc-500 dark:text-zinc-400">
                          {row.callsConnected}
                        </td>
                        <td className="py-2.5 text-right font-mono">
                          {formatDuration(row.talkTimeSeconds)}
                        </td>
                        <td className="py-2.5 text-right font-mono">{row.smsInitiated}</td>
                        <td className="py-2.5 text-right font-mono">{row.whatsappInitiated}</td>
                        <td className="py-2.5 text-right font-mono">
                          {row.ptpsCreated}
                          {row.ptpsBroken > 0 && (
                            <span className="text-rose-600 dark:text-rose-400">
                              {' '}
                              ({row.ptpsBroken}✕)
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-mono text-rose-600 dark:text-rose-400">
                          {money(row.outstandingBalance)}
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

            {report.byBorrower.total > limit && (
              <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
                <span>
                  Showing {offset + 1}–{Math.min(offset + limit, report.byBorrower.total)} of{' '}
                  {report.byBorrower.total}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={offset === 0}
                    onClick={() => goToPage(offset - limit)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 font-medium transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    Previous
                  </button>
                  <button
                    type="button"
                    disabled={offset + limit >= report.byBorrower.total}
                    onClick={() => goToPage(offset + limit)}
                    className="rounded-lg border border-zinc-200 px-2.5 py-1.5 font-medium transition hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-800 dark:hover:bg-zinc-900"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </Panel>

          {report.byDisposition.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-2">
              <Panel>
                <PanelHeading title="Call outcomes" detail="What collectors recorded as the action" />
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
              </Panel>

              <Panel>
                <PanelHeading
                  title="What customers said"
                  detail="Recorded borrower responses"
                  action={
                    <span className="inline-flex items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <HugeiconsIcon icon={UserGroupIcon} size={13} />
                      {totals.borrowersTouched} reached
                    </span>
                  }
                />
                {report.byOutcome.length === 0 ? (
                  <p className="mt-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                    No structured responses recorded in this range. Collectors on the updated app
                    record what the customer said alongside the disposition.
                  </p>
                ) : (
                  <div className="mt-4 space-y-2">
                    {report.byOutcome.map((row) => (
                      <div key={row.outcome} className="flex items-center gap-3">
                        <span className="w-40 shrink-0 truncate text-[11px] text-zinc-600 dark:text-zinc-400">
                          {OUTCOME_LABEL[row.outcome] ?? row.outcome}
                        </span>
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                          <div
                            className="h-full bg-emerald-500/70"
                            style={{
                              width: `${(row.count / Math.max(...report.byOutcome.map((d) => d.count))) * 100}%`,
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
            </div>
          )}
        </>
      )}

      <Modal
        open={!!openBorrower}
        onClose={() => setOpenBorrower(null)}
        title={openBorrower?.fullName ?? ''}
        subtitle={openBorrower ? `${openBorrower.phone} · ${money(openBorrower.outstandingBalance)} outstanding` : undefined}
        size="lg"
      >
        {openBorrower && (
          <BorrowerTimelineModal borrower={openBorrower} rangeQs={range.qs} />
        )}
      </Modal>
    </div>
  );
}
