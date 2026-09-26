import { Entity, PrimaryColumn, Column } from 'typeorm';
import { NumericTransformer } from '../numeric.transformer.js';

@Entity('lending_settings')
export class LendingSettings {
  @PrimaryColumn({ type: 'int' })
  id: number;

  @Column({ type: 'numeric', precision: 5, scale: 2, default: 40, transformer: NumericTransformer })
  interestRateMonthly: number;

  /**
   * What an extension costs, as a percentage of the balance outstanding when it is
   * granted. The fee buys time only -- it never reduces the debt.
   */
  @Column({ type: 'numeric', precision: 5, scale: 2, default: 25, transformer: NumericTransformer })
  extensionFeePercent: number;

  /** How many times one loan may be extended. The main guard against a debt trap. */
  @Column({ type: 'int', default: 2 })
  maxExtensions: number;

  /**
   * Ceiling on accrued late penalties, as a percentage of principal.
   *
   * At 1%/day an uncapped penalty passes the principal itself inside four months and
   * keeps compounding for as long as the row exists, which is neither collectable nor
   * defensible. Set to 0 to disable the ceiling.
   */
  @Column({ type: 'numeric', precision: 6, scale: 2, default: 100, transformer: NumericTransformer })
  maxPenaltyPercentOfPrincipal: number;
}
