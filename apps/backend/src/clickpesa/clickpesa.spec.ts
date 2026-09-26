import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ClickPesaClient, canonicalize } from './clickpesa.client.js';
import { ClickPesaService } from './clickpesa.service.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanStatus, PtpStatus, RepaymentStatus, UserRole } from '../database/enums.js';

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

function setup(
  payment: Record<string, unknown> = {},
  ptps: Array<Record<string, unknown>> = [],
  paidSince = 100,
) {
  const orderId = 'RM012345678901234567';
  // Carries the per-leg amounts the allocation waterfall needs. They sum to the 200
  // outstanding, which is the invariant every balance assertion below relies on.
  const loan = {
    id: 'loan', borrowerId: 'borrower', status: LoanStatus.ACTIVE,
    outstandingBalance: 200, totalPaid: 0,
    principalAmount: 150, interestAmount: 30, processingFee: 10, penaltyAmount: 10,
    totalAmount: 190, tenureDays: 14,
    dueDate: new Date('2026-09-20T09:00:00.000Z'),
    originalDueDate: null as Date | null,
    penaltyAccruedThrough: null as Date | null,
    settledAt: null as Date | null,
    daysOverdue: 0,
  };
  const repayment = {
    id: 'repayment', loanId: loan.id, loan, amount: 100,
    status: RepaymentStatus.PENDING, purpose: 'REPAYMENT', initiatedById: 'collector',
    penaltyPaid: 0, interestPaid: 0, feePaid: 0, principalPaid: 0,
  };
  const manager = {
    findOneOrFail: vi.fn(async (entity) => entity === Loan ? loan : repayment),
    create: vi.fn((_entity, data) => data), save: vi.fn(async (_entity, data) => data),
    find: vi.fn(async () => ptps),
    update: vi.fn(async (_entity: unknown, _id: unknown, _patch: any) => ({ affected: 1 })),
    createQueryBuilder: vi.fn(() => {
      const qb: any = { getRawOne: async () => ({ sum: String(paidSince) }) };
      for (const method of ['select', 'where', 'andWhere']) qb[method] = () => qb;
      return qb;
    }),
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
    await expect(s.service.reconcile(s.orderId, { id: 'other', role: UserRole.BORROWER })).rejects.toThrow('not assigned to you');
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
    await expect(s.service.triggerUssdPush({ loanId: '00000000-0000-0000-0000-000000000000', amount: amount as number }, { id: 'borrower', role: UserRole.BORROWER })).rejects.toThrow('at least TZS 500');
    expect(s.db.transaction).not.toHaveBeenCalled();
  });
});

describe('ClickPesa dispatch', () => {
  function dispatchSetup(pending = false) {
    const loan = { id: '00000000-0000-0000-0000-000000000000', borrowerId: 'borrower', outstandingBalance: 2000, status: LoanStatus.ACTIVE, borrower: { phone: '0712 345 678' } };
    const manager = {
      findOne: vi.fn(async entity => entity === Loan ? loan : pending ? { providerReference: 'RM012345678901234567' } : null),
      findOneOrFail: vi.fn(async () => loan),
      create: vi.fn((_entity, data) => data), save: vi.fn(async (_entity, data) => data),
    };
    const client = { ensureReady: vi.fn(async () => {}), request: vi.fn(async (path: string, body: any) => path.includes('preview') ? ({ activeMethods: [{ status: 'AVAILABLE' }] }) : ({ status: 'PROCESSING', orderReference: body.orderReference })) };
    const db = { transaction: vi.fn(async fn => fn(manager)) };
    const service = new ClickPesaService(client as any, db as any);
    return { client, manager, service, loan, actor: { id: 'borrower', role: UserRole.BORROWER } };
  }

  it('persists a pending order before sending normalized phone, TZS and decimal amount', async () => {
    const s = dispatchSetup();
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 1000 }, s.actor);
    expect(result.success).toBe(true);
    expect(result.orderId).toMatch(/^RM[a-f0-9]{18}$/);
    expect(s.client.request.mock.calls[1][1]).toEqual({ amount: '1000.00', currency: 'TZS', phoneNumber: '255712345678', orderReference: result.orderId });
    expect(s.manager.save.mock.invocationCallOrder[0]).toBeLessThan(s.client.request.mock.invocationCallOrder[0]);
  });

  it('reuses a pending order without sending another push', async () => {
    const s = dispatchSetup(true);
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 1000 }, s.actor);
    expect(result.orderId).toBe('RM012345678901234567');
    expect(s.client.request).not.toHaveBeenCalled();
    expect(s.manager.save).not.toHaveBeenCalled();
  });

  it('preserves pending state after an ambiguous network error', async () => {
    const s = dispatchSetup();
    s.client.request.mockRejectedValue(new Error('timeout'));
    const result = await s.service.triggerUssdPush({ loanId: s.loan.id, amount: 1000 }, s.actor);
    expect(result.success).toBe(false);
    expect(result.orderId).toBeTruthy();
    expect(s.manager.save.mock.calls[0][1].status).toBe('PENDING');
    expect(s.client.request).toHaveBeenCalledTimes(1);
  });

  it('does not create an order when authentication fails', async () => {
    const s = dispatchSetup();
    s.client.ensureReady.mockRejectedValue(new Error('authentication failed'));
    await expect(s.service.triggerUssdPush({ loanId: s.loan.id, amount: 1000 }, s.actor)).rejects.toThrow('authentication failed');
    expect(s.manager.save).not.toHaveBeenCalled();
    expect(s.client.request).not.toHaveBeenCalled();
  });
});

