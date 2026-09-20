import { BadRequestException, HttpException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, EntityManager } from 'typeorm';
import { createHmac, randomInt, randomBytes } from 'node:crypto';
import { PhoneChallenge, OnboardingRateLimit } from '../database/entities/phone-challenge.entity.js';
import { VerificationProvider } from './verification-provider.service.js';

export function normalizePhone(value: string) {
  let phone = value.replace(/[\s()-]/g, '');
  if (phone.startsWith('0')) phone = '+255' + phone.slice(1);
  if (phone.startsWith('255')) phone = '+' + phone;
  if (!/^\+255[67]\d{8}$/.test(phone)) throw new BadRequestException('Enter a valid Tanzanian mobile number');
  return phone;
}

@Injectable()
export class PhoneVerificationService {
  constructor(private readonly db: DataSource, private readonly config: ConfigService, private readonly provider: VerificationProvider) {}

  private hash(value: string) {
    const secret = this.config.get<string>('OTP_SECRET');
    if ((!secret || Buffer.byteLength(secret) < 32) && !this.provider.development) throw new ServiceUnavailableException('Phone verification is not configured');
    return createHmac('sha256', secret || 'development-only-otp-secret').update(value).digest('hex');
  }

  private async throttle(key: string, max: number) {
    const allowed = await this.db.transaction(async (manager) => {
      await manager.createQueryBuilder().insert().into(OnboardingRateLimit)
        .values({ key, windowStart: new Date(), count: 0 }).orIgnore().execute();
      const row = await manager.findOneOrFail(OnboardingRateLimit, { where: { key }, lock: { mode: 'pessimistic_write' } });
      if (Date.now() - row.windowStart.getTime() >= 3600000) { row.count = 0; row.windowStart = new Date(); }
      if (row.count >= max) return false;
      row.count++;
      await manager.save(row);
      return true;
    });
    if (!allowed) throw new HttpException('Too many verification requests. Please try again in an hour.', 429);
  }

  async send(rawPhone: string, ip: string) {
    const phone = normalizePhone(rawPhone);
    await this.throttle(`ip:${this.hash(ip)}`, 20);
    await this.throttle(`phone:${phone}`, 5);
    const code = String(randomInt(100000, 1000000));
    await this.db.transaction(async (manager) => {
      await manager.createQueryBuilder().insert().into(PhoneChallenge).values({ phone }).orIgnore().execute();
      const row = await manager.findOneOrFail(PhoneChallenge, { where: { phone }, lock: { mode: 'pessimistic_write' } });
      if (row.sentAt && Date.now() - row.sentAt.getTime() < 60000) {
        throw new HttpException('Wait 60 seconds before requesting another code', 429);
      }
      await this.provider.request('sms', { phone, message: `Your realMoney verification code is ${code}. It expires in 5 minutes. Do not share it.` });
      Object.assign(row, {
        codeHash: this.hash(`${phone}:${code}`), expiresAt: new Date(Date.now() + 300000),
        sentAt: new Date(), attempts: 0, proofHash: null, verifiedAt: null,
        mode: this.provider.development ? 'development' : 'live',
      });
      await manager.save(row);
    });
    return { phone, expiresInSeconds: 300, resendAfterSeconds: 60,
      ...(this.provider.development ? { developmentCode: code } : {}) };
  }

  async verify(rawPhone: string, code: string) {
    const phone = normalizePhone(rawPhone);
    const result = await this.db.transaction(async (manager) => {
      const row = await manager.findOne(PhoneChallenge, { where: { phone }, lock: { mode: 'pessimistic_write' } });
      if (!row || !row.expiresAt || row.expiresAt.getTime() < Date.now() || row.attempts >= 5 || row.verifiedAt) return null;
      row.attempts++;
      if (row.codeHash !== this.hash(`${phone}:${code}`)) { await manager.save(row); return null; }
      const proof = randomBytes(32).toString('hex');
      row.proofHash = this.hash(proof);
      row.codeHash = '';
      row.verifiedAt = new Date();
      row.expiresAt = new Date(Date.now() + 1800000);
      await manager.save(row);
      return { phone, phoneProof: proof };
    });
    if (!result) throw new BadRequestException('Code is invalid, expired or already used. Request a new code if needed.');
    return result;
  }

  async consume(manager: EntityManager, phone: string, proof: string) {
    const row = await manager.findOne(PhoneChallenge, { where: { phone }, lock: { mode: 'pessimistic_write' } });
    if (!row?.verifiedAt || !row.expiresAt || row.expiresAt.getTime() < Date.now() || row.proofHash !== this.hash(proof) ||
        (row.mode === 'development' && !this.provider.development)) {
      throw new BadRequestException('Phone verification expired. Verify your phone again.');
    }
    const verification = { phoneVerifiedAt: row.verifiedAt.toISOString(), phoneVerificationMode: row.mode as 'live' | 'development' };
    row.proofHash = null;
    await manager.save(row);
    return verification;
  }
}
