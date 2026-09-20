import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { EntryType, AccountType, RepaymentChannel, RepaymentStatus, LoanStatus } from '../database/enums.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';

export interface SelcomPushResponse {
  success: boolean;
  message: string;
  orderId: string;
  transId?: string;
  rawResponse?: any;
}

@Injectable()
export class SelcomService {
  private readonly logger = new Logger(SelcomService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly vendor: string;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Repayment)
    private readonly repayments: Repository<Repayment>,
    @InjectRepository(Loan)
    private readonly loans: Repository<Loan>,
    @InjectRepository(LedgerEntry)
    private readonly ledger: Repository<LedgerEntry>,
    private readonly dataSource: DataSource,
  ) {
    this.baseUrl = this.config.get<string>('SELCOM_BASE_URL', 'https://apigw.selcommobile.com/v1');
    this.apiKey = this.config.get<string>('SELCOM_API_KEY', 'TEST_KEY');
    this.apiSecret = this.config.get<string>('SELCOM_API_SECRET', 'TEST_SECRET');
    this.vendor = this.config.get<string>('SELCOM_VENDOR', 'REALMONEY');
  }

  /**
   * Generates cryptographic headers required by Selcom Tanzania Gateway
   * Digest = Base64(HMAC-SHA256(apiKey + apiSecret + timestamp + fieldValues, secret))
   */
  generateAuthHeaders(data: Record<string, any>): Record<string, string> {
    const timestamp = new Date().toISOString();
    const sortedKeys = Object.keys(data).sort();
    const signedFields = sortedKeys.join(',');

    let signString = `timestamp=${timestamp}`;
    for (const key of sortedKeys) {
      signString += `&${key}=${data[key]}`;
    }

    const digest = crypto
      .createHmac('sha256', this.apiSecret)
      .update(signString)
      .digest('base64');

    return {
      'Content-Type': 'application/json',
      'Authorization': `SELCOM ${this.apiKey}`,
      'Digest-Method': 'HS256',
      'Digest': digest,
      'Timestamp': timestamp,
      'Signed-Fields': signedFields,
    };
  }

  /**
   * Triggers a C2B USSD Push Prompt to the customer's phone (M-Pesa, Tigo, Airtel, HaloPesa)
   */
  async triggerUssdPush(params: {
    loanId: string;
    phone: string;
    amount: number;
    initiatedById?: string;
  }): Promise<SelcomPushResponse> {
    const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const formattedPhone = params.phone.replace(/[^0-9]/g, '');

    // 1. Create a pending repayment record in our database
    await this.repayments.save(
      this.repayments.create({
        loanId: params.loanId,
        amount: params.amount,
        channel: RepaymentChannel.SELCOM_USSD_PUSH,
        selcomReference: orderId,
        status: RepaymentStatus.PENDING,
        initiatedById: params.initiatedById || null,
        notes: `USSD Push triggered to ${formattedPhone}`,
      }),
    );

    const payload = {
      vendor: this.vendor,
      order_id: orderId,
      buyer_phone: formattedPhone,
      amount: params.amount,
      currency: 'TZS',
      gateway_buyer_uuid: formattedPhone,
      webhook_url: `${this.config.get<string>('APP_URL', 'https://api.realmoney.tz')}/selcom/webhook`,
    };

    this.logger.log(`Initiating Selcom USSD push for Order ${orderId} -> ${formattedPhone} Amount: TZS ${params.amount}`);

    try {
      // If mock/test mode or real endpoint
      if (this.apiKey.includes('PLACEHOLDER') || this.apiKey.includes('TEST')) {
        this.logger.warn(`[SIMULATION MODE] Selcom API Key is placeholder. Simulating successful USSD prompt dispatch.`);
        return {
          success: true,
          message: `USSD Push prompt sent to ${formattedPhone}. Awaiting user PIN entry.`,
          orderId,
          transId: `SIM-SEL-${Date.now()}`,
          rawResponse: { result: 'SUCCESS', resultcode: '000', message: 'Prompt dispatched' },
        };
      }

      const headers = this.generateAuthHeaders(payload);
      const response = await fetch(`${this.baseUrl}/checkout/wallet-payment`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const resData = await response.json();
      return {
        success: response.ok && resData.result === 'SUCCESS',
        message: resData.message || 'Prompt dispatched',
        orderId,
        transId: resData.transid,
        rawResponse: resData,
      };
    } catch (error: any) {
      this.logger.error(`Selcom USSD push dispatch failed: ${error.message}`);
      return {
        success: false,
        message: error.message || 'Failed to dispatch USSD prompt',
        orderId,
      };
    }
  }

  /**
   * Disburses approved loan funds directly to borrower's mobile money wallet via Selcom B2C
   */
  async disburseLoan(params: {
    loanId: string;
    phone: string;
    amount: number;
    adminId: string;
  }): Promise<{ success: boolean; transId?: string; message: string }> {
    const formattedPhone = params.phone.replace(/[^0-9]/g, '');
    const transId = `DISB-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    this.logger.log(`Triggering Selcom B2C loan disbursement: Loan ${params.loanId} -> ${formattedPhone} Amount: TZS ${params.amount}`);

    // In simulation mode:
    if (this.apiKey.includes('PLACEHOLDER') || this.apiKey.includes('TEST')) {
      this.logger.warn(`[SIMULATION MODE] Simulating successful B2C wallet payout.`);
      return {
        success: true,
        transId: `SIM-PAYOUT-${Date.now()}`,
        message: `TZS ${params.amount} disbursed to ${formattedPhone} successfully.`,
      };
    }

    try {
      const payload = {
        transid: transId,
        utilitycode: 'CASHIN',
        amount: params.amount,
        phone: formattedPhone,
        currency: 'TZS',
      };
      const headers = this.generateAuthHeaders(payload);
      const response = await fetch(`${this.baseUrl}/funds-transfer/wallet-transfer`, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      return {
        success: response.ok && data.result === 'SUCCESS',
        transId: data.transid || transId,
        message: data.message || 'Disbursement completed',
      };
    } catch (err: any) {
      return {
        success: false,
        message: err.message,
      };
    }
  }

  /**
   * Processes incoming Selcom Webhook callback when borrower enters PIN
   */
  async processWebhook(body: any): Promise<{ received: boolean; message: string }> {
    this.logger.log(`Processing Selcom Webhook: ${JSON.stringify(body)}`);

    const orderId = body.order_id || body.reference;
    const transId = body.transid;
    const result = body.result; // SUCCESS or FAIL
    const amount = Number(body.amount);

    if (!orderId) {
      return { received: false, message: 'Missing order_id' };
    }

    // Find the pending repayment
    const repayment = await this.repayments.findOne({
      where: { selcomReference: orderId },
      relations: { loan: true },
    });

    if (!repayment) {
      this.logger.warn(`Webhook received for unknown repayment order: ${orderId}`);
      return { received: true, message: 'Repayment order not found' };
    }

    if (repayment.status === RepaymentStatus.COMPLETED) {
      return { received: true, message: 'Already processed' };
    }

    if (result === 'SUCCESS') {
      const now = new Date();
      const currentOutstanding = Number(repayment.loan.outstandingBalance);
      const currentTotalPaid = Number(repayment.loan.totalPaid);
      const newOutstanding = Math.max(0, currentOutstanding - amount);
      const newTotalPaid = currentTotalPaid + amount;
      const isSettled = newOutstanding === 0;

      // Atomic update of Repayment, Loan balance, and Double-Entry Ledger
      await this.dataSource.transaction(async (manager) => {
        await manager.update(Repayment, { id: repayment.id }, {
          status: RepaymentStatus.COMPLETED,
          selcomTransId: transId,
          paidAt: now,
          rawWebhookPayload: body,
        });
        await manager.update(Loan, { id: repayment.loanId }, {
          outstandingBalance: newOutstanding,
          totalPaid: newTotalPaid,
          status: isSettled ? LoanStatus.SETTLED : repayment.loan.status,
          settledAt: isSettled ? now : undefined,
        });
        // Double-entry bookkeeping:
        // Debit: CASH_SELCOM (Assets increase)
        // Credit: LOAN_RECEIVABLE (Loan asset decreases)
        await manager.save(
          manager.create(LedgerEntry, {
            loanId: repayment.loanId,
            repaymentId: repayment.id,
            entryType: EntryType.REPAYMENT,
            accountType: AccountType.CASH_SELCOM,
            debit: amount,
            credit: 0,
            description: `Repayment received via Selcom USSD Push (${transId})`,
          }),
        );
        await manager.save(
          manager.create(LedgerEntry, {
            loanId: repayment.loanId,
            repaymentId: repayment.id,
            entryType: EntryType.REPAYMENT,
            accountType: AccountType.LOAN_RECEIVABLE,
            debit: 0,
            credit: amount,
            description: `Principal/Balance reduction from repayment (${transId})`,
          }),
        );
      });

      this.logger.log(`Repayment of TZS ${amount} for Loan ${repayment.loan.loanNumber} processed successfully. Remaining: TZS ${newOutstanding}`);
      return { received: true, message: 'Repayment credited successfully' };
    } else {
      // Payment failed
      await this.repayments.update(
        { id: repayment.id },
        { status: RepaymentStatus.FAILED, rawWebhookPayload: body },
      );
      return { received: true, message: 'Repayment marked as failed' };
    }
  }
}
