import { OnboardingService } from '../onboarding/onboarding.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { SelcomService } from '../selcom/selcom.service.js';
import { LoanStatus, AgingBucket, EntryType, AccountType } from '../database/enums.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanProduct } from '../database/entities/loan-product.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { borrowingLimit } from './borrowing-limit.js';

@Injectable()
export class LoansService {
  constructor(
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(LoanProduct)
    private readonly products: Repository<LoanProduct>,
    @InjectRepository(LedgerEntry)
    private readonly ledger: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
    private readonly selcomService: SelcomService,
    private readonly settings: SettingsService,
    private readonly onboarding: OnboardingService,
  ) {}

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
    const fee = Math.round(dto.principalAmount * (Number(product.processingFeeRate) / 100));
    const totalPayable = dto.principalAmount + interest + fee;

    const loanCount = await this.loans.count();
    const loanNumber = `RM-${new Date().getFullYear()}-${String(loanCount + 1).padStart(4, '0')}`;

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

    await this.loans.update(
      { id: loanId },
      { status: LoanStatus.APPROVED, approvedBy: adminId, approvedAt: new Date() },
    );
    return this.loans.findOneBy({ id: loanId });
  }

  async disburseLoan(loanId: string, adminId: string) {
    const loan = await this.getLoanById(loanId);
    if (loan.status !== LoanStatus.APPROVED) {
      throw new BadRequestException(`Loan must be in APPROVED status to disburse. Current: ${loan.status}`);
    }

    const disbursement = await this.selcomService.disburseLoan({
      loanId: loan.id,
      phone: loan.borrower.phone,
      amount: Number(loan.principalAmount),
      adminId,
    });

    if (!disbursement.success) {
      throw new BadRequestException(`Disbursement failed: ${disbursement.message}`);
    }

    const now = new Date();
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + loan.tenureDays);

    // Double-entry bookkeeping (atomic):
    // Debit: LOAN_RECEIVABLE (Company asset increases)
    // Credit: CASH_SELCOM (Cash transferred out)
    await this.dataSource.transaction(async (manager) => {
      await manager.update(Loan, { id: loanId }, {
        status: LoanStatus.ACTIVE,
        disbursedAt: now,
        disbursementDate: now,
        dueDate,
      });
      await manager.save(
        manager.create(LedgerEntry, {
          loanId: loan.id,
          entryType: EntryType.DISBURSEMENT,
          accountType: AccountType.LOAN_RECEIVABLE,
          debit: Number(loan.principalAmount),
          credit: 0,
          description: `Principal disbursed to ${loan.borrower.phone} (${disbursement.transId})`,
        }),
      );
      await manager.save(
        manager.create(LedgerEntry, {
          loanId: loan.id,
          entryType: EntryType.DISBURSEMENT,
          accountType: AccountType.CASH_SELCOM,
          debit: 0,
          credit: Number(loan.principalAmount),
          description: `Cash payout via Selcom B2C (${disbursement.transId})`,
        }),
      );
    });

    return this.loans.findOne({
      where: { id: loanId },
      relations: { borrower: true, product: true },
    });
  }
}
