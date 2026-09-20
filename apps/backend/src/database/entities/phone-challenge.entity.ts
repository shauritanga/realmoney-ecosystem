import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('phone_challenges')
export class PhoneChallenge {
  @PrimaryColumn() phone: string;
  @Column({ default: '' }) codeHash: string;
  @Column({ type: 'timestamptz', nullable: true }) expiresAt: Date | null;
  @Column({ type: 'timestamptz', nullable: true }) sentAt: Date | null;
  @Column({ default: 0 }) attempts: number;
  @Column({ type: 'varchar', nullable: true }) proofHash: string | null;
  @Column({ type: 'timestamptz', nullable: true }) verifiedAt: Date | null;
  @Column({ default: 'live' }) mode: string;
}
@Entity('onboarding_rate_limits')
export class OnboardingRateLimit {
  @PrimaryColumn() key: string;
  @Column({ type: 'timestamptz' }) windowStart: Date;
  @Column({ default: 0 }) count: number;
}
