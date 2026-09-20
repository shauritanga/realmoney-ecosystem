import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import type { User } from './user.entity.js';
import type { Loan } from './loan.entity.js';

@Entity('collector_assignments')
@Index('idx_assign_collector', ['collectorId'])
@Index('idx_assign_loan', ['loanId'])
@Index('idx_assign_active', ['isActive'])
export class CollectorAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  collectorId: string;

  @Column({ type: 'uuid' })
  loanId: string;

  @CreateDateColumn({ type: 'timestamptz' })
  assignedAt: Date;

  @Column({ type: 'uuid', nullable: true })
  assignedBy: string | null;

  @Column({ default: true })
  isActive: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  reassignedAt: Date | null;

  @ManyToOne('User', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'collectorId' })
  collector: User;

  @ManyToOne('Loan', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'loanId' })
  loan: Loan;
}
