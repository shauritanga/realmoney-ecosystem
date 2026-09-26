import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Loan } from '../database/entities/loan.entity.js';
import { SettingsModule } from '../settings/settings.module.js';
import { PenaltyAccrualService } from './penalty-accrual.service.js';

/**
 * Stands apart from LoansModule so collections and admin can run the sweep without
 * importing the whole lending service, which would put a cycle between them.
 */
@Module({
  imports: [TypeOrmModule.forFeature([Loan]), SettingsModule],
  providers: [PenaltyAccrualService],
  exports: [PenaltyAccrualService],
})
export class PenaltyModule {}
