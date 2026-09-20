import { describe, it, expect, vi } from 'vitest';
import { SettingsService } from './settings.service.js';

describe('lending settings', () => {
  function setup() {
    let stored: { id: number; interestRateMonthly: number } | null = null;
    const repository = {
      findOneBy: vi.fn(async () => stored),
      upsert: vi.fn(async (value) => { stored = value; }),
    };
    return { repository, service: new SettingsService(repository as any) };
  }
  it('defaults to 40% and persists updates across service instances', async () => {
    const { repository, service } = setup();
    expect(await service.get()).toEqual({ interestRateMonthly: 40 });
    await service.update(32.25);
    expect(await new SettingsService(repository as any).get()).toEqual({ interestRateMonthly: 32.25 });
  });
  it.each([undefined, null, '40', NaN, Infinity, -1, 101, 1.234])('rejects invalid rate %s without writing', async (rate) => {
    const { service, repository } = setup();
    await expect(service.update(rate)).rejects.toThrow('Monthly interest rate');
    expect(repository.upsert).not.toHaveBeenCalled();
  });
  it.each([0, 40, 100, 0.01])('accepts valid rate %s', async (rate) => {
    const { service } = setup();
    expect(await service.update(rate)).toEqual({ interestRateMonthly: rate });
  });
});
