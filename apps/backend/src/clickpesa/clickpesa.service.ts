import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { ClickPesaClient } from './clickpesa.client.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { CollectorAssignment } from '../database/entities/collector-assignment.entity.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { AccountType, EntryType, LoanStatus, PtpStatus, RepaymentChannel, RepaymentStatus, UserRole } from '../database/enums.js';
import type { RepaymentPurpose } from '../database/enums.js';
import { LoanExtension } from '../database/entities/loan-extension.entity.js';
import { resolveOnPayment } from '../collections/ptp-status.js';
import { allocatePayment, allocationTotal } from '../loans/allocation.js';
import { extendedDueDate } from '../loans/extension.js';

export type PaymentActor = { id: string; role: UserRole };

export interface TriggerPushParams {
  loanId: string;
  amount: number;
  /** REPAYMENT pays the debt down; EXTENSION_FEE buys time and leaves it untouched. */
  purpose?: RepaymentPurpose;
  /** Prompt this number instead of the borrower's, when someone else is paying. */
  payerPhone?: string;
  payerName?: string;
}

@Injectable()
export class ClickPesaService {
  constructor(private readonly client: ClickPesaClient, private readonly db: DataSource) {}

  /**
   * Admins see everything, borrowers see their own loan, and a collector needs an
   * active assignment.
   *
   * Also used by `CollectionsService` to guard interaction logging and case reads, so
   * the message is about the loan rather than specifically about payments.
   */
  async assertAccess(loan: Loan, actor: PaymentActor) {
    if (actor.role === UserRole.ADMIN || (actor.role === UserRole.BORROWER && loan.borrowerId === actor.id)) return;
    if (actor.role === UserRole.COLLECTOR && await this.db.getRepository(CollectorAssignment).existsBy({
      loanId: loan.id, collectorId: actor.id, isActive: true,
    })) return;
    throw new ForbiddenException('This loan is not assigned to you');
  }

