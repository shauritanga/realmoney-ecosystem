import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { Loan } from '../database/entities/loan.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';
import { User } from '../database/entities/user.entity.js';

@Module({
  imports: [OnboardingModule, SettingsModule, TypeOrmModule.forFeature([Loan, Repayment, LedgerEntry, User])],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
