import { BadRequestException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { DataSource } from 'typeorm';
import { canonicalize } from './clickpesa.client.js';
import { ClickPesaService } from './clickpesa.service.js';
import { PaymentWebhookEvent } from '../database/entities/payment-webhook-event.entity.js';
import { RepaymentStatus } from '../database/enums.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

@Injectable()
export class ClickPesaWebhookService {
  constructor(private readonly config: ConfigService, private readonly db: DataSource, private readonly payments: ClickPesaService) {}

  async handle(input: unknown) {
    const key = this.config.get<string>('CLICKPESA_CHECKSUM_KEY', '');
    if (!key) throw new ServiceUnavailableException('ClickPesa webhook checksum key is not configured');
    if (!isObject(input)) throw new BadRequestException('Invalid webhook payload');
    const { checksum, checksumMethod, ...unsigned } = input;
    if (checksumMethod !== undefined && checksumMethod !== 'canonical') throw new UnauthorizedException('Unsupported checksum method');
    if (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum)) throw new UnauthorizedException('Invalid webhook checksum');
    const canonical = JSON.stringify(canonicalize(unsigned));
    const expected = createHmac('sha256', key).update(canonical).digest();
    if (!timingSafeEqual(expected, Buffer.from(checksum, 'hex'))) throw new UnauthorizedException('Invalid webhook checksum');

    const data = unsigned.data;
    if (typeof unsigned.event !== 'string' || unsigned.event.length > 100 || !isObject(data)) throw new BadRequestException('Invalid webhook event');
    for (const field of ['id', 'orderReference', 'status']) {
      if (data[field] !== undefined && (typeof data[field] !== 'string' || (data[field] as string).length > 255)) throw new BadRequestException('Invalid webhook data');
    }
    const collectionEvent = ['PAYMENT RECEIVED', 'PAYMENT FAILED'].includes(unsigned.event);
    if (collectionEvent && (typeof data.orderReference !== 'string' || !data.orderReference || typeof data.id !== 'string' || !data.id || typeof data.status !== 'string')) {
      throw new BadRequestException('Missing payment webhook fields');
    }
    const payloadHash = createHash('sha256').update(canonical).digest('hex');
    const events = this.db.getRepository(PaymentWebhookEvent);
    // Store the authenticated original JSON before any provider lookup. The unique
    // digest deduplicates retries even if JSON key order or checksum casing changes.
    await events.createQueryBuilder().insert().values({
      provider: 'CLICKPESA', payloadHash, eventType: unsigned.event,
      paymentId: data.id as string ?? null, orderReference: data.orderReference as string ?? null,
      status: data.status as string ?? null, payload: input as Record<string, any>,
    }).orIgnore().execute();
    const event = await events.findOneByOrFail({ provider: 'CLICKPESA', payloadHash });
    if (event.processed) return { success: true, duplicate: true };
    try {
      if (collectionEvent) {
        // Preserve signed events for other applications/orders, but do not apply them.
        // Unknown references fail reconciliation and remain available for investigation.
        const result = await this.payments.reconcile(data.orderReference as string);
        if (result.status === RepaymentStatus.PENDING) throw new ServiceUnavailableException('Payment verification is pending');
      }
      // A crash between repayment commit and this update is safe: reconciliation
      // locks/rechecks the repayment and never credits an already completed payment.
      await events.update({ id: event.id }, { processed: true, processedAt: new Date(), processingError: null });
      return { success: true };
    } catch {
      // Do not overwrite success if another delivery completed concurrently.
      await events.update({ id: event.id, processed: false }, { processingError: 'Payment reconciliation requires retry or operator review' });
      throw new ServiceUnavailableException('Webhook saved; payment reconciliation requires retry');
    }
  }
}
