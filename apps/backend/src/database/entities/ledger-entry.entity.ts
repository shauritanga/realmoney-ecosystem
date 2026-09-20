import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { EntryType, AccountType } from '../enums.js';
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';
import type { Repayment } from './repayment.entity.js';

@Entity('ledger_entries')
@Index('idx_ledger_loan', ['loanId'])
@Index('idx_ledger_account', ['accountType'])
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @Column({ type: 'uuid', nullable: true })
  repaymentId: string | null;

  @Column({ type: 'enum', enum: EntryType })
  entryType: EntryType;

  @Column({ type: 'enum', enum: AccountType })
  accountType: AccountType;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  debit: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, default: 0, transformer: NumericTransformer })
  credit: number;

  @Column()
  description: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('Repayment', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'repaymentId' })
  repayment: Repayment | null;
}
