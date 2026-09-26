import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LendingSettings } from '../database/entities/lending-settings.entity.js';

/**
 * The singleton row of lending policy every loan is priced against.
 *
 * Widened from a single interest rate when extensions arrived: an extension fee and
 * the penalty ceiling are the same kind of knob and belong in the same place, rather
 * than as constants somebody has to redeploy to change.
 */
export interface LendingConfig {
  interestRateMonthly: number;
  extensionFeePercent: number;
  maxExtensions: number;
  maxPenaltyPercentOfPrincipal: number;
}

export const LENDING_DEFAULTS: LendingConfig = {
  interestRateMonthly: 40,
  extensionFeePercent: 25,
  maxExtensions: 2,
  maxPenaltyPercentOfPrincipal: 100,
};

/** Human labels, so a rejection names the field the way the admin screen does. */
const LABELS: Record<keyof LendingConfig, string> = {
  interestRateMonthly: 'Monthly interest rate',
  extensionFeePercent: 'Extension fee percentage',
  maxExtensions: 'Maximum extensions per loan',
  maxPenaltyPercentOfPrincipal: 'Penalty ceiling',
};

const RANGES: Record<keyof LendingConfig, { min: number; max: number; integer?: boolean }> = {
  interestRateMonthly: { min: 0, max: 100 },
  extensionFeePercent: { min: 0, max: 100 },
  // Zero is a legitimate setting: it switches extensions off entirely.
  maxExtensions: { min: 0, max: 12, integer: true },
  // Allows a ceiling above the principal, and 0 to disable it.
  maxPenaltyPercentOfPrincipal: { min: 0, max: 1000 },
};

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(LendingSettings) private readonly settings: Repository<LendingSettings>,
  ) {}

  async get(): Promise<LendingConfig> {
    const stored = await this.settings.findOneBy({ id: 1 });
    return {
      interestRateMonthly: numberOr(stored?.interestRateMonthly, LENDING_DEFAULTS.interestRateMonthly),
      extensionFeePercent: numberOr(stored?.extensionFeePercent, LENDING_DEFAULTS.extensionFeePercent),
      maxExtensions: numberOr(stored?.maxExtensions, LENDING_DEFAULTS.maxExtensions),
      maxPenaltyPercentOfPrincipal: numberOr(
        stored?.maxPenaltyPercentOfPrincipal,
        LENDING_DEFAULTS.maxPenaltyPercentOfPrincipal,
      ),
    };
  }

  /**
   * Applies a partial update. Fields left out keep their current value, so the admin
   * screen can save one knob without having to send the others back.
   */
  async update(patch: Partial<Record<keyof LendingConfig, unknown>>): Promise<LendingConfig> {
    if (!patch || typeof patch !== 'object') {
      throw new BadRequestException('No settings supplied');
    }

    const current = await this.get();
    const next: LendingConfig = { ...current };
    let changed = false;

    for (const key of Object.keys(RANGES) as (keyof LendingConfig)[]) {
      if (!(key in patch) || patch[key] === undefined) continue;
      next[key] = validate(key, patch[key]);
      changed = true;
    }

    if (!changed) throw new BadRequestException('No settings supplied');

    await this.settings.upsert({ id: 1, ...next }, ['id']);
    return next;
  }
}

function numberOr(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return value === null || value === undefined || Number.isNaN(parsed) ? fallback : parsed;
}

function validate(key: keyof LendingConfig, value: unknown): number {
  const { min, max, integer } = RANGES[key];
  const label = LABELS[key];

  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
    throw new BadRequestException(`${label} must be between ${min} and ${max}`);
  }
  if (integer && !Number.isInteger(value)) {
    throw new BadRequestException(`${label} must be a whole number`);
  }
  // Rejects values the numeric(x,2) column would silently round.
  if (!integer && Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    throw new BadRequestException(`${label} must have at most two decimal places`);
  }
  return value;
}
