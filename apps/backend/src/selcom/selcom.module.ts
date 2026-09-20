import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SelcomService } from './selcom.service.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LedgerEntry } from '../database/entities/ledger-entry.entity.js';

@Module({
  imports: [TypeOrmModule.forFeature([Repayment, Loan, LedgerEntry])],
  providers: [SelcomService],
  exports: [SelcomService],
})
export class SelcomModule {}
