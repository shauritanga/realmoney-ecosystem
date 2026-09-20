import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { PtpStatus } from '../enums.js';
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';
import type { User } from './user.entity.js';

@Entity('promises_to_pay')
@Index('idx_ptp_loan', ['loanId'])
@Index('idx_ptp_collector', ['collectorId'])
@Index('idx_ptp_date', ['promisedDate'])
@Index('idx_ptp_status', ['status'])
export class PromiseToPay {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @Column({ type: 'uuid' })
  collectorId: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  promisedAmount: number;

  @Column({ type: 'timestamptz' })
  promisedDate: Date;

  @Column({ type: 'enum', enum: PtpStatus, default: PtpStatus.PENDING })
  status: PtpStatus;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectorId' })
  collector: User;
}
