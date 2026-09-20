import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CollectionsService } from './collections.service.js';
import { CollectionsController } from './collections.controller.js';
import { ClickPesaModule } from '../clickpesa/clickpesa.module.js';
import { CollectorAssignment } from '../database/entities/collector-assignment.entity.js';
import { Loan } from '../database/entities/loan.entity.js';
import { InteractionLog } from '../database/entities/interaction-log.entity.js';
import { PromiseToPay } from '../database/entities/promise-to-pay.entity.js';
import { Repayment } from '../database/entities/repayment.entity.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([CollectorAssignment, Loan, InteractionLog, PromiseToPay, Repayment]),
    ClickPesaModule,
  ],
  controllers: [CollectionsController],
  providers: [CollectionsService],
  exports: [CollectionsService],
})
export class CollectionsModule {}
