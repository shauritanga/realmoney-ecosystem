import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { Loan } from '../database/entities/loan.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { AccountType, EntryType, LoanStatus } from '../database/enums.js';
import { SettingsService } from '../settings/settings.service.js';
import { startOfUtcDay } from '../collections/date-range.js';
import { accruePenalty, agingBucketFor, daysOverdueFor } from './penalty.js';

/** Statuses a penalty can be charged against. */
const CHARGEABLE = [
  LoanStatus.ACTIVE,
  LoanStatus.OVERDUE,
  LoanStatus.DEFAULTED,
  LoanStatus.DISBURSED,
];

/**
 * One sweep never touches more than this many loans, so the first run after the
 * feature ships cannot turn a page load into a minute-long transaction.
 */
const SWEEP_BATCH = 500;

/**
 * Charges late-payment penalties and keeps `daysOverdue` / `agingBucket` honest.
 *
 * Deliberately not a cron, for the same reasons as `PtpSweepService`: this repo has
 * no scheduler, queue or worker, and `@nestjs/schedule` would add a deployment
 * concern and duplicate work across replicas for a state change that is a pure
 * function of a date. The sweep runs at the top of the endpoints about to read a
 * balance, is idempotent, and costs one indexed scan.
 *
 * Unlike the PTP sweep, this one cannot be derived on read and persisted later: the
 * payment waterfall allocates against a stored `penaltyAmount`, and the ledger needs
 * a real PENALTY_ACCRUAL entry. `Loan.penaltyAccruedThrough` is the idempotency
 * watermark -- each run charges only the whole days since it and then advances it.
 */
@Injectable()
export class PenaltyAccrualService {
  private readonly logger = new Logger(PenaltyAccrualService.name);

  constructor(
    @InjectRepository(Loan) private readonly loans: Repository<Loan>,
    private readonly settings: SettingsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Charges every loan that has fallen further behind since it was last swept.
   *
   * Safe to call on every request and safe to run concurrently: the `WHERE` clause on
   * the update carries the watermark the charge was computed from, so if two requests
   * race, exactly one of them wins and the other's update affects no rows.
   *
   * @param loanIds restricts the sweep to these loans; omit to sweep everything due.
   */
  async sweep(now: Date = new Date(), loanIds?: string[]): Promise<number> {
    if (loanIds && loanIds.length === 0) return 0;

    const due = await this.loans.find({
      where: {
        status: In(CHARGEABLE),
        dueDate: LessThan(now),
        ...(loanIds ? { id: In(loanIds) } : {}),
      },
      relations: { product: true },
      order: { dueDate: 'ASC' },
      take: SWEEP_BATCH,
    });
    if (!due.length) return 0;

    const config = await this.settings.get();
    let charged = 0;

    for (const loan of due) {
      const accrual = accruePenalty(
        {
          dueDate: loan.dueDate,
          totalAmount: Number(loan.totalAmount),
          totalPaid: Number(loan.totalPaid),
          principalAmount: Number(loan.principalAmount),
          penaltyAmount: Number(loan.penaltyAmount),
          penaltyAccruedThrough: loan.penaltyAccruedThrough,
        },
        {
          ratePerDay: Number(loan.product?.latePenaltyRateDaily ?? 1),
          maxPercentOfPrincipal: config.maxPenaltyPercentOfPrincipal,
        },
        now,
      );

      const aging = this.agingFor(loan, now);

      if (!accrual) {
        // Nothing to charge -- fully paid, capped out, or already swept today. The
        // aging figures still need to be true, and the watermark still needs to move
        // so those days are not re-counted the moment the balance changes.
        await this.loans.update(
          { id: loan.id },
          { ...aging, penaltyAccruedThrough: now },
        );
        continue;
      }

      await this.dataSource.transaction(async (manager) => {
        const penaltyAmount = round(Number(loan.penaltyAmount) + accrual.amount);
        const outstandingBalance = round(Number(loan.outstandingBalance) + accrual.amount);

        // Guards against double-billing when two requests sweep the same loan at once:
        // whoever commits first moves the watermark into today, and the other's WHERE
        // no longer matches.
        //
        // The condition is deliberately "not yet charged today" rather than "the
        // watermark still equals what I read". Equality cannot be used here: Postgres
        // stores timestamptz to microseconds while a JavaScript Date holds only
        // milliseconds, so a watermark written by SQL (now() in the migration
        // back-fill, for instance) never equals the value TypeORM reads back, and the
        // update silently matched nothing -- no charge, and no advance of the
        // watermark, so the loan stayed stuck that way forever. Day granularity is
        // also the real invariant: accrual bills whole days, at most once a day.
        const dayStart = startOfUtcDay(now);
        const result = await manager
          .createQueryBuilder()
          .update(Loan)
          .set({
            penaltyAmount,
            outstandingBalance,
            penaltyAccruedThrough: accrual.through,
            ...aging,
          })
          .where('id = :id', { id: loan.id })
          .andWhere(
            '("penaltyAccruedThrough" IS NULL OR "penaltyAccruedThrough" < :dayStart)',
            { dayStart },
          )
          .execute();
        if (!result.affected) return;

        const description =
          `Late penalty, ${accrual.days} day(s) on ${loan.loanNumber}` +
          (accrual.capped ? ' (ceiling reached)' : '');

        await manager.save(LedgerEntry, [
          manager.create(LedgerEntry, {
            loanId: loan.id,
            entryType: EntryType.PENALTY_ACCRUAL,
            accountType: AccountType.LOAN_RECEIVABLE,
            debit: accrual.amount,
            credit: 0,
            description,
          }),
          manager.create(LedgerEntry, {
            loanId: loan.id,
            entryType: EntryType.PENALTY_ACCRUAL,
            accountType: AccountType.PENALTY_INCOME,
            debit: 0,
            credit: accrual.amount,
            description,
          }),
        ]);

        charged += 1;
      });
    }

    if (charged) this.logger.log(`Accrued late penalties on ${charged} loan(s).`);
    return charged;
  }

  /**
   * Age and status, derived from the due date.
   *
   * Nothing in the codebase moved a loan from ACTIVE to OVERDUE -- the seeds set it
   * directly and everything else derived lateness live from `dueDate`. Persisting it
   * here is what finally makes the admin dashboard's overdue count and the
   * `?agingBucket=` filter agree with the collections queue.
   */
  private agingFor(loan: Loan, now: Date) {
    const daysOverdue = daysOverdueFor(loan.dueDate, now);
    const agingBucket = agingBucketFor(daysOverdue);
    const status =
      daysOverdue > 0 && (loan.status === LoanStatus.ACTIVE || loan.status === LoanStatus.DISBURSED)
        ? LoanStatus.OVERDUE
        : loan.status;
    return { daysOverdue, agingBucket, status };
  }
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
