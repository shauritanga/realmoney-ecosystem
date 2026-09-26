import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, ParseUUIDPipe, ForbiddenException } from '@nestjs/common';
import { CollectionsService } from './collections.service.js';
import { PtpSweepService } from './ptp-sweep.service.js';
import { PenaltyAccrualService } from '../loans/penalty-accrual.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../database/enums.js';
import {
  AssignLoanDto,
  AutoAssignDto,
  FollowUpQueryDto,
  InteractionHistoryQueryDto,
  LogInteractionDto,
  PromiseQueryDto,
  QueueQueryDto,
  TriggerPaymentDto,
  ExtendLoanDto,
  UnassignLoanDto,
  ActivityQueryDto,
} from './collections.dto.js';
import { CollectionsReportingService } from './collections-reporting.service.js';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(
    private readonly collectionsService: CollectionsService,
    private readonly ptpSweep: PtpSweepService,
    private readonly penaltyAccrual: PenaltyAccrualService,
    private readonly reporting: CollectionsReportingService,
  ) {}

  /**
   * Collector's daily work queue — single level only.
   * Optional ?level=M2|M1|ZERO|T1|T2|T3 narrows further.
   *
   * Sweeps lapsed promises first so a broken promise shows as broken. The level
   * string no longer needs a hand-rolled check: @IsEnum in QueueQueryDto rejects it.
   */
  @Get('my-queue')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async getMyQueue(@Request() req: any, @Query() query: QueueQueryDto) {
    // Both sweeps before the read: a queue that shows a stale balance would have the
    // collector quote a figure the borrower is not actually being charged.
    await Promise.all([this.ptpSweep.sweep(), this.penaltyAccrual.sweep()]);
    return this.collectionsService.getCollectorQueue(req.user.id, query.level);
  }

  /**
   * Collector daily stats
   */
  @Get('stats')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  getStats(@Request() req: any) {
    return this.collectionsService.getCollectorStats(req.user.id);
  }

  /**
   * One case, refreshed. The app previously re-pulled the entire queue and picked
   * itself out of it to refresh a single screen.
   */
  @Get('cases/:loanId')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async getCase(@Request() req: any, @Param('loanId', ParseUUIDPipe) loanId: string) {
    await Promise.all([this.ptpSweep.sweep(), this.penaltyAccrual.sweep(undefined, [loanId])]);
    return this.collectionsService.getCase(req.user, loanId);
  }

  /**
   * Full contact history for a case, newest first, cursor-paginated.
   * Replaces the 3-item preview the app had to infer everything from.
   */
  @Get('cases/:loanId/interactions')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  getCaseHistory(
    @Request() req: any,
    @Param('loanId', ParseUUIDPipe) loanId: string,
    @Query() query: InteractionHistoryQueryDto,
  ) {
    return this.collectionsService.getCaseHistory(req.user, loanId, query);
  }

  /**
   * Callbacks and promises coming due for this collector — the work the old app
   * could record but never resurface.
   */
  @Get('follow-ups')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async getFollowUps(@Request() req: any, @Query() query: FollowUpQueryDto) {
    await this.ptpSweep.sweep();
    return this.collectionsService.getFollowUps(req.user.id, query.on);
  }

  /**
   * Every promise this collector has secured, with a tally by state. Backs the
   * app's PTP tab.
   */
  @Get('promises')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async getMyPromises(@Request() req: any, @Query() query: PromiseQueryDto) {
    await this.ptpSweep.sweep();
    return this.collectionsService.getMyPromises(req.user.id, query.status);
  }

  /**
   * This collector's own performance over a date range -- the same figures an admin
   * sees for them, scoped to themselves.
   */
  @Get('me/performance')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  getMyPerformance(@Request() req: any, @Query() query: ActivityQueryDto) {
    return this.reporting.activity({ ...query, collectorId: req.user.id });
  }

  /**
   * Log a contact attempt and the customer's response.
   */
  @Post('log-interaction')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  logInteraction(@Request() req: any, @Body() body: LogInteractionDto) {
    return this.collectionsService.logInteraction(req.user, body);
  }

  /**
   * Trigger ClickPesa USSD push prompt directly to borrower
   */
  @Post('trigger-payment')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN, UserRole.BORROWER)
  triggerPayment(@Request() req: any, @Body() body: TriggerPaymentDto) {
    // A borrower may pay their own loan but may not redirect the prompt to someone
    // else's phone: there is no legitimate flow behind it and it muddies who
    // authorised the debit.
    if (req.user.role === UserRole.BORROWER && body.payerPhone) {
      throw new ForbiddenException('Only a collector or admin can send a payment request to another number');
    }
    return this.collectionsService.triggerUssdPushPayment(req.user, body);
  }

  /**
   * What an extension would cost right now -- fee, new due date, and how many are
   * left. Read-only, so the collector can quote it before the borrower commits.
   */
  @Get('cases/:loanId/extension-quote')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async getExtensionQuote(@Request() req: any, @Param('loanId', ParseUUIDPipe) loanId: string) {
    // Price it off a current balance: an extension quoted from a stale figure is a
    // different number from the one the borrower will be charged.
    await this.penaltyAccrual.sweep(undefined, [loanId]);
    return this.collectionsService.quoteLoanExtension(req.user, loanId);
  }

  /**
   * Offer an extension and push the fee for payment. Collector and admin only -- the
   * borrower app has no extension controls, by design.
   */
  @Post('extend-loan')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  async extendLoan(@Request() req: any, @Body() body: ExtendLoanDto) {
    await this.penaltyAccrual.sweep(undefined, [body.loanId]);
    return this.collectionsService.extendLoan(req.user, body);
  }

  /** Every extension granted on a case. */
  @Get('cases/:loanId/extensions')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  getLoanExtensions(@Request() req: any, @Param('loanId', ParseUUIDPipe) loanId: string) {
    return this.collectionsService.getLoanExtensions(req.user, loanId);
  }

  /**
   * Admin: Assign a single loan to a collector (no level mixing).
   */
  @Post('assign')
  @Roles(UserRole.ADMIN)
  assignLoan(@Request() req: any, @Body() body: AssignLoanDto) {
    return this.collectionsService.assignLoanToCollector(body.loanId, body.collectorId, req.user.id);
  }

  /**
   * Admin: Unassign a loan from its current collector.
   */
  @Post('unassign')
  @Roles(UserRole.ADMIN)
  unassignLoan(@Body() body: UnassignLoanDto) {
    return this.collectionsService.unassignLoan(body.loanId);
  }

  /**
   * Admin: Bulk-assign up to `limit` unassigned loans of ONE level —
   * e.g. 45x T1 cases to one collector for the day.
   */
  @Post('auto-assign')
  @Roles(UserRole.ADMIN)
  autoAssign(@Request() req: any, @Body() body: AutoAssignDto) {
    return this.collectionsService.autoAssignLevel(
      body.collectorId,
      body.level,
      req.user.id,
      body.limit ?? 45,
    );
  }
}
