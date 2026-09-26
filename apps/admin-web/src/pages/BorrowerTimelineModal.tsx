import { useEffect, useMemo, useState } from 'react';
import { HugeiconsIcon } from '@hugeicons/react';
import { CallIcon, HandshakeIcon, Message01Icon, WhatsappIcon } from '@hugeicons/core-free-icons';
import { apiClient } from '../api/client';
import { useAuth } from '../hooks';
import {
  CALL_OUTCOME_LABEL,
  DISPOSITION_LABEL,
  DURATION_SOURCE_LABEL,
  OUTCOME_LABEL,
  channelTone,
  dispositionTone,
  durationSourceTone,
  formatDate,
  formatDateTime,
  formatDuration,
  money,
  ptpTone,
} from '../lib/format';
import type {
  BorrowerActivity,
  BorrowerTimeline,
  TimelineInteraction,
  TimelinePromise,
} from '../types';

const CHANNEL_ICON = {
  CALL: CallIcon,
  SMS: Message01Icon,
  WHATSAPP: WhatsappIcon,
} as const;

type Event =
  | { kind: 'interaction'; at: string; data: TimelineInteraction }
  | { kind: 'promise'; at: string; data: TimelinePromise };

/**
 * One borrower's full contact history, merged from interactions and promises into a
 * single chronological list and grouped by day.
 *
 * Answers "what have we actually done to chase this person?" — the question the
 * per-borrower counts prompt but cannot answer on their own.
 */
