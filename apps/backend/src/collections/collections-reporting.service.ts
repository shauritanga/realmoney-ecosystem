import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PtpStatus, RepaymentStatus, UserRole } from '../database/enums.js';
import type { PtpResolvedReason } from '../database/enums.js';
import { InteractionLog } from '../database/entities/interaction-log.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { User } from '../database/entities/user.entity.js';
import { PtpSweepService } from './ptp-sweep.service.js';
import { REPORT_TZ, eatDayKeys, resolveDateRange, type DateRange } from './date-range.js';
import {
  bucketByDay,
  mergeCollectorMetrics,
  rollupChannels,
  rollupPtps,
  summariseTotals,
  type RawChannelRow,
} from './activity-metrics.js';
import { ptpState } from './ptp-status.js';
import type { ActivityQueryDto } from './collections.dto.js';

/**
 * Date-ranged collections activity reporting for admins.
 *
 * Lives in `CollectionsModule` rather than `AdminModule` because AdminModule cannot
 * see the interaction tables at all (it registers only Loan, Repayment, LedgerEntry
 * and User), and because this generalizes the per-channel `groupBy` already in
 * `CollectionsService.getCollectorStats` -- keeping both in one place stops them
 * drifting apart. `AdminController` injects it the same way it injects
 * OnboardingService and SettingsService.
 *
 * Two invariants hold in every query here:
 *  1. `origin = 'COLLECTOR'` -- SYSTEM rows are the server recording its own USSD
 *     pushes, and counting them would credit collectors with messages they did not
 *     send.
 *  2. Half-open `[from, to)` bounds on EAT calendar days, so a touch is counted in
 *     exactly one day and one report.
 */
@Injectable()
export class CollectionsReportingService {
  constructor(
    @InjectRepository(InteractionLog)
    private readonly interactions: Repository<InteractionLog>,
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(PromiseToPay)
    private readonly ptps: Repository<PromiseToPay>,
    @InjectRepository(Repayment)
    private readonly repayments: Repository<Repayment>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly ptpSweep: PtpSweepService,
  ) {}

  /** Parses the query into a range, mapping the helper's errors to 400s. */
  private range(query: ActivityQueryDto): DateRange {
    try {
      return resolveDateRange(query.from, query.to);
    } catch (error: any) {
      throw new BadRequestException(error?.message || 'Invalid date range');
    }
  }

  /** Collector-origin interactions inside the range, optionally narrowed. */
  private base(range: DateRange, query: ActivityQueryDto) {
    const qb = this.interactions
      .createQueryBuilder('l')
      .where('l."createdAt" >= :from AND l."createdAt" < :to', {
        from: range.from,
        to: range.to,
      })
      .andWhere('l.origin = :origin', { origin: 'COLLECTOR' });
    if (query.collectorId) {
      qb.andWhere('l."collectorId" = :collectorId', { collectorId: query.collectorId });
    }
    if (query.borrowerId) {
      // Via the loan rather than `l.borrowerId`: that column is populated by the
      // migration's back-fill, which a synchronize-managed dev database never runs,
      // and a subquery stays correct whatever joins the caller has added.
      qb.andWhere(
        'l."loanId" IN (SELECT id FROM loans WHERE "borrowerId" = :borrowerId)',
        { borrowerId: query.borrowerId },
      );
    }
    if (query.channel) qb.andWhere('l.channel = :channel', { channel: query.channel });
    return qb;
  }

