import { describe, it, expect, vi } from 'vitest';
import { LoansService } from './loans.service.js';
import { LoanStatus } from '../database/enums.js';

describe('identity checks before loan approval and payout', () => {
  it.each(['approveLoan', 'disburseLoan'] as const)('blocks %s when current verification fails', async action => {
    const loans = { update: vi.fn() };
    const payments = { disburseLoan: vi.fn() };
    const onboarding = { assertCanApply: vi.fn().mockRejectedValue(new Error('Verification required')) };
    const service = new LoansService(loans as any, {} as any, {} as any, {} as any, payments as any, {} as any, onboarding as any);
    vi.spyOn(service, 'getLoanById').mockResolvedValue({ id: 'loan', borrowerId: 'borrower', status: action === 'approveLoan' ? LoanStatus.PENDING : LoanStatus.APPROVED } as any);
    await expect(service[action]('loan', 'admin')).rejects.toThrow('Verification required');
    expect(onboarding.assertCanApply).toHaveBeenCalledWith('borrower');
    expect(loans.update).not.toHaveBeenCalled();
    expect(payments.disburseLoan).not.toHaveBeenCalled();
  });
});
