import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from '../database/entities/user.entity.js';
import { KycStatus, UserRole } from '../database/enums.js';
import { ProfileDto, RegisterDto, FinancialProfileDto } from './onboarding.dto.js';
import { PhoneVerificationService, normalizePhone } from './phone-verification.service.js';
import { LegalService } from './legal.service.js';
import { VerificationProvider } from './verification-provider.service.js';

export function validateBirthDate(value: string, now = new Date()) {
  const dob = new Date(value + 'T00:00:00Z');
  const cutoff = new Date(Date.UTC(now.getUTCFullYear() - 18, now.getUTCMonth(), now.getUTCDate()));
  if (!Number.isFinite(dob.getTime()) || dob.toISOString().slice(0, 10) !== value || dob > cutoff || dob.getUTCFullYear() < now.getUTCFullYear() - 120) {
    throw new BadRequestException('You must be at least 18 and provide a valid date of birth');
  }
}

const PROFILE_FIELDS = ['id', 'phone', 'fullName', 'nationalId', 'email', 'role', 'kycStatus', 'isActive', 'onboarding'] as const;

@Injectable()
export class OnboardingService {
  constructor(private readonly db: DataSource, private readonly phones: PhoneVerificationService,
    private readonly legal: LegalService, private readonly provider: VerificationProvider) {}

  async saveProfile(dto: ProfileDto | RegisterDto, userId?: string) {
    const phone = normalizePhone(dto.phone);
    validateBirthDate(dto.dateOfBirth);
    const legal = this.legal.getDocuments();
    if (!dto.acceptTerms || !dto.acknowledgePrivacy || dto.termsVersion !== legal.terms.version || dto.privacyVersion !== legal.privacy.version) {
      throw new BadRequestException('Read and accept the current account terms and acknowledge the privacy notice');
    }
    for (const field of ['fullName', 'region', 'district', 'ward', 'street'] as const) {
      if (dto[field].trim().length < 2) throw new BadRequestException(`${field} is required`);
    }
    const nationalId = dto.nationalId.replace(/[\s-]/g, '').toUpperCase();
    if (dto.identityType === 'NIDA' ? !/^\d{20}$/.test(nationalId) : !/^[A-Z0-9]{5,20}$/.test(nationalId)) {
      throw new BadRequestException('Enter a valid identity document number');
    }
    let passwordHash: string | undefined;
    if (!userId) {
      const register = dto as RegisterDto;
      if (register.password !== register.confirmPassword || Buffer.byteLength(register.password ?? '') > 72 || (register.password?.length ?? 0) < 10) {
        throw new BadRequestException('Passwords must match and contain 10–72 characters (at most 72 bytes)');
      }
      passwordHash = await bcrypt.hash(register.password, 12);
    }
    try {
      return await this.db.transaction(async (manager) => {
        const user = userId ? await manager.findOne(User, { select: [...PROFILE_FIELDS], where: { id: userId, role: UserRole.BORROWER }, lock: { mode: 'pessimistic_write' } }) : manager.create(User, { role: UserRole.BORROWER, passwordHash });
        if (!user) throw new NotFoundException('Borrower not found');
        if (userId && user.phone !== phone) throw new BadRequestException('Verify your existing account phone number');
        const verification = await this.phones.consume(manager, phone, dto.phoneProof);
        const old = user.onboarding;
        const identityUnchanged = user.fullName === dto.fullName.trim() && user.nationalId === nationalId &&
          old?.dateOfBirth === dto.dateOfBirth && old?.identityType === dto.identityType;
        Object.assign(user, { phone, fullName: dto.fullName.trim(), nationalId, email: dto.email?.trim().toLowerCase() || null,
          address: [dto.region, dto.district, dto.ward, dto.street, dto.landmark].filter(Boolean).join(', '),
          kycStatus: identityUnchanged ? user.kycStatus : KycStatus.PENDING,
          onboarding: {
            dateOfBirth: dto.dateOfBirth, identityType: dto.identityType, region: dto.region.trim(), district: dto.district.trim(),
            ward: dto.ward.trim(), street: dto.street.trim(), landmark: dto.landmark?.trim() || '', ...verification,
            consents: [...(old?.consents ?? []), { acceptedAt: new Date().toISOString(), termsVersion: legal.terms.version,
              privacyVersion: legal.privacy.version, termsText: legal.terms.text, privacyText: legal.privacy.text, marketingConsent: dto.marketingConsent }],
            financial: old?.financial,
            identity: identityUnchanged ? old?.identity : undefined,
            wallet: identityUnchanged ? old?.wallet : undefined,
          },
        });
        return manager.save(user);
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') throw new BadRequestException('An account with these identity or contact details already exists. Sign in or contact support.');
      throw error;
    }
  }

  async profile(id: string) {
    const user = await this.db.getRepository(User).findOne({ select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER } });
    if (!user) throw new NotFoundException('Borrower not found');
    const status = this.readiness(user);
    return { id: user.id, phone: user.phone, fullName: user.fullName, email: user.email, nationalId: user.nationalId,
      kycStatus: user.kycStatus, onboarding: user.onboarding, ...status, development: this.provider.development };
  }

  readiness(user: User) {
    const profile = user.onboarding;
    const modeAllowed = (mode?: string) => mode === 'live' || (mode === 'development' && this.provider.development);
    const registrationComplete = !!(profile?.phoneVerifiedAt && modeAllowed(profile.phoneVerificationMode) && profile.dateOfBirth && profile.region && profile.district && profile.ward && profile.street && profile.consents?.length);
    const identityVerified = user.kycStatus === KycStatus.VERIFIED && !!profile?.identity && modeAllowed(profile.identity.mode);
    const walletVerified = !!profile?.wallet && profile.wallet.phone === user.phone && modeAllowed(profile.wallet.mode);
    const financialComplete = !!profile?.financial && Date.now() - new Date(profile.financial.updatedAt).getTime() <= 90 * 86400000;
    return { registrationComplete, identityVerified, walletVerified, financialComplete,
      canApply: registrationComplete && identityVerified && walletVerified && financialComplete };
  }

  async verifyIdentity(id: string) {
    return this.db.transaction(async (manager) => {
      const user = await manager.findOneOrFail(User, { select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER }, lock: { mode: 'pessimistic_write' } });
      if (!this.readiness(user).registrationComplete) throw new BadRequestException('Complete registration first');
      const result = await this.provider.request('identity', { fullName: user.fullName, nationalId: user.nationalId,
        identityType: user.onboarding!.identityType, dateOfBirth: user.onboarding!.dateOfBirth });
      user.onboarding!.identity = { verifiedAt: new Date().toISOString(), reference: result.reference, mode: result.mode };
      user.kycStatus = KycStatus.VERIFIED;
      await manager.save(user);
      return { identityVerified: true, development: result.mode === 'development' };
    });
  }

