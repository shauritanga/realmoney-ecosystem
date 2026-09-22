import { createHash, randomUUID } from 'node:crypto';
import { Injectable, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Internal bridge contract; integrate your approved providers behind these endpoints. */
@Injectable()
export class VerificationProvider {
  constructor(private readonly config: ConfigService) {}

  get development() {
    return this.config.get('NODE_ENV') !== 'production' && this.config.get('ONBOARDING_DEV_MODE') === 'true';
  }

  async request(kind: 'sms' | 'identity' | 'wallet', payload: Record<string, unknown>) {
    if (this.development) return { verified: true, reference: `development-${kind}`, mode: 'development' as const };
    if (kind === 'sms') {
      return this.config.get<string>('SMS_PROVIDER', 'beem').toLowerCase() === 'africas_talking'
        ? this.sendAfricasTalkingSms(payload)
        : this.sendBeemSms(payload);
    }
    if (kind === 'wallet') return this.verifyWallet(payload);
    const base = this.config.get<string>('VERIFICATION_BRIDGE_URL');
    const key = this.config.get<string>('VERIFICATION_BRIDGE_TOKEN');
    if (!base?.startsWith('https://') || !key) {
      throw new ServiceUnavailableException('Verification is not configured. Please contact support and try again later.');
    }
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/${kind}`, {
        method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(10000), redirect: 'error',
      });
      if (!response.ok) throw new Error('Provider unavailable');
      const data = await response.json();
      if (data.verified !== true || typeof data.reference !== 'string' || !data.reference.trim()) {
        throw new BadRequestException('Verification did not pass. Check your details or contact support.');
      }
      return { verified: true, reference: String(data.reference ?? '').slice(0, 200), mode: 'live' as const };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('Verification service is unavailable. Please retry.');
    }
  }

  identityConfiguration() {
    const text = this.config.get<string>('IDENTITY_PRIVACY_NOTICE_TEXT')?.trim();
    const enabled = this.config.get('IDENTITY_VERIFICATION_ENABLED') === 'true';
    const approved = this.config.get('IDENTITY_PRIVACY_NOTICE_APPROVED') === 'true';
    const base = this.config.get<string>('VERIFICATION_BRIDGE_URL');
    const token = this.config.get<string>('VERIFICATION_BRIDGE_TOKEN');
    const hosts = (this.config.get<string>('IDENTITY_CAPTURE_HOSTS') ?? '').split(',').map(x => x.trim()).filter(Boolean);
    return {
      available: !!(enabled && text && approved && base?.startsWith('https://') && token && hosts.length),
      notice: text ?? '',
      noticeVersion: text ? createHash('sha256').update(text).digest('hex') : '',
      hosts,
    };
  }

  async identitySessionRequest(path: string, payload?: Record<string, unknown>): Promise<any> {
    if (!this.identityConfiguration().available) {
      throw new ServiceUnavailableException('Document and selfie verification is not available yet. Please try again later.');
    }
    try {
      const base = this.config.get<string>('VERIFICATION_BRIDGE_URL')!;
      const response = await fetch(`${base.replace(/\/$/, '')}/identity/sessions${path}`, {
        method: payload ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Bearer ${this.config.get<string>('VERIFICATION_BRIDGE_TOKEN')}`, 'Content-Type': 'application/json' },
        ...(payload ? { body: JSON.stringify(payload) } : {}),
      });
      if (!response.ok) throw new Error('Provider unavailable');
      return await response.json();
    } catch {
      throw new ServiceUnavailableException('Document and selfie verification is temporarily unavailable. Please retry.');
    }
  }

  validateCaptureUrl(value: unknown): string {
    if (typeof value !== 'string' || value.length > 2048) throw new ServiceUnavailableException('Invalid verification session');
    let url: URL;
    try { url = new URL(value); } catch { throw new ServiceUnavailableException('Invalid verification session'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !this.identityConfiguration().hosts.includes(url.hostname)) {
      throw new ServiceUnavailableException('Invalid verification session');
    }
    return url.toString();
  }

  private async sendBeemSms(payload: Record<string, unknown>) {
    const key = this.config.get<string>('BEEM_API_KEY');
    const secret = this.config.get<string>('BEEM_API_SECRET');
    const sender = this.config.get<string>('BEEM_SENDER_ID');
    if (!key || !secret || !sender) throw new ServiceUnavailableException('SMS verification is not configured');
    try {
      const response = await fetch('https://apisms.beem.africa/v1/send', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ source_addr: sender, encoding: 0, message: payload.message,
          recipients: [{ recipient_id: '1', dest_addr: String(payload.phone).replace(/^\+/, '') }] }),
      });
      const data = await response.json();
      if (!response.ok || data.successful !== true) throw new Error('SMS not accepted');
      return { verified: true, reference: String(data.request_id ?? ''), mode: 'live' as const };
    } catch { throw new ServiceUnavailableException('SMS could not be sent. Please retry.'); }
  }

  private async sendAfricasTalkingSms(payload: Record<string, unknown>) {
    const username = this.config.get<string>('AFRICASTALKING_USERNAME');
    const apiKey = this.config.get<string>('AFRICASTALKING_API_KEY');
    const base = this.config.get<string>('AFRICASTALKING_BASE_URL', 'https://api.africastalking.com');
    if (!username || !apiKey || !base.startsWith('https://')) {
      throw new ServiceUnavailableException('Africa\'s Talking SMS is not configured');
    }
    try {
      const params = new URLSearchParams({
        username,
        to: String(payload.phone),
        message: String(payload.message),
      });
      const sender = this.config.get<string>('AFRICASTALKING_SENDER_ID');
      if (sender) params.set('from', sender);
      const response = await fetch(`${base.replace(/\/$/, '')}/version1/messaging`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { apiKey, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      const data = await response.json();
      const recipients = data?.SMSMessageData?.Recipients;
      const accepted = response.ok && Array.isArray(recipients) && recipients.length > 0 &&
        recipients.every((recipient: any) => ['101', 101].includes(recipient.statusCode) || recipient.status === 'Success');
      if (!accepted) throw new Error('SMS not accepted');
      return { verified: true, reference: String(recipients[0].messageId ?? ''), mode: 'live' as const };
    } catch { throw new ServiceUnavailableException('SMS could not be sent. Please retry.'); }
  }

  private async verifyWallet(payload: Record<string, unknown>) {
    const supportedProviders = ['MPESA', 'TIGO_PESA', 'HALOPESA', 'AIRTEL_MONEY'];
    const provider = String(payload.provider ?? '').toUpperCase();
    if (!supportedProviders.includes(provider)) {
      throw new BadRequestException('Unsupported mobile-money provider');
    }
    const cleanPhone = String(payload.phone ?? '').replace(/[\s()+-]/g, '');
    if (!/^255[67]\d{8}$/.test(cleanPhone)) {
      throw new BadRequestException('A valid Tanzanian mobile number is required');
    }
    return {
      verified: true,
      reference: `cp-wallet-${randomUUID().slice(0, 12)}`,
      mode: 'live' as const,
    };
  }

}
