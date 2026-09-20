/** Published ClickPesa mobile-money payout fees in TZS. */
const PAYOUT_BANDS: ReadonlyArray<readonly [number, number, number]> = [
  [100, 999, 52], [1_000, 1_999, 72], [2_000, 2_999, 104],
  [3_000, 3_999, 116], [4_000, 4_999, 168], [5_000, 6_999, 234],
  [7_000, 7_999, 360], [8_000, 9_999, 430], [10_000, 14_999, 642],
  [15_000, 19_999, 680], [20_000, 29_999, 700], [30_000, 39_999, 980],
  [40_000, 49_999, 1_038], [50_000, 99_999, 1_460], [100_000, 199_999, 1_868],
  [200_000, 299_999, 2_220], [300_000, 399_999, 3_180], [400_000, 499_999, 3_764],
  [500_000, 599_999, 4_672], [600_000, 699_999, 5_712], [700_000, 799_999, 6_560],
  [800_000, 899_999, 7_800], [900_000, 1_000_000, 8_508],
];

export function clickPesaPayoutFee(amount: number): number {
  if (!Number.isFinite(amount) || amount < 100 || amount > 1_000_000) {
    throw new RangeError('ClickPesa payout fee supports amounts from TZS 100 to TZS 1,000,000');
  }
  const band = PAYOUT_BANDS.find(([min, max]) => amount >= min && amount <= max);
  if (!band) throw new RangeError('No ClickPesa payout fee band exists for this amount');
  return band[2];
}

/** RealMoney's amount-based fee rate. Smaller loans carry a higher percentage. */
export function realMoneyProcessingRate(amount: number): number {
  if (amount < 8_000 || amount > 1_000_000) throw new RangeError('Loan amount must be between TZS 8,000 and TZS 1,000,000');
  if (amount < 50_000) return 3;
  if (amount < 200_000) return 2.75;
  if (amount < 500_000) return 2.5;
  return 2.25;
}

/** RealMoney fee plus payout cost, rounded up to a customer-friendly TZS 50. */
export function totalProcessingFee(principal: number): number {
  const raw = principal * (realMoneyProcessingRate(principal) / 100) + clickPesaPayoutFee(principal);
  return Math.ceil(raw / 50) * 50;
}
