import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository, In, MoreThan } from 'typeorm';
import { ClickPesaService, type PaymentActor } from '../clickpesa/clickpesa.service.js';
import {
  CommunicationChannel,
  DispositionCode,
  PtpStatus,
  LoanStatus,
  RepaymentStatus,
  UserRole,
} from '../database/enums.js';
import { CollectorAssignment } from '../database/entities/collector-assignment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { InteractionLog } from '../database/entities/interaction-log.entity.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import {
  CollectionLevel,
  COLLECTION_LEVELS,
  LEVEL_LABEL,
  assertNoLevelMix,
  daysToDue,
  getCollectionLevel,
  isQueueableLevel,
  maxCapacityForLevel,
} from './collection-level.js';
import { LogInteractionDto } from './collections.dto.js';
import { LoanExtension } from '../database/entities/loan-extension.entity.js';
import { SettingsService } from '../settings/settings.service.js';
import { canExtend, quoteExtension } from '../loans/extension.js';
import {
  deriveConnected,
  normaliseDurationSource,
  validateInteraction,
} from './interaction-rules.js';
import { resolveDateRange, startOfEatDay, todayRange, utcDaysBetween } from './date-range.js';
import { NON_FAILURE_PTP_REASONS, isPtpFailure, ptpState } from './ptp-status.js';

/** Per-loan contact rollup backing the queue rows. */
interface LoanContactActivity {
  touchesToday: number;
  talkTimeTodaySeconds: number;
  lastContactAt: Date | null;
  nextFollowUpAt: Date | null;
}

const WORKABLE_STATUSES = [LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED];

@Injectable()
export class CollectionsService {
  constructor(
    @InjectRepository(CollectorAssignment)
    private readonly assignments: Repository<CollectorAssignment>,
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(InteractionLog)
    private readonly interactions: Repository<InteractionLog>,
    @InjectRepository(PromiseToPay)
    private readonly ptps: Repository<PromiseToPay>,
    @InjectRepository(Repayment)
    private readonly repayments: Repository<Repayment>,
    @InjectRepository(LoanExtension)
    private readonly extensions: Repository<LoanExtension>,
    private readonly clickPesaService: ClickPesaService,
    private readonly settings: SettingsService,
    private readonly db: DataSource,
  ) {}

  /**
   * Collector's daily work queue: ONLY their assigned level.
   * Pass `level` to narrow further (must match their assigned level).
   */
  async getCollectorQueue(collectorId: string, level?: CollectionLevel) {
    if (level && !COLLECTION_LEVELS.includes(level)) {
      throw new BadRequestException(`Unknown collection level: ${level}`);
    }

    const assignments = await this.assignments.find({
      where: {
        collectorId,
        isActive: true,
        loan: {
          status: In(WORKABLE_STATUSES),
          outstandingBalance: MoreThan(0),
        },
      },
      relations: {
        loan: {
          borrower: true,
          product: true,
          promisesToPay: true,
        },
      },
      order: {
        loan: { daysOverdue: 'DESC', outstandingBalance: 'DESC' },
        assignedAt: 'ASC',
      },
    });
    if (!assignments.length) return [];

    const now = new Date();
    // Contact activity comes from one grouped query rather than the eager
    // `interactionLogs` relation this used to load: that pulled EVERY log for EVERY
    // assigned loan into memory (45 cases x months of history) only to slice three
    // off the top. It also meant the client had to infer "worked today" from those
    // three records, so a case touched four times in a day silently fell out of the
    // window. Both problems go away by computing it in SQL.
    const loanIds = assignments.map((a) => a.loanId);
    const [activity, previews, extensions] = await Promise.all([
      this.contactActivity(loanIds, now),
      this.recentInteractions(loanIds),
      this.extensionCounts(loanIds),
    ]);

    let items = assignments.map((a) => {
      const lvl = getCollectionLevel(a.loan.dueDate, now);
      const activePtp = pickDisplayPtp(a.loan.promisesToPay);
      const stats = activity.get(a.loanId);
      return {
        assignmentId: a.id,
        assignedAt: a.assignedAt,
        loan: a.loan,
        level: lvl,
        levelLabel: LEVEL_LABEL[lvl],
        daysToDue: daysToDue(new Date(a.loan.dueDate), now),
        activePtp,
        // Derived server-side so the app and the dashboard cannot disagree.
        ptpState: ptpState(activePtp, now),
        workedToday: (stats?.touchesToday ?? 0) > 0,
        touchesToday: stats?.touchesToday ?? 0,
        talkTimeTodaySeconds: stats?.talkTimeTodaySeconds ?? 0,
        lastContactAt: stats?.lastContactAt ?? null,
        // Previews are newest-first, so the head carries the latest disposition.
        // A DISTINCT ON query cannot express this through the query builder --
        // TypeORM reorders the select list and moves DISTINCT ON off the front.
        lastDisposition: previews.get(a.loanId)?.[0]?.disposition ?? null,
        nextFollowUpAt: stats?.nextFollowUpAt ?? null,
        // So a row can be marked "Extended x1" without the app asking per case.
        extensionCount: extensions.get(a.loanId) ?? 0,
        recentInteractions: previews.get(a.loanId) ?? [],
      };
    });

    // UPCOMING loans never appear in a daily queue.
    items = items.filter((i) => isQueueableLevel(i.level));
    if (level) {
      items = items.filter((i) => i.level === level);
    }
    return items;
  }

