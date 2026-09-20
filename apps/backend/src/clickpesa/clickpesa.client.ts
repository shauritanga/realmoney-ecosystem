import { BadRequestException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
      .map(([key, item]) => [key, canonicalize(item)]));
  }
  return value;
}

export class ClickPesaProviderError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

@Injectable()
export class ClickPesaClient {
  private token = '';
  private expiresAt = 0;
  private tokenRequest?: Promise<string>;
  private readonly baseUrl = 'https://api.clickpesa.com/third-parties';

  constructor(private readonly config: ConfigService) {}

  get clientId(): string { return this.config.get<string>('CLICKPESA_CLIENT_ID', ''); }

  async ensureReady(): Promise<void> { await this.authorize(); }

  private async authorize(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt) return this.token;
    if (this.tokenRequest) return this.tokenRequest;
    this.tokenRequest = (async () => {
      const apiKey = this.config.get<string>('CLICKPESA_API_KEY', '');
      if (!apiKey || !this.clientId) throw new ServiceUnavailableException('ClickPesa credentials are not configured');
      const data = await this.fetchJson('/generate-token', {
        method: 'POST', headers: { 'api-key': apiKey, 'client-id': this.clientId },
      });
      if (data.success !== true || typeof data.token !== 'string' || !data.token) {
        throw new ServiceUnavailableException('ClickPesa authentication failed');
      }
      this.token = data.token.startsWith('Bearer ') ? data.token : `Bearer ${data.token}`;
      this.expiresAt = Date.now() + 50 * 60 * 1000;
      return this.token;
    })();
    try { return await this.tokenRequest; } finally { this.tokenRequest = undefined; }
  }

  private async fetchJson(path: string, options: RequestInit): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...options, signal: AbortSignal.timeout(15000), redirect: 'error',
      });
      if (!response.ok) {
        if (response.status === 401) { this.token = ''; this.expiresAt = 0; }
        let message = 'ClickPesa rejected the request';
        try {
          const body = await response.json();
          if (typeof body?.message === 'string' && body.message.length <= 180) message = body.message;
        } catch { /* use safe generic message */ }
        throw new ClickPesaProviderError(response.status, message);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof ClickPesaProviderError) {
        if (error.status >= 400 && error.status < 500) throw new BadRequestException(error.message);
        throw new ServiceUnavailableException(error.message);
      }
      // Never expose upstream bodies, credentials, or customer information.
      throw new ServiceUnavailableException('ClickPesa is unavailable. Check payment status before retrying.');
    }
  }

  async request(path: string, payload?: Record<string, unknown>): Promise<any> {
    const authorization = await this.authorize();
    const body = payload ? { ...payload } : undefined;
    const key = this.config.get<string>('CLICKPESA_CHECKSUM_KEY', '');
    if (body && key) body.checksum = createHmac('sha256', key).update(JSON.stringify(canonicalize(body))).digest('hex');
    return this.fetchJson(path, {
      method: body ? 'POST' : 'GET',
      headers: { Authorization: authorization, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
}
