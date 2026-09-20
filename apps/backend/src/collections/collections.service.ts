import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, MoreThan } from 'typeorm';
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
} from './collection-level.js';

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
    private readonly clickPesaService: ClickPesaService,
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
          interactionLogs: true,
        },
      },
      order: {
        loan: { daysOverdue: 'DESC', outstandingBalance: 'DESC' },
        assignedAt: 'ASC',
      },
    });

    const now = new Date();
    let items = assignments.map((a) => {
      const lvl = getCollectionLevel(a.loan.dueDate, now);
      const pendingPtps = (a.loan.promisesToPay || [])
        .filter((p) => p.status === PtpStatus.PENDING)
        .sort((x, y) => x.promisedDate.getTime() - y.promisedDate.getTime());
      const recent = [...(a.loan.interactionLogs || [])]
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .slice(0, 3);
      return {
        assignmentId: a.id,
        assignedAt: a.assignedAt,
        loan: a.loan,
        level: lvl,
        levelLabel: LEVEL_LABEL[lvl],
        daysToDue: daysToDue(new Date(a.loan.dueDate), now),
        activePtp: pendingPtps[0] || null,
        recentInteractions: recent,
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
   * Collector daily performance metrics + per-level breakdown.
   */
  async getCollectorStats(collectorId: string) {
    const totalAssigned = await this.assignments.count({
      where: { collectorId, isActive: true },
    });

    const activePtps = await this.ptps.count({
      where: { collectorId, status: PtpStatus.PENDING },
    });

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

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
   * Records agent touchpoint & call disposition
   */
  async logInteraction(
    collectorId: string,
    dto: {
      loanId: string;
      channel: CommunicationChannel;
      disposition: DispositionCode;
      notes?: string;
      durationSeconds?: number;
      ptpAmount?: number;
      ptpDate?: string;
    },
  ) {
    const loan = await this.loans.findOne({ where: { id: dto.loanId } });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    const log = await this.interactions.save(
      this.interactions.create({
        loanId: dto.loanId,
        collectorId,
        channel: dto.channel,
        disposition: dto.disposition,
        notes: dto.notes ?? null,
        durationSeconds: dto.durationSeconds || 0,
      }),
    );

    // If disposition is PROMISED_TO_PAY, schedule a PTP
    let ptpRecord = null;
    if (dto.disposition === DispositionCode.PROMISED_TO_PAY && dto.ptpAmount && dto.ptpDate) {
      ptpRecord = await this.ptps.save(
        this.ptps.create({
          loanId: dto.loanId,
          collectorId,
          promisedAmount: dto.ptpAmount,
          promisedDate: new Date(dto.ptpDate),
          notes: dto.notes ?? null,
        }),
      );
    }

    return {
      log,
      ptp: ptpRecord,
    };
  }

  async triggerUssdPushPayment(actor: PaymentActor, dto: { loanId: string; amount: number }) {
    const result = await this.clickPesaService.triggerUssdPush(dto, actor);
    if (actor.role === UserRole.COLLECTOR && result.success) {
      await this.interactions.save(this.interactions.create({
        loanId: dto.loanId,
        collectorId: actor.id,
        channel: CommunicationChannel.SMS,
        disposition: DispositionCode.PROMISED_TO_PAY,
        notes: `ClickPesa payment requested. Order ID: ${result.orderId}. ${result.message}`,
      }));
    }
    return result;
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
   * Admin: Bulk-assign up to `limit` unassigned loans of ONE level to a
   * collector — e.g. "give Neema 45x T1 cases for today". Biggest balances
   * first. The no-mix rule applies.
   */
  async autoAssignLevel(
    collectorId: string,
    level: CollectionLevel,
    adminId: string,
    limit = 50,
  ) {
    if (!COLLECTION_LEVELS.includes(level)) {
      throw new BadRequestException(`Unknown collection level: ${level}`);
    }
    try {
      assertNoLevelMix(await this.workedLevels(collectorId), level);
    } catch (e: any) {
      throw new BadRequestException(e.message);
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
      .slice(0, Math.max(1, Math.min(limit, 500)));

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
