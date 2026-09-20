import { PhoneVerificationService } from '../onboarding/phone-verification.service.js';
import { LegalService } from '../onboarding/legal.service.js';
import { RegisterDto, PhoneDto, VerifyPhoneDto } from '../onboarding/onboarding.dto.js';
import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly phones: PhoneVerificationService,
    private readonly legal: LegalService) {}

  @Get('legal') legalDocuments() { return this.legal.getDocuments(); }
  @Post('phone-code') sendCode(@Body() body: PhoneDto, @Request() req: any) {
    return this.phones.send(body.phone, req.ip || req.socket.remoteAddress || 'unknown');
  }
  @Post('verify-phone') verifyPhone(@Body() body: VerifyPhoneDto) {
    return this.phones.verify(body.phone, body.code);
  }

  @Post('login')
  async login(@Body() body: { identifier: string; password: string }) {
    const user = await this.authService.validateUser(body.identifier, body.password);
    return this.authService.login(user);
  }

  @Post('register')
  register(@Body() body: RegisterDto) {
    return this.authService.registerBorrower(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@Request() req: any) {
    return req.user;
  }
}
