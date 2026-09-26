import { describe, it, expect, vi } from 'vitest';
import { SettingsService, LENDING_DEFAULTS } from './settings.service.js';

describe('lending settings', () => {
  function setup(initial: Record<string, unknown> | null = null) {
    let stored = initial;
    const repository = {
      findOneBy: vi.fn(async () => stored),
      upsert: vi.fn(async (value: any) => { stored = value; }),
    };
    return { repository, service: new SettingsService(repository as any) };
  }

  it('falls back to the documented defaults when nothing is stored', async () => {
    const { service } = setup();
    expect(await service.get()).toEqual(LENDING_DEFAULTS);
  });

  it('persists updates across service instances', async () => {
    const { repository, service } = setup();
    await service.update({ interestRateMonthly: 32.25 });
    const reloaded = await new SettingsService(repository as any).get();
    expect(reloaded.interestRateMonthly).toBe(32.25);
  });

  it('applies a partial update without disturbing the other knobs', async () => {
    const { service } = setup();
    await service.update({ interestRateMonthly: 12 });
    const after = await service.update({ maxExtensions: 1 });
    expect(after).toEqual({ ...LENDING_DEFAULTS, interestRateMonthly: 12, maxExtensions: 1 });
  });

  it.each([undefined, null, '40', NaN, Infinity, -1, 101, 1.234])(
    'rejects invalid interest rate %s without writing',
    async (rate) => {
      const { service, repository } = setup();
      await expect(service.update({ interestRateMonthly: rate })).rejects.toThrow(
        /Monthly interest rate|No settings supplied/,
      );
      expect(repository.upsert).not.toHaveBeenCalled();
    },
  );

  it.each([0, 40, 100, 0.01])('accepts valid interest rate %s', async (rate) => {
    const { service } = setup();
    expect((await service.update({ interestRateMonthly: rate })).interestRateMonthly).toBe(rate);
  });

  it.each([0, 25, 50, 12.5])('accepts extension fee %s%%', async (percent) => {
    const { service } = setup();
    expect((await service.update({ extensionFeePercent: percent })).extensionFeePercent).toBe(percent);
  });

  it('requires a whole number of extensions', async () => {
    const { service } = setup();
    await expect(service.update({ maxExtensions: 1.5 })).rejects.toThrow('whole number');
  });

  it('allows extensions to be switched off entirely', async () => {
    const { service } = setup();
    expect((await service.update({ maxExtensions: 0 })).maxExtensions).toBe(0);
  });

  it('allows a penalty ceiling above the principal, and zero to disable it', async () => {
    const { service } = setup();
    expect((await service.update({ maxPenaltyPercentOfPrincipal: 200 })).maxPenaltyPercentOfPrincipal).toBe(200);
    expect((await service.update({ maxPenaltyPercentOfPrincipal: 0 })).maxPenaltyPercentOfPrincipal).toBe(0);
  });

  it('rejects an empty patch rather than writing the defaults over stored values', async () => {
    const { service, repository } = setup();
    await expect(service.update({})).rejects.toThrow('No settings supplied');
    expect(repository.upsert).not.toHaveBeenCalled();
  });
});
