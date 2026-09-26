import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsService } from './collections.service.js';
import { PtpSweepService } from './ptp-sweep.service.js';
import { CollectionsReportingService } from './collections-reporting.service.js';
import { CollectionsController } from './collections.controller.js';
import { ClickPesaModule } from '../clickpesa/clickpesa.module.js';
import { PenaltyModule } from '../loans/penalty.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { CollectorAssignment } from '../database/entities/collector-assignment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { LoanExtension } from '../database/entities/loan-extension.entity.js';
import { InteractionLog } from '../database/entities/interaction-log.entity.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';
import { User } from '../database/entities/user.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      CollectorAssignment,
      Loan,
      LoanExtension,
      InteractionLog,
      PromiseToPay,
      Repayment,
      // Reports LEFT JOIN from users so collectors with no activity still appear.
      User,
    ]),
    ClickPesaModule,
    PenaltyModule,
    SettingsModule,
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService, PtpSweepService, CollectionsReportingService],
  exports: [CollectionsService, PtpSweepService, CollectionsReportingService],
})
export class CollectionsModule {}
