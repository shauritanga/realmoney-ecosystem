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
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';
import type { User } from './user.entity.js';
import type { LedgerEntry } from './ledger-entry.entity.js';

@Entity('repayments')
@Index('idx_repayment_loan', ['loanId'])
@Index('idx_repayment_trans', ['selcomTransId'])
@Index('idx_repayment_status', ['status'])
export class Repayment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  amount: number;

  @Column({ type: 'enum', enum: RepaymentChannel, default: RepaymentChannel.SELCOM_USSD_PUSH })
  channel: RepaymentChannel;

  @Column({ type: 'varchar', unique: true, nullable: true })
  selcomTransId: string | null;

  @Column({ type: 'varchar', nullable: true })
  selcomReference: string | null;

  @Column({ type: 'enum', enum: RepaymentStatus, default: RepaymentStatus.PENDING })
  status: RepaymentStatus;

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
