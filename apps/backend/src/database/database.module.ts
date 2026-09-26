import { PaymentWebhookEvent } from './entities/payment-webhook-event.entity.js';
import { PhoneChallenge, OnboardingRateLimit } from './entities/phone-challenge.entity.js';
import { LendingSettings } from './entities/lending-settings.entity.js';
import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './entities/user.entity.js';
import { LoanProduct } from './entities/loan-product.entity.js';
import { Loan } from './entities/loan.entity.js';
import { Repayment } from './entities/repayment.entity.js';
import { LedgerEntry } from './entities/ledger-entry.entity.js';
import { LoanExtension } from './entities/loan-extension.entity.js';
import { CollectorAssignment } from './entities/collector-assignment.entity.js';
import { InteractionLog } from './entities/interaction-log.entity.js';
import { PromiseToPay } from './entities/promise-to-pay.entity.js';
import { DeviceToken } from '../notifications/device-token.entity.js';
import { Location } from './entities/location.entity.js';

export const APP_ENTITIES = [
  PaymentWebhookEvent,
  PhoneChallenge, OnboardingRateLimit,
  LendingSettings,
  User,
  LoanProduct,
  Loan,
  Repayment,
  LoanExtension,
  LedgerEntry,
  CollectorAssignment,
  InteractionLog,
  PromiseToPay,
  DeviceToken,
  Location,
];

@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.get<string>(
          'DATABASE_URL',
          'postgres://postgres:postgrespassword@localhost:5432/realmoney_db',
        ),
        entities: APP_ENTITIES,
        // Auto-sync schema in dev; use migrations in production.
        synchronize: config.get<string>('TYPEORM_SYNC', 'true') === 'true',
        logging: config.get<string>('TYPEORM_LOGGING', 'false') === 'true',
      }),
    }),
  ],
})
export class DatabaseModule {}
