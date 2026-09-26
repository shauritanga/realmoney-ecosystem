import { CommunicationChannel, PtpStatus } from '../database/enums.js';
import type { PtpResolvedReason } from '../database/enums.js';
import { isPtpFailure, ptpKeptRate } from './ptp-status.js';

/**
 * Turning raw aggregate rows into report shapes, as pure functions.
 *
 * This repo has no database tests -- every spec is a pure-function unit test -- so
 * keeping all the arithmetic here rather than in the service is what makes the
 * reporting testable at all. The service stays a thin SQL-and-assemble layer.
 */

/** A channel row as Postgres returns it: counts arrive as strings. */
export interface RawChannelRow {
  channel: string;
  count: string | number;
  talkTimeSeconds: string | number;
  connected: string | number;
  /** Number of touches whose duration came from a device call log. */
  verified: string | number;
  /** Seconds of that duration. Distinct from `verified`, which is a row count. */
  verifiedTalkTimeSeconds: string | number;
}

export interface ChannelRollup {
  channel: CommunicationChannel;
  count: number;
  talkTimeSeconds: number;
  connected: number;
  verified: number;
  verifiedTalkTimeSeconds: number;
}

const num = (v: string | number | null | undefined) => Number(v ?? 0) || 0;

/**
 * One row per channel, with absent channels zero-filled.
 *
 * Zero-filling matters: a report that silently omits WhatsApp when nobody used it
 * reads as missing data rather than as "no WhatsApp messages", and the UI would have
 * to guess which.
 */
export function rollupChannels(rows: RawChannelRow[]): ChannelRollup[] {
  const byChannel = new Map<string, ChannelRollup>();
  for (const channel of Object.values(CommunicationChannel)) {
    byChannel.set(channel, {
      channel,
      count: 0,
      talkTimeSeconds: 0,
      connected: 0,
      verified: 0,
      verifiedTalkTimeSeconds: 0,
    });
  }
  for (const row of rows) {
    const existing = byChannel.get(row.channel);
    if (!existing) continue; // A channel no longer in the enum: ignore, never crash.
    existing.count += num(row.count);
    existing.talkTimeSeconds += num(row.talkTimeSeconds);
    existing.connected += num(row.connected);
    existing.verified += num(row.verified);
    existing.verifiedTalkTimeSeconds += num(row.verifiedTalkTimeSeconds);
  }
  return [...byChannel.values()];
}

/**
 * Share of calls that reached someone.
 *
 * Returns null, not 0, when no calls were placed: "0% contact rate" reads as failure,
 * whereas no calls means the metric does not apply.
 */
export function contactRate(calls: number, connected: number): number | null {
  if (calls <= 0) return null;
  return connected / calls;
}

/** Share of talk time backed by a device call log rather than self-reported. */
export function verifiedShare(talkTimeSeconds: number, verifiedSeconds: number): number | null {
  if (talkTimeSeconds <= 0) return null;
  return verifiedSeconds / talkTimeSeconds;
}

/** Mean call length over calls actually placed. */
export function averageCallSeconds(calls: number, talkTimeSeconds: number): number | null {
  if (calls <= 0) return null;
  return talkTimeSeconds / calls;
}

export interface RawDayRow {
  day: string;
  interactions?: string | number;
  calls?: string | number;
  talkTimeSeconds?: string | number;
}

export interface DayBucket {
  day: string;
  interactions: number;
  calls: number;
  talkTimeSeconds: number;
}

/**
 * A value per day across the whole range, in order, with quiet days present as
 * zeros. A chart fed only the days that had activity would compress gaps and imply
 * work happened on days nobody worked.
 */
