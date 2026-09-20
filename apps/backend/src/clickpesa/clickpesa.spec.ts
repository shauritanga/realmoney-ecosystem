import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClickPesaClient, canonicalize } from './clickpesa.client.js';
import { ClickPesaService } from './clickpesa.service.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanStatus, RepaymentStatus, UserRole } from '../database/enums.js';

afterEach(() => vi.unstubAllGlobals());

describe('ClickPesa client', () => {
  it('uses server credentials for tokens, caches authorization, and sends the documented push payload', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, token: 'Bearer test-token' }) })
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'PROCESSING' }) });
    vi.stubGlobal('fetch', fetchMock);
    const client = new ClickPesaClient(new ConfigService({ CLICKPESA_API_KEY: 'test-key', CLICKPESA_CLIENT_ID: 'test-client' }));
    await client.request('/payments/initiate-ussd-push-request', { amount: '100.00', currency: 'TZS', phoneNumber: '255712345678', orderReference: 'RM012345678901234567' });
    await client.request('/payments/RM012345678901234567');
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ 'api-key': 'test-key', 'client-id': 'test-client' });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer test-token');
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).amount).toBe('100.00');
  });

  it('canonicalizes nested objects without changing array order', () => {
    expect(JSON.stringify(canonicalize({ z: [{ b: 1, a: 2 }], a: '100' }))).toBe('{"a":"100","z":[{"a":2,"b":1}]}');
  });

  it('does not leak upstream errors or retry financial POSTs', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => ({ success: true, token: 'Bearer test' }) })
      .mockRejectedValue(new Error('secret upstream contents'));
    vi.stubGlobal('fetch', fetchMock);
    const client = new ClickPesaClient(new ConfigService({ CLICKPESA_API_KEY: 'key', CLICKPESA_CLIENT_ID: 'client' }));
    await expect(client.request('/payments/initiate-ussd-push-request', {})).rejects.toThrow('ClickPesa is unavailable');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function setup(payment: Record<string, unknown> = {}) {
  const orderId = 'RM012345678901234567';
  const loan = { id: 'loan', borrowerId: 'borrower', status: LoanStatus.ACTIVE, outstandingBalance: 200, totalPaid: 0 };
  const repayment = { id: 'repayment', loanId: loan.id, loan, amount: 100, status: RepaymentStatus.PENDING };
  const manager = {
    findOneOrFail: vi.fn(async (entity) => entity === Loan ? loan : repayment),
    create: vi.fn((_entity, data) => data), save: vi.fn(async (_entity, data) => data),
  };
  const db = { getRepository: vi.fn(() => ({ findOne: vi.fn(async () => repayment), existsBy: vi.fn(async () => false) })), transaction: vi.fn(async fn => fn(manager)) };
  const client = { clientId: 'client', request: vi.fn(async () => [{ id: 'transaction', clientId: 'client', orderReference: orderId, status: 'SUCCESS', collectedAmount: '100.00', collectedCurrency: 'TZS', ...payment }]) };
  return { service: new ClickPesaService(client as any, db as any), client, db, manager, loan, repayment, orderId };
}