  /**
   * The team activity rollup: headline totals, channel and disposition mix, a daily
   * series, per-collector performance, the promise pipeline, and the per-borrower
   * breakdown that answers "what have we actually done to chase this person?".
   */
  async activity(query: ActivityQueryDto) {
    await this.ptpSweep.sweep();
    const range = this.range(query);
    const opts = { includeBackfilled: query.includeBackfilled };

    const [channelRows, dispositionRows, outcomeRows, dayRows, reach] = await Promise.all([
      this.channelRows(range, query),
      this.dispositionRows(range, query),
      this.outcomeRows(range, query),
      this.dayRows(range, query),
      this.reachRows(range, query),
    ]);

    const byChannel = rollupChannels(channelRows);
    const [collectors, ptpPipeline, byBorrower] = await Promise.all([
      this.byCollector(range, query, opts),
      this.ptpPipeline(range, query, opts),
      this.byBorrower(range, query),
    ]);

    return {
      range: { from: range.fromKey, to: range.toKey, timezone: REPORT_TZ },
      totals: {
        ...summariseTotals(byChannel),
        borrowersTouched: Number(reach.borrowers || 0),
        casesTouched: Number(reach.cases || 0),
        activeCollectors: collectors.filter((c) => c.interactions > 0).length,
      },
      byChannel,
      byDisposition: dispositionRows.map((r) => ({
        disposition: r.disposition,
        count: Number(r.count || 0),
      })),
      byOutcome: outcomeRows.map((r) => ({
        outcome: r.outcome,
        count: Number(r.count || 0),
      })),
      byDay: bucketByDay(dayRows, eatDayKeys(range)),
      byCollector: collectors,
      ptps: ptpPipeline,
      byBorrower,
    };
  }

  private channelRows(range: DateRange, query: ActivityQueryDto) {
    return this.base(range, query)
      .select('l.channel', 'channel')
      .addSelect('COUNT(l.id)', 'count')
      .addSelect('COALESCE(SUM(l."durationSeconds"), 0)', 'talkTimeSeconds')
      .addSelect('COUNT(*) FILTER (WHERE l.connected)', 'connected')
      .addSelect(`COUNT(*) FILTER (WHERE l."durationSource" = 'CALL_LOG')`, 'verified')
      .addSelect(
        `COALESCE(SUM(l."durationSeconds") FILTER (WHERE l."durationSource" = 'CALL_LOG'), 0)`,
        'verifiedTalkTimeSeconds',
      )
      .groupBy('l.channel')
      .getRawMany<RawChannelRow>();
  }

  private dispositionRows(range: DateRange, query: ActivityQueryDto) {
    return this.base(range, query)
      .select('l.disposition', 'disposition')
      .addSelect('COUNT(l.id)', 'count')
      .groupBy('l.disposition')
      .orderBy('COUNT(l.id)', 'DESC')
      .getRawMany<{ disposition: string; count: string }>();
  }

  private outcomeRows(range: DateRange, query: ActivityQueryDto) {
    return this.base(range, query)
      .select('l.outcome', 'outcome')
      .addSelect('COUNT(l.id)', 'count')
      .andWhere('l.outcome IS NOT NULL')
      .groupBy('l.outcome')
      .orderBy('COUNT(l.id)', 'DESC')
      .getRawMany<{ outcome: string; count: string }>();
  }

