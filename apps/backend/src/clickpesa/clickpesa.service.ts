import { BadRequestException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { randomBytes } from 'node:crypto';
import { ClickPesaClient } from './clickpesa.client.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { CollectorAssignment } from '../database/entities/collector-assignment.entity.js';
import { AccountType, EntryType, LoanStatus, RepaymentChannel, RepaymentStatus, UserRole } from '../database/enums.js';

export type PaymentActor = { id: string; role: UserRole };

@Injectable()
export class ClickPesaService {
  constructor(private readonly client: ClickPesaClient, private readonly db: DataSource) {}

  async assertAccess(loan: Loan, actor: PaymentActor) {
    if (actor.role === UserRole.ADMIN || (actor.role === UserRole.BORROWER && loan.borrowerId === actor.id)) return;
    if (actor.role === UserRole.COLLECTOR && await this.db.getRepository(CollectorAssignment).existsBy({
      loanId: loan.id, collectorId: actor.id, isActive: true,
    })) return;
    throw new ForbiddenException('You cannot access payments for this loan');
  }

  async triggerUssdPush(params: { loanId: string; amount: number }, actor: PaymentActor) {
    if (typeof params.loanId !== 'string' || !/^[0-9a-f-]{36}$/i.test(params.loanId)) throw new BadRequestException('Invalid loan ID');
    const amount = params.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 500 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) {
      throw new BadRequestException('ClickPesa mobile-money payments must be at least TZS 500 and have at most two decimal places');
    }
    const prepared = await this.db.transaction(async manager => {
      const loan = await manager.findOne(Loan, { where: { id: params.loanId }, lock: { mode: 'pessimistic_write' } });
      if (!loan) throw new NotFoundException('Loan not found');
      await this.assertAccess(loan, actor);
      if (![LoanStatus.ACTIVE, LoanStatus.OVERDUE, LoanStatus.DEFAULTED, LoanStatus.DISBURSED].includes(loan.status) || amount > Number(loan.outstandingBalance)) {
        throw new BadRequestException('Payment must not exceed the outstanding balance of an active loan');
      }
      const pending = await manager.findOne(Repayment, { where: { loanId: loan.id, channel: RepaymentChannel.CLICKPESA_USSD_PUSH, status: RepaymentStatus.PENDING } });
      if (pending) return { orderId: pending.providerReference!, phone: '', existing: true };
      const fullLoan = await manager.findOneOrFail(Loan, { where: { id: loan.id }, relations: { borrower: true } });
      let phone = fullLoan.borrower.phone.replace(/[\s()+-]/g, '');
      if (/^0[67]\d{8}$/.test(phone)) phone = `255${phone.slice(1)}`;
      if (!/^255[67]\d{8}$/.test(phone)) throw new BadRequestException('A valid Tanzanian mobile number is required');
      const orderId = `RM${randomBytes(9).toString('hex')}`;
      // Authenticate before reserving an order, so invalid credentials cannot
      // strand a repayment that was never sent to the provider.
      await this.client.ensureReady();
      await manager.save(Repayment, manager.create(Repayment, {
        loanId: loan.id, amount, channel: RepaymentChannel.CLICKPESA_USSD_PUSH,
        providerReference: orderId, initiatedById: actor.id, status: RepaymentStatus.PENDING,
      }));
      return { orderId, phone, existing: false };
    });
    const { orderId } = prepared;
    if (prepared.existing) return { success: true, orderId, message: 'A payment is already pending. Check its status before starting another.' };
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
        if (amount > Number(loan.outstandingBalance)) throw new BadRequestException('Payment exceeds remaining balance; manual reconciliation required');
        const now = new Date();
        repayment.status = RepaymentStatus.COMPLETED;
        repayment.providerTransId = payment.id;
        repayment.paidAt = now;
        loan.outstandingBalance = Math.round((Number(loan.outstandingBalance) - amount) * 100) / 100;
        loan.totalPaid = Math.round((Number(loan.totalPaid) + amount) * 100) / 100;
        if (loan.outstandingBalance === 0) { loan.status = LoanStatus.SETTLED; loan.settledAt = now; }
        await manager.save(Loan, loan);
        await manager.save(LedgerEntry, [
          manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.REPAYMENT, accountType: AccountType.CASH_CLICKPESA, debit: amount, credit: 0, description: `ClickPesa repayment ${orderId}` }),
          manager.create(LedgerEntry, { loanId: loan.id, repaymentId: repayment.id, entryType: EntryType.REPAYMENT, accountType: AccountType.LOAN_RECEIVABLE, debit: 0, credit: amount, description: `Loan repayment ${orderId}` }),
        ]);
      } else if (payment.status === 'FAILED') repayment.status = RepaymentStatus.FAILED;
      repayment.rawWebhookPayload = { id: payment.id, status: payment.status, orderReference: orderId };
      await manager.save(Repayment, repayment);
      return this.result(repayment.status);
    });
  }

  private result(status: RepaymentStatus) {
    return { received: true, status, message: status === RepaymentStatus.COMPLETED ? 'Payment received and credited.' : status === RepaymentStatus.FAILED ? 'Payment failed. You can try again.' : 'Payment is still pending. Complete the prompt on your phone, then check again.' };
  }
}
