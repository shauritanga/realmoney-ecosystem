import { describe, it, expect, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import { ClickPesaWebhookService } from './clickpesa-webhook.service.js';
import { canonicalize } from './clickpesa.client.js';

const secret = 'webhook-test-secret';
function signed(overrides: Record<string, unknown> = {}) {
  const payload = { event: 'PAYMENT RECEIVED', data: { id: 'transaction', orderReference: 'RM012345678901234567', status: 'SUCCESS', collectedAmount: '100', collectedCurrency: 'TZS' }, ...overrides };
  return { ...payload, checksumMethod: 'canonical', checksum: createHmac('sha256', secret).update(JSON.stringify(canonicalize(payload))).digest('hex') };
}
function setup(key = secret) {
  let event: any;
  let values: any;
  const query: any = { insert: vi.fn(() => query), values: vi.fn(v => { values = v; return query; }), orIgnore: vi.fn(() => query), execute: vi.fn(async () => { event ??= { id: 'event', processed: false, ...values }; }) };
  const repository = { createQueryBuilder: vi.fn(() => query), findOneByOrFail: vi.fn(async () => event), update: vi.fn(async (where, data) => { if (where.processed === undefined || event.processed === where.processed) Object.assign(event, data); }) };
  const db = { getRepository: vi.fn(() => repository) };
  const payments = { reconcile: vi.fn(async () => ({ status: 'COMPLETED' })) };
  return { service: new ClickPesaWebhookService(new ConfigService({ CLICKPESA_CHECKSUM_KEY: key }), db as any, payments as any), payments, repository, query, event: () => event };
}
describe('ClickPesa webhook verification and durable events', () => {
  it('fails closed without checksum configuration', async () => {
    const s = setup('');
    await expect(s.service.handle(signed())).rejects.toThrow('not configured');
    expect(s.repository.createQueryBuilder).not.toHaveBeenCalled();
  });
  it.each([null, {}, { checksum: 'bad' }, { ...signed(), checksum: '0'.repeat(64) }, { ...signed(), checksumMethod: 'legacy' }])('rejects unsigned or invalid data before storage: %j', async payload => {
    const s = setup();
    await expect(s.service.handle(payload)).rejects.toThrow();
    expect(s.repository.createQueryBuilder).not.toHaveBeenCalled();
    expect(s.payments.reconcile).not.toHaveBeenCalled();
  });
  it('detects a tampered amount', async () => {
    const s = setup();
    const payload = signed();
    payload.data.collectedAmount = '999';
    await expect(s.service.handle(payload)).rejects.toThrow('Invalid webhook checksum');
    expect(s.payments.reconcile).not.toHaveBeenCalled();
  });
  it('stores the original verified payload before reconciliation and marks it processed', async () => {
    const s = setup();
    const payload = signed();
    expect(await s.service.handle(payload)).toEqual({ success: true });
    expect(s.event().payload).toEqual(payload);
    expect(s.event().processed).toBe(true);
    expect(s.event().processedAt).toBeInstanceOf(Date);
    expect(s.query.execute.mock.invocationCallOrder[0]).toBeLessThan(s.payments.reconcile.mock.invocationCallOrder[0]);
    expect(s.payments.reconcile).toHaveBeenCalledWith('RM012345678901234567');
  });
  it('deduplicates equivalent JSON with reordered keys and uppercase checksum', async () => {
    const s = setup();
    const payload = signed();
    await s.service.handle(payload);
    const firstHash = s.query.values.mock.calls[0][0].payloadHash;
    const reordered = { checksum: payload.checksum.toUpperCase(), data: Object.fromEntries(Object.entries(payload.data).reverse()), event: payload.event };
    expect(await s.service.handle(reordered)).toEqual({ success: true, duplicate: true });
    expect(s.query.values.mock.calls[1][0].payloadHash).toBe(firstHash);
    expect(s.payments.reconcile).toHaveBeenCalledTimes(1);
  });
  it('retains failures and allows a redelivery to complete', async () => {
    const s = setup();
    s.payments.reconcile.mockRejectedValueOnce(new Error('upstream failure containing private data'));
    await expect(s.service.handle(signed())).rejects.toThrow('requires retry');
    expect(s.event().processed).toBe(false);
    expect(s.event().processingError).not.toContain('private');
    await s.service.handle(signed());
    expect(s.event().processed).toBe(true);
    expect(s.event().processingError).toBeNull();
  });
  it('does not mark a pending verification as processed', async () => {
    const s = setup();
    s.payments.reconcile.mockResolvedValue({ status: 'PENDING' });
    await expect(s.service.handle(signed())).rejects.toThrow('requires retry');
    expect(s.event().processed).toBe(false);
  });
  it('retains authenticated unrelated events without attempting repayment', async () => {
    const s = setup();
    await s.service.handle(signed({ event: 'PAYOUT INITIATED' }));
    expect(s.event().processed).toBe(true);
    expect(s.payments.reconcile).not.toHaveBeenCalled();
  });
  it('rejects signed malformed payment data', async () => {
    const s = setup();
    await expect(s.service.handle(signed({ data: { status: 'SUCCESS' } }))).rejects.toThrow('Missing payment');
    expect(s.query.execute).not.toHaveBeenCalled();
  });
});
