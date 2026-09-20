import { describe, expect, it } from 'vitest';
import { clickPesaPayoutFee, realMoneyProcessingRate, totalProcessingFee } from './clickpesa-fees.js';

describe('ClickPesa payout fee recovery', () => {
  it.each([
    [8_000, 430], [10_000, 642], [50_000, 1_460], [100_000, 1_868],
    [250_000, 2_220], [500_000, 4_672], [750_000, 6_560], [1_000_000, 8_508],
  ])('uses the published fee band for TZS %s', (amount, expected) => {
    expect(clickPesaPayoutFee(amount)).toBe(expected);
  });

  it('adds the product percentage and rounds up to TZS 50', () => {
    expect(realMoneyProcessingRate(8_000)).toBe(3);
    expect(realMoneyProcessingRate(50_000)).toBe(2.75);
    expect(realMoneyProcessingRate(200_000)).toBe(2.5);
    expect(realMoneyProcessingRate(500_000)).toBe(2.25);
    expect(totalProcessingFee(8_000)).toBe(700);
    expect(totalProcessingFee(1_000_000)).toBe(31_050);
  });

  it.each([0, 99, 1_000_001, Number.NaN])('rejects unsupported payout amounts: %s', amount => {
    expect(() => clickPesaPayoutFee(amount)).toThrow();
  });
});