describe('ClickPesa reconciliation', () => {
  it('credits a verified payment once with balanced ledger entries', async () => {
    const s = setup();
    expect((await s.service.reconcile(s.orderId)).status).toBe('COMPLETED');
    await s.service.reconcile(s.orderId);
    expect(s.loan.outstandingBalance).toBe(100);
    expect(s.loan.totalPaid).toBe(100);
    expect(s.client.request).toHaveBeenCalledTimes(1);
    const entries = s.manager.save.mock.calls.find(([, data]) => Array.isArray(data))![1];
    expect(entries.reduce((sum: number, e: any) => sum + e.debit - e.credit, 0)).toBe(0);
  });

  it.each([{ collectedAmount: '99' }, { collectedCurrency: 'USD' }, { collectedAmount: 'NaN' }, { id: '' }])('rejects mismatched successful payments: %j', async payment => {
    const s = setup(payment);
    await expect(s.service.reconcile(s.orderId)).rejects.toThrow('Payment details do not match');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it.each([{ clientId: 'other' }, { orderReference: 'other' }, { status: 'PROCESSING' }])('does not credit unmatched or pending payments: %j', async payment => {
    const s = setup(payment);
    expect((await s.service.reconcile(s.orderId)).status).toBe('PENDING');
    expect(s.loan.totalPaid).toBe(0);
  });

  it('does not let a repeated failure overwrite completed repayment', async () => {
    const s = setup({ status: 'FAILED' });
    s.repayment.status = RepaymentStatus.COMPLETED;
    expect((await s.service.reconcile(s.orderId)).status).toBe('COMPLETED');
    expect(s.client.request).not.toHaveBeenCalled();
  });

  it('blocks other borrowers before querying ClickPesa', async () => {
    const s = setup();
    await expect(s.service.reconcile(s.orderId, { id: 'other', role: UserRole.BORROWER })).rejects.toThrow('cannot access');
    expect(s.client.request).not.toHaveBeenCalled();
  });

  it('rechecks completion inside the transaction to prevent concurrent duplicate credit', async () => {
    const s = setup();
    s.manager.findOneOrFail.mockImplementation(async entity => {
      if (entity === Loan) return s.loan;
      return { ...s.repayment, status: RepaymentStatus.COMPLETED } as any;
    });
    expect((await s.service.reconcile(s.orderId)).status).toBe('COMPLETED');
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it.each([NaN, Infinity, 0, -1, 1.234, '100'])('rejects invalid amount %s before accessing the database', async amount => {
    const s = setup();
    await expect(s.service.triggerUssdPush({ loanId: '00000000-0000-0000-0000-000000000000', amount: amount as number }, { id: 'borrower', role: UserRole.BORROWER })).rejects.toThrow('positive amount');
    expect(s.db.transaction).not.toHaveBeenCalled();
  });
});

describe('ClickPesa dispatch', () => {
  function dispatchSetup(pending = false) {
    const loan = { id: '00000000-0000-0000-0000-000000000000', borrowerId: 'borrower', outstandingBalance: 200, status: LoanStatus.ACTIVE, borrower: { phone: '0712 345 678' } };
    const manager = {
      findOne: vi.fn(async entity => entity === Loan ? loan : pending ? { providerReference: 'RM012345678901234567' } : null),
      findOneOrFail: vi.fn(async () => loan),
      create: vi.fn((_entity, data) => data), save: vi.fn(async (_entity, data) => data),
    };
    const client = { ensureReady: vi.fn(async () => {}), request: vi.fn(async (_path, body) => ({ status: 'PROCESSING', orderReference: body.orderReference })) };
    const db = { transaction: vi.fn(async fn => fn(manager)) };
    const service = new ClickPesaService(client as any, db as any);
    return { client, manager, service, loan, actor: { id: 'borrower', role: UserRole.BORROWER } };
  }

  it('persists a pending order before sending normalized phone, TZS and decimal amount', async () => {
    const s = dispatchSetup();
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 100 }, s.actor);
    expect(result.success).toBe(true);
    expect(result.orderId).toMatch(/^RM[a-f0-9]{18}$/);
    expect(s.client.request.mock.calls[0][1]).toEqual({ amount: '100.00', currency: 'TZS', phoneNumber: '255712345678', orderReference: result.orderId });
    expect(s.manager.save.mock.invocationCallOrder[0]).toBeLessThan(s.client.request.mock.invocationCallOrder[0]);
  });

  it('reuses a pending order without sending another push', async () => {
    const s = dispatchSetup(true);
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 100 }, s.actor);
    expect(result.orderId).toBe('RM012345678901234567');
    expect(s.client.request).not.toHaveBeenCalled();
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it('preserves pending state after an ambiguous network error', async () => {
    const s = dispatchSetup();
    s.client.request.mockRejectedValue(new Error('timeout'));
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 100 }, s.actor);
    expect(result.success).toBe(false);
    expect(result.orderId).toBeTruthy();
    expect(s.manager.save.mock.calls[0][1].status).toBe('PENDING');
    expect(s.client.request).toHaveBeenCalledTimes(1);
  });

  it('does not create an order when authentication fails', async () => {
    const s = dispatchSetup();
    s.client.ensureReady.mockRejectedValue(new Error('authentication failed'));
    await expect(s.service.triggerUssdPush({ loanId: s.loan.id, amount: 100 }, s.actor)).rejects.toThrow('authentication failed');
    expect(s.manager.save).not.toHaveBeenCalled();
    expect(s.client.request).not.toHaveBeenCalled();
  });
});
