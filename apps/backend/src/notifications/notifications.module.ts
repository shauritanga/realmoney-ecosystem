import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeviceToken } from './device-token.entity.js';
import { NotificationsService } from './notifications.service.js';
import { NotificationsController } from './notifications.controller.js';

@Module({
  imports: [TypeOrmModule.forFeature([DeviceToken])],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
