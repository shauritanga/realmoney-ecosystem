import { createHash } from 'node:crypto';
import { IDENTITY_POLICY_VERSION, requiredDocumentSides, identityFingerprint, evaluateIdentityDecision, type IdentitySession } from './identity-verification.js';
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
            identitySession: identityUnchanged ? old?.identitySession : undefined,
            identityAttempts: old?.identityAttempts,
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

  async profile(id: string, admin = false) {
    const user = await this.db.getRepository(User).findOne({ select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER } });
    if (!user) throw new NotFoundException('Borrower not found');
    const status = this.readiness(user);
    return { id: user.id, phone: user.phone, fullName: user.fullName, email: user.email, nationalId: user.nationalId,
      kycStatus: user.kycStatus, onboarding: this.publicOnboarding(user), identityVerification: { ...this.identitySummary(user), ...(admin ? { sessionReference: user.onboarding?.identitySession?.sessionId } : {}) }, ...status, development: this.provider.development };
  }

  readiness(user: User) {
    const profile = user.onboarding;
    const modeAllowed = (mode?: string) => mode === 'live' || (mode === 'development' && this.provider.development);
    const registrationComplete = !!(profile?.phoneVerifiedAt && modeAllowed(profile.phoneVerificationMode) && profile.dateOfBirth && profile.region && profile.district && profile.ward && profile.street && profile.consents?.length);
    const session = profile?.identitySession;
    const identityVerified = user.kycStatus === KycStatus.VERIFIED && !!profile?.identity && modeAllowed(profile.identity.mode) &&
      profile.identity.policyVersion === IDENTITY_POLICY_VERSION && session?.policyVersion === IDENTITY_POLICY_VERSION &&
      session.status === 'verified' && session.profileFingerprint === identityFingerprint(user) &&
      modeAllowed(session.mode) && !!session.checks && ['documentAuthenticity', 'documentSides', 'registrationMatch', 'liveness', 'faceMatch'].every(key => session.checks![key as keyof typeof session.checks] === true);
    const walletVerified = !!profile?.wallet && profile.wallet.phone === user.phone && modeAllowed(profile.wallet.mode) && !!profile.wallet.reference && !profile.wallet.reference.startsWith('auto-wallet-');
    const financialComplete = !!profile?.financial && Date.now() - new Date(profile.financial.updatedAt).getTime() <= 90 * 86400000;
    return { registrationComplete, identityVerified, walletVerified, financialComplete,
      canApply: registrationComplete && identityVerified && walletVerified && financialComplete };
  }

  private publicOnboarding(user: User) {
    if (!user.onboarding) return null;
    const { identitySession, identityAttempts, ...publicData } = user.onboarding;
    return publicData;
  }

  private identitySummary(user: User) {
    const config = this.provider.identityConfiguration();
    const session = user.onboarding?.identitySession;
    const current = session?.profileFingerprint === identityFingerprint(user) && session.policyVersion === IDENTITY_POLICY_VERSION &&
      (session.mode === 'live' || this.provider.development) ? session : undefined;
    const status = current?.status ?? 'not_started';
    return {
      available: config.available, policyVersion: IDENTITY_POLICY_VERSION,
      status, requiredSides: user.onboarding && ['NIDA', 'VOTER_ID', 'DRIVING_LICENSE', 'PASSPORT'].includes(user.onboarding.identityType) ? requiredDocumentSides(user.onboarding.identityType) : [],
      documentType: user.onboarding?.identityType,
      checks: current?.checks, completedAt: current?.completedAt, mode: current?.mode,
      notice: config.notice, noticeVersion: config.noticeVersion,
    };
  }

  async verifyIdentity(_id: string) {
    // Old clients cannot bypass document capture and liveness using the legacy endpoint.
    throw new BadRequestException('Update the app and complete document and live selfie verification');
  }

  async startIdentitySession(id: string, noticeVersion: string, consent: boolean) {
    return this.db.transaction(async manager => {
      const user = await manager.findOneOrFail(User, { select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER }, lock: { mode: 'pessimistic_write' } });
      if (!user.isActive || !this.readiness(user).registrationComplete) throw new BadRequestException('Complete registration first');
      const config = this.provider.identityConfiguration();
      if (!config.available) throw new BadRequestException('Document and selfie verification is not available yet. Please try again later.');
      if (consent !== true || noticeVersion !== config.noticeVersion) throw new BadRequestException('Read and accept the current identity verification notice');
      const profile = user.onboarding!;
      const previous = profile.identitySession;
      if (previous?.profileFingerprint === identityFingerprint(user) && previous.policyVersion === IDENTITY_POLICY_VERSION &&
          (previous.mode === 'live' || this.provider.development)) {
        if (previous.status === 'verified' || previous.status === 'review' || previous.status === 'processing') return { ...this.identitySummary(user), hostedUrl: null };
        if (['capture_required', 'processing'].includes(previous.status) && Date.parse(previous.expiresAt) > Date.now()) {
          return { ...this.identitySummary(user), hostedUrl: previous.status === 'capture_required' ? this.provider.validateCaptureUrl(previous.hostedUrl) : null };
        }
      }
      const attempts = (profile.identityAttempts ?? []).filter(at => Date.parse(at) > Date.now() - 86400000);
      if (attempts.length >= 3) throw new BadRequestException('You have reached the verification attempt limit. Please try again after 24 hours.');
      // Stable across failed/ambiguous provider calls; avoids duplicate paid sessions on retry.
      const requestId = createHash('sha256').update(JSON.stringify([
        identityFingerprint(user), previous?.requestId ?? null, new Date().toISOString().slice(0, 10),
      ])).digest('hex');
      const createdAt = new Date().toISOString();
      const result = await this.provider.identitySessionRequest('', {
        requestId, subjectId: user.id, policyVersion: IDENTITY_POLICY_VERSION,
        identity: { type: profile.identityType, fullName: user.fullName, number: user.nationalId, dateOfBirth: profile.dateOfBirth },
        requiredSides: requiredDocumentSides(profile.identityType),
        requiredChecks: ['documentAuthenticity', 'registrationMatch', 'liveness', 'faceMatch'],
        consent: { version: config.noticeVersion, text: config.notice, acceptedAt: createdAt },
      });
      if (!result || typeof result !== 'object' || Array.isArray(result) || typeof result.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{1,200}$/.test(result.sessionId) ||
          result.requestId !== requestId || result.subjectId !== user.id ||
          !['live', 'development'].includes(result.mode) || (result.mode !== 'live' && !this.provider.development) ||
          !Number.isFinite(Date.parse(result.expiresAt)) || Date.parse(result.expiresAt) <= Date.now() ||
          Date.parse(result.expiresAt) > Date.now() + 86400000) throw new BadRequestException('Invalid verification session');
      profile.identitySession = {
        sessionId: result.sessionId, requestId, policyVersion: IDENTITY_POLICY_VERSION,
        profileFingerprint: identityFingerprint(user), mode: result.mode,
        hostedUrl: this.provider.validateCaptureUrl(result.hostedUrl),
        createdAt, expiresAt: result.expiresAt, status: 'capture_required',
        consent: { version: config.noticeVersion, text: config.notice, acceptedAt: createdAt },
      };
      profile.identityAttempts = [...attempts, createdAt];
      profile.identity = undefined;
      user.kycStatus = KycStatus.PENDING;
      await manager.save(user);
      return { ...this.identitySummary(user), hostedUrl: profile.identitySession.hostedUrl };
    });
  }

  async refreshIdentitySession(id: string) {
    return this.db.transaction(async manager => {
      const user = await manager.findOneOrFail(User, { select: [...PROFILE_FIELDS], where: { id, role: UserRole.BORROWER }, lock: { mode: 'pessimistic_write' } });
      const session = user.onboarding?.identitySession;
      if (!user.isActive) throw new BadRequestException('Account is inactive');
      if (!session || session.profileFingerprint !== identityFingerprint(user) || session.policyVersion !== IDENTITY_POLICY_VERSION ||
          (session.mode !== 'live' && !this.provider.development)) return this.identitySummary(user);
      if (['verified', 'rejected', 'expired'].includes(session.status)) return this.identitySummary(user);
      if (session.checkedAt && Date.now() - Date.parse(session.checkedAt) < 15000) return this.identitySummary(user);
      const result = await this.provider.identitySessionRequest(`/${encodeURIComponent(session.sessionId)}`);
      const decision = evaluateIdentityDecision(user, session, result);
      session.checkedAt = new Date().toISOString();
      session.status = decision.status;
      session.checks = decision.checks;
      if (session.status === 'capture_required' && Date.parse(session.expiresAt) <= Date.now()) session.status = 'expired';
      if (session.status === 'verified') {
        session.completedAt = session.checkedAt;
        session.hostedUrl = '';
        user.onboarding!.identity = { verifiedAt: session.completedAt, reference: session.sessionId, mode: session.mode, policyVersion: IDENTITY_POLICY_VERSION };
        user.kycStatus = KycStatus.VERIFIED;
      } else {
        user.onboarding!.identity = undefined;
        user.kycStatus = session.status === 'rejected' ? KycStatus.REJECTED : KycStatus.PENDING;
        if (['rejected', 'expired'].includes(session.status)) session.hostedUrl = '';
      }
      await manager.save(user);
      return this.identitySummary(user);
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

  async getBorrowersKycQueue() {
    const users = await this.db.getRepository(User).find({
      select: [...PROFILE_FIELDS],
      where: { role: UserRole.BORROWER },
      order: { createdAt: 'DESC' },
    });
    return users.map(user => {
      const summary = this.identitySummary(user);
      const ready = this.readiness(user);
      return {
        id: user.id,
        phone: user.phone,
        fullName: user.fullName,
        email: user.email,
        nationalId: user.nationalId,
        kycStatus: user.kycStatus,
        createdAt: user.createdAt,
        onboarding: this.publicOnboarding(user),
        identityVerification: {
          ...summary,
          sessionReference: user.onboarding?.identitySession?.sessionId,
        },
        ...ready,
      };
    });
  }

  async approveBorrowerIdentity(id: string, _adminIdentifier = 'admin') {
    return this.db.transaction(async manager => {
      const user = await manager.findOneOrFail(User, {
        select: [...PROFILE_FIELDS],
        where: { id, role: UserRole.BORROWER },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user.isActive) throw new BadRequestException('Account is inactive');
      if (!user.onboarding) throw new BadRequestException('Borrower has no onboarding profile');
      const now = new Date().toISOString();
      const session: IdentitySession = user.onboarding.identitySession || {
        sessionId: `manual-${now.slice(0, 10)}`,
        requestId: `manual-${now.slice(0, 10)}`,
        policyVersion: IDENTITY_POLICY_VERSION,
        profileFingerprint: identityFingerprint(user),
        mode: 'live',
        status: 'review',
        hostedUrl: '',
        createdAt: now,
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        consent: { version: 'admin-override', text: 'Admin manual approval', acceptedAt: now },
      };
      session.status = 'verified';
      session.completedAt = now;
      session.checkedAt = now;
      session.checks = {
        documentAuthenticity: true,
        documentSides: true,
        registrationMatch: true,
        liveness: true,
        faceMatch: true,
      };
      user.onboarding.identitySession = session;
      user.onboarding.identity = {
        verifiedAt: now,
        reference: session.sessionId,
        mode: session.mode,
        policyVersion: IDENTITY_POLICY_VERSION,
      };
      user.kycStatus = KycStatus.VERIFIED;
      await manager.save(user);
      return this.profile(user.id, true);
    });
  }

  async resetBorrowerIdentity(id: string, _reason?: string) {
    return this.db.transaction(async manager => {
      const user = await manager.findOneOrFail(User, {
        select: [...PROFILE_FIELDS],
        where: { id, role: UserRole.BORROWER },
        lock: { mode: 'pessimistic_write' },
      });
      if (user.onboarding) {
        if (user.onboarding.identitySession) {
          user.onboarding.identitySession.status = 'capture_required';
          user.onboarding.identitySession.expiresAt = new Date(0).toISOString();
        }
        user.onboarding.identity = undefined;
      }
      user.kycStatus = KycStatus.PENDING;
      await manager.save(user);
      return this.profile(user.id, true);
    });
  }
}