export function BorrowerTimelineModal({
  borrower,
  rangeQs,
}: {
  borrower: BorrowerActivity;
  rangeQs: string;
}) {
  const { token } = useAuth();
  const [timeline, setTimeline] = useState<BorrowerTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) return;
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient<BorrowerTimeline>(
          `/admin/collections/borrowers/${borrower.borrowerId}/timeline?${rangeQs}&limit=200`,
          { token },
        );
        if (!cancelled) setTimeline(data);
      } catch (err: any) {
        if (!cancelled) setError(err?.message || 'Could not load this borrower’s timeline.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    // Guards against a stale response landing after the user opened a different row.
    return () => {
      cancelled = true;
    };
  }, [token, borrower.borrowerId, rangeQs]);

  /** Interactions and promises interleaved newest-first, then grouped by day. */
  const days = useMemo(() => {
    if (!timeline) return [];
    const events: Event[] = [
      ...timeline.interactions.map((data) => ({ kind: 'interaction' as const, at: data.at, data })),
      ...timeline.promises.map((data) => ({ kind: 'promise' as const, at: data.at, data })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

    const grouped = new Map<string, Event[]>();
    for (const event of events) {
      const key = formatDate(event.at);
      grouped.set(key, [...(grouped.get(key) ?? []), event]);
    }
    return [...grouped.entries()];
  }, [timeline]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Calls', value: `${borrower.calls} (${borrower.callsConnected} connected)` },
          { label: 'Talk time', value: formatDuration(borrower.talkTimeSeconds) },
          { label: 'Messages', value: `${borrower.smsInitiated} SMS · ${borrower.whatsappInitiated} WA` },
          { label: 'Promises', value: `${borrower.ptpsCreated} (${borrower.ptpsBroken} broken)` },
        ].map((tile) => (
          <div key={tile.label} className="rounded-xl bg-zinc-50 p-3 dark:bg-zinc-800/60">
            <span className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              {tile.label}
            </span>
            <strong className="mt-1 block text-xs font-semibold text-zinc-900 dark:text-zinc-100">
              {tile.value}
            </strong>
          </div>
        ))}
      </div>

      {loading && (
        <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">Loading timeline…</p>
      )}

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5 text-[11px] text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      )}

      {timeline && !loading && days.length === 0 && (
        <p className="py-8 text-center text-xs text-zinc-500 dark:text-zinc-400">
          No contact recorded for this borrower in the selected range.
        </p>
      )}

      {days.map(([day, events]) => (
        <section key={day}>
          <h4 className="sticky top-0 bg-white py-1.5 text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:bg-zinc-900 dark:text-zinc-400">
            {day}
          </h4>
          <div className="space-y-2.5">
            {events.map((event) =>
              event.kind === 'interaction' ? (
                <InteractionRow key={`i-${event.data.id}`} log={event.data} />
              ) : (
                <PromiseRow key={`p-${event.data.id}`} promise={event.data} />
              ),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

function InteractionRow({ log }: { log: TimelineInteraction }) {
  const isCall = log.channel === 'CALL';
  // Duration is meaningless on a handed-off message, and a zero-second call from
  // before duration capture shipped would falsely claim a silent call. A recorded
  // duration is always shown, though -- otherwise the row would contradict the talk
  // time in the summary above it -- with its provenance stated alongside.
  const showDuration = isCall && log.durationSeconds > 0;

  return (
    <article className="rounded-xl border border-zinc-200 p-3 dark:border-zinc-800">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${channelTone(log.channel)}`}>
          <HugeiconsIcon icon={CHANNEL_ICON[log.channel]} size={11} />
          {log.channel === 'CALL' ? 'Call' : log.channel === 'SMS' ? 'SMS' : 'WhatsApp'}
        </span>
        <span className="font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
          {formatDateTime(log.at).slice(-5)}
        </span>

        {showDuration && (
          <>
            <strong className="font-mono text-[11px] text-zinc-900 dark:text-zinc-100">
              {formatDuration(log.durationSeconds)}
            </strong>
            <span className={`inline-flex rounded-md px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ring-inset ${durationSourceTone(log.durationSource)}`}>
              {/* Rows predating duration capture carry no provenance at all. */}
              {log.durationSource
                ? DURATION_SOURCE_LABEL[log.durationSource] ?? log.durationSource
                : 'Source unknown'}
            </span>
          </>
        )}

        {isCall && log.connected !== null && (
          <span className={`text-[11px] ${log.connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-500 dark:text-zinc-400'}`}>
            {log.connected ? '✓ connected' : '✕ no contact'}
            {log.callOutcome && log.callOutcome !== 'UNKNOWN' && (
              <> · {CALL_OUTCOME_LABEL[log.callOutcome] ?? log.callOutcome}</>
            )}
          </span>
        )}

        <span className={`ml-auto inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${dispositionTone(log.disposition)}`}>
          {DISPOSITION_LABEL[log.disposition] ?? log.disposition}
        </span>
      </div>

      {log.outcome && (
        <p className="mt-2 text-[11px] text-zinc-600 dark:text-zinc-400">
          Customer said:{' '}
          <strong className="font-semibold text-zinc-900 dark:text-zinc-100">
            {OUTCOME_LABEL[log.outcome] ?? log.outcome}
          </strong>
        </p>
      )}

      {log.notes && (
        <p className="mt-1.5 text-[11px] italic leading-snug text-zinc-600 dark:text-zinc-400">
          “{log.notes}”
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500 dark:text-zinc-500">
        <span>
          {log.origin === 'SYSTEM' ? 'Automatic system event' : log.collectorName || 'Collector'}
        </span>
        {log.loanNumber && <span className="font-mono">{log.loanNumber}</span>}
        {log.followUpAt && <span>Callback set for {formatDateTime(log.followUpAt)}</span>}
      </div>
    </article>
  );
}

function PromiseRow({ promise }: { promise: TimelinePromise }) {
  const renegotiated = promise.resolvedReason === 'SUPERSEDED';
  const untracked = promise.resolvedReason === 'BACKFILL_UNVERIFIED';

  return (
    <article className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-emerald-700 ring-1 ring-inset ring-emerald-500/30 dark:text-emerald-400">
          <HugeiconsIcon icon={HandshakeIcon} size={11} />
          Promise
        </span>
        <strong className="font-mono text-xs text-zinc-900 dark:text-zinc-100">
          {money(promise.promisedAmount)}
        </strong>
        <span className="text-[11px] text-zinc-600 dark:text-zinc-400">
          due {formatDate(promise.promisedDate)}
        </span>
        <span className={`ml-auto inline-flex rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ring-1 ring-inset ${ptpTone(renegotiated || untracked ? 'NONE' : promise.status)}`}>
          {renegotiated ? 'Renegotiated' : untracked ? 'Before tracking' : promise.status}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-zinc-500 dark:text-zinc-500">
        <span>{promise.collectorName || 'Collector'}</span>
        {promise.loanNumber && <span className="font-mono">{promise.loanNumber}</span>}
        {promise.resolvedAt && !renegotiated && (
          <span>
            {promise.status === 'HONORED' ? 'Kept' : 'Broke'} {formatDate(promise.resolvedAt)}
          </span>
        )}
      </div>
    </article>
  );
}