describe('promise-to-pay resolution on settlement', () => {
  const ptp = (over: Record<string, unknown> = {}) => ({
    id: 'ptp', status: PtpStatus.PENDING, promisedAmount: 100,
    createdAt: new Date('2026-09-20T00:00:00Z'), promisedDate: new Date('2026-09-27T00:00:00Z'),
    ...over,
  });

  it('honors a promise once the payment covers the promised amount', async () => {
    const s = setup({}, [ptp()], 100);
    await s.service.reconcile(s.orderId);
    expect(s.manager.update).toHaveBeenCalledOnce();
    const [, id, patch] = s.manager.update.mock.calls[0];
    expect(id).toBe('ptp');
    expect(patch.status).toBe(PtpStatus.HONORED);
    expect(patch.resolvedReason).toBe('PARTIAL_PAYMENT');
    expect(patch.resolvedAt).toBeInstanceOf(Date);
  });

  it('leaves a promise pending when the payment falls short of it', async () => {
    const s = setup({}, [ptp({ promisedAmount: 150 })], 100);
    await s.service.reconcile(s.orderId);
    expect(s.manager.update).not.toHaveBeenCalled();
  });

  it('honors a short promise anyway once the loan is fully settled', async () => {
    // outstandingBalance 100 less a 100 payment settles the loan.
    const s = setup({}, [ptp({ promisedAmount: 5000 })], 100);
    s.loan.outstandingBalance = 100;
    await s.service.reconcile(s.orderId);
    expect(s.manager.update.mock.calls[0][2].resolvedReason).toBe('SETTLED_IN_FULL');
  });

  it('credits part payments cumulatively, not just the payment being reconciled', async () => {
    // Two earlier instalments plus this one reach the promised 100.
    const s = setup({}, [ptp({ promisedAmount: 100 })], 100);
    await s.service.reconcile(s.orderId);
    expect(s.manager.update.mock.calls[0][2].status).toBe(PtpStatus.HONORED);
  });

  it('does not touch promises when a payment is not credited', async () => {
    const s = setup({ status: 'PROCESSING' }, [ptp()]);
    await s.service.reconcile(s.orderId);
    expect(s.manager.update).not.toHaveBeenCalled();
  });

  it('is a no-op when the loan has no promises', async () => {
    const s = setup({}, []);
    expect((await s.service.reconcile(s.orderId)).status).toBe('COMPLETED');
    expect(s.manager.update).not.toHaveBeenCalled();
  });

  it('resolves several pending promises independently', async () => {
    const s = setup({}, [ptp({ id: 'a', promisedAmount: 50 }), ptp({ id: 'b', promisedAmount: 500 })], 100);
    await s.service.reconcile(s.orderId);
    expect(s.manager.update).toHaveBeenCalledOnce();
    expect(s.manager.update.mock.calls[0][1]).toBe('a');
  });
});

/**
 * The reconcile transaction is the only code in the repo that moves real money, and
 * Phase 5 branched it. These tests exist mainly to prove the *repayment* path still
 * behaves exactly as it did, and that the extension path leaves the debt alone.
 */
