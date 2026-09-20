import { Entity, PrimaryColumn, Column } from 'typeorm';
import { NumericTransformer } from '../numeric.transformer.js';

@Entity('lending_settings')
export class LendingSettings {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 40, transformer: NumericTransformer })
  interestRateMonthly: number;
}
