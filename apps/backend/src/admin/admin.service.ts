import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { LoanStatus, UserRole, RepaymentStatus, KycStatus } from '../database/enums.js';
import { Loan } from '../database/entities/loan.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { LoanExtension } from '../database/entities/loan-extension.entity.js';
import { User } from '../database/entities/user.entity.js';
import { normalizePhone } from '../onboarding/phone-verification.service.js';
import {
  CollectionLevel,
  LEVEL_LABEL,
  getCollectionLevel,
  isQueueableLevel,
  maxCapacityForLevel,
} from '../collections/collection-level.js';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(Repayment)
    private readonly repayments: Repository<Repayment>,
    @InjectRepository(LedgerEntry)
    private readonly ledger: Repository<LedgerEntry>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    @InjectRepository(LoanExtension)
    private readonly extensions: Repository<LoanExtension>,
  ) {}

  /**
   * Every extension ever granted, newest first, with a rollup by loan.
   *
   * Exists so somebody can answer "how many loans are we rolling, and who is
   * approving them?" -- the metric that distinguishes an extension offered as a
   * service from one sold as a trap. Without it, a borrower on their second extension
   * is only visible to whoever happens to open that one case.
   */
  async getExtensions(limit = 100) {
    const rows = await this.extensions.find({
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 500),
      relations: { loan: { borrower: true }, grantedBy: true },
    });

    // How many extensions each of these loans has in total, so a row can say "2 of 2"
    // rather than leaving the reader to count occurrences in the list.
    const totals = new Map<string, number>();
    if (rows.length) {
      const counts = await this.extensions
        .createQueryBuilder('e')
        .select('e.loanId', 'loanId')
        .addSelect('COUNT(*)', 'count')
        .where('e.loanId IN (:...ids)', { ids: [...new Set(rows.map((r) => r.loanId))] })
        .groupBy('e.loanId')
        .getRawMany<{ loanId: string; count: string }>();
      for (const row of counts) totals.set(row.loanId, Number(row.count));
    }

    const items = rows.map((extension) => ({
      id: extension.id,
      loanId: extension.loanId,
      loanNumber: extension.loan?.loanNumber ?? null,
      borrowerName: extension.loan?.borrower?.fullName ?? null,
      borrowerPhone: extension.loan?.borrower?.phone ?? null,
      previousDueDate: extension.previousDueDate,
      newDueDate: extension.newDueDate,
      feeAmount: Number(extension.feeAmount),
      outstandingAtExtension: Number(extension.outstandingAtExtension),
      grantedBy: extension.grantedBy?.fullName ?? null,
      createdAt: extension.createdAt,
      extensionsOnLoan: totals.get(extension.loanId) ?? 1,
      // The status now, not at the time -- whether rolling this loan actually helped.
      loanStatus: extension.loan?.status ?? null,
      outstandingNow: extension.loan ? Number(extension.loan.outstandingBalance) : null,
    }));

    return {
      items,
      totals: {
        extensions: items.length,
        loans: new Set(items.map((i) => i.loanId)).size,
        feesCollected: Math.round(items.reduce((sum, i) => sum + i.feeAmount, 0) * 100) / 100,
        // Loans rolled more than once: the number worth watching.
        repeatLoans: new Set(
          items.filter((i) => i.extensionsOnLoan > 1).map((i) => i.loanId),
        ).size,
      },
    };
  }

  async getDashboardStats() {
    const totalLoans = await this.loans.count();
    const activeLoans = await this.loans.count({
      where: { status: LoanStatus.ACTIVE },
    });
    const overdueLoans = await this.loans.count({
      where: { status: LoanStatus.OVERDUE },
    });
    const settledLoans = await this.loans.count({
      where: { status: LoanStatus.SETTLED },
    });

    const disbursed = await this.loans
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.principalAmount), 0)', 'sum')
      .where('loan.status IN (:...statuses)', {
        statuses: [LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.SETTLED, LoanStatus.DEFAULTED],
      })
      .getRawOne<{ sum: string }>();

    const outstanding = await this.loans
      .createQueryBuilder('loan')
      .select('COALESCE(SUM(loan.outstandingBalance), 0)', 'sum')
      .where('loan.status IN (:...statuses)', {
        statuses: [LoanStatus.ACTIVE, LoanStatus.OVERDUE],
      })
      .getRawOne<{ sum: string }>();

    const repayments = await this.repayments
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount), 0)', 'sum')
      .where('r.status = :status', { status: RepaymentStatus.COMPLETED })
      .getRawOne<{ sum: string }>();

    // Aging breakdown
    const agingBreakdown = await this.loans
      .createQueryBuilder('loan')
      .select('loan.agingBucket', 'agingBucket')
      .addSelect('COUNT(loan.id)', 'count')
      .addSelect('COALESCE(SUM(loan.outstandingBalance), 0)', 'outstandingBalance')
      .groupBy('loan.agingBucket')
      .getRawMany();

    // Recent Loans
    const recentLoans = await this.loans.find({
      take: 5,
      order: { createdAt: 'DESC' },
      relations: { borrower: true, product: true },
    });

    return {
      totalLoans,
      activeLoans,
      overdueLoans,
      settledLoans,
      totalDisbursedAmount: Number(disbursed?.sum || 0),
      totalOutstandingAmount: Number(outstanding?.sum || 0),
      totalRepaymentsAmount: Number(repayments?.sum || 0),
      agingBreakdown,
      recentLoans: recentLoans.map((l) => ({
        ...l,
        borrower: l.borrower
          ? { fullName: l.borrower.fullName, phone: l.borrower.phone }
          : l.borrower,
        product: l.product ? { name: l.product.name } : l.product,
      })),
    };
  }

  async getCollectors() {
    const collectors = await this.users.find({
      where: { role: UserRole.COLLECTOR },
      relations: { assignedLoans: { loan: { borrower: true } } },
    });

    const now = new Date();
    return collectors.map((c) => {
      const activeAssignments = (c.assignedLoans || []).filter(
        (a) => a.isActive && a.loan && Number(a.loan.outstandingBalance) > 0,
      );
      const levels = [
        ...new Set(
          activeAssignments
            .map((a) => getCollectionLevel(a.loan.dueDate, now))
            .filter(isQueueableLevel),
        ),
      ];
      const workedLevel = levels.length === 1 ? levels[0] : levels.length > 1 ? 'MIXED' : null;
      const workedLevelLabel =
        workedLevel && workedLevel !== 'MIXED'
          ? LEVEL_LABEL[workedLevel as CollectionLevel]
          : workedLevel;
      const maxCap =
        workedLevel && workedLevel !== 'MIXED'
          ? maxCapacityForLevel(workedLevel as CollectionLevel)
          : 45;

      return {
        id: c.id,
        fullName: c.fullName,
        phone: c.phone,
        email: c.email,
        isActive: c.isActive,
        activeAssignmentsCount: activeAssignments.length,
        workedLevel,
        workedLevelLabel,
        maxCapacity: maxCap,
        assignedLoans: activeAssignments.map((a) => ({
          id: a.id,
          loanId: a.loan.id,
          loanNumber: a.loan.loanNumber,
          borrowerName: a.loan.borrower?.fullName || 'Borrower',
          borrowerPhone: a.loan.borrower?.phone || '',
          outstandingBalance: Number(a.loan.outstandingBalance),
          dueDate: a.loan.dueDate,
          assignedAt: a.assignedAt,
        })),
      };
    });
  }

  async toggleCollectorStatus(id: string) {
    const collector = await this.users.findOne({ where: { id, role: UserRole.COLLECTOR } });
    if (!collector) throw new NotFoundException('Collector not found');
    collector.isActive = !collector.isActive;
    await this.users.save(collector);
    return { id: collector.id, isActive: collector.isActive };
  }

  async createCollector(dto: { fullName: string; phone: string; email?: string; password: string }) {
    if (!dto.fullName || !dto.phone || !dto.password) {
      throw new BadRequestException('Full name, phone, and password are required');
    }
    const normalizedPhone = normalizePhone(dto.phone);
    const existing = await this.users.findOne({
      where: [{ phone: normalizedPhone }, ...(dto.email ? [{ email: dto.email.toLowerCase() }] : [])],
    });
    if (existing) {
      throw new BadRequestException('A user with this phone or email already exists');
    }
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const collector = this.users.create({
      fullName: dto.fullName.trim(),
      phone: normalizedPhone,
      email: dto.email ? dto.email.trim().toLowerCase() : null,
      passwordHash,
      role: UserRole.COLLECTOR,
      kycStatus: KycStatus.VERIFIED,
      isActive: true,
    });
    const saved = await this.users.save(collector);
    return {
      id: saved.id,
      fullName: saved.fullName,
      phone: saved.phone,
      email: saved.email,
      isActive: saved.isActive,
      activeAssignmentsCount: 0,
      workedLevel: null,
      workedLevelLabel: null,
      maxCapacity: 45,
    };
  }

  async getLedgerEntries(take = 50) {
    const entries = await this.ledger.find({
      take,
      order: { createdAt: 'DESC' },
      relations: { loan: { borrower: true } },
    });

    return entries.map((e) => ({
      ...e,
      loan: e.loan
        ? {
            loanNumber: e.loan.loanNumber,
            borrower: e.loan.borrower ? { fullName: e.loan.borrower.fullName } : null,
          }
        : e.loan,
    }));
  }
}