  async saveFinancial(id: string, dto: FinancialProfileDto) {
    return this.db.transaction(async (manager) => {
      const user = await manager.findOneOrFail(User, { select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER }, lock: { mode: 'pessimistic_write' } });
      if (!this.readiness(user).identityVerified) throw new BadRequestException('Verify your identity first');
      const phone = normalizePhone(dto.walletPhone);
      if (phone !== user.phone) throw new BadRequestException('Use the mobile-money wallet on your verified account phone number');
      if (!dto.occupation.trim()) throw new BadRequestException('Occupation or income source is required');
      const result = await this.provider.request('wallet', { phone, provider: dto.walletProvider, fullName: user.fullName, nationalId: user.nationalId });
      user.onboarding!.financial = { employmentStatus: dto.employmentStatus, occupation: dto.occupation.trim(), monthlyIncome: dto.monthlyIncome,
        essentialExpenses: dto.essentialExpenses, existingLoanRepayments: dto.existingLoanRepayments, updatedAt: new Date().toISOString() };
      user.onboarding!.wallet = { phone, provider: dto.walletProvider, verifiedAt: new Date().toISOString(), reference: result.reference, mode: result.mode };
      await manager.save(user);
      return { walletVerified: true, development: result.mode === 'development' };
    });
  }

  async assertCanApply(id: string) {
    const user = await this.db.getRepository(User).findOne({ select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER } });
    if (!user || !user.isActive || !this.readiness(user).canApply) {
      throw new BadRequestException('Complete registration, identity verification, income details and wallet verification before applying');
    }
  }
}
