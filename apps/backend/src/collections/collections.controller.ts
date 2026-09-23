import { Controller, Get, Post, Body, Query, UseGuards, Request, BadRequestException } from '@nestjs/common';
import { CollectionsService } from './collections.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole, CommunicationChannel, DispositionCode } from '../database/enums.js';
import { CollectionLevel, COLLECTION_LEVELS } from './collection-level.js';

@Controller('collections')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  /**
   * Collector's daily work queue — single level only.
   * Optional ?level=M2|M1|ZERO|T1|T2|T3 narrows further.
   */
  @Get('my-queue')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  getMyQueue(@Request() req: any, @Query('level') level?: string) {
    let parsed: CollectionLevel | undefined;
    if (level) {
      if (!COLLECTION_LEVELS.includes(level as CollectionLevel)) {
        throw new BadRequestException(
          `Unknown level '${level}'. Use one of: ${COLLECTION_LEVELS.join(', ')}`,
        );
      }
      parsed = level as CollectionLevel;
    }
    return this.collectionsService.getCollectorQueue(req.user.id, parsed);
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
   * Log post-contact disposition (Call, WhatsApp, SMS notes)
   */
  @Post('log-interaction')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN)
  logInteraction(
    @Request() req: any,
    @Body()
    body: {
      loanId: string;
      channel: CommunicationChannel;
      disposition: DispositionCode;
      notes?: string;
      durationSeconds?: number;
      ptpAmount?: number;
      ptpDate?: string;
    },
  ) {
    return this.collectionsService.logInteraction(req.user.id, body);
  }

  /**
   * Trigger ClickPesa USSD push prompt directly to borrower
   */
  @Post('trigger-payment')
  @Roles(UserRole.COLLECTOR, UserRole.ADMIN, UserRole.BORROWER)
  triggerPayment(
    @Request() req: any,
    @Body() body: { loanId: string; amount: number },
  ) {
    return this.collectionsService.triggerUssdPushPayment(req.user, body);
  }

  /**
   * Admin: Assign a single loan to a collector (no level mixing).
   */
  @Post('assign')
  @Roles(UserRole.ADMIN)
  assignLoan(
    @Request() req: any,
    @Body() body: { loanId: string; collectorId: string },
  ) {
    return this.collectionsService.assignLoanToCollector(body.loanId, body.collectorId, req.user.id);
  }

  /**
   * Admin: Unassign a loan from its current collector.
   */
  @Post('unassign')
  @Roles(UserRole.ADMIN)
  unassignLoan(@Body() body: { loanId: string }) {
    return this.collectionsService.unassignLoan(body.loanId);
  }

  /**
   * Admin: Bulk-assign up to `limit` unassigned loans of ONE level —
   * e.g. 45x T1 cases to one collector for the day.
   */
  @Post('auto-assign')
  @Roles(UserRole.ADMIN)
  autoAssign(
    @Request() req: any,
    @Body() body: { collectorId: string; level: CollectionLevel; limit?: number },
  ) {
    return this.collectionsService.autoAssignLevel(
      body.collectorId,
      body.level,
      req.user.id,
      body.limit ?? 45,
    );
  }
}