  async triggerUssdPush(params: TriggerPushParams, actor: PaymentActor) {
    if (typeof params.loanId !== 'string' || !/^[0-9a-f-]{36}$/i.test(params.loanId)) throw new BadRequestException('Invalid loan ID');
    const purpose: RepaymentPurpose = params.purpose ?? 'REPAYMENT';
    const amount = params.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 500 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new BadRequestException('ClickPesa mobile-money payments must be at least TZS 500 and have at most two decimal places');
    }
    const prepared = await this.db.transaction(async manager => {
      const loan = await manager.findOne(Loan, { where: { id: params.loanId }, lock: { mode: 'pessimistic_write' } });
      if (!loan) throw new NotFoundException('Loan not found');
      await this.assertAccess(loan, actor);
      if (![LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED, LoanStatus.DISBURSED].includes(loan.status)) {
        throw new BadRequestException('Payment must not exceed the outstanding balance of an active loan');
      }
      // The balance ceiling applies to money that pays the debt down. An extension fee
      // is priced off the balance rather than drawn from it, so it is not bounded by
      // it -- though in practice a percentage of the balance is always below it.
      if (purpose === 'REPAYMENT' && amount > Number(loan.outstandingBalance)) {
        throw new BadRequestException('Payment must not exceed the outstanding balance of an active loan');
      }
      const pending = await manager.findOne(Repayment, { where: { loanId: loan.id, channel: RepaymentChannel.CLICKPESA_USSD_PUSH, status: RepaymentStatus.PENDING } });
      if (pending) return { orderId: pending.providerReference!, phone: '', existing: true };
      const fullLoan = await manager.findOneOrFail(Loan, { where: { id: loan.id }, relations: { borrower: true } });
      // A friend or relative settling the debt is common enough that collectors were
      // working around its absence. The override is normalised by exactly the same
      // rules as the borrower's own number, and recorded on the repayment rather than
      // written back to the customer's profile -- a number given on a collections call
      // is not consent to store it against them.
      const thirdParty = typeof params.payerPhone === 'string' && params.payerPhone.trim().length > 0;
      let phone = (thirdParty ? params.payerPhone! : fullLoan.borrower.phone).replace(/[\s()+-]/g, '');
      if (/^0[67]\d{8}$/.test(phone)) phone = `255${phone.slice(1)}`;
      if (!/^255[67]\d{8}$/.test(phone)) {
        throw new BadRequestException(
          thirdParty
            ? 'Enter a valid Tanzanian mobile number for the person paying'
            : 'A valid Tanzanian mobile number is required',
        );
      }
      const orderId = `RM${randomBytes(9).toString('hex')}`;
      // Authenticate before reserving an order, so invalid credentials cannot
      // strand a repayment that was never sent to the provider.
      await this.client.ensureReady();
      await manager.save(Repayment, manager.create(Repayment, {
        loanId: loan.id, amount, channel: RepaymentChannel.CLICKPESA_USSD_PUSH,
        providerReference: orderId, initiatedById: actor.id, status: RepaymentStatus.PENDING,
        purpose,
        payerPhone: thirdParty ? phone : null,
        payerName: thirdParty && params.payerName ? params.payerName.trim().slice(0, 120) : null,
      }));
      return { orderId, phone, existing: false };
    });
    const { orderId } = prepared;
    // Not `success: true`: nothing was sent, and every client took that flag at face
    // value and told the collector "Request sent" while no prompt had gone anywhere.
    if (prepared.existing) {
      return {
        success: false,
        pending: true,
        orderId,
        message: 'A payment is already pending on this loan. Check its status before starting another.',
      };
    }
    try {
      const preview = await this.client.request('/payments/preview-ussd-push-request', {
        amount: amount.toFixed(2), currency: 'TZS', orderReference: orderId,
        phoneNumber: prepared.phone, fetchSenderDetails: false,
      });
      const available = Array.isArray(preview.activeMethods)
        && preview.activeMethods.some((method: any) => method?.status === 'AVAILABLE');
      if (!available) {
        const reason = preview.activeMethods?.find((method: any) => method?.message)?.message;
        throw new BadRequestException(reason || 'No ClickPesa mobile-money collection method is available');
      }
      const data = await this.client.request('/payments/initiate-ussd-push-request', {
        amount: amount.toFixed(2), currency: 'TZS', orderReference: orderId, phoneNumber: prepared.phone,
      });
      if (data.orderReference !== orderId || !['PROCESSING', 'SUCCESS', 'SETTLED'].includes(data.status)) {
        return { success: false, orderId, message: 'Payment was not confirmed. Check its status before retrying.' };
      }
      return { success: true, orderId, message: 'Check your phone and authorize the mobile-money prompt.' };
    } catch (error: any) {
      const providerStatus = typeof error?.getStatus === 'function' ? error.getStatus() : 0;
      if (providerStatus >= 400 && providerStatus < 500) {
        await this.db.getRepository(Repayment).update(
          { providerReference: orderId },
          { status: RepaymentStatus.FAILED, notes: error.message },
        );
      }
      // An HTTP timeout does not prove that the provider rejected the push.
      return {
        success: false,
        retryable: providerStatus < 400 || providerStatus >= 500,
        orderId,
        message: error?.message || 'Dispatch could not be confirmed. Check payment status before retrying.',
      };
    }
  }

  async disburseLoan(params: { loanId: string; phone: string; amount: number }) {
    const phone = params.phone.replace(/[\s()+-]/g, '').replace(/^0([67])/, '255$1');
    if (!/^255[67]\d{8}$/.test(phone)) return { success: false, message: 'A valid Tanzanian mobile number is required' };
    if (!Number.isFinite(params.amount) || params.amount <= 0) return { success: false, message: 'Invalid payout amount' };
    const orderReference = `P${randomBytes(9).toString('hex')}`;
    try {
      const response = await this.client.request('/payouts/create-mobile-money-payout', {
        amount: params.amount, phoneNumber: phone, currency: 'TZS', orderReference,
      });
      const success = response.orderReference === orderReference && ['AUTHORIZED', 'SUCCESS'].includes(response.status);
      return { success, transId: response.id, message: success ? 'ClickPesa payout accepted' : 'ClickPesa payout was not accepted' };
    } catch (error: any) {
      return { success: false, message: error?.message || 'ClickPesa payout failed' };
    }
  }

  async reconcile(orderId: string, actor?: PaymentActor) {
    if (typeof orderId !== 'string' || !/^RM[a-f0-9]{18}$/.test(orderId)) throw new BadRequestException('Invalid payment reference');
    const existing = await this.db.getRepository(Repayment).findOne({ where: { providerReference: orderId, channel: RepaymentChannel.CLICKPESA_USSD_PUSH }, relations: { loan: true } });
    if (!existing) throw new NotFoundException('Payment not found');
    if (actor) await this.assertAccess(existing.loan, actor);
    if (existing.status === RepaymentStatus.COMPLETED) return this.result(existing.status);
    // Treat webhook data only as a notification. Fetch authoritative payment details.
    const payments = await this.client.request(`/payments/${encodeURIComponent(orderId)}`);
    if (!Array.isArray(payments)) throw new ServiceUnavailableException('Invalid ClickPesa status response');
    const matching = payments.filter(p => p.orderReference === orderId && p.clientId === this.client.clientId);
    const payment = matching.find(p => ['SUCCESS', 'SETTLED'].includes(p.status)) ?? matching.find(p => p.status === 'PROCESSING') ?? matching[0];
    if (!payment) return this.result(RepaymentStatus.PENDING);
    return this.db.transaction(async manager => {
      // Serialize all balance changes for the loan, then re-read the payment under lock.
      const loan = await manager.findOneOrFail(Loan, { where: { id: existing.loanId }, lock: { mode: 'pessimistic_write' } });
      const repayment = await manager.findOneOrFail(Repayment, { where: { id: existing.id }, lock: { mode: 'pessimistic_write' } });
      if (repayment.status === RepaymentStatus.COMPLETED) return this.result(repayment.status);
      if (['SUCCESS', 'SETTLED'].includes(payment.status)) {
        const amount = Number(payment.collectedAmount);
        if (!Number.isFinite(amount) || amount <= 0 || amount !== Number(repayment.amount) || payment.collectedCurrency !== 'TZS' || typeof payment.id !== 'string' || !payment.id) {
          throw new BadRequestException('Payment details do not match the requested repayment');
        }
        const isExtension = repayment.purpose === 'EXTENSION_FEE';
        // An extension fee is priced off the balance, not drawn from it, so the
        // ceiling applies only to money that actually settles the debt.
        if (!isExtension && amount > Number(loan.outstandingBalance)) throw new BadRequestException('Payment exceeds remaining balance; manual reconciliation required');
        const now = new Date();
        repayment.status = RepaymentStatus.COMPLETED;
        repayment.providerTransId = payment.id;
        repayment.paidAt = now;

        if (isExtension) {
          await this.applyExtension(manager, loan, repayment, amount, orderId, now);
        } else {
          await this.applyRepayment(manager, loan, repayment, amount, orderId, now);
        }
      } else if (payment.status === 'FAILED') repayment.status = RepaymentStatus.FAILED;
      repayment.rawWebhookPayload = { id: payment.id, status: payment.status, orderReference: orderId };
      await manager.save(Repayment, repayment);
      return this.result(repayment.status);
    });
  }

  /**
   * Credits a payment against the debt, recording what each shilling settled.
   *
   * The allocation waterfall is penalty -> interest -> fee -> principal. What is
   * still owed per leg is re-derived by running the *whole* payment history through
   * the same waterfall, rather than by summing the per-repayment legs: that makes the
   * figure self-consistent, needs no extra query, and copes with repayments made
   * before the legs existed, whose columns are all zero because nothing ever recorded
   * what they settled.
   *
   * The four legs always sum to the amount, because
   * `outstandingBalance = principal + interest + fee + penalty - totalPaid`.
   */
  private async applyRepayment(
    manager: EntityManager,
    loan: Loan,
    repayment: Repayment,
    amount: number,
    orderId: string,
    now: Date,
  ) {
    const contracted = {
      penalty: Number(loan.penaltyAmount),
      interest: Number(loan.interestAmount),
      fee: Number(loan.processingFee),
      principal: Number(loan.principalAmount),
    };
    const alreadyApplied = allocatePayment(Number(loan.totalPaid), contracted);
    const owed = {
      penalty: round(contracted.penalty - alreadyApplied.penalty),
      interest: round(contracted.interest - alreadyApplied.interest),
      fee: round(contracted.fee - alreadyApplied.fee),
      principal: round(contracted.principal - alreadyApplied.principal),
    };

    const allocation = allocatePayment(amount, owed);
    repayment.penaltyPaid = allocation.penalty;
    repayment.interestPaid = allocation.interest;
    repayment.feePaid = allocation.fee;
    repayment.principalPaid = allocation.principal;

    loan.outstandingBalance = round(Number(loan.outstandingBalance) - amount);
    loan.totalPaid = round(Number(loan.totalPaid) + amount);
    if (loan.outstandingBalance === 0) { loan.status = LoanStatus.SETTLED; loan.settledAt = now; }
    await manager.save(Loan, loan);
    await this.honorPromises(manager, loan, now);

    const partial = loan.outstandingBalance > 0;
    const label = partial
      ? `Part payment ${allocationTotal(allocation)} of ${orderId}`
      : `Loan repayment ${orderId}`;

    await manager.save(LedgerEntry, [
      manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.REPAYMENT, accountType: AccountType.CASH_CLICKPESA, debit: amount, credit: 0, description: `ClickPesa repayment ${orderId}` }),
      manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.REPAYMENT, accountType: AccountType.LOAN_RECEIVABLE, debit: 0, credit: amount, description: label }),
    ]);
  }

  /**
   * Grants an extension: the due date moves out by one more full tenure and the debt
   * is left exactly as it was.
   *
   * Nothing here touches `outstandingBalance`, `totalPaid` or `totalAmount`. That is
   * the whole point -- the borrower bought time, not a discount -- and it is also
   * what stops the borrower app's `paid / total` progress bar running backwards.
   *
   * The new due date is re-derived rather than stored at push time: it is a pure
   * function of the loan's current due date and tenure, neither of which can change
   * between the push and this call, because only an extension moves `dueDate` and only
   * one payment may be pending at a time. So the date applied is the date quoted.
   *
   * Accrued penalty is deliberately left standing. The borrower is paying for time,
   * not absolution; because `dueDate` has moved the loan is no longer overdue, so the
   * accrual simply stops and the penalty freezes where it is.
   */
  private async applyExtension(
    manager: EntityManager,
    loan: Loan,
    repayment: Repayment,
    amount: number,
    orderId: string,
    now: Date,
  ) {
    const previousDueDate = new Date(loan.dueDate);
    const newDueDate = extendedDueDate(previousDueDate, loan.tenureDays);

    // Freeze the contracted date the first time it moves, so `borrowingLimit()` keeps
    // comparing settlement against the date the borrower originally agreed to. Without
    // it, paying a fee *because* you were late would earn the on-time 25% increase.
    if (!loan.originalDueDate) loan.originalDueDate = previousDueDate;
    loan.dueDate = newDueDate;

    // The loan is no longer overdue, so stop the penalty clock at today rather than
    // leaving a watermark that would bill the extended period retroactively.
    loan.penaltyAccruedThrough = now;
    loan.daysOverdue = 0;
    if (loan.status === LoanStatus.OVERDUE || loan.status === LoanStatus.DEFAULTED) {
      loan.status = LoanStatus.ACTIVE;
    }
    await manager.save(Loan, loan);

    await manager.save(LoanExtension, manager.create(LoanExtension, {
      loanId: loan.id,
      repaymentId: repayment.id,
      previousDueDate,
      newDueDate,
      feeAmount: amount,
      outstandingAtExtension: Number(loan.outstandingBalance),
      grantedById: repayment.initiatedById,
    }));

    const description = `Extension fee ${orderId}: due date moved to ${newDueDate.toISOString().slice(0, 10)}`;
    await manager.save(LedgerEntry, [
      manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.FEE, accountType: AccountType.CASH_CLICKPESA, debit: amount, credit: 0, description }),
      // Income, not a reduction in the receivable: the debt is unchanged.
      manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.FEE, accountType: AccountType.FEE_INCOME, debit: 0, credit: amount, description }),
    ]);
  }

  /**
   * Resolves promises-to-pay that this payment keeps.
   *
   * Runs inside the settlement transaction, which already holds a pessimistic write
   * lock on the loan, so no new concurrency surface is introduced. The decision
   * itself is a pure function in `../collections/ptp-status.js`.
   *
   * A payment is credited against the promise if it lands at any point after the
   * promise was made -- a borrower who pays early has still kept their word. Amounts
   * accumulate across part payments, so three instalments totalling the promised sum
   * honour the promise even though no single payment reached it.
   */
  private async honorPromises(
    manager: EntityManager,
    loan: Loan,
    now: Date,
  ) {
    const pending = await manager.find(PromiseToPay, {
      where: { loanId: loan.id, status: PtpStatus.PENDING },
      order: { promisedDate: 'ASC' },
    });
    if (!pending.length) return;

    const loanSettled = loan.status === LoanStatus.SETTLED;

    for (const ptp of pending) {
      // Everything paid since the promise was recorded, including this payment.
      const paid = await manager
        .createQueryBuilder(Repayment, 'r')
        .select('COALESCE(SUM(r.amount), 0)', 'sum')
        .where('r.loanId = :loanId', { loanId: loan.id })
        .andWhere('r.status = :status', { status: RepaymentStatus.COMPLETED })
        .andWhere('r.paidAt >= :since', { since: ptp.createdAt })
        .getRawOne<{ sum: string }>();

      const resolution = resolveOnPayment(ptp, Number(paid?.sum || 0), loanSettled, now);
      if (!resolution) continue;

      await manager.update(PromiseToPay, ptp.id, {
        status: resolution.status,
        resolvedAt: resolution.resolvedAt,
        resolvedReason: resolution.resolvedReason,
      });
    }
  }

  private result(status: RepaymentStatus) {
    return { received: true, status, message: status === RepaymentStatus.COMPLETED ? 'Payment received and credited.' : status === RepaymentStatus.FAILED ? 'Payment failed. You can try again.' : 'Payment is still pending. Complete the prompt on your phone, then check again.' };
  }
}

function round(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}