export function bucketByDay(rows: RawDayRow[], dayKeys: string[]): DayBucket[] {
  const byDay = new Map<string, DayBucket>(
    dayKeys.map((day) => [day, { day, interactions: 0, calls: 0, talkTimeSeconds: 0 }]),
  );
  for (const row of rows) {
    const bucket = byDay.get(row.day);
    if (!bucket) continue; // Outside the requested range.
    bucket.interactions += num(row.interactions);
    bucket.calls += num(row.calls);
    bucket.talkTimeSeconds += num(row.talkTimeSeconds);
  }
  return dayKeys.map((day) => byDay.get(day)!);
}

export interface RawPtpRow {
  status: PtpStatus | string;
  resolvedReason?: PtpResolvedReason | null;
  count: string | number;
  promisedAmount?: string | number;
}

export interface PtpRollup {
  created: number;
  pending: number;
  honored: number;
  broken: number;
  /** Genuine misses: excludes renegotiated and historical-backfill promises. */
  brokenTracked: number;
  backfilled: number;
  superseded: number;
  promisedAmount: number;
  keptRate: number | null;
}

/**
 * Promise pipeline counts plus a kept-rate.
 *
 * The rate deliberately excludes promises swept in by the historical backfill: they
 * were made when nothing tracked outcomes at all, so counting them would describe a
 * backlog nobody measured rather than how well collectors secure promises now.
 */
export function rollupPtps(rows: RawPtpRow[], opts: { includeBackfilled?: boolean } = {}): PtpRollup {
  const rollup: PtpRollup = {
    created: 0,
    pending: 0,
    honored: 0,
    broken: 0,
    brokenTracked: 0,
    backfilled: 0,
    superseded: 0,
    promisedAmount: 0,
    keptRate: null,
  };

  // ptpKeptRate works on individual records, so expand the grouped counts back out.
  const expanded: Array<{ status: PtpStatus; resolvedReason?: PtpResolvedReason | null }> = [];

  for (const row of rows) {
    const count = num(row.count);
    rollup.created += count;
    rollup.promisedAmount += num(row.promisedAmount);
    if (row.resolvedReason === 'BACKFILL_UNVERIFIED') rollup.backfilled += count;
    if (row.resolvedReason === 'SUPERSEDED') rollup.superseded += count;

    if (row.status === PtpStatus.PENDING) rollup.pending += count;
    if (row.status === PtpStatus.HONORED) rollup.honored += count;
    if (row.status === PtpStatus.BROKEN) {
      rollup.broken += count;
      if (isPtpFailure(row.resolvedReason)) rollup.brokenTracked += count;
    }

    for (let i = 0; i < count; i++) {
      expanded.push({ status: row.status as PtpStatus, resolvedReason: row.resolvedReason });
    }
  }

  rollup.keptRate = ptpKeptRate(expanded, opts);
  return rollup;
}

export interface CollectorRow {
  collectorId: string;
  fullName: string;
  phone: string;
  isActive: boolean;
}

export interface RawCollectorActivityRow {
  collectorId: string;
  interactions?: string | number;
  calls?: string | number;
  callsConnected?: string | number;
  talkTimeSeconds?: string | number;
  verifiedTalkTimeSeconds?: string | number;
  smsInitiated?: string | number;
  whatsappInitiated?: string | number;
  casesTouched?: string | number;
  borrowersTouched?: string | number;
  lastActivityAt?: Date | string | null;
}

export interface CollectorMetrics extends CollectorRow {
  interactions: number;
  calls: number;
  callsConnected: number;
  talkTimeSeconds: number;
  verifiedTalkTimeSeconds: number;
  smsInitiated: number;
  whatsappInitiated: number;
  casesTouched: number;
  borrowersTouched: number;
  lastActivityAt: Date | string | null;
  contactRate: number | null;
  averageCallSeconds: number | null;
  verifiedShare: number | null;
  ptps: PtpRollup;
  recoveredInitiatedAmount: number;
}

/**
 * One row per collector, including collectors with no activity at all.
 *
 * Keeping the zero rows is the point: "is this agent working?" cannot be answered by
 * a report that only lists agents who did something.
 *
 * Two recovery figures are deliberately NOT merged into one "recovered" number.
 * `recoveredInitiatedAmount` is money from payments this collector actually
 * triggered -- causation. Attribution by assignment would be a different and much
 * weaker claim, so it is not reported under the same name.
 */
