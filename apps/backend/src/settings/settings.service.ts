import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LendingSettings } from '../database/entities/lending-settings.entity.js';

@Injectable()
export class SettingsService {
  constructor(@InjectRepository(LendingSettings) private readonly settings: Repository<LendingSettings>) {}

  async get() {
    const stored = await this.settings.findOneBy({ id: 1 });
    return { interestRateMonthly: Number(stored?.interestRateMonthly ?? 40) };
  }

  async update(rate: unknown) {
    if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 100 ||
        Math.abs(rate * 100 - Math.round(rate * 100)) > 0.000001) {
      throw new BadRequestException('Monthly interest rate must be between 0 and 100, with at most two decimal places');
    }
    await this.settings.upsert({ id: 1, interestRateMonthly: rate }, ['id']);
    return { interestRateMonthly: rate };
  }
}
