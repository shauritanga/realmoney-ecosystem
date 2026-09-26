import { OnboardingService } from '../onboarding/onboarding.service.js';
import { SettingsService } from '../settings/settings.service.js';
import { Controller, Get, UseGuards, Query, Put, Body, Param, Post, Patch, ParseUUIDPipe } from '@nestjs/common';
import { CollectionsReportingService } from '../collections/collections-reporting.service.js';
import { PtpSweepService } from '../collections/ptp-sweep.service.js';
import { PenaltyAccrualService } from '../loans/penalty-accrual.service.js';
import { ActivityQueryDto } from '../collections/collections.dto.js';
import { AdminService } from './admin.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../database/enums.js';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly settings: SettingsService,
    private readonly onboarding: OnboardingService,
    private readonly reporting: CollectionsReportingService,
    private readonly ptpSweep: PtpSweepService,
    private readonly penaltyAccrual: PenaltyAccrualService,
  ) {}

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
  updateSettings(@Body() body: Record<string, unknown>) {
    return this.settings.update(body ?? {});
  }

  @Get('dashboard-stats')
  async getDashboardStats() {
    // The overdue count and the aging breakdown read persisted columns, which only
    // this sweep keeps current.
    await this.penaltyAccrual.sweep();
    return this.adminService.getDashboardStats();
  }

  /** Every extension granted, so repeat rolling is visible rather than discovered. */
  @Get('extensions')
  getExtensions(@Query('limit') limit?: string) {
    return this.adminService.getExtensions(limit ? Number(limit) : undefined);
  }

  @Get('collectors')
  getCollectors() {
    return this.adminService.getCollectors();
  }

  @Post('collectors')
  createCollector(@Body() body: { fullName: string; phone: string; email?: string; password: string }) {
    return this.adminService.createCollector(body);
  }

  @Patch('collectors/:id/status')
  toggleCollectorStatus(@Param('id') id: string) {
    return this.adminService.toggleCollectorStatus(id);
  }

  @Get('ledger')
  getLedger(@Query('limit') limit?: string) {
    return this.adminService.getLedgerEntries(limit ? parseInt(limit, 10) : 50);
  }

  /**
   * Collections follow-up activity over a date range: totals, channel and
   * disposition mix, a daily series, per-collector performance, the promise
   * pipeline, and the per-borrower contact breakdown.
   */
  @Get('collections/activity')
  getCollectionActivity(@Query() query: ActivityQueryDto) {
    return this.reporting.activity(query);
  }

  /** One borrower's contact timeline: every call, message and promise. */
  @Get('collections/borrowers/:id/timeline')
  getBorrowerTimeline(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityQueryDto,
  ) {
    return this.reporting.borrowerTimeline(id, query);
  }

  /** One collector's performance over a date range. */
  @Get('collections/collectors/:id/performance')
  getCollectorPerformance(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ActivityQueryDto,
  ) {
    return this.reporting.activity({ ...query, collectorId: id });
  }

  /** Flat rows for CSV export. Reports `truncated` rather than silently capping. */
  @Get('collections/activity/export')
  exportCollectionActivity(@Query() query: ActivityQueryDto) {
    return this.reporting.exportRows(query);
  }

  /** Cheap counts for the sidebar badge and alert banners. */
  @Get('collections/alerts')
  getCollectionAlerts() {
    return this.reporting.alerts();
  }

  /**
   * Force a promise sweep. The sweep also runs on read, so this exists for an
   * operator who wants to run it deliberately (or from an external scheduler).
   */
  @Post('collections/ptp/sweep')
  sweepPromises() {
    return this.ptpSweep.sweep().then((resolved) => ({ resolved }));
  }
}