export function mergeCollectorMetrics(
  collectors: CollectorRow[],
  activity: RawCollectorActivityRow[],
  ptpRows: Array<RawPtpRow & { collectorId: string }>,
  recovered: Array<{ collectorId: string; amount: string | number }>,
  opts: { includeBackfilled?: boolean } = {},
): CollectorMetrics[] {
  const activityById = new Map(activity.map((row) => [row.collectorId, row]));
  const recoveredById = new Map(recovered.map((row) => [row.collectorId, num(row.amount)]));
  const ptpsById = new Map<string, RawPtpRow[]>();
  for (const row of ptpRows) {
    const bucket = ptpsById.get(row.collectorId) ?? [];
    bucket.push(row);
    ptpsById.set(row.collectorId, bucket);
  }

  return collectors.map((collector) => {
    const raw = activityById.get(collector.collectorId);
    const calls = num(raw?.calls);
    const callsConnected = num(raw?.callsConnected);
    const talkTimeSeconds = num(raw?.talkTimeSeconds);
    const verifiedTalkTimeSeconds = num(raw?.verifiedTalkTimeSeconds);

    return {
      ...collector,
      interactions: num(raw?.interactions),
      calls,
      callsConnected,
      talkTimeSeconds,
      verifiedTalkTimeSeconds,
      smsInitiated: num(raw?.smsInitiated),
      whatsappInitiated: num(raw?.whatsappInitiated),
      casesTouched: num(raw?.casesTouched),
      borrowersTouched: num(raw?.borrowersTouched),
      lastActivityAt: raw?.lastActivityAt ?? null,
      contactRate: contactRate(calls, callsConnected),
      averageCallSeconds: averageCallSeconds(calls, talkTimeSeconds),
      verifiedShare: verifiedShare(talkTimeSeconds, verifiedTalkTimeSeconds),
      ptps: rollupPtps(ptpsById.get(collector.collectorId) ?? [], opts),
      recoveredInitiatedAmount: recoveredById.get(collector.collectorId) ?? 0,
    };
  });
}

export interface Totals {
  interactions: number;
  calls: number;
  callsConnected: number;
  contactRate: number | null;
  talkTimeSeconds: number;
  verifiedTalkTimeSeconds: number;
  verifiedShare: number | null;
  averageCallSeconds: number | null;
  /** Messages handed to the device, NOT confirmed deliveries. */
  smsInitiated: number;
  whatsappInitiated: number;
}

/** Headline figures, derived from the channel rollup so they cannot disagree with it. */
export function summariseTotals(byChannel: ChannelRollup[]): Totals {
  const find = (channel: CommunicationChannel) =>
    byChannel.find((row) => row.channel === channel);
  const callRow = find(CommunicationChannel.CALL);

  const calls = callRow?.count ?? 0;
  const callsConnected = callRow?.connected ?? 0;
  const talkTimeSeconds = byChannel.reduce((sum, row) => sum + row.talkTimeSeconds, 0);
  const verifiedTalkTimeSeconds = callRow?.verifiedTalkTimeSeconds ?? 0;

  return {
    interactions: byChannel.reduce((sum, row) => sum + row.count, 0),
    calls,
    callsConnected,
    contactRate: contactRate(calls, callsConnected),
    talkTimeSeconds,
    verifiedTalkTimeSeconds,
    verifiedShare: verifiedShare(talkTimeSeconds, verifiedTalkTimeSeconds),
    averageCallSeconds: averageCallSeconds(calls, talkTimeSeconds),
    smsInitiated: find(CommunicationChannel.SMS)?.count ?? 0,
    whatsappInitiated: find(CommunicationChannel.WHATSAPP)?.count ?? 0,
  };
}
