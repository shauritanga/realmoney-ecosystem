import { createHmac, randomUUID } from 'node:crypto';
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
    if (kind === 'sms') return this.sendBeemSms(payload);
    if (kind === 'wallet') return this.verifySelcomWallet(payload);
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

  private async verifySelcomWallet(payload: Record<string, unknown>) {
    const key = this.config.get<string>('SELCOM_API_KEY');
    const secret = this.config.get<string>('SELCOM_API_SECRET');
    const base = this.config.get<string>('SELCOM_BASE_URL', 'https://apigw.selcommobile.com/v1');
    if (!key || !secret || /TEST|PLACEHOLDER/.test(key) || !base.startsWith('https://')) {
      throw new ServiceUnavailableException('Wallet verification is not configured');
    }
    const codes: Record<string, string> = { MPESA: 'MPREMITIN', TIGO_PESA: 'TPREMITIN', HALOPESA: 'HPREMITIN', AIRTEL_MONEY: 'AMREMITIN' };
    const utilitycode = codes[String(payload.provider)];
    if (!utilitycode) throw new BadRequestException('Unsupported mobile-money provider');
    const query = { utilitycode, utilityref: String(payload.phone).replace(/^\+/, ''), transid: randomUUID() };
    const timestamp = new Date().toISOString();
    const fields = Object.keys(query);
    const signing = `timestamp=${timestamp}&${Object.entries(query).map(([key, value]) => `${key}=${value}`).join('&')}`;
    try {
      const response = await fetch(`${base.replace(/\/$/, '')}/imt/wallet-namelookup?${new URLSearchParams(query)}`, {
        redirect: 'error', signal: AbortSignal.timeout(10000),
        headers: { Authorization: `SELCOM ${Buffer.from(key).toString('base64')}`, Timestamp: timestamp,
          'Digest-Method': 'HS256', Digest: createHmac('sha256', secret).update(signing).digest('base64'),
          'Signed-Fields': fields.join(','), Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || data.result !== 'SUCCESS') throw new Error('Lookup unavailable');
      const normalizeName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase();
      const name = data.data?.[0]?.name;
      if (typeof name !== 'string' || normalizeName(name) !== normalizeName(String(payload.fullName))) {
        throw new BadRequestException('Wallet account name does not match your verified legal name. Contact support to resolve it.');
      }
      return { verified: true, reference: String(data.reference || query.transid), mode: 'live' as const };
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new ServiceUnavailableException('Wallet verification is unavailable. Please retry.');
    }
  }

}
