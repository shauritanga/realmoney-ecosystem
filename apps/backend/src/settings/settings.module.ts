import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { LendingSettings } from '../database/entities/lending-settings.entity.js';
import { SettingsService } from './settings.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([LendingSettings])],
  providers: [SettingsService],
  exports: [SettingsService],
})
export class SettingsModule {}
