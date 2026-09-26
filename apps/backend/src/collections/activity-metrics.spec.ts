import { describe, it, expect } from 'vitest';
import { CommunicationChannel, PtpStatus } from '../database/enums.js';
import {
  averageCallSeconds,
  bucketByDay,
  contactRate,
  mergeCollectorMetrics,
  rollupChannels,
  rollupPtps,
  summariseTotals,
  verifiedShare,
} from './activity-metrics.js';

const channelRow = (over: Record<string, unknown> = {}) => ({
  channel: CommunicationChannel.CALL,
  count: '10',
  talkTimeSeconds: '600',
  connected: '7',
  verified: '8',
  verifiedTalkTimeSeconds: '480',
  ...over,
});

describe('rollupChannels', () => {
  it('coerces the strings Postgres returns into numbers', () => {
    const [call] = rollupChannels([channelRow()]);
    expect(call).toEqual({
      channel: CommunicationChannel.CALL,
      count: 10,
      talkTimeSeconds: 600,
      connected: 7,
      verified: 8,
      verifiedTalkTimeSeconds: 480,
    });
  });

  it('zero-fills channels nobody used, so absent data is not mistaken for missing data', () => {
    const rollup = rollupChannels([channelRow()]);
    expect(rollup).toHaveLength(3);
    const sms = rollup.find((r) => r.channel === CommunicationChannel.SMS);
    expect(sms).toMatchObject({ count: 0, talkTimeSeconds: 0, connected: 0 });
  });

  it('returns all channels at zero for an empty range', () => {
    const rollup = rollupChannels([]);
    expect(rollup).toHaveLength(3);
    expect(rollup.every((r) => r.count === 0)).toBe(true);
  });

  it('ignores a channel value no longer in the enum rather than crashing', () => {
    const rollup = rollupChannels([channelRow(), channelRow({ channel: 'TELEGRAM' })]);
    expect(rollup).toHaveLength(3);
    expect(rollup.find((r) => r.channel === CommunicationChannel.CALL)!.count).toBe(10);
  });

  it('sums duplicate rows for the same channel', () => {
    const rollup = rollupChannels([channelRow({ count: '3' }), channelRow({ count: '4' })]);
    expect(rollup.find((r) => r.channel === CommunicationChannel.CALL)!.count).toBe(7);
  });
});

describe('rate helpers', () => {
  it('returns null rather than zero when the metric does not apply', () => {
    // "0% contact rate" reads as failure; no calls means there is nothing to rate.
    expect(contactRate(0, 0)).toBeNull();
    expect(verifiedShare(0, 0)).toBeNull();
    expect(averageCallSeconds(0, 0)).toBeNull();
  });

  it('computes the obvious cases', () => {
    expect(contactRate(10, 7)).toBe(0.7);
    expect(verifiedShare(600, 480)).toBe(0.8);
    expect(averageCallSeconds(10, 600)).toBe(60);
  });
});

describe('bucketByDay', () => {
  const days = ['2026-09-23', '2026-09-24', '2026-09-25'];

  it('fills quiet days with zeros and preserves range order', () => {
    const buckets = bucketByDay([{ day: '2026-09-25', interactions: '5', calls: '4' }], days);
    expect(buckets.map((b) => b.day)).toEqual(days);
    expect(buckets[0]).toEqual({ day: '2026-09-23', interactions: 0, calls: 0, talkTimeSeconds: 0 });
    expect(buckets[2].interactions).toBe(5);
  });

  it('ignores rows outside the requested range', () => {
    const buckets = bucketByDay([{ day: '2020-01-01', interactions: '99' }], days);
    expect(buckets.every((b) => b.interactions === 0)).toBe(true);
  });

  it('returns nothing for an empty range', () => {
    expect(bucketByDay([{ day: '2026-09-25', interactions: '5' }], [])).toEqual([]);
  });
});

describe('rollupPtps', () => {
  it('counts the pipeline by status', () => {
    const rollup = rollupPtps([
      { status: PtpStatus.PENDING, count: '5', promisedAmount: '500000' },
      { status: PtpStatus.HONORED, count: '3', promisedAmount: '300000' },
      { status: PtpStatus.BROKEN, count: '2', resolvedReason: 'DATE_PASSED', promisedAmount: '200000' },
    ]);
    expect(rollup).toMatchObject({
      created: 10, pending: 5, honored: 3, broken: 2, brokenTracked: 2, promisedAmount: 1_000_000,
    });
    expect(rollup.keptRate).toBe(0.6);
  });

  it('excludes the untracked historical backlog from the kept-rate by default', () => {
    const rows = [
      { status: PtpStatus.HONORED, count: '3', resolvedReason: 'SETTLED_IN_FULL' as const },
      { status: PtpStatus.BROKEN, count: '97', resolvedReason: 'BACKFILL_UNVERIFIED' as const },
    ];
    const rollup = rollupPtps(rows);
    expect(rollup.broken).toBe(97);
    expect(rollup.brokenTracked).toBe(0);
    expect(rollup.backfilled).toBe(97);
    // Without the exclusion this would read 3%, describing a backlog nobody measured.
    expect(rollup.keptRate).toBe(1);
    expect(rollupPtps(rows, { includeBackfilled: true }).keptRate).toBeCloseTo(0.03);
  });

  it('keeps renegotiated promises out of broken-as-missed and the kept-rate', () => {
    const rollup = rollupPtps([
      { status: PtpStatus.BROKEN, count: '2', resolvedReason: 'SUPERSEDED' },
      { status: PtpStatus.HONORED, count: '1', resolvedReason: 'SETTLED_IN_FULL' },
    ]);
    expect(rollup.broken).toBe(2);
    expect(rollup.superseded).toBe(2);
    // Renegotiated promises are not misses, so nothing needs escalating.
    expect(rollup.brokenTracked).toBe(0);
    expect(rollup.keptRate).toBe(1);
  });

  it('reports a null kept-rate when nothing has concluded', () => {
    expect(rollupPtps([{ status: PtpStatus.PENDING, count: '4' }]).keptRate).toBeNull();
    expect(rollupPtps([]).keptRate).toBeNull();
  });

  it('starts from zero for an empty range', () => {
    expect(rollupPtps([])).toMatchObject({ created: 0, pending: 0, honored: 0, broken: 0 });
  });
});

