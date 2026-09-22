import { describe, it, expect, vi, afterEach } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PhoneVerificationService, normalizePhone } from './phone-verification.service.js';
import { PhoneChallenge } from '../database/entities/phone-challenge.entity.js';
import { VerificationProvider } from './verification-provider.service.js';
import { LegalService } from './legal.service.js';
import { OnboardingService, validateBirthDate } from './onboarding.service.js';
import { RegisterDto, FinancialProfileDto } from './onboarding.dto.js';
import { User } from '../database/entities/user.entity.js';
import { KycStatus } from '../database/enums.js';

function memoryDb() {
  const tables = new Map<any, Map<string, any>>();
  const table = (entity: any) => { if (!tables.has(entity)) tables.set(entity, new Map()); return tables.get(entity)!; };
  const key = (row: any) => row.id || row.phone || row.key;
  const manager: any = {
    create: (entity: any, values: any) => Object.assign(new entity(), values),
    save: vi.fn(async (row: any) => {
      if (row instanceof User && !row.id) { row.id = 'borrower'; row.isActive = true; }
      table(row.constructor).set(key(row), row); return row;
    }),
    findOne: vi.fn(async (entity: any, options: any) => {
      return [...table(entity).values()].find(row => Object.entries(options.where).every(([k, v]) => row[k] === v)) ?? null;
    }),
    findOneOrFail: async (entity: any, options: any) => {
      const row = await manager.findOne(entity, options); if (!row) throw new Error('Not found'); return row;
    },
    createQueryBuilder: () => {
      let entity: any, values: any;
      const builder: any = {
        insert: () => builder, into: (e: any) => { entity = e; return builder; },
        values: (v: any) => { values = v; return builder; }, orIgnore: () => builder,
        execute: async () => { if (!table(entity).has(key(values))) table(entity).set(key(values), Object.assign(new entity(), values)); },
      }; return builder;
    },
  };
  const db: any = { transaction: async (fn: any) => fn(manager), getRepository: (entity: any) => ({ findOne: (options: any) => manager.findOne(entity, options) }) };
  return { db, manager, table };
}
function setup() {
  const memory = memoryDb();
  const config = new ConfigService({ NODE_ENV: 'test', ONBOARDING_DEV_MODE: 'true', IDENTITY_VERIFICATION_ENABLED: 'true', IDENTITY_PRIVACY_NOTICE_APPROVED: 'true', IDENTITY_PRIVACY_NOTICE_TEXT: 'Synthetic document and biometric verification notice.', VERIFICATION_BRIDGE_URL: 'https://bridge.example', VERIFICATION_BRIDGE_TOKEN: 'test', IDENTITY_CAPTURE_HOSTS: 'capture.example' });
  const provider = new VerificationProvider(config);
  const phones = new PhoneVerificationService(memory.db, config, provider);
  const legal = new LegalService(config, provider);
  const onboarding = new OnboardingService(memory.db, phones, legal, provider);
  return { ...memory, config, provider, phones, legal, onboarding };
}
const valid = {
  phone: '+255712345678', phoneProof: 'a'.repeat(64), fullName: 'Test Borrower', dateOfBirth: '1990-01-01',
  identityType: 'NIDA', nationalId: '19900101123450000101', region: 'Dar es Salaam', district: 'Kinondoni',
  ward: 'Mikocheni', street: 'Test street', termsVersion: 'x', privacyVersion: 'y',
  acceptTerms: true, acknowledgePrivacy: true, marketingConsent: false,
  password: 'LongSecret123!', confirmPassword: 'LongSecret123!',
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('phone verification', () => {
  it('normalizes local and international phone numbers', () => {
    expect(normalizePhone('0712 345 678')).toBe('+255712345678');
    expect(normalizePhone('255712345678')).toBe('+255712345678');
    expect(() => normalizePhone('+44712345678')).toThrow();
  });
  it('stores hashed codes, issues single-use proofs and binds them to the phone', async () => {
    const { phones, table, manager } = setup();
    const sent = await phones.send(valid.phone, '127.0.0.1');
    const row = table(PhoneChallenge).get(valid.phone);
    expect(row.codeHash).not.toContain(sent.developmentCode);
    const verified = await phones.verify(valid.phone, sent.developmentCode!);
    await expect(phones.consume(manager, '+255712345679', verified.phoneProof)).rejects.toThrow();
    await expect(phones.verify(valid.phone, sent.developmentCode!)).rejects.toThrow();
    expect(await phones.consume(manager, valid.phone, verified.phoneProof)).toHaveProperty('phoneVerifiedAt');
    await expect(phones.consume(manager, valid.phone, verified.phoneProof)).rejects.toThrow();
  });
  it('enforces cooldown, expiry and five incorrect attempts', async () => {
    vi.useFakeTimers();
    const { phones } = setup();
    const sent = await phones.send(valid.phone, 'ip');
    await expect(phones.send(valid.phone, 'ip')).rejects.toThrow('60 seconds');
    for (let i = 0; i < 5; i++) await expect(phones.verify(valid.phone, '000000')).rejects.toThrow();
    await expect(phones.verify(valid.phone, sent.developmentCode!)).rejects.toThrow();
    vi.advanceTimersByTime(60001);
    const next = await phones.send(valid.phone, 'ip');
    vi.advanceTimersByTime(300001);
    await expect(phones.verify(valid.phone, next.developmentCode!)).rejects.toThrow();
  });
  it('expires proof after 30 minutes and enforces phone send budget', async () => {
    vi.useFakeTimers();
    const { phones, manager } = setup();
    const sent = await phones.send(valid.phone, 'ip');
    const proof = await phones.verify(valid.phone, sent.developmentCode!);
    vi.advanceTimersByTime(1800001);
    await expect(phones.consume(manager, valid.phone, proof.phoneProof)).rejects.toThrow();
    for (let i = 0; i < 4; i++) { await phones.send(valid.phone, 'ip'); vi.advanceTimersByTime(60001); }
    await expect(phones.send(valid.phone, 'ip')).rejects.toThrow('Too many');
  });
  it('cannot enable development bypass in production', async () => {
    const provider = new VerificationProvider(new ConfigService({ NODE_ENV: 'production', ONBOARDING_DEV_MODE: 'true' }));
    expect(provider.development).toBe(false);
    await expect(provider.request('sms', {})).rejects.toThrow('not configured');
  });
});

describe('registration and pre-loan checks', () => {
  it('validates adulthood and rejects impossible dates', () => {
    expect(() => validateBirthDate('2008-09-19', new Date('2026-09-19'))).not.toThrow();
    expect(() => validateBirthDate('2008-09-20', new Date('2026-09-19'))).toThrow();
    expect(() => validateBirthDate('2000-02-30')).toThrow();
  });
  it('requires full registration data and rejects invalid financial amounts', async () => {
    expect(await validate(plainToInstance(RegisterDto, valid))).toHaveLength(0);
    expect((await validate(plainToInstance(RegisterDto, { phone: valid.phone }))).length).toBeGreaterThan(5);
    expect((await validate(plainToInstance(FinancialProfileDto, { monthlyIncome: -1, essentialExpenses: NaN }))).length).toBeGreaterThan(0);
  });
  it('rejects mismatched passwords and stale legal acceptance', async () => {
    const { onboarding, legal } = setup();
    const docs = legal.getDocuments();
    const dto = { ...valid, termsVersion: docs.terms.version, privacyVersion: docs.privacy.version };
    await expect(onboarding.saveProfile({ ...dto, confirmPassword: 'different password' })).rejects.toThrow('Passwords must match');
    await expect(onboarding.saveProfile({ ...dto, acceptTerms: false })).rejects.toThrow('current account terms');
    await expect(onboarding.saveProfile({ ...dto, termsVersion: 'old' })).rejects.toThrow('current account terms');
  });
  it('completes registration → identity → financial/wallet and gates applications', async () => {
    const { onboarding, phones, legal, table } = setup();
    const sent = await phones.send(valid.phone, 'ip');
    const proof = await phones.verify(valid.phone, sent.developmentCode!);
    const docs = legal.getDocuments();
    const user = await onboarding.saveProfile({ ...valid, phoneProof: proof.phoneProof, termsVersion: docs.terms.version, privacyVersion: docs.privacy.version });
    expect(user.passwordHash).not.toBe(valid.password);
    expect(user.onboarding?.consents[0].marketingConsent).toBe(false);
    expect(user.onboarding?.consents[0].termsText).toBe(docs.terms.text);
    await expect(onboarding.assertCanApply(user.id)).rejects.toThrow();
    await expect(onboarding.verifyIdentity(user.id)).rejects.toThrow('Update the app');
    const provider = (onboarding as any).provider as VerificationProvider;
    const request = vi.spyOn(provider, 'identitySessionRequest');
    request.mockImplementation(async (_path, payload) => ({
      sessionId: 'session-test', requestId: payload!.requestId, subjectId: user.id,
      mode: 'development', hostedUrl: 'https://capture.example/session', expiresAt: new Date(Date.now() + 3600000).toISOString(),
    }));
    await onboarding.startIdentitySession(user.id, provider.identityConfiguration().noticeVersion, true);
    request.mockResolvedValue(identityResult(user));
    await onboarding.refreshIdentitySession(user.id);
    const financial = { employmentStatus: 'EMPLOYED', occupation: 'Teacher', monthlyIncome: 500000, essentialExpenses: 200000,
      existingLoanRepayments: 0, walletPhone: valid.phone, walletProvider: 'MPESA' };
    await expect(onboarding.saveFinancial(user.id, { ...financial, walletPhone: '+255712345679' })).rejects.toThrow('verified account');
    await onboarding.saveFinancial(user.id, financial);
    await expect(onboarding.assertCanApply(user.id)).resolves.toBeUndefined();
    const stored = table(User).get(user.id);
    stored.onboarding.financial.updatedAt = new Date(Date.now() - 91 * 86400000).toISOString();
    await expect(onboarding.assertCanApply(user.id)).rejects.toThrow();
  });
  it('does not grandfather legacy users or trust development evidence in production', () => {
    const { onboarding } = setup();
    expect(onboarding.readiness({ kycStatus: KycStatus.VERIFIED } as User).canApply).toBe(false);
    const provider = new VerificationProvider(new ConfigService({ NODE_ENV: 'production', ONBOARDING_DEV_MODE: 'true' }));
    const service = new OnboardingService({} as any, {} as any, {} as any, provider);
    expect(service.readiness({ kycStatus: KycStatus.VERIFIED, onboarding: { identity: { mode: 'development' }, wallet: { mode: 'development' }, phoneVerificationMode: 'development' } } as User).canApply).toBe(false);
  });
  it('requires approved legal documents outside development', () => {
    const config = new ConfigService({ NODE_ENV: 'production', ACCOUNT_TERMS_TEXT: 'text', PRIVACY_NOTICE_TEXT: 'text' });
    expect(() => new LegalService(config, new VerificationProvider(config)).getDocuments()).toThrow('not configured');
  });
  it('serves legal documents when review is approved', () => {
    const config = new ConfigService({ NODE_ENV: 'production', LEGAL_REVIEW_APPROVED: 'true' });
    const docs = new LegalService(config, new VerificationProvider(config)).getDocuments();
    expect(docs.draft).toBe(false);
    expect(docs.terms.text).toContain('RealMoney');
    expect(docs.privacy.text).toContain('RealMoney');
  });
});

describe('provider adapters', () => {
  it('sends Beem SMS with Basic authentication and never exposes the code as development', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ successful: true, request_id: 123 }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ BEEM_API_KEY: 'key', BEEM_API_SECRET: 'secret', BEEM_SENDER_ID: 'RealMoney' }));
    expect((await provider.request('sms', { phone: valid.phone, message: 'test code' })).mode).toBe('live');
    expect(fetchMock.mock.calls[0][0]).toBe('https://apisms.beem.africa/v1/send');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).recipients[0].dest_addr).toBe('255712345678');
  });
  it('sends Africa\'s Talking SMS when selected and treats accepted recipients as live delivery', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ SMSMessageData: { Recipients: [{ statusCode: 101, messageId: 'ATXid_test' }] } }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ SMS_PROVIDER: 'africas_talking', AFRICASTALKING_USERNAME: 'shauritanga', AFRICASTALKING_API_KEY: 'key' }));
    expect((await provider.request('sms', { phone: valid.phone, message: 'test code' })).reference).toBe('ATXid_test');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.africastalking.com/version1/messaging');
    expect(fetchMock.mock.calls[0][1].headers.apiKey).toBe('key');
    expect(fetchMock.mock.calls[0][1].body).toContain('username=shauritanga');
    expect(fetchMock.mock.calls[0][1].body).toContain('to=%2B255712345678');
  });
  it('validates supported wallet providers and Tanzanian mobile format for ClickPesa disbursements', async () => {
    const provider = new VerificationProvider(new ConfigService({}));
    const result = await provider.request('wallet', { phone: valid.phone, provider: 'MPESA' });
    expect(result.verified).toBe(true);
    expect(result.reference).toMatch(/^cp-wallet-/);
    expect(result.mode).toBe('live');
    await expect(provider.request('wallet', { phone: valid.phone, provider: 'INVALID_PROVIDER' })).rejects.toThrow('Unsupported');
    await expect(provider.request('wallet', { phone: '12345', provider: 'MPESA' })).rejects.toThrow('Tanzanian mobile number');
  });
  it('requires positive identity-provider evidence and does not turn timeouts into verified status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ VERIFICATION_BRIDGE_URL: 'https://verification.example', VERIFICATION_BRIDGE_TOKEN: 'secret' }));
    await expect(provider.request('identity', {})).rejects.toThrow('did not pass');
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(provider.request('identity', {})).rejects.toThrow('unavailable');
  });
  it('never treats production auto-verify flags as identity provider evidence', async () => {
    const provider = new VerificationProvider(new ConfigService({ NODE_ENV: 'production', AUTO_VERIFY_ONBOARDING: 'true', AUTO_VERIFY_IDENTITY: 'true' }));
    await expect(provider.request('identity', {})).rejects.toThrow('not configured');
  });
});

