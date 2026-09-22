import { Body, Controller, Get, Post, Put, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesGuard } from '../auth/roles.guard.js';
import { Roles } from '../auth/roles.decorator.js';
import { UserRole } from '../database/enums.js';
import { FinancialProfileDto, ProfileDto, IdentitySessionDto } from './onboarding.dto.js';
import { OnboardingService } from './onboarding.service.js';

@Controller('onboarding')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.BORROWER)
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}
  @Get() profile(@Request() req: any) { return this.onboarding.profile(req.user.id); }
  @Put('profile') async saveProfile(@Request() req: any, @Body() body: ProfileDto) {
    await this.onboarding.saveProfile(body, req.user.id);
    return this.onboarding.profile(req.user.id);
  }
  @Post('identity/session') startIdentity(@Request() req: any, @Body() body: IdentitySessionDto) {
    return this.onboarding.startIdentitySession(req.user.id, body.noticeVersion, body.consent);
  }
  @Post('identity/refresh') refreshIdentity(@Request() req: any) {
    return this.onboarding.refreshIdentitySession(req.user.id);
  }
  @Post('verify-identity') verifyIdentity(@Request() req: any) { return this.onboarding.verifyIdentity(req.user.id); }
  @Put('financial') saveFinancial(@Request() req: any, @Body() body: FinancialProfileDto) {
    return this.onboarding.saveFinancial(req.user.id, body);
  }
}