describe('mergeCollectorMetrics', () => {
  const collectors = [
    { collectorId: 'busy', fullName: 'Grace M', phone: '0712', isActive: true },
    { collectorId: 'idle', fullName: 'Idle A', phone: '0713', isActive: true },
  ];

  it('keeps collectors with no activity, so "is this agent working?" can be answered', () => {
    const merged = mergeCollectorMetrics(collectors, [], [], []);
    expect(merged).toHaveLength(2);
    expect(merged[1]).toMatchObject({
      collectorId: 'idle', interactions: 0, calls: 0, talkTimeSeconds: 0,
      contactRate: null, recoveredInitiatedAmount: 0,
    });
  });

  it('joins activity, promises and recovery onto the right collector', () => {
    const merged = mergeCollectorMetrics(
      collectors,
      [{ collectorId: 'busy', interactions: '20', calls: '15', callsConnected: '9', talkTimeSeconds: '900', verifiedTalkTimeSeconds: '450', smsInitiated: '3', whatsappInitiated: '2', casesTouched: '11' }],
      [
        { collectorId: 'busy', status: PtpStatus.HONORED, count: '4' },
        { collectorId: 'busy', status: PtpStatus.BROKEN, count: '1', resolvedReason: 'DATE_PASSED' },
      ],
      [{ collectorId: 'busy', amount: '1250000' }],
    );
    const busy = merged[0];
    expect(busy).toMatchObject({
      interactions: 20, calls: 15, callsConnected: 9, talkTimeSeconds: 900,
      smsInitiated: 3, whatsappInitiated: 2, casesTouched: 11,
      recoveredInitiatedAmount: 1_250_000,
    });
    expect(busy.contactRate).toBe(0.6);
    expect(busy.averageCallSeconds).toBe(60);
    expect(busy.verifiedShare).toBe(0.5);
    expect(busy.ptps.keptRate).toBe(0.8);
    expect(merged[1].ptps.created).toBe(0);
  });

  it('never invents a collector that activity rows reference but the roster does not', () => {
    const merged = mergeCollectorMetrics(
      [collectors[0]],
      [{ collectorId: 'ghost', calls: '99' }],
      [],
      [],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0].calls).toBe(0);
  });

  it('returns nothing when there are no collectors', () => {
    expect(mergeCollectorMetrics([], [{ collectorId: 'x', calls: '1' }], [], [])).toEqual([]);
  });
});

describe('summariseTotals', () => {
  it('derives headlines from the channel rollup so they cannot disagree with it', () => {
    const byChannel = rollupChannels([
      channelRow({ count: '10', talkTimeSeconds: '600', connected: '7', verifiedTalkTimeSeconds: '480' }),
      channelRow({ channel: CommunicationChannel.SMS, count: '4', talkTimeSeconds: '0', connected: '0', verified: '0', verifiedTalkTimeSeconds: '0' }),
      channelRow({ channel: CommunicationChannel.WHATSAPP, count: '2', talkTimeSeconds: '0', connected: '0', verified: '0', verifiedTalkTimeSeconds: '0' }),
    ]);
    const totals = summariseTotals(byChannel);
    expect(totals).toMatchObject({
      interactions: 16, calls: 10, callsConnected: 7, talkTimeSeconds: 600,
      verifiedTalkTimeSeconds: 480, smsInitiated: 4, whatsappInitiated: 2,
    });
    expect(totals.contactRate).toBe(0.7);
    expect(totals.verifiedShare).toBe(0.8);
  });

  it('counts verified seconds, not verified rows', () => {
    // A row count and a seconds sum are different quantities; conflating them would
    // make verifiedShare exceed 1 on short calls.
    const byChannel = rollupChannels([
      channelRow({ count: '2', talkTimeSeconds: '10', verified: '2', verifiedTalkTimeSeconds: '10' }),
    ]);
    expect(summariseTotals(byChannel).verifiedShare).toBe(1);
  });

  it('is all zeros and nulls for an empty range', () => {
    const totals = summariseTotals(rollupChannels([]));
    expect(totals).toMatchObject({ interactions: 0, calls: 0, talkTimeSeconds: 0 });
    expect(totals.contactRate).toBeNull();
    expect(totals.verifiedShare).toBeNull();
    expect(totals.averageCallSeconds).toBeNull();
  });
});
