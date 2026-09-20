import { OnboardingModule } from '../onboarding/onboarding.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LoansService } from './loans.service.js';
import { LoansController } from './loans.controller.js';
import { SelcomModule } from '../selcom/selcom.module.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanProduct } from '../database/entities/loan-product.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';

@Module({
  imports: [OnboardingModule, SettingsModule, TypeOrmModule.forFeature([Loan, LoanProduct, LedgerEntry]), SelcomModule],
  controllers: [LoansController],
  providers: [LoansService],
  exports: [LoansService],
})
export class LoansModule {}
