import type { BorrowerOnboarding } from '../../onboarding/onboarding.types.js';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  OneToMany,
} from 'typeorm';
import { UserRole, KycStatus } from '../enums.js';
import type { Loan } from './loan.entity.js';
import type { CollectorAssignment } from './collector-assignment.entity.js';
import type { InteractionLog } from './interaction-log.entity.js';
import type { PromiseToPay } from './promise-to-pay.entity.js';
import type { Repayment } from './repayment.entity.js';

@Entity('users')
@Index('idx_user_phone', ['phone'])
@Index('idx_user_role', ['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  phone: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  email: string | null;

  @Column({ select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.BORROWER })
  role: UserRole;

  @Column()
  fullName: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  nationalId: string | null;

  @Column({ type: 'varchar', nullable: true })
  address: string | null;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.PENDING })
  kycStatus: KycStatus;

  @Column({ type: 'varchar', nullable: true })
  kycDocUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  selfieUrl: string | null;

  @Column({ type: 'jsonb', nullable: true, select: false })
  onboarding: BorrowerOnboarding | null;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('Loan', 'borrower')
  loansAsBorrower: Loan[];

  @OneToMany('CollectorAssignment', 'collector')
  assignedLoans: CollectorAssignment[];

  @OneToMany('InteractionLog', 'collector')
  interactionLogs: InteractionLog[];

  @OneToMany('PromiseToPay', 'collector')
  promisesRecorded: PromiseToPay[];

  @OneToMany('Repayment', 'initiatedBy')
  repaymentsInitiated: Repayment[];
}
