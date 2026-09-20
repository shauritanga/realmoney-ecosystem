import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { LoanStatus, AgingBucket } from '../enums.js';
import { NumericTransformer } from '../numeric.transformer.js';
import type { User } from './user.entity.js';
import type { LoanProduct } from './loan-product.entity.js';
import type { Repayment } from './repayment.entity.js';
import type { LedgerEntry } from './ledger-entry.entity.js';
import type { CollectorAssignment } from './collector-assignment.entity.js';
import type { InteractionLog } from './interaction-log.entity.js';
import type { PromiseToPay } from './promise-to-pay.entity.js';

@Entity('loans')
@Index('idx_loan_borrower', ['borrowerId'])
@Index('idx_loan_status', ['status'])
@Index('idx_loan_aging', ['agingBucket'])
@Index('idx_loan_due', ['dueDate'])
export class Loan {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  loanNumber: string;

  @Column({ type: 'uuid' })
  borrowerId: string;

  @Column({ type: 'uuid' })
  productId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  principalAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  interestAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  processingFee: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  penaltyAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  totalAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  outstandingBalance: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  totalPaid: number;

  @Column()
  tenureDays: number;

  @Column({ type: 'timestamptz', nullable: true })
  disbursementDate: Date | null;

  @Column({ type: 'timestamptz' })
  dueDate: Date;

  @Column({ type: 'enum', enum: LoanStatus, default: LoanStatus.PENDING })
  status: LoanStatus;

  @Column({ default: 0 })
  daysOverdue: number;

  @Column({ type: 'enum', enum: AgingBucket, default: AgingBucket.CURRENT })
  agingBucket: AgingBucket;

  @Column({ type: 'uuid', nullable: true })
  approvedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  approvedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  disbursedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  settledAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne('User', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'borrowerId' })
  borrower: User;

  @ManyToOne('LoanProduct', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'productId' })
  product: LoanProduct;

  @OneToMany('Repayment', 'loan')
  repayments: Repayment[];

  @OneToMany('LedgerEntry', 'loan')
  ledgerEntries: LedgerEntry[];

  @OneToMany('CollectorAssignment', 'loan')
  assignments: CollectorAssignment[];

  @OneToMany('InteractionLog', 'loan')
  interactionLogs: InteractionLog[];

  @OneToMany('PromiseToPay', 'loan')
  promisesToPay: PromiseToPay[];
}