function identityResult(user: User, overrides: Record<string, unknown> = {}) {
  const session = user.onboarding!.identitySession!;
  return {
    sessionId: session.sessionId, requestId: session.requestId, subjectId: user.id,
    mode: session.mode, status: 'verified',
    document: { authentic: true, capturedSides: ['front', 'back'], type: user.onboarding!.identityType,
      fullName: user.fullName, number: user.nationalId, dateOfBirth: user.onboarding!.dateOfBirth },
    liveness: { passed: true }, faceMatch: { passed: true }, ...overrides,
  };
}
async function identitySetup() {
  const env = setup();
  const sent = await env.phones.send(valid.phone, 'ip');
  const proof = await env.phones.verify(valid.phone, sent.developmentCode!);
  const docs = env.legal.getDocuments();
  const user = await env.onboarding.saveProfile({ ...valid, phoneProof: proof.phoneProof, termsVersion: docs.terms.version, privacyVersion: docs.privacy.version });
  const request = vi.spyOn(env.provider, 'identitySessionRequest').mockImplementation(async (_path, payload) => ({
    sessionId: 'session-test', requestId: payload!.requestId, subjectId: user.id,
    mode: 'development', hostedUrl: 'https://capture.example/session', expiresAt: new Date(Date.now() + 3600000).toISOString(),
  }));
  const start = () => env.onboarding.startIdentitySession(user.id, env.provider.identityConfiguration().noticeVersion, true);
  return { ...env, user, request, start };
}

