import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { SelcomModule } from './selcom/selcom.module.js';
import { LoansModule } from './loans/loans.module.js';
import { CollectionsModule } from './collections/collections.module.js';
import { AdminModule } from './admin/admin.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { LocationsModule } from './locations/locations.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    SelcomModule,
    LoansModule,
    CollectionsModule,
    AdminModule,
    NotificationsModule,
    LocationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
