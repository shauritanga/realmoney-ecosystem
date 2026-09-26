import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { RepaymentChannel, RepaymentStatus } from '../enums.js';
import type { RepaymentPurpose } from '../enums.js';
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';
import type { User } from './user.entity.js';
import type { LedgerEntry } from './ledger-entry.entity.js';

@Entity('repayments')
@Index('idx_repayment_loan', ['loanId'])
@Index('idx_repayment_status', ['status'])
export class Repayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: RepaymentChannel, default: RepaymentChannel.CLICKPESA_USSD_PUSH })
  channel: RepaymentChannel;

  @Column({ type: 'varchar', unique: true, nullable: true })
  selcomTransId: string | null;

  @Column({ type: 'varchar', nullable: true })
  selcomReference: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  providerReference: string | null;

  @Column({ type: 'varchar', unique: true, nullable: true })
  providerTransId: string | null;

  @Column({ type: 'enum', enum: RepaymentStatus, default: RepaymentStatus.PENDING })
  status: RepaymentStatus;

  /**
   * Whether this money pays the debt down or buys more time. An EXTENSION_FEE never
   * touches `outstandingBalance` or `totalPaid` -- see the branch in
   * ClickPesaService.reconcile.
   */
  @Column({ type: 'varchar', default: 'REPAYMENT' })
  purpose: RepaymentPurpose;

  /**
   * How the payment was applied, penalty first. The four legs always sum to `amount`
   * for a COMPLETED repayment; all zero for an EXTENSION_FEE, which settles nothing.
   */
  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  penaltyPaid: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  interestPaid: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  feePaid: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  principalPaid: number;

  /**
   * The number actually prompted, when a friend or relative is paying on the
   * borrower's behalf. Null means it went to the borrower's own phone. Recorded here
   * only -- a number given on a collections call is not consent to add it to the
   * customer's profile.
   */
  @Column({ type: 'varchar', nullable: true })
  payerPhone: string | null;

  @Column({ type: 'varchar', nullable: true })
  payerName: string | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ type: 'uuid', nullable: true })
  initiatedById: string | null;

  @Column({ type: 'jsonb', nullable: true })
  rawWebhookPayload: Record<string, any> | null;

  @Column({ type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'initiatedById' })
  initiatedBy: User | null;

  @OneToMany('LedgerEntry', 'repayment')
  ledgerEntries: LedgerEntry[];
}