  /**
   * Daily series bucketed in EAT. `AT TIME ZONE` in SQL rather than grouping in JS,
   * so Postgres can use the createdAt index and the boundary matches the range.
   */
  private dayRows(range: DateRange, query: ActivityQueryDto) {
    return this.base(range, query)
      .select(`to_char(l."createdAt" AT TIME ZONE '${REPORT_TZ}', 'YYYY-MM-DD')`, 'day')
      .addSelect('COUNT(l.id)', 'interactions')
      .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'CALL')`, 'calls')
      .addSelect('COALESCE(SUM(l."durationSeconds"), 0)', 'talkTimeSeconds')
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; interactions: string; calls: string; talkTimeSeconds: string }>();
  }

  /**
   * Distinct borrowers and cases touched.
   *
   * Counts borrowers through the loan join rather than the denormalised
   * `l.borrowerId`. That column is back-filled by the migration, which a dev database
   * running `synchronize` never executes -- so trusting it here would report zero
   * borrowers touched on the very same page where `byBorrower` (which joins) lists
   * them. Two figures disagreeing is worse than one slower query.
   */
  private async reachRows(range: DateRange, query: ActivityQueryDto) {
    const row = await this.base(range, query)
      .innerJoin('loans', 'ln', 'ln.id = l."loanId"')
      .select('COUNT(DISTINCT ln."borrowerId")', 'borrowers')
      .addSelect('COUNT(DISTINCT l."loanId")', 'cases')
      .getRawOne<{ borrowers: string; cases: string }>();
    return row ?? { borrowers: '0', cases: '0' };
  }

  /**
   * Per-collector performance.
   *
   * LEFT JOINs from `users`, not from interactions, so a collector who logged nothing
   * still appears with zeros -- a report listing only the agents who did something
   * cannot answer whether an agent is working.
   */
  private async byCollector(
    range: DateRange,
    query: ActivityQueryDto,
    opts: { includeBackfilled?: boolean },
  ) {
    const roster = this.users
      .createQueryBuilder('u')
      .select(['u.id AS "collectorId"', 'u."fullName" AS "fullName"', 'u.phone AS phone', 'u."isActive" AS "isActive"'])
      .where('u.role = :role', { role: UserRole.COLLECTOR });
    if (query.collectorId) {
      roster.andWhere('u.id = :collectorId', { collectorId: query.collectorId });
    }

    const [collectors, activity, ptpRows, recovered] = await Promise.all([
      roster.orderBy('u."fullName"', 'ASC').getRawMany<{
        collectorId: string;
        fullName: string;
        phone: string;
        isActive: boolean;
      }>(),
      this.base(range, query)
        .innerJoin('loans', 'ln', 'ln.id = l."loanId"')
        .select('l."collectorId"', 'collectorId')
        .addSelect('COUNT(l.id)', 'interactions')
        .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'CALL')`, 'calls')
        .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'CALL' AND l.connected)`, 'callsConnected')
        .addSelect(
          `COALESCE(SUM(l."durationSeconds") FILTER (WHERE l.channel = 'CALL'), 0)`,
          'talkTimeSeconds',
        )
        .addSelect(
          `COALESCE(SUM(l."durationSeconds") FILTER (WHERE l."durationSource" = 'CALL_LOG'), 0)`,
          'verifiedTalkTimeSeconds',
        )
        .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'SMS')`, 'smsInitiated')
        .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'WHATSAPP')`, 'whatsappInitiated')
        .addSelect('COUNT(DISTINCT l."loanId")', 'casesTouched')
        // Through the loan, not the denormalised column: see reachRows.
        .addSelect('COUNT(DISTINCT ln."borrowerId")', 'borrowersTouched')
        .addSelect('MAX(l."createdAt")', 'lastActivityAt')
        .groupBy('l."collectorId"')
        .getRawMany(),
      this.ptpRows(range, query, 'p."collectorId"'),
      this.recoveredRows(range, query),
    ]);

    return mergeCollectorMetrics(collectors, activity, ptpRows as Array<Parameters<typeof mergeCollectorMetrics>[2][number]>, recovered, opts);
  }

  /** Promises created in the range, grouped by status and resolution reason. */
  private ptpRows(range: DateRange, query: ActivityQueryDto, groupBy?: string) {
    const qb = this.ptps
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('p."resolvedReason"', 'resolvedReason')
      .addSelect('COUNT(p.id)', 'count')
      .addSelect('COALESCE(SUM(p."promisedAmount"), 0)', 'promisedAmount')
      .where('p."createdAt" >= :from AND p."createdAt" < :to', {
        from: range.from,
        to: range.to,
      })
      .groupBy('p.status')
      .addGroupBy('p."resolvedReason"');
    if (query.collectorId) {
      qb.andWhere('p."collectorId" = :collectorId', { collectorId: query.collectorId });
    }
    if (groupBy) {
      qb.addSelect(groupBy, 'collectorId').addGroupBy(groupBy);
    }
    return qb.getRawMany<{
      status: PtpStatus;
      resolvedReason: PtpResolvedReason | null;
      count: string;
      promisedAmount: string;
      collectorId?: string;
    }>();
  }

  /**
   * Money from payments a collector actually triggered.
   *
   * Deliberately narrow: attributing every payment on an assigned case to its
   * collector would be a much weaker claim, and reporting the two under one
   * "recovered" heading would overstate what an agent caused.
   */
  private recoveredRows(range: DateRange, query: ActivityQueryDto) {
    const qb = this.repayments
      .createQueryBuilder('r')
      .select('r."initiatedById"', 'collectorId')
      .addSelect('COALESCE(SUM(r.amount), 0)', 'amount')
      .where('r.status = :status', { status: RepaymentStatus.COMPLETED })
      .andWhere('r."paidAt" >= :from AND r."paidAt" < :to', { from: range.from, to: range.to })
      .andWhere('r."initiatedById" IS NOT NULL')
      .groupBy('r."initiatedById"');
    if (query.collectorId) {
      qb.andWhere('r."initiatedById" = :collectorId', { collectorId: query.collectorId });
    }
    return qb.getRawMany<{ collectorId: string; amount: string }>();
  }

  private async ptpPipeline(
    range: DateRange,
    query: ActivityQueryDto,
    opts: { includeBackfilled?: boolean },
  ) {
    const rows = await this.ptpRows(range, query);
    const rollup = rollupPtps(rows, opts);

    // Promises already broken and still owing: the escalation list.
    const brokenQb = this.ptps
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .leftJoinAndSelect('p.collector', 'collector')
      .where('p.status = :status', { status: PtpStatus.BROKEN })
      .andWhere('loan.outstandingBalance > 0')
      .orderBy('p.resolvedAt', 'DESC')
      .take(20);
    // A renegotiated promise was replaced, not missed, so it never escalates.
    brokenQb.andWhere(`COALESCE(p."resolvedReason", '') <> 'SUPERSEDED'`);
    if (!opts.includeBackfilled) {
      brokenQb.andWhere(`COALESCE(p."resolvedReason", '') <> 'BACKFILL_UNVERIFIED'`);
    }
    if (query.collectorId) {
      brokenQb.andWhere('p."collectorId" = :collectorId', { collectorId: query.collectorId });
    }
    const broken = await brokenQb.getMany();

    return {
      ...rollup,
      brokenNeedingEscalation: broken.map((p) => ({
        ptpId: p.id,
        loanId: p.loanId,
        loanNumber: p.loan?.loanNumber ?? null,
        borrowerId: p.loan?.borrowerId ?? null,
        borrowerName: p.loan?.borrower?.fullName ?? null,
        borrowerPhone: p.loan?.borrower?.phone ?? null,
        collectorName: p.collector?.fullName ?? null,
        promisedAmount: p.promisedAmount,
        promisedDate: p.promisedDate,
        resolvedAt: p.resolvedAt,
        outstandingBalance: p.loan?.outstandingBalance ?? null,
      })),
    };
  }

  /**
   * Per-borrower contact breakdown -- calls with talk time, plus SMS and WhatsApp
   * initiated. This is the "how many calls, for how long, and how many messages have
   * we sent this customer?" question.
   *
   * Grouped on the loan's borrower rather than the denormalised column so a legacy
   * row whose `borrowerId` back-fill missed is still counted.
   */
  private async byBorrower(range: DateRange, query: ActivityQueryDto) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 500);
    const offset = Math.max(query.offset ?? 0, 0);

    const rows = await this.base(range, query)
      .innerJoin('loans', 'ln', 'ln.id = l."loanId"')
      .innerJoin('users', 'b', 'b.id = ln."borrowerId"')
      .select('ln."borrowerId"', 'borrowerId')
      .addSelect('b."fullName"', 'fullName')
      .addSelect('b.phone', 'phone')
      .addSelect('COUNT(l.id)', 'interactions')
      .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'CALL')`, 'calls')
      .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'CALL' AND l.connected)`, 'callsConnected')
      .addSelect(
        `COALESCE(SUM(l."durationSeconds") FILTER (WHERE l.channel = 'CALL'), 0)`,
        'talkTimeSeconds',
      )
      .addSelect(
        `COALESCE(SUM(l."durationSeconds") FILTER (WHERE l."durationSource" = 'CALL_LOG'), 0)`,
        'verifiedTalkTimeSeconds',
      )
      .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'SMS')`, 'smsInitiated')
      .addSelect(`COUNT(*) FILTER (WHERE l.channel = 'WHATSAPP')`, 'whatsappInitiated')
      .addSelect('MAX(l."createdAt")', 'lastContactAt')
      .addSelect('COUNT(DISTINCT l."loanId")', 'loanCount')
      .groupBy('ln."borrowerId"')
      .addGroupBy('b."fullName"')
      .addGroupBy('b.phone')
      .orderBy('COUNT(l.id)', 'DESC')
      .addOrderBy('ln."borrowerId"', 'ASC')
      .limit(limit)
      .offset(offset)
      .getRawMany<Record<string, string>>();

    const totalRow = await this.base(range, query)
      .innerJoin('loans', 'ln', 'ln.id = l."loanId"')
      .select('COUNT(DISTINCT ln."borrowerId")', 'total')
      .getRawOne<{ total: string }>();

    const borrowerIds = rows.map((r) => r.borrowerId);

    // Outstanding balance needs its own query: summing it inside the grouped
    // interaction query would multiply it by the number of touches, and
    // SUM(DISTINCT ...) would instead collapse two loans that happen to owe the
    // same amount.
    const balances = borrowerIds.length
      ? await this.loans
          .createQueryBuilder('ln')
          .select('ln."borrowerId"', 'borrowerId')
          .addSelect('COALESCE(SUM(ln."outstandingBalance"), 0)', 'outstandingBalance')
          .where('ln."borrowerId" IN (:...borrowerIds)', { borrowerIds })
          .andWhere('ln."outstandingBalance" > 0')
          .groupBy('ln."borrowerId"')
          .getRawMany<{ borrowerId: string; outstandingBalance: string }>()
      : [];
    const balanceByBorrower = new Map(
      balances.map((r) => [r.borrowerId, Number(r.outstandingBalance || 0)]),
    );

    // Promise counts per borrower, for the same range.
    const promiseCounts = borrowerIds.length
      ? await this.ptps
          .createQueryBuilder('p')
          .innerJoin('loans', 'ln', 'ln.id = p."loanId"')
          .select('ln."borrowerId"', 'borrowerId')
          .addSelect('COUNT(p.id)', 'created')
          .addSelect(`COUNT(*) FILTER (WHERE p.status = 'BROKEN')`, 'broken')
          .where('ln."borrowerId" IN (:...borrowerIds)', { borrowerIds })
          .andWhere('p."createdAt" >= :from AND p."createdAt" < :to', {
            from: range.from,
            to: range.to,
          })
          .groupBy('ln."borrowerId"')
          .getRawMany<{ borrowerId: string; created: string; broken: string }>()
      : [];
    const promisesByBorrower = new Map(promiseCounts.map((r) => [r.borrowerId, r]));

    return {
      total: Number(totalRow?.total || 0),
      limit,
      offset,
      rows: rows.map((r) => {
        const promises = promisesByBorrower.get(r.borrowerId);
        return {
          borrowerId: r.borrowerId,
          fullName: r.fullName,
          phone: r.phone,
          loanCount: Number(r.loanCount || 0),
          outstandingBalance: balanceByBorrower.get(r.borrowerId) ?? 0,
          interactions: Number(r.interactions || 0),
          calls: Number(r.calls || 0),
          callsConnected: Number(r.callsConnected || 0),
          talkTimeSeconds: Number(r.talkTimeSeconds || 0),
          verifiedTalkTimeSeconds: Number(r.verifiedTalkTimeSeconds || 0),
          smsInitiated: Number(r.smsInitiated || 0),
          whatsappInitiated: Number(r.whatsappInitiated || 0),
          lastContactAt: r.lastContactAt || null,
          ptpsCreated: Number(promises?.created || 0),
          ptpsBroken: Number(promises?.broken || 0),
        };
      }),
    };
  }

  /**
   * One borrower's full contact timeline, merging interactions and promise events.
   *
   * SYSTEM rows are included here and flagged: on a timeline, a USSD push the server
   * sent is useful context. They remain excluded from every count.
   */
  async borrowerTimeline(borrowerId: string, query: ActivityQueryDto) {
    await this.ptpSweep.sweep();
    const range = this.range(query);
    const limit = Math.min(Math.max(query.limit ?? 100, 1), 500);
    const now = new Date();

    const [interactions, promises] = await Promise.all([
      this.interactions
        .createQueryBuilder('l')
        .leftJoinAndSelect('l.loan', 'loan')
        .leftJoinAndSelect('l.collector', 'collector')
        .where('l."loanId" IN (SELECT id FROM loans WHERE "borrowerId" = :borrowerId)', {
          borrowerId,
        })
        .andWhere('l."createdAt" >= :from AND l."createdAt" < :to', {
          from: range.from,
          to: range.to,
        })
        .orderBy('l.createdAt', 'DESC')
        .take(limit)
        .getMany(),
      this.ptps
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.loan', 'loan')
        .leftJoinAndSelect('p.collector', 'collector')
        .innerJoin('loans', 'ln', 'ln.id = p."loanId"')
        .where('ln."borrowerId" = :borrowerId', { borrowerId })
        .andWhere('p."createdAt" >= :from AND p."createdAt" < :to', {
          from: range.from,
          to: range.to,
        })
        .orderBy('p.createdAt', 'DESC')
        .take(limit)
        .getMany(),
    ]);

    const borrower = await this.users.findOne({
      where: { id: borrowerId },
      select: { id: true, fullName: true, phone: true },
    });

    return {
      range: { from: range.fromKey, to: range.toKey, timezone: REPORT_TZ },
      borrower,
      interactions: interactions.map((l) => ({
        id: l.id,
        at: l.createdAt,
        loanId: l.loanId,
        loanNumber: l.loan?.loanNumber ?? null,
        channel: l.channel,
        disposition: l.disposition,
        outcome: l.outcome,
        connected: l.connected,
        callOutcome: l.callOutcome,
        durationSeconds: l.durationSeconds,
        durationSource: l.durationSource,
        followUpAt: l.followUpAt,
        notes: l.notes,
        origin: l.origin,
        collectorName: l.collector?.fullName ?? null,
      })),
      promises: promises.map((p) => ({
        id: p.id,
        at: p.createdAt,
        loanId: p.loanId,
        loanNumber: p.loan?.loanNumber ?? null,
        promisedAmount: p.promisedAmount,
        promisedDate: p.promisedDate,
        status: p.status,
        state: ptpState(p, now),
        resolvedAt: p.resolvedAt,
        resolvedReason: p.resolvedReason,
        collectorName: p.collector?.fullName ?? null,
      })),
    };
  }

  /**
   * Flat rows for CSV export.
   *
   * Capped, and the cap is reported rather than silently truncating: an export that
   * quietly stops at 20,000 rows would be taken for the complete record.
   */
  async exportRows(query: ActivityQueryDto) {
    const range = this.range(query);
    const cap = 20_000;

    const rows = await this.base(range, query)
      .innerJoin('loans', 'ln', 'ln.id = l."loanId"')
      .leftJoin('users', 'b', 'b.id = ln."borrowerId"')
      .leftJoin('users', 'c', 'c.id = l."collectorId"')
      .select('l."createdAt"', 'at')
      .addSelect('c."fullName"', 'collectorName')
      .addSelect('b."fullName"', 'borrowerName')
      .addSelect('b.phone', 'borrowerPhone')
      .addSelect('ln."loanNumber"', 'loanNumber')
      .addSelect('l.channel', 'channel')
      .addSelect('l.connected', 'connected')
      .addSelect('l."durationSeconds"', 'durationSeconds')
      .addSelect('l."durationSource"', 'durationSource')
      .addSelect('l."callOutcome"', 'callOutcome')
      .addSelect('l.disposition', 'disposition')
      .addSelect('l.outcome', 'outcome')
      .addSelect('l."followUpAt"', 'followUpAt')
      .addSelect('l.notes', 'notes')
      .orderBy('l."createdAt"', 'DESC')
      .limit(cap + 1)
      .getRawMany<Record<string, unknown>>();

    return {
      range: { from: range.fromKey, to: range.toKey, timezone: REPORT_TZ },
      truncated: rows.length > cap,
      cap,
      rows: rows.slice(0, cap),
    };
  }

  /** Cheap counts for the sidebar badge and alert banners. */
  async alerts() {
    await this.ptpSweep.sweep();
    const now = new Date();

    const [brokenPtpCount, callbacksDueToday] = await Promise.all([
      this.ptps
        .createQueryBuilder('p')
        .innerJoin('loans', 'ln', 'ln.id = p."loanId"')
        .where('p.status = :status', { status: PtpStatus.BROKEN })
        .andWhere(
          `COALESCE(p."resolvedReason", '') NOT IN ('SUPERSEDED', 'BACKFILL_UNVERIFIED')`,
        )
        .andWhere('ln."outstandingBalance" > 0')
        .getCount(),
      this.interactions
        .createQueryBuilder('l')
        .where('l."followUpAt" IS NOT NULL')
        .andWhere('l."followUpAt" <= :now', { now })
        .andWhere('l.origin = :origin', { origin: 'COLLECTOR' })
        .getCount(),
    ]);

    return { brokenPtpCount, callbacksDueToday };
  }
}
