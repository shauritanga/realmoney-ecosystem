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
  const config = new ConfigService({ NODE_ENV: 'test', ONBOARDING_DEV_MODE: 'true' });
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
    await onboarding.verifyIdentity(user.id);
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
});

describe('provider adapters', () => {
  it('sends Beem SMS with Basic authentication and never exposes the code as development', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ successful: true, request_id: 123 }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ BEEM_API_KEY: 'key', BEEM_API_SECRET: 'secret', BEEM_SENDER_ID: 'realMoney' }));
    expect((await provider.request('sms', { phone: valid.phone, message: 'test code' })).mode).toBe('live');
    expect(fetchMock.mock.calls[0][0]).toBe('https://apisms.beem.africa/v1/send');
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).recipients[0].dest_addr).toBe('255712345678');
  });
  it('rejects failed or mismatched Selcom lookups and accepts matching legal names', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: 'SUCCESS', reference: 'ref', data: [{ name: 'TEST BORROWER' }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ SELCOM_API_KEY: 'key', SELCOM_API_SECRET: 'secret' }));
    expect((await provider.request('wallet', { phone: valid.phone, provider: 'MPESA', fullName: 'Test Borrower' })).reference).toBe('ref');
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('SELCOM a2V5');
    await expect(provider.request('wallet', { phone: valid.phone, provider: 'MPESA', fullName: 'Another Person' })).rejects.toThrow('does not match');
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: 'FAIL' }) });
    await expect(provider.request('wallet', { phone: valid.phone, provider: 'MPESA', fullName: 'Test Borrower' })).rejects.toThrow('unavailable');
  });
  it('requires positive identity-provider evidence and does not turn timeouts into verified status', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ verified: false }) });
    vi.stubGlobal('fetch', fetchMock);
    const provider = new VerificationProvider(new ConfigService({ VERIFICATION_BRIDGE_URL: 'https://verification.example', VERIFICATION_BRIDGE_TOKEN: 'secret' }));
    await expect(provider.request('identity', {})).rejects.toThrow('did not pass');
    fetchMock.mockRejectedValue(new Error('timeout'));
    await expect(provider.request('identity', {})).rejects.toThrow('unavailable');
  });
});
