import { OnboardingService } from '../onboarding/onboarding.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  CASE_NUMBER_CAPACITY_WARNING,
  CASE_NUMBER_SPACE,
  nextCaseNumber,
} from './loan-number.js';
import { Logger, Injectable, NotFoundException, BadRequestException, Optional } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service.js';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { ClickPesaService } from '../clickpesa/clickpesa.service.js';
import { LoanStatus, AgingBucket, EntryType, AccountType } from '../database/enums.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanProduct } from '../database/entities/loan-product.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { borrowingLimit } from './borrowing-limit.js';
import { totalProcessingFee } from '../clickpesa/clickpesa-fees.js';

@Injectable()
export class LoansService {
  private readonly logger = new Logger(LoansService.name);

  constructor(
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(LoanProduct)
    private readonly products: Repository<LoanProduct>,
    @InjectRepository(LedgerEntry)
    private readonly ledger: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
    private readonly clickPesaService: ClickPesaService,
    private readonly settings: SettingsService,
    private readonly onboarding: OnboardingService,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  private async notifyBorrower(borrowerId: string, title: string, body: string, data: Record<string, string>) {
    try {
      await this.notifications?.sendToBorrower(borrowerId, title, body, data);
    } catch {
      // Push is best-effort and must never fail the loan flow.
    }
  }

  async getProducts() {
    const [products, settings] = await Promise.all([
      this.products.find({ where: { isActive: true } }), this.settings.get(),
    ]);
    return products.map((product) => ({ ...product, interestRateMonthly: settings.interestRateMonthly }));
  }

  async getBorrowingLimit(borrowerId: string) {
    const latest = await this.loans.findOne({
      where: { borrowerId, status: LoanStatus.SETTLED },
      order: { createdAt: 'DESC', id: 'DESC' },
    });
    return borrowingLimit(latest);
  }

  async getAllLoans(filters?: { status?: LoanStatus; agingBucket?: AgingBucket; borrowerId?: string }) {
    const loans = await this.loans.find({
      where: {
        ...(filters?.status && { status: filters.status }),
        ...(filters?.agingBucket && { agingBucket: filters.agingBucket }),
        ...(filters?.borrowerId && { borrowerId: filters.borrowerId }),
      },
      relations: {
        borrower: true,
        product: true,
        assignments: { collector: true },
      },
      order: { createdAt: 'DESC' },
    });

    // Mirror Prisma selects: trim borrower/collector payloads, keep active assignments only.
    return loans.map((loan) => ({
      ...loan,
      borrower: loan.borrower
        ? {
            id: (loan.borrower as any).id,
            fullName: (loan.borrower as any).fullName,
            phone: (loan.borrower as any).phone,
            email: (loan.borrower as any).email,
            nationalId: (loan.borrower as any).nationalId,
          }
        : loan.borrower,
      assignments: (loan.assignments || [])
        .filter((a) => a.isActive)
        .map((a) => ({
          ...a,
          collector: a.collector
            ? {
                id: (a.collector as any).id,
                fullName: (a.collector as any).fullName,
                phone: (a.collector as any).phone,
              }
            : a.collector,
        })),
    }));
  }

  async getLoanById(id: string) {
    const loan = await this.loans.findOne({
      where: { id },
      relations: {
        borrower: true,
        product: true,
        repayments: true,
        assignments: { collector: true },
        interactionLogs: { collector: true },
        promisesToPay: true,
        ledgerEntries: true,
      },
      order: {
        repayments: { createdAt: 'DESC' },
        interactionLogs: { createdAt: 'DESC' },
        promisesToPay: { promisedDate: 'DESC' },
        ledgerEntries: { createdAt: 'DESC' },
      },
    });

    if (!loan) {
      throw new NotFoundException('Loan not found');
    }

    loan.assignments = (loan.assignments || []).filter((a) => a.isActive);
    return loan;
  }

  async getMyLoans(borrowerId: string) {
    return this.loans.find({
      where: { borrowerId },
      relations: { product: true, repayments: true },
      order: { createdAt: 'DESC', repayments: { createdAt: 'DESC' } },
    });
  }

  async applyForLoan(
    borrowerId: string,
    dto: { productId: string; principalAmount: number; tenureDays: number },
  ) {
    await this.onboarding.assertCanApply(borrowerId);
    const product = await this.products.findOne({ where: { id: dto.productId } });

    if (!product || !product.isActive) {
      throw new BadRequestException('Selected loan product is invalid or inactive');
    }

    if (!Number.isFinite(dto.principalAmount) || dto.principalAmount <= 0) {
      throw new BadRequestException('Loan amount must be a positive number');
    }
    const limit = await this.getBorrowingLimit(borrowerId);
    if (dto.principalAmount > limit.amount) {
      throw new BadRequestException(`Your borrowing limit is TZS ${limit.amount}`);
    }

    if (dto.principalAmount < Number(product.minAmount) || dto.principalAmount > Number(product.maxAmount)) {
      throw new BadRequestException(
        `Amount must be between TZS ${product.minAmount} and TZS ${product.maxAmount}`,
      );
    }

    if (!Number.isInteger(dto.tenureDays) || dto.tenureDays < product.minTenureDays || dto.tenureDays > product.maxTenureDays) {
      throw new BadRequestException('Select a valid repayment duration for this product');
    }

    // Check for active unsettled loans
    const activeLoan = await this.loans.findOne({
      where: {
        borrowerId,
        status: In([LoanStatus.PENDING, LoanStatus.APPROVED, LoanStatus.DISBURSED, LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED]),
      },
    });

    if (activeLoan) {
      throw new BadRequestException('You already have an active or pending loan application');
    }

    // Calculations
    const { interestRateMonthly } = await this.settings.get();
    const weeklyRate = interestRateMonthly / 100;
    const interest = Math.round(dto.principalAmount * weeklyRate * (dto.tenureDays / 7));
    const fee = totalProcessingFee(dto.principalAmount);
    const totalPayable = dto.principalAmount + interest + fee;

    // A short number a collector can read out on a call and a borrower can repeat
    // back. See loan-number.ts for the 9,000-loan ceiling this format implies.
    const loanCount = await this.loans.count();
    if (loanCount >= CASE_NUMBER_CAPACITY_WARNING) {
      this.logger.warn(
        `Case numbers are ${Math.round((loanCount / CASE_NUMBER_SPACE) * 100)}% ` +
          'allocated. Widen the format in loan-number.ts before the space fills.',
      );
    }
    const loanNumber = await nextCaseNumber(
      (candidate) => this.loans.existsBy({ loanNumber: candidate }),
      loanCount,
    );

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + dto.tenureDays);

    return this.loans.save(
      this.loans.create({
        loanNumber,
        borrowerId,
        productId: product.id,
        principalAmount: dto.principalAmount,
        interestAmount: interest,
        processingFee: fee,
        penaltyAmount: 0,
        totalAmount: totalPayable,
        outstandingBalance: totalPayable,
        totalPaid: 0,
        tenureDays: dto.tenureDays,
        dueDate,
        status: LoanStatus.PENDING,
      }),
    );
  }

