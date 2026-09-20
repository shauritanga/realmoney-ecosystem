import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { NumericTransformer } from '../numeric.transformer.js';
import type { Loan } from './loan.entity.js';

@Entity('loan_products')
export class LoanProduct {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  minAmount: number;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: NumericTransformer })
  maxAmount: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, transformer: NumericTransformer })
  interestRateMonthly: number;

  @Column()
  minTenureDays: number;

  @Column()
  maxTenureDays: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 1.0, transformer: NumericTransformer })
  latePenaltyRateDaily: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 2.5, transformer: NumericTransformer })
  processingFeeRate: number;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @OneToMany('Loan', 'product')
  loans: Loan[];
}
