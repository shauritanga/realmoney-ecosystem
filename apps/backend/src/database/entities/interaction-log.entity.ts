import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { CommunicationChannel, DispositionCode } from '../enums.js';
import type {
  CallOutcome,
  CustomerOutcome,
  DurationSource,
  InteractionOrigin,
} from '../enums.js';
import type { Loan } from './loan.entity.js';
import type { User } from './user.entity.js';

@Entity('interaction_logs')
@Index('idx_interaction_loan', ['loanId'])
@Index('idx_interaction_collector', ['collectorId'])
@Index('idx_interaction_disposition', ['disposition'])
@Index('idx_interaction_created', ['createdAt'])
@Index('idx_interaction_borrower', ['borrowerId'])
@Index('idx_interaction_followup', ['followUpAt'])
export class InteractionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  /**
   * Denormalised from the loan so per-customer activity reports do not have to
   * join through `loans` on every aggregate.
   */
  @Column({ type: 'uuid', nullable: true })
  borrowerId: string | null;

  @Column({ type: 'uuid' })
  collectorId: string;

  @Column({ type: 'enum', enum: CommunicationChannel, default: CommunicationChannel.CALL })
  channel: CommunicationChannel;

  /** The action the collector took. */
  @Column({ type: 'enum', enum: DispositionCode })
  disposition: DispositionCode;

  /** What the borrower actually said. See CUSTOMER_OUTCOMES. */
  @Column({ type: 'varchar', nullable: true })
  outcome: CustomerOutcome | null;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ default: 0 })
  durationSeconds: number;

  /** null = unknown. Set from the device call log's ANSWERED vs MISSED/DECLINED. */
  @Column({ type: 'boolean', nullable: true })
  connected: boolean | null;

  /** Richer detail behind `connected`, when the call log supplies it. */
  @Column({ type: 'varchar', nullable: true })
  callOutcome: CallOutcome | null;

  /** Distinguishes call-log-verified talk time from self-reported. */
  @Column({ type: 'varchar', nullable: true })
  durationSource: DurationSource | null;

  /**
   * Client-generated idempotency key, unique per collector.
   *
   * The app is online-only and surfaces failures rather than queuing, so a collector
   * whose submit times out will retry. Without this, one call becomes two logged
   * calls and the admin's counts drift upward every time the network hiccups.
   */
  @Column({ type: 'varchar', nullable: true })
  clientRef: string | null;

  /** Scheduled callback, so CALLBACK_REQUESTED resurfaces in a queue. */
  @Column({ type: 'timestamptz', nullable: true })
  followUpAt: Date | null;

  /** SYSTEM rows are excluded from collector activity reports. */
  @Column({ type: 'varchar', default: 'COLLECTOR' })
  origin: InteractionOrigin;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectorId' })
  collector: User;
}
