import { ACCOUNT_TERMS_DRAFT, PRIVACY_NOTICE_DRAFT } from './legal-drafts.js';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { VerificationProvider } from './verification-provider.service.js';

@Injectable()
export class LegalService {
  constructor(private readonly config: ConfigService, private readonly provider: VerificationProvider) {}
  getDocuments() {
    let terms = this.config.get<string>('ACCOUNT_TERMS_TEXT') || ACCOUNT_TERMS_DRAFT;
    let privacy = this.config.get<string>('PRIVACY_NOTICE_TEXT') || PRIVACY_NOTICE_DRAFT;
    const isApproved = this.config.get('LEGAL_REVIEW_APPROVED') === 'true';
    const draft = !isApproved;
    if (draft && !this.provider.development) {
      throw new ServiceUnavailableException('Account terms and privacy notice are not configured. Please try again later.');
    }
    const document = (text: string) => ({ text, version: createHash('sha256').update(text).digest('hex') });
    return { terms: document(terms), privacy: document(privacy), draft };
  }
}