describe('document and biometric verification sessions', () => {
  it('requires consent and the exact current notice', async () => {
    const { onboarding, user, request } = await identitySetup();
    await expect(onboarding.startIdentitySession(user.id, 'old', true)).rejects.toThrow('current identity');
    await expect(onboarding.startIdentitySession(user.id, 'old', false)).rejects.toThrow('current identity');
    expect(request).not.toHaveBeenCalled();
  });
  it('binds capture requirements to registration and reuses an active session', async () => {
    const { start, request, onboarding, user } = await identitySetup();
    await start(); await start();
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][1]).toMatchObject({ requiredSides: ['front', 'back'], identity: { type: 'NIDA' } });
    const profile = await onboarding.profile(user.id);
    expect(profile.onboarding).not.toHaveProperty('identitySession');
    expect(JSON.stringify(profile)).not.toContain('https://capture.example/session');
    expect(profile.canApply).toBe(false);
  });
  it('requires only the biodata page for a passport', async () => {
    const { user, start, request, onboarding } = await identitySetup();
    user.onboarding!.identityType = 'PASSPORT';
    await start();
    expect(request.mock.calls[0][1]).toMatchObject({ requiredSides: ['biodata'] });
    const result = identityResult(user); result.document.capturedSides = ['biodata'];
    request.mockResolvedValue(result);
    expect((await onboarding.refreshIdentitySession(user.id)).status).toBe('verified');
  });
  it.each(['liveness', 'faceMatch'])('does not approve a missing %s check', async (check) => {
    const { start, user, request, onboarding } = await identitySetup();
    await start(); request.mockResolvedValue(identityResult(user, { [check]: { passed: false } }));
    expect((await onboarding.refreshIdentitySession(user.id)).status).toBe('review');
    expect((await onboarding.profile(user.id)).identityVerified).toBe(false);
  });
  it.each(['authentic', 'capturedSides', 'number', 'type', 'fullName', 'dateOfBirth'])('does not approve invalid document %s', async field => {
    const { start, user, request, onboarding } = await identitySetup();
    await start(); const result = identityResult(user);
    (result.document as any)[field] = field === 'authentic' ? false : field === 'capturedSides' ? ['front'] : 'different';
    request.mockResolvedValue(result);
    expect((await onboarding.refreshIdentitySession(user.id)).status).toBe('review');
  });
  it.each(['sessionId', 'requestId', 'subjectId', 'mode'])('rejects a result with a different %s', async field => {
    const { start, user, request, onboarding } = await identitySetup();
    await start(); request.mockResolvedValue(identityResult(user, { [field]: 'another' }));
    await expect(onboarding.refreshIdentitySession(user.id)).rejects.toThrow('does not match');
    expect((await onboarding.profile(user.id)).identityVerified).toBe(false);
  });
  it('keeps processing and review pending, refreshes review, and ignores stale profile evidence', async () => {
    const { start, user, request, onboarding } = await identitySetup();
    await start(); request.mockResolvedValue(identityResult(user, { status: 'review' }));
    expect((await onboarding.refreshIdentitySession(user.id)).status).toBe('review');
    expect((await start()).hostedUrl).toBeNull();
    user.onboarding!.identitySession!.checkedAt = new Date(Date.now() - 16000).toISOString();
    request.mockResolvedValue(identityResult(user));
    await onboarding.refreshIdentitySession(user.id);
    expect((await onboarding.profile(user.id)).identityVerified).toBe(true);
    user.nationalId = 'changed';
    expect((await onboarding.profile(user.id)).identityVerified).toBe(false);
  });
  it('preserves pending state on provider failure and limits successful session creation', async () => {
    const { start, user, request, onboarding } = await identitySetup();
    await start(); request.mockRejectedValue(new Error('timeout'));
    await expect(onboarding.refreshIdentitySession(user.id)).rejects.toThrow();
    expect(user.onboarding!.identitySession!.status).toBe('capture_required');
    user.onboarding!.identitySession!.status = 'expired';
    user.onboarding!.identityAttempts = Array(3).fill(new Date().toISOString());
    await expect(start()).rejects.toThrow('attempt limit');
  });
  it('uses the same provider idempotency key after an ambiguous session-create failure', async () => {
    const { start, request } = await identitySetup();
    request.mockRejectedValue(new Error('timeout'));
    await expect(start()).rejects.toThrow('timeout');
    await expect(start()).rejects.toThrow('timeout');
    expect(request.mock.calls[0][1]!.requestId).toBe(request.mock.calls[1][1]!.requestId);
  });
  it('requires recapture of development evidence after switching to production', async () => {
    const { start, user, request, onboarding, config } = await identitySetup();
    await start(); request.mockResolvedValue(identityResult(user));
    await onboarding.refreshIdentitySession(user.id);
    config.set('NODE_ENV', 'production');
    const profile = await onboarding.profile(user.id);
    expect(profile.identityVerified).toBe(false);
    expect(profile.identityVerification.status).toBe('not_started');
  });
  it('authenticates bridge requests, rejects redirects/failures, and keeps errors generic', async () => {
    const { provider } = setup();
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'processing' }) });
    vi.stubGlobal('fetch', fetchMock);
    await provider.identitySessionRequest('', { subjectId: 'test-borrower' });
    expect(fetchMock.mock.calls[0][0]).toBe('https://bridge.example/identity/sessions');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'POST', redirect: 'error', headers: { Authorization: 'Bearer test' } });
    await provider.identitySessionRequest('/session-test');
    expect(fetchMock.mock.calls[1][1].method).toBe('GET');
    fetchMock.mockRejectedValue(new Error('secret provider internals'));
    await expect(provider.identitySessionRequest('/session-test')).rejects.toThrow('temporarily unavailable');
  });
  it('does not start hosted sessions with unapproved privacy configuration', async () => {
    const { provider, config } = setup();
    config.set('IDENTITY_PRIVACY_NOTICE_APPROVED', 'false');
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    expect(provider.identityConfiguration().available).toBe(false);
    await expect(provider.identitySessionRequest('', {})).rejects.toThrow('not available yet');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('rejects unsafe capture URLs', () => {
    const { provider } = setup();
    for (const url of ['http://capture.example/a', 'https://capture.example.evil/a', 'https://user@capture.example/a', 'https://capture.example:8443/a', 'bad']) {
      expect(() => provider.validateCaptureUrl(url)).toThrow();
    }
    expect(provider.validateCaptureUrl('https://capture.example/a')).toBe('https://capture.example/a');
  });
  it('cannot grant live access from legacy identity or wallet auto approvals', () => {
    const { onboarding } = setup();
    const user = { id: 'old', phone: valid.phone, kycStatus: KycStatus.VERIFIED,
      onboarding: { identity: { mode: 'live', reference: 'auto-identity-x' }, wallet: { mode: 'live', phone: valid.phone, reference: 'auto-wallet-x' } } } as User;
    expect(onboarding.readiness(user).identityVerified).toBe(false);
    expect(onboarding.readiness(user).walletVerified).toBe(false);
  });
});
