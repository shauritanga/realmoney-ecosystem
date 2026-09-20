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
import type { Loan } from './loan.entity.js';
import type { User } from './user.entity.js';

@Entity('interaction_logs')
@Index('idx_interaction_loan', ['loanId'])
@Index('idx_interaction_collector', ['collectorId'])
@Index('idx_interaction_disposition', ['disposition'])
export class InteractionLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @Column({ type: 'uuid' })
  collectorId: string;

  @Column({ type: 'enum', enum: CommunicationChannel, default: CommunicationChannel.CALL })
  channel: CommunicationChannel;

  @Column({ type: 'enum', enum: DispositionCode })
  disposition: DispositionCode;

  @Column({ type: 'varchar', nullable: true })
  notes: string | null;

  @Column({ default: 0 })
  durationSeconds: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectorId' })
  collector: User;
}