  /**
   * How many extensions each loan has, in one grouped query rather than one per row.
   *
   * A queue of 45 cases must not become 45 COUNT queries, and a collector needs to see
   * at a glance that a case has already been rolled -- extending a loan that has been
   * extended before is the point at which a service starts becoming a trap.
   */
  private async extensionCounts(loanIds: string[]): Promise<Map<string, number>> {
    if (!loanIds.length) return new Map();
    const rows = await this.extensions
      .createQueryBuilder('e')
      .select('e.loanId', 'loanId')
      .addSelect('COUNT(*)', 'count')
      .where('e.loanId IN (:...loanIds)', { loanIds })
      .groupBy('e.loanId')
      .getRawMany<{ loanId: string; count: string }>();
    return new Map(rows.map((r) => [r.loanId, Number(r.count || 0)]));
  }

  /**
   * Per-loan contact activity for a queue, in one pass.
   *
   * Only COLLECTOR-origin rows count: the server writes a SYSTEM row of its own when
   * a USSD push succeeds, and letting that mark a case "worked" would credit the
   * collector for work they did not do.
   */
  private async contactActivity(loanIds: string[], now: Date) {
    if (!loanIds.length) return new Map<string, LoanContactActivity>();
    const dayStart = startOfEatDay(now);

    const rows = await this.interactions
      .createQueryBuilder('l')
      .select('l.loanId', 'loanId')
      .addSelect('COUNT(*) FILTER (WHERE l."createdAt" >= :dayStart)', 'touchesToday')
      .addSelect(
        'COALESCE(SUM(l."durationSeconds") FILTER (WHERE l."createdAt" >= :dayStart), 0)',
        'talkTimeTodaySeconds',
      )
      .addSelect('MAX(l."createdAt")', 'lastContactAt')
      .addSelect('MIN(l."followUpAt") FILTER (WHERE l."followUpAt" >= :now)', 'nextFollowUpAt')
      .where('l.loanId IN (:...loanIds)', { loanIds })
      .andWhere('l.origin = :origin', { origin: 'COLLECTOR' })
      .setParameters({ dayStart, now })
      .groupBy('l.loanId')
      .getRawMany<{
        loanId: string;
        touchesToday: string;
        talkTimeTodaySeconds: string;
        lastContactAt: Date | null;
        nextFollowUpAt: Date | null;
      }>();

    return new Map<string, LoanContactActivity>(
      rows.map((r) => [
        r.loanId,
        {
          touchesToday: Number(r.touchesToday || 0),
          talkTimeTodaySeconds: Number(r.talkTimeTodaySeconds || 0),
          lastContactAt: r.lastContactAt,
          nextFollowUpAt: r.nextFollowUpAt,
        },
      ]),
    );
  }

  /**
   * The last few touches per loan, for the row previews only.
   *
   * Uses a window function so Postgres discards the older rows. Fetching everything
   * and slicing in memory would read a whole queue's history -- 45 cases times months
   * of calls -- to display five rows each, which is the same unbounded read the eager
   * `interactionLogs` relation used to cause.
   *
   * The query builder cannot express ROW_NUMBER, hence the raw SQL. Both parameters
   * are bound, never interpolated.
   */
  private async recentInteractions(loanIds: string[], perLoan = 5) {
    const byLoan = new Map<string, InteractionLog[]>();
    if (!loanIds.length) return byLoan;

    const rows = await this.interactions.query(
      `SELECT * FROM (
         SELECT l.*, ROW_NUMBER() OVER (
           PARTITION BY l."loanId" ORDER BY l."createdAt" DESC
         ) AS rank
         FROM interaction_logs l
         WHERE l."loanId" = ANY($1) AND l.origin = 'COLLECTOR'
       ) ranked
       WHERE ranked.rank <= $2
       ORDER BY ranked."loanId", ranked."createdAt" DESC`,
      [loanIds, perLoan],
    );

    for (const row of rows as Array<InteractionLog & { rank: string }>) {
      const bucket = byLoan.get(row.loanId) ?? [];
      bucket.push(row);
      byLoan.set(row.loanId, bucket);
    }
    return byLoan;
  }

