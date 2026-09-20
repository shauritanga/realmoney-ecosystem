import { describe, it, expect, vi } from 'vitest';
import { borrowingLimit } from './borrowing-limit.js';
import { LoanStatus } from '../database/enums.js';
import { LoansService } from './loans.service.js';

const loan = {
  principalAmount: 100000,
  dueDate: new Date('2026-09-20T12:00:00Z'),
  settledAt: new Date('2026-09-20T12:00:00Z'),
  status: LoanStatus.SETTLED,
  outstandingBalance: 0,
};

describe('borrowing limit policy', () => {
  it('retains the initial allowance for new borrowers', () => {
    expect(borrowingLimit(null).amount).toBe(8000);
  });
  it('increases principal by 25% for early and exact-deadline settlement', () => {
    expect(borrowingLimit(loan).amount).toBe(125000);
    expect(borrowingLimit({ ...loan, settledAt: new Date('2026-09-19') }).amount).toBe(125000);
  });
  it('keeps the same principal even one millisecond late', () => {
    expect(borrowingLimit({ ...loan, settledAt: new Date(loan.dueDate.getTime() + 1) }).amount).toBe(100000);
  });
  it('does not reward partial repayments or missing settlement evidence', () => {
    expect(borrowingLimit({ ...loan, outstandingBalance: 1 }).amount).toBe(100000);
    expect(borrowingLimit({ ...loan, status: LoanStatus.ACTIVE }).amount).toBe(100000);
    expect(borrowingLimit({ ...loan, settledAt: null }).amount).toBe(100000);
  });
  it('compounds only from each actual principal and rounds down to whole TZS', () => {
    expect(borrowingLimit({ ...loan, principalAmount: 125000 }).amount).toBe(156250);
    expect(borrowingLimit({ ...loan, principalAmount: 100001 }).amount).toBe(125001);
    expect(borrowingLimit(loan)).toEqual(borrowingLimit(loan));
  });
});

describe('application limit enforcement', () => {
  function setup(previous: typeof loan | null = loan, maxAmount = 500000, active: object | null = null) {
    const loans = {
      findOne: vi.fn().mockResolvedValueOnce(previous).mockResolvedValueOnce(active),
      count: vi.fn().mockResolvedValue(1),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
    };
    const products = { findOne: vi.fn().mockResolvedValue({ id: 'product', isActive: true, minAmount: 10000, maxAmount, interestRateMonthly: 10, minTenureDays: 7, maxTenureDays: 30, processingFeeRate: 2 }) };
    const settings = { get: vi.fn().mockResolvedValue({ interestRateMonthly: 40 }) };
    const service = new LoansService(loans as any, products as any, {} as any, {} as any, {} as any, settings as any, { assertCanApply: vi.fn().mockResolvedValue(undefined) } as any);
    return { service, loans, settings, products };
  }
  const apply = (service: LoansService, principalAmount: number) => service.applyForLoan('borrower', { productId: 'product', principalAmount, tenureDays: 14 });
  it('rejects amounts above the earned limit without saving', async () => {
    const { service, loans } = setup();
    await expect(apply(service, 125001)).rejects.toThrow('borrowing limit');
    expect(loans.save).not.toHaveBeenCalled();
    expect(loans.findOne).toHaveBeenCalledWith({ where: { borrowerId: 'borrower', status: LoanStatus.SETTLED }, order: { createdAt: 'DESC', id: 'DESC' } });
  });
  it('uses the saved global rate for both product quotes and new loans', async () => {
    const { service, settings, products } = setup();
    Object.assign(products, { find: vi.fn().mockResolvedValue([{ interestRateMonthly: 10 }]) });
    settings.get.mockResolvedValue({ interestRateMonthly: 30 });
    expect((await service.getProducts())[0].interestRateMonthly).toBe(30);
    expect((await apply(service, 100000)).interestAmount).toBe(60000);
  });
  it('charges the 7-day rate without monthly proration', async () => {
    const { service } = setup();
    const loan = await service.applyForLoan('borrower', { productId: 'product', principalAmount: 10000, tenureDays: 7 });
    expect(loan.interestAmount).toBe(4000);
    expect(loan.totalAmount).toBe(10000 + 4000 + 200);
  });
  it('accepts the exact earned allowance', async () => {
    const { service } = setup();
    expect((await apply(service, 125000)).principalAmount).toBe(125000);
  });
  it('retains the same limit after late settlement', async () => {
    const { service } = setup({ ...loan, settledAt: new Date('2026-09-21') });
    await expect(apply(service, 100001)).rejects.toThrow('borrowing limit');
  });
  it('still enforces product maximums', async () => {
    const { service } = setup(loan, 110000);
    await expect(apply(service, 125000)).rejects.toThrow('Amount must be between');
  });
  it('blocks borrowing before an existing debt is cleared', async () => {
    const { service } = setup(loan, 500000, { status: LoanStatus.DEFAULTED });
    await expect(apply(service, 100000)).rejects.toThrow('active or pending');
  });
  it.each([NaN, Infinity, -1, 0])('rejects invalid amount %s', async (amount) => {
    const { service } = setup();
    await expect(apply(service, amount)).rejects.toThrow('positive number');
  });
});
