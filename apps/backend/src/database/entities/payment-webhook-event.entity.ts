import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity('payment_webhook_events')
@Index('idx_webhook_provider', ['provider'])
@Index('idx_webhook_payment', ['paymentId'])
@Index('idx_webhook_order', ['orderReference'])
@Index('idx_webhook_dedup', ['provider', 'payloadHash'], { unique: true })
export class PaymentWebhookEvent {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'varchar', default: 'CLICKPESA' }) provider: string;
  @Column({ type: 'varchar' }) payloadHash: string;
  @Column({ type: 'varchar' }) eventType: string;
  @Column({ type: 'varchar', nullable: true }) paymentId: string | null;
  @Column({ type: 'varchar', nullable: true }) orderReference: string | null;
  @Column({ type: 'varchar', nullable: true }) status: string | null;
  @Column({ type: 'jsonb' }) payload: Record<string, any>;
  @Column({ default: false }) processed: boolean;
  @Column({ type: 'timestamptz', nullable: true }) processedAt: Date | null;
  @Column({ type: 'varchar', nullable: true }) processingError: string | null;
  @CreateDateColumn() createdAt: Date;
}
