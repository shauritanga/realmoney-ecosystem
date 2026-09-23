import { OnboardingService } from '../onboarding/onboarding.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Controller, Get, UseGuards, Query, Put, Body, Param, Post } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../database/enums.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService, private readonly settings: SettingsService, private readonly onboarding: OnboardingService) {}

  @Get('borrowers/kyc-queue')
  getBorrowersKycQueue() { return this.onboarding.getBorrowersKycQueue(); }

  @Get('borrowers/:id/onboarding')
  getBorrowerOnboarding(@Param('id') id: string) { return this.onboarding.profile(id, true); }

  @Post('borrowers/:id/identity/refresh')
  refreshBorrowerIdentity(@Param('id') id: string) { return this.onboarding.refreshIdentitySession(id); }

  @Post('borrowers/:id/identity/approve')
  approveBorrowerIdentity(@Param('id') id: string) {
    return this.onboarding.approveBorrowerIdentity(id);
  }

  @Post('borrowers/:id/identity/reset')
  resetBorrowerIdentity(@Param('id') id: string, @Body() body: { reason?: string }) {
    return this.onboarding.resetBorrowerIdentity(id, body?.reason);
  }

  @Get('settings')
  getSettings() { return this.settings.get(); }

  @Put('settings')
  updateSettings(@Body() body: { interestRateMonthly?: unknown }) {
    return this.settings.update(body?.interestRateMonthly);
  }

  @Get('dashboard-stats')
  getDashboardStats() {
    return this.adminService.getDashboardStats();
  }

  @Get('collectors')
  getCollectors() {
    return this.adminService.getCollectors();
  }

  @Post('collectors')
  createCollector(@Body() body: { fullName: string; phone: string; email?: string; password: string }) {
    return this.adminService.createCollector(body);
  }

  @Get('ledger')
  getLedger(@Query('limit') limit?: string) {
    return this.adminService.getLedgerEntries(limit ? parseInt(limit, 10) : 50);
  }
}