  /**
   * Collector daily performance metrics + per-level breakdown.
   */
  async getCollectorStats(collectorId: string) {
    const totalAssigned = await this.assignments.count({
      where: { collectorId, isActive: true },
    });

    const activePtps = await this.ptps.count({
      where: { collectorId, status: PtpStatus.PENDING },
    });

    // EAT, not server local time. On a UTC host `setHours(0,0,0,0)` started the
    // collector's day at 03:00 local, so the first three hours of every shift were
    // counted against the previous day.
    const todayStart = startOfEatDay();

    const interactionsToday = await this.interactions
      .createQueryBuilder('l')
      .where('l.collectorId = :collectorId', { collectorId })
      .andWhere('l.createdAt >= :today', { today: todayStart })
      .getCount();

    // Per-channel touches for the home screen (calls / WhatsApp / SMS).
    const channelRows = await this.interactions
      .createQueryBuilder('l')
      .select('l.channel', 'channel')
      .addSelect('COUNT(l.id)', 'count')
      .where('l.collectorId = :collectorId', { collectorId })
      .andWhere('l.createdAt >= :today', { today: todayStart })
      .groupBy('l.channel')
      .getRawMany<{ channel: string; count: string }>();
    const channelCount = (c: string) =>
      Number(channelRows.find((r) => r.channel === c)?.count || 0);
    const callsToday = channelCount(CommunicationChannel.CALL);
    const whatsappToday = channelCount(CommunicationChannel.WHATSAPP);
    const smsToday = channelCount(CommunicationChannel.SMS);

    // Cases this collector settled today.
    const settledToday = await this.loans
      .createQueryBuilder('loan')
      .innerJoin(
        'loan.assignments',
        'a',
        'a.collectorId = :collectorId',
        { collectorId },
      )
      .where('loan.settledAt >= :today', { today: todayStart })
      .getCount();

    const recovered = await this.repayments
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount), 0)', 'sum')
      .where('r.initiatedById = :collectorId', { collectorId })
      .andWhere('r.status = :status', { status: RepaymentStatus.COMPLETED })
      .andWhere('r.paidAt >= :today', { today: todayStart })
      .getRawOne<{ sum: string }>();

    // Level breakdown of today's queue → drives the app's level tabs.
    const queue = await this.getCollectorQueue(collectorId);
    const levelCounts: Record<string, number> = {};
    for (const item of queue) {
      levelCounts[item.level] = (levelCounts[item.level] || 0) + 1;
    }
    const workedLevels = Object.keys(levelCounts);
    const assignedLevel = workedLevels.length === 1 ? workedLevels[0] : null;

    return {
      totalAssignedAccounts: totalAssigned,
      interactionsToday,
      callsToday,
      whatsappToday,
      smsToday,
      settledToday,
      activePtps,
      recoveredTodayAmount: Number(recovered?.sum || 0),
      queueSize: queue.length,
      levelCounts,
      assignedLevel,
    };
  }

  /**
   * Records a collector's touchpoint and the customer's response.
   *
   * Three defects closed here, all of which silently corrupted data:
   *  - **No authorization.** Any authenticated collector could log against any
   *    loanId. Now reuses `ClickPesaService.assertAccess`, the same predicate that
   *    already guards payments, so a collector needs an active assignment.
   *  - **Not transactional.** The log and the promise were separate saves, so a
   *    failure between them left an interaction claiming a promise that did not exist.
   *  - **Silent promise drop.** `PROMISED_TO_PAY` with a falsy amount returned 201
   *    with no promise created -- and `ptpAmount: 0` is falsy, so a zero promise
   *    vanished while the collector saw success. Validation is now explicit.
   */
  async logInteraction(actor: PaymentActor, dto: LogInteractionDto) {
    const loan = await this.loans.findOne({ where: { id: dto.loanId } });
    if (!loan) throw new NotFoundException('Loan not found');

    await this.clickPesaService.assertAccess(loan, actor);

    // A retried submit after a network timeout must not double-count a touch.
    if (dto.clientRef) {
      const existing = await this.interactions.findOne({
        where: { collectorId: actor.id, clientRef: dto.clientRef },
      });
      if (existing) {
        const ptp = await this.ptps.findOne({
          where: { loanId: dto.loanId, collectorId: actor.id, status: PtpStatus.PENDING },
          order: { createdAt: 'DESC' },
        });
        return { log: existing, ptp, duplicate: true };
      }
    }

    const now = new Date();
    const errors = validateInteraction(dto, {
      outstandingBalance: Number(loan.outstandingBalance),
      now,
    });
    if (errors.length) throw new BadRequestException(errors.join(' '));

    return this.db.transaction(async (manager) => {
      const log = await manager.save(
        InteractionLog,
        manager.create(InteractionLog, {
          loanId: dto.loanId,
          borrowerId: loan.borrowerId,
          collectorId: actor.id,
          channel: dto.channel,
          disposition: dto.disposition,
          outcome: dto.outcome ?? null,
          notes: dto.notes?.trim() || null,
          durationSeconds: dto.durationSeconds ?? 0,
          durationSource: normaliseDurationSource(
            dto.channel,
            dto.durationSource,
            dto.durationSeconds,
          ),
          callOutcome: dto.channel === CommunicationChannel.CALL ? dto.callOutcome ?? null : null,
          connected: deriveConnected(dto.channel, dto.callOutcome, dto.durationSeconds),
          followUpAt: dto.followUpAt ? new Date(dto.followUpAt) : null,
          clientRef: dto.clientRef ?? null,
          origin: 'COLLECTOR',
        }),
      );

      let ptpRecord: PromiseToPay | null = null;
      if (dto.disposition === DispositionCode.PROMISED_TO_PAY) {
        // A fresh promise replaces any still-open one on the same loan: the borrower
        // has renegotiated, and leaving both pending would double-count the debt in
        // the promise pipeline. The superseded one is not marked BROKEN -- it was
        // renegotiated, not missed.
        await manager.update(
          PromiseToPay,
          { loanId: dto.loanId, status: PtpStatus.PENDING },
          { status: PtpStatus.BROKEN, resolvedAt: now, resolvedReason: 'SUPERSEDED' },
        );

        ptpRecord = await manager.save(
          PromiseToPay,
          manager.create(PromiseToPay, {
            loanId: dto.loanId,
            collectorId: actor.id,
            promisedAmount: dto.ptpAmount!,
            promisedDate: new Date(dto.ptpDate!),
            notes: dto.notes?.trim() || null,
          }),
        );
      }

      return { log, ptp: ptpRecord, duplicate: false };
    });
  }

  /**
   * A single case with everything the detail screen needs, so refreshing one case
   * no longer means re-fetching the whole queue.
   */
  async getCase(actor: PaymentActor, loanId: string) {
    const loan = await this.loans.findOne({
      where: { id: loanId },
      relations: { borrower: true, product: true, promisesToPay: true },
    });
    if (!loan) throw new NotFoundException('Loan not found');
    await this.clickPesaService.assertAccess(loan, actor);

    const now = new Date();
    const assignment = await this.assignments.findOne({
      where: { loanId, isActive: true },
      relations: { collector: true },
    });
    const [activity, history, config, extensionsGranted] = await Promise.all([
      this.contactActivity([loanId], now),
      this.getCaseHistory(actor, loanId, { limit: 25 }, loan),
      this.settings.get(),
      this.extensions.countBy({ loanId }),
    ]);

    // Quoted here rather than behind a second round trip: the collector is about to
    // have this conversation, and a fee they have to fetch separately is a fee they
    // will guess at.
    const extensionSettings = {
      feePercent: config.extensionFeePercent,
      maxExtensions: config.maxExtensions,
    };
    const eligibility = canExtend(loan, extensionsGranted, extensionSettings);

    const activePtp = pickDisplayPtp(loan.promisesToPay);
    const level = getCollectionLevel(loan.dueDate, now);
    const stats = activity.get(loanId);

    return {
      loan,
      assignmentId: assignment?.id ?? null,
      assignedAt: assignment?.assignedAt ?? null,
      assignedTo: assignment
        ? { id: assignment.collectorId, fullName: assignment.collector?.fullName ?? null }
        : null,
      level,
      levelLabel: LEVEL_LABEL[level],
      daysToDue: daysToDue(new Date(loan.dueDate), now),
      activePtp,
      ptpState: ptpState(activePtp, now),
      // Newest first, so a renegotiated promise reads as a history.
      ptpHistory: [...(loan.promisesToPay || [])].sort(
        (x, y) => y.createdAt.getTime() - x.createdAt.getTime(),
      ),
      workedToday: (stats?.touchesToday ?? 0) > 0,
      touchesToday: stats?.touchesToday ?? 0,
      talkTimeTodaySeconds: stats?.talkTimeTodaySeconds ?? 0,
      lastContactAt: stats?.lastContactAt ?? null,
      nextFollowUpAt: stats?.nextFollowUpAt ?? null,
      extension: {
        ...quoteExtension(loan, extensionsGranted, extensionSettings),
        eligible: eligibility.ok,
        reason: eligibility.ok ? null : eligibility.reason,
      },
      interactions: history,
    };
  }

  /**
   * A case's contact history, newest first.
   *
   * Cursor-paginated on `createdAt` rather than offset-paginated: new touches land at
   * the head while a collector is scrolling, and an offset would make rows repeat or
   * disappear. SYSTEM rows are included here -- on a timeline a USSD push the server
   * sent is useful context -- but flagged by `origin` so the UI can style it as a
   * machine event, and they stay excluded from the activity counts.
   */
  async getCaseHistory(
    actor: PaymentActor,
    loanId: string,
    query: { limit?: number; before?: string },
    preloadedLoan?: Loan,
  ) {
    const loan =
      preloadedLoan ?? (await this.loans.findOne({ where: { id: loanId } }));
    if (!loan) throw new NotFoundException('Loan not found');
    if (!preloadedLoan) await this.clickPesaService.assertAccess(loan, actor);

    const limit = Math.min(Math.max(query.limit ?? 25, 1), 100);
    const qb = this.interactions
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.collector', 'collector')
      .where('l.loanId = :loanId', { loanId })
      .orderBy('l.createdAt', 'DESC')
      // Fetch one extra to learn whether another page exists, without a COUNT.
      .take(limit + 1);
    if (query.before) {
      const before = new Date(query.before);
      if (Number.isNaN(before.getTime())) {
        throw new BadRequestException('Invalid history cursor');
      }
      qb.andWhere('l."createdAt" < :before', { before });
    }

    const rows = await qb.getMany();
    const items = rows.slice(0, limit).map((row) => ({
      ...row,
      collector: row.collector
        ? { id: row.collectorId, fullName: row.collector.fullName }
        : null,
    }));

    return {
      items,
      nextCursor:
        rows.length > limit ? items[items.length - 1].createdAt.toISOString() : null,
    };
  }

  /**
   * What this collector owes a follow-up on: callbacks they committed to, promises
   * coming due, and promises already broken.
   *
   * `CALLBACK_REQUESTED` was previously selectable but captured no date at all, so
   * nothing ever came back. This is the queue that makes it mean something.
   */
  async getFollowUps(collectorId: string, on?: string) {
    const now = new Date();
    const day = on ? resolveDateRange(on, on, now) : todayRange(now);

    const callbacks = await this.interactions
      .createQueryBuilder('l')
      .leftJoinAndSelect('l.loan', 'loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .where('l.collectorId = :collectorId', { collectorId })
      .andWhere('l."followUpAt" IS NOT NULL')
      // Everything up to end-of-day: an overdue callback must not silently vanish.
      .andWhere('l."followUpAt" < :end', { end: day.to })
      .andWhere('loan.status IN (:...statuses)', { statuses: WORKABLE_STATUSES })
      .andWhere('loan.outstandingBalance > 0')
      .orderBy('l.followUpAt', 'ASC')
      .take(100)
      .getMany();

    const promises = await this.ptps
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .where('p.collectorId = :collectorId', { collectorId })
      .andWhere('p.status = :status', { status: PtpStatus.PENDING })
      .andWhere('p."promisedDate" < :end', { end: day.to })
      .orderBy('p.promisedDate', 'ASC')
      .take(100)
      .getMany();

    const broken = await this.ptps
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .where('p.collectorId = :collectorId', { collectorId })
      .andWhere('p.status = :status', { status: PtpStatus.BROKEN })
      // Renegotiated and historical-backfill promises are not misses, so they are
      // not escalation candidates.
      .andWhere(
        `COALESCE(p."resolvedReason", '') NOT IN (:...nonFailures)`,
        { nonFailures: NON_FAILURE_PTP_REASONS },
      )
      .andWhere('loan.outstandingBalance > 0')
      .orderBy('p.resolvedAt', 'DESC')
      .take(50)
      .getMany();

    return {
      on: day.fromKey,
      callbacks: callbacks.map((c) => ({
        interactionId: c.id,
        loanId: c.loanId,
        loanNumber: c.loan?.loanNumber ?? null,
        borrowerName: c.loan?.borrower?.fullName ?? null,
        borrowerPhone: c.loan?.borrower?.phone ?? null,
        followUpAt: c.followUpAt,
        overdue: !!c.followUpAt && c.followUpAt < now,
        notes: c.notes,
      })),
      // `ptpState` rather than the stored status: a promise that lapsed since the
      // last sweep should already read as overdue.
      promisesDue: promises.map((p) => ({
        ptpId: p.id,
        loanId: p.loanId,
        loanNumber: p.loan?.loanNumber ?? null,
        borrowerName: p.loan?.borrower?.fullName ?? null,
        borrowerPhone: p.loan?.borrower?.phone ?? null,
        promisedAmount: p.promisedAmount,
        promisedDate: p.promisedDate,
        state: ptpState(p, now),
      })),
      brokenPromises: broken.map((p) => ({
        ptpId: p.id,
        loanId: p.loanId,
        loanNumber: p.loan?.loanNumber ?? null,
        borrowerName: p.loan?.borrower?.fullName ?? null,
        borrowerPhone: p.loan?.borrower?.phone ?? null,
        promisedAmount: p.promisedAmount,
        promisedDate: p.promisedDate,
        outstandingBalance: p.loan?.outstandingBalance ?? null,
        daysLate: p.resolvedAt ? utcDaysBetween(p.resolvedAt, now) : null,
      })),
    };
  }

  /**
   * Every promise this collector has secured, newest first, with a tally by state.
   *
   * Backs the app's PTP tab. Renegotiated and pre-tracking promises are reported
   * separately from genuine misses, so a collector is not shown a "broken" count
   * that includes commitments they successfully replaced.
   */
  async getMyPromises(collectorId: string, status?: string) {
    const now = new Date();

    const rows = await this.ptps
      .createQueryBuilder('p')
      .leftJoinAndSelect('p.loan', 'loan')
      .leftJoinAndSelect('loan.borrower', 'borrower')
      .where('p.collectorId = :collectorId', { collectorId })
      .orderBy('p.createdAt', 'DESC')
      .take(200)
      .getMany();

    const items = rows.map((p) => ({
      id: p.id,
      loanId: p.loanId,
      loanNumber: p.loan?.loanNumber ?? null,
      borrowerName: p.loan?.borrower?.fullName ?? null,
      borrowerPhone: p.loan?.borrower?.phone ?? null,
      promisedAmount: p.promisedAmount,
      promisedDate: p.promisedDate,
      status: p.status,
      // Display-time truth: a promise that lapsed since the last sweep already
      // reads as overdue here.
      state: ptpState(p, now),
      resolvedAt: p.resolvedAt,
      resolvedReason: p.resolvedReason,
      notes: p.notes,
      createdAt: p.createdAt,
      outstandingBalance: p.loan?.outstandingBalance ?? null,
    }));

    const isMiss = (row: (typeof items)[number]) =>
      row.status === PtpStatus.BROKEN && isPtpFailure(row.resolvedReason);

    const counts = {
      pending: items.filter((r) => r.state === 'PENDING').length,
      overdue: items.filter((r) => r.state === 'OVERDUE').length,
      honored: items.filter((r) => r.status === PtpStatus.HONORED).length,
      broken: items.filter(isMiss).length,
      promisedAmount: items
        .filter((r) => r.state !== 'NONE')
        .reduce((sum, r) => sum + Number(r.promisedAmount), 0),
    };

    const filtered = (() => {
      switch (status) {
        case 'PENDING':
          return items.filter((r) => r.state === 'PENDING');
        case 'OVERDUE':
          return items.filter((r) => r.state === 'OVERDUE');
        case 'HONORED':
          return items.filter((r) => r.status === PtpStatus.HONORED);
        case 'BROKEN':
          return items.filter(isMiss);
        default:
          return items;
      }
    })();

    return { counts, items: filtered };
  }

  async triggerUssdPushPayment(
    actor: PaymentActor,
    dto: { loanId: string; amount: number; payerPhone?: string; payerName?: string },
  ) {
    const result = await this.clickPesaService.triggerUssdPush(dto, actor);
    const loan = await this.loans.findOne({ where: { id: dto.loanId }, select: { borrowerId: true } });
    if (actor.role === UserRole.COLLECTOR && result.success) {
      // Tagged SYSTEM: this is the server recording its own action, not a message
      // the collector sent. Left as COLLECTOR it inflated every SMS and promise
      // count in the activity reports.
      await this.interactions.save(this.interactions.create({
        loanId: dto.loanId,
        borrowerId: loan?.borrowerId ?? null,
        collectorId: actor.id,
        channel: CommunicationChannel.SMS,
        disposition: DispositionCode.PROMISED_TO_PAY,
        // NOTE: the 20260925 migration back-fills historical rows by matching the
        // previous wording ('ClickPesa payment requested. Order ID:%'). Do not
        // update that pattern to match this text -- it targets rows already written.
        // New rows need no pattern: `origin` is set explicitly below.
        notes: `Payment request sent. Reference: ${result.orderId}. ${result.message}`,
        origin: 'SYSTEM',
      }));
    }
    return result;
  }

  /**
   * What an extension would cost this loan right now, without committing to it.
   *
   * Backs the collector's confirmation screen: they need to read the fee and the new
   * date out loud before the borrower agrees to anything.
   */
  async quoteLoanExtension(actor: PaymentActor, loanId: string) {
    const loan = await this.loans.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    await this.clickPesaService.assertAccess(loan, actor);

    const config = await this.settings.get();
    const settings = { feePercent: config.extensionFeePercent, maxExtensions: config.maxExtensions };
    const granted = await this.extensions.countBy({ loanId });
    const eligibility = canExtend(loan, granted, settings);

    return {
      ...quoteExtension(loan, granted, settings),
      eligible: eligibility.ok,
      reason: eligibility.ok ? null : eligibility.reason,
    };
  }

  /**
   * Offers an extension: prices the fee server-side and pushes it for payment.
   *
   * The due date does not move here. It moves when the money actually lands, in
   * ClickPesaService.reconcile -- an extension nobody paid for is not an extension.
   */
  async extendLoan(
    actor: PaymentActor,
    dto: { loanId: string; payerPhone?: string; payerName?: string },
  ) {
    const loan = await this.loans.findOne({ where: { id: dto.loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    await this.clickPesaService.assertAccess(loan, actor);

    const config = await this.settings.get();
    const settings = { feePercent: config.extensionFeePercent, maxExtensions: config.maxExtensions };
    const granted = await this.extensions.countBy({ loanId: dto.loanId });

    const eligibility = canExtend(loan, granted, settings);
    if (!eligibility.ok) throw new BadRequestException(eligibility.reason);

    const quote = quoteExtension(loan, granted, settings);
    const result = await this.clickPesaService.triggerUssdPush(
      {
        loanId: dto.loanId,
        amount: quote.fee,
        purpose: 'EXTENSION_FEE',
        payerPhone: dto.payerPhone,
        payerName: dto.payerName,
      },
      actor,
    );

    if (actor.role === UserRole.COLLECTOR && result.success) {
      await this.interactions.save(this.interactions.create({
        loanId: dto.loanId,
        borrowerId: loan.borrowerId,
        collectorId: actor.id,
        channel: CommunicationChannel.SMS,
        disposition: DispositionCode.PROMISED_TO_PAY,
        notes:
          `Extension offered: TZS ${quote.fee} to move the due date to ` +
          `${quote.newDueDate.toISOString().slice(0, 10)}. Reference: ${result.orderId}.`,
        origin: 'SYSTEM',
      }));
    }

    // The fee and the date are echoed back so the client shows what was actually
    // quoted rather than recomputing it and risking a different answer.
    return { ...result, fee: quote.fee, newDueDate: quote.newDueDate, extensionsRemaining: quote.extensionsRemaining };
  }

  /** Every extension granted on a loan, oldest first. Backs the case timeline. */
  async getLoanExtensions(actor: PaymentActor, loanId: string) {
    const loan = await this.loans.findOne({ where: { id: loanId } });
    if (!loan) throw new NotFoundException('Loan not found');
    await this.clickPesaService.assertAccess(loan, actor);
    return this.extensions.find({
      where: { loanId },
      order: { createdAt: 'ASC' },
      relations: { grantedBy: true },
    });
  }

  /** Levels across a collector's currently worked (queueable) assignments. */
  private async workedLevels(collectorId: string): Promise<CollectionLevel[]> {
    const active = await this.assignments.find({
      where: {
        collectorId,
        isActive: true,
        loan: { status: In(WORKABLE_STATUSES) },
      },
      relations: { loan: true },
    });
    const now = new Date();
    return active
      .map((a) => getCollectionLevel(a.loan.dueDate, now))
      .filter(isQueueableLevel);
  }

  /**
   * Admin: Assign / Reassign a single loan. Enforces the no-mix rule —
   * a collector working level X cannot receive a level-Y loan.
   */
  async assignLoanToCollector(loanId: string, collectorId: string, adminId: string) {
    const loan = await this.loans.findOne({ where: { id: loanId } });
    if (!loan) {
      throw new NotFoundException('Loan not found');
    }
    const newLevel = getCollectionLevel(loan.dueDate, new Date());
    if (!isQueueableLevel(newLevel)) {
      throw new BadRequestException(
        `Loan ${loan.loanNumber} is not yet due (UPCOMING) — it cannot join a daily queue.`,
      );
    }

    try {
      assertNoLevelMix(await this.workedLevels(collectorId), newLevel);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    const maxCap = maxCapacityForLevel(newLevel);
    if (maxCap !== null) {
      const activeCount = await this.assignments.count({
        where: { collectorId, isActive: true },
      });
      if (activeCount >= maxCap) {
        throw new BadRequestException(
          `Collector capacity reached. Maximum ${maxCap} accounts can be assigned for tier ${LEVEL_LABEL[newLevel]}.`,
        );
      }
    }

    // Deactivate previous active assignment
    await this.assignments.update(
      { loanId, isActive: true },
      { isActive: false, reassignedAt: new Date() },
    );

    return this.assignments.save(
      this.assignments.create({
        loanId,
        collectorId,
        assignedBy: adminId,
        isActive: true,
      }),
    );
  }

  /**
   * Admin: Unassign a loan from its active collector.
   */
  async unassignLoan(loanId: string) {
    const res = await this.assignments.update(
      { loanId, isActive: true },
      { isActive: false, reassignedAt: new Date() },
    );
    return { success: true, affected: res.affected || 0 };
  }

  /**
   * Admin: Bulk-assign up to `limit` unassigned loans of ONE level to a
   * collector — e.g. "give Neema 45x T1 cases for today". Biggest balances
   * first. The no-mix rule and max 45 rule (for tiers other than S) apply.
   */
  async autoAssignLevel(
    collectorId: string,
    level: CollectionLevel,
    adminId: string,
    limit = 45,
  ) {
    if (!COLLECTION_LEVELS.includes(level)) {
      throw new BadRequestException(`Unknown collection level: ${level}`);
    }
    try {
      assertNoLevelMix(await this.workedLevels(collectorId), level);
    } catch (e: any) {
      throw new BadRequestException(e.message);
    }

    const maxCap = maxCapacityForLevel(level);
    let effectiveLimit = limit;
    if (maxCap !== null) {
      const activeCount = await this.assignments.count({
        where: { collectorId, isActive: true },
      });
      const remaining = maxCap - activeCount;
      if (remaining <= 0) {
        throw new BadRequestException(
          `Collector already has ${activeCount} accounts assigned. Maximum allowed for tier ${LEVEL_LABEL[level]} is ${maxCap}.`,
        );
      }
      effectiveLimit = Math.min(limit, remaining);
    }

    // Candidates: workable, owing, with no active assignment.
    const candidates = await this.loans
      .createQueryBuilder('loan')
      .leftJoin(
        'loan.assignments',
        'activeAssignment',
        'activeAssignment.isActive = :active',
        { active: true },
      )
      .where('loan.status IN (:...statuses)', { statuses: WORKABLE_STATUSES })
      .andWhere('loan.outstandingBalance > 0')
      .andWhere('activeAssignment.id IS NULL')
      .orderBy('loan.outstandingBalance', 'DESC')
      .limit(500)
      .getMany();

    const now = new Date();
    const matching = candidates
      .filter((l) => getCollectionLevel(l.dueDate, now) === level)
      .slice(0, Math.max(1, Math.min(effectiveLimit, 500)));

    const created = await this.assignments.save(
      matching.map((l) =>
        this.assignments.create({
          loanId: l.id,
          collectorId,
          assignedBy: adminId,
          isActive: true,
        }),
      ),
    );

    return {
      level,
      levelLabel: LEVEL_LABEL[level],
      assigned: created.length,
      loanIds: created.map((a) => a.loanId),
    };
  }
}

/**
 * The promise a case should display.
 *
 * Prefers the soonest still-pending promise. Falls back to the most recently broken
 * one so a missed commitment stays on the row after the sweep resolves it -- without
 * this the flag vanished the moment the promise was marked BROKEN. Renegotiated and
 * pre-tracking promises are skipped: neither is the borrower failing.
 */
function pickDisplayPtp(promises: PromiseToPay[] | undefined): PromiseToPay | null {
  const all = promises || [];
  const pending = all
    .filter((p) => p.status === PtpStatus.PENDING)
    .sort((x, y) => x.promisedDate.getTime() - y.promisedDate.getTime());
  if (pending.length) return pending[0];

  const broken = all
    .filter((p) => p.status === PtpStatus.BROKEN && isPtpFailure(p.resolvedReason))
    .sort((x, y) => y.promisedDate.getTime() - x.promisedDate.getTime());
  return broken[0] ?? null;
}
