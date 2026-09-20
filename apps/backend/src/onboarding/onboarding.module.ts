import { Module } from '@nestjs/common';
import { OnboardingService } from './onboarding.service.js';
import { PhoneVerificationService } from './phone-verification.service.js';
import { VerificationProvider } from './verification-provider.service.js';
import { LegalService } from './legal.service.js';
import { OnboardingController } from './onboarding.controller.js';

@Module({
  controllers: [OnboardingController],
  providers: [OnboardingService, PhoneVerificationService, VerificationProvider, LegalService],
  exports: [OnboardingService, PhoneVerificationService, LegalService],
})
export class OnboardingModule {}