  async approveLoan(loanId: string, adminId: string) {
    const loan = await this.getLoanById(loanId);
    if (loan.status !== LoanStatus.PENDING) {
      throw new BadRequestException(`Cannot approve loan with status ${loan.status}`);
    }

    await this.onboarding.assertCanApply(loan.borrowerId);

    await this.loans.update(
      { id: loanId },
      { status: LoanStatus.APPROVED, approvedBy: adminId, approvedAt: new Date() },
    );
    void this.notifyBorrower(
      loan.borrowerId,
      'Loan approved',
      `Your loan ${loan.loanNumber} of TZS ${Number(loan.principalAmount)} was approved. The payout is on its way.`,
      { loanId: loan.id, type: 'loan_approved' },
    );
    return this.loans.findOneBy({ id: loanId });
  }

  async disburseLoan(loanId: string, adminId: string) {
    const loan = await this.getLoanById(loanId);
    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException(`Loan must be in APPROVED status to disburse. Current: ${loan.status}`);
    }

    await this.onboarding.assertCanApply(loan.borrowerId);

    const disbursement = await this.clickPesaService.disburseLoan({
      loanId: loan.id,
      phone: loan.borrower.phone,
      amount: Number(loan.principalAmount),
    });

    if (!disbursement.success) {
      throw new BadRequestException(`Disbursement failed: ${disbursement.message}`);
    }

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loan.tenureDays);

    void this.notifyBorrower(
      loan.borrowerId,
      'Money sent',
      `TZS ${Number(loan.principalAmount)} sent to ${loan.borrower.phone}. Repay TZS ${Number(loan.outstandingBalance)} by ${dueDate.toISOString().slice(0, 10)}.`,
      { loanId: loan.id, type: 'loan_disbursed' },
    );

    // Double-entry bookkeeping (atomic).
    //
    // The receivable is debited with everything the borrower owes -- principal,
    // interest and processing fee -- not principal alone. Repayment credits
    // LOAN_RECEIVABLE with the full amount collected, so debiting only the principal
    // here left every settled loan sitting at -(interest + fee) and kept
    // INTEREST_INCOME and FEE_INCOME permanently at zero. The contra entries below
    // recognise that income at origination, which for a 14-30 day loan is a
    // deliberate policy choice rather than accrual across the tenure.
    const principal = Number(loan.principalAmount);
    const interest = Number(loan.interestAmount);
    const fee = Number(loan.processingFee);
    const receivable = Math.round((principal + interest + fee) * 100) / 100;

    await this.dataSource.transaction(async (manager) => {
      await manager.update(Loan, { id: loanId }, {
        status: LoanStatus.ACTIVE,
        disbursedAt: now,
        disbursementDate: now,
        dueDate,
        // Frozen here so an extension can move `dueDate` without moving the date the
        // borrowing limit measures on-time settlement against.
        originalDueDate: dueDate,
        // Start the penalty clock at the due date, so the first sweep after the loan
        // falls behind charges from day one rather than from whenever it first ran.
        penaltyAccruedThrough: dueDate,
      });

      const entry = (accountType: AccountType, debit: number, credit: number, description: string) =>
        manager.create(LedgerEntry, {
          loanId: loan.id,
          entryType: EntryType.DISBURSEMENT,
          accountType,
          debit,
          credit,
          description,
        });

      const entries = [
        entry(
          AccountType.LOAN_RECEIVABLE,
          receivable,
          0,
          `Loan receivable raised for ${loan.borrower.phone} (${disbursement.transId})`,
        ),
        entry(
          AccountType.CASH_CLICKPESA,
          0,
          principal,
          `Cash payout via ClickPesa (${disbursement.transId})`,
        ),
      ];

      // A zero-value entry is noise in the ledger view, and a zero-rate product or a
      // waived fee is legitimate.
      if (interest > 0) {
        entries.push(
          entry(AccountType.INTEREST_INCOME, 0, interest, `Interest recognised on ${loan.loanNumber}`),
        );
      }
      if (fee > 0) {
        entries.push(
          entry(AccountType.FEE_INCOME, 0, fee, `Processing fee recognised on ${loan.loanNumber}`),
        );
      }

      await manager.save(LedgerEntry, entries);
    });

    return this.loans.findOne({
      where: { id: loanId },
      relations: { borrower: true, product: true },
    });
  }
}