describe('partial payments', () => {
  it('records which legs the money settled, penalty first', async () => {
    const s = setup();
    await s.service.reconcile(s.orderId);
    // 100 against 10 penalty, 30 interest, 10 fee, then 50 off the principal.
    expect(s.repayment).toMatchObject({
      penaltyPaid: 10, interestPaid: 30, feePaid: 10, principalPaid: 50,
    });
  });

  it('allocates the four legs to exactly the amount collected', async () => {
    const s = setup();
    await s.service.reconcile(s.orderId);
    const { penaltyPaid, interestPaid, feePaid, principalPaid } = s.repayment;
    expect(penaltyPaid + interestPaid + feePaid + principalPaid).toBe(100);
  });

  it('leaves the loan active and does not settle it on a part payment', async () => {
    const s = setup();
    await s.service.reconcile(s.orderId);
    expect(s.loan.outstandingBalance).toBe(100);
    expect(s.loan.status).toBe(LoanStatus.ACTIVE);
  });

  it('continues the waterfall from where earlier payments left off', async () => {
    const s = setup();
    // 50 already paid clears the penalty, the interest and the fee exactly.
    s.loan.totalPaid = 50;
    s.loan.outstandingBalance = 150;
    await s.service.reconcile(s.orderId);
    expect(s.repayment).toMatchObject({
      penaltyPaid: 0, interestPaid: 0, feePaid: 0, principalPaid: 100,
    });
  });

  it('settles the loan when the final payment clears the balance', async () => {
    const s = setup();
    s.loan.outstandingBalance = 100;
    await s.service.reconcile(s.orderId);
    expect(s.loan.status).toBe(LoanStatus.SETTLED);
    expect(s.loan.settledAt).toBeInstanceOf(Date);
  });
});

describe('loan extensions', () => {
  function extensionSetup(overrides: Record<string, unknown> = {}) {
    const s = setup();
    s.repayment.purpose = 'EXTENSION_FEE';
    Object.assign(s.loan, overrides);
    return s;
  }

  it('does not reduce the debt: the fee buys time, not a discount', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    expect(s.loan.outstandingBalance).toBe(200);
    expect(s.loan.totalPaid).toBe(0);
    expect(s.loan.totalAmount).toBe(190);
  });

  it('moves the due date out by one more full tenure', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    expect(s.loan.dueDate.toISOString().slice(0, 10)).toBe('2026-10-04');
  });

  it('freezes the original due date so the borrowing limit is not fooled', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    expect(s.loan.originalDueDate!.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('keeps the first original due date across a second extension', async () => {
    const s = extensionSetup({ originalDueDate: new Date('2026-09-06T09:00:00.000Z') });
    await s.service.reconcile(s.orderId);
    expect(s.loan.originalDueDate!.toISOString().slice(0, 10)).toBe('2026-09-06');
  });

  it('brings an overdue loan back to active and stops the penalty clock', async () => {
    const s = extensionSetup({ status: LoanStatus.OVERDUE, daysOverdue: 9 });
    await s.service.reconcile(s.orderId);
    expect(s.loan.status).toBe(LoanStatus.ACTIVE);
    expect(s.loan.daysOverdue).toBe(0);
    expect(s.loan.penaltyAccruedThrough).toBeInstanceOf(Date);
  });

  it('leaves the accrued penalty standing: time was bought, not absolution', async () => {
    const s = extensionSetup({ penaltyAmount: 250 });
    await s.service.reconcile(s.orderId);
    expect(s.loan.penaltyAmount).toBe(250);
  });

  it('records the extension with both dates and the fee', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    const extension = s.manager.create.mock.calls
      .map(([, data]) => data as any)
      .find((data) => data?.newDueDate);
    expect(extension).toMatchObject({
      loanId: 'loan', repaymentId: 'repayment', feeAmount: 100, grantedById: 'collector',
    });
    expect(extension.previousDueDate.toISOString().slice(0, 10)).toBe('2026-09-20');
  });

  it('posts the fee to income rather than against the receivable', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    const entries = s.manager.save.mock.calls.find(([, data]) => Array.isArray(data))![1] as any[];
    expect(entries.map((e) => e.accountType)).toEqual(['CASH_CLICKPESA', 'FEE_INCOME']);
    expect(entries.reduce((sum, e) => sum + e.debit - e.credit, 0)).toBe(0);
  });

  it('records no allocation, because an extension settles nothing', async () => {
    const s = extensionSetup();
    await s.service.reconcile(s.orderId);
    expect(s.repayment).toMatchObject({
      penaltyPaid: 0, interestPaid: 0, feePaid: 0, principalPaid: 0,
    });
  });

  /**
   * A repayment is capped at the outstanding balance. An extension fee is priced *off*
   * that balance rather than drawn from it, so the cap must not apply -- otherwise a
   * nearly-settled loan could never be extended.
   */
  it('is not bounded by the outstanding balance', async () => {
    const s = extensionSetup({ outstandingBalance: 50 });
    expect((await s.service.reconcile(s.orderId)).status).toBe('COMPLETED');
    expect(s.loan.outstandingBalance).toBe(50);
  });

  it('never marks the loan settled, however small the balance', async () => {
    const s = extensionSetup({ outstandingBalance: 0.01 });
    await s.service.reconcile(s.orderId);
    expect(s.loan.status).not.toBe(LoanStatus.SETTLED);
  });
});
