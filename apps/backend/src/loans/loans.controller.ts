import { Controller, Get, Post, Body, Param, Query, UseGuards, Request, ForbiddenException } from '@nestjs/common';
import { LoansService } from './loans.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole, LoanStatus, AgingBucket } from '../database/enums.js';

@Controller('loans')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LoansController {
  constructor(private readonly loansService: LoansService) {}

  @Get('products')
  getProducts() {
    return this.loansService.getProducts();
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.COLLECTOR)
  getAllLoans(
    @Query('status') status?: LoanStatus,
    @Query('agingBucket') agingBucket?: AgingBucket,
    @Query('borrowerId') borrowerId?: string,
  ) {
    return this.loansService.getAllLoans({ status, agingBucket, borrowerId });
  }

  @Get('my-loans')
  @Roles(UserRole.BORROWER)
  getMyLoans(@Request() req: any) {
    return this.loansService.getMyLoans(req.user.id);
  }

  @Get('my-limit')
  @Roles(UserRole.BORROWER)
  getMyLimit(@Request() req: any) {
    return this.loansService.getBorrowingLimit(req.user.id);
  }

  @Get(':id')
  async getLoanById(@Param('id') id: string, @Request() req: any) {
    const loan = await this.loansService.getLoanById(id);
    if (req.user.role === UserRole.BORROWER && loan.borrowerId !== req.user.id) throw new ForbiddenException();
    // Do not expose password hashes or unrelated account records through loans.
    const borrower = loan.borrower;
    return { ...loan, borrower: borrower ? { id: borrower.id, fullName: borrower.fullName, phone: borrower.phone } : null,
      assignments: loan.assignments.map((assignment) => ({ ...assignment, collector: assignment.collector ? { id: assignment.collector.id, fullName: assignment.collector.fullName, phone: assignment.collector.phone } : null })),
    };
  }

  @Post('apply')
  @Roles(UserRole.BORROWER)
  applyForLoan(
    @Request() req: any,
    @Body() body: { productId: string; principalAmount: number; tenureDays: number },
  ) {
    return this.loansService.applyForLoan(req.user.id, body);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN)
  approveLoan(@Param('id') id: string, @Request() req: any) {
    return this.loansService.approveLoan(id, req.user.id);
  }

  @Post(':id/disburse')
  @Roles(UserRole.ADMIN)
  disburseLoan(@Param('id') id: string, @Request() req: any) {
    return this.loansService.disburseLoan(id, req.user.id);
  }
}
