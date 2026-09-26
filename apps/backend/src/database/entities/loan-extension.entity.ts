import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';
import type { Repayment } from './repayment.entity.js';
import type { User } from './user.entity.js';

/**
 * One row per granted extension: the borrower paid a fee and the due date moved out.
 *
 * This is the audit trail and the cap is counted from it, rather than from a
 * denormalised counter on the loan. Extensions are capped at two, so the count is
 * never on a hot path, and one source of truth beats a cache that can drift away
 * from the history it summarises.
 */
@Entity('loan_extensions')
@Index('idx_loan_extension_loan', ['loanId'])
export class LoanExtension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  /** The fee payment that bought this extension. */
  @Column({ type: 'uuid', nullable: true })
  repaymentId: string | null;

  @Column({ type: 'timestamptz' })
  previousDueDate: Date;

  @Column({ type: 'timestamptz' })
  newDueDate: Date;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  feeAmount: number;

  /** The outstanding balance the fee was calculated from, kept for disputes. */
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  outstandingAtExtension: number;

  /** The collector or admin who offered it. */
  @Column({ type: 'uuid', nullable: true })
  grantedById: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('Repayment', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repaymentId' })
  repayment: Repayment | null;

  @ManyToOne('User', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'grantedById' })
  grantedBy: User | null;
}
