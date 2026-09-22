import { BadRequestException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { User } from '../database/entities/user.entity.js';

export const IDENTITY_POLICY_VERSION = 2;
export type IdentityStatus = 'capture_required' | 'processing' | 'review' | 'verified' | 'rejected' | 'expired';
export type DocumentSide = 'front' | 'back' | 'biodata';
export interface IdentityChecks {
  documentAuthenticity: boolean;
  documentSides: boolean;
  registrationMatch: boolean;
  liveness: boolean;
  faceMatch: boolean;
}
export interface IdentitySession {
  sessionId: string;
  requestId: string;
  profileFingerprint: string;
  policyVersion: number;
  status: IdentityStatus;
  mode: 'live' | 'development';
  hostedUrl: string;
  createdAt: string;
  expiresAt: string;
  checkedAt?: string;
  completedAt?: string;
  checks?: IdentityChecks;
  consent: { version: string; text: string; acceptedAt: string };
}
export function requiredDocumentSides(type: string): DocumentSide[] {
  if (type === 'PASSPORT') return ['biodata'];
  if (['NIDA', 'VOTER_ID', 'DRIVING_LICENSE'].includes(type)) return ['front', 'back'];
  throw new BadRequestException('Choose a supported identity document during registration');
}
export function identityFingerprint(user: User) {
  return createHash('sha256').update(JSON.stringify([
    user.id, user.fullName, user.nationalId, user.onboarding?.identityType, user.onboarding?.dateOfBirth,
  ])).digest('hex');
}
export function evaluateIdentityDecision(user: User, session: IdentitySession, result: any): {
  status: IdentityStatus; checks?: IdentityChecks;
} {
  if (!result || typeof result !== 'object' || Array.isArray(result)) throw new BadRequestException('Invalid verification result');
  // Both bindings must come from the authenticated provider response, never the mobile client.
  if (result.sessionId !== session.sessionId || result.requestId !== session.requestId || result.subjectId !== user.id || result.mode !== session.mode) {
    throw new BadRequestException('Verification result does not match this session');
  }
  const allowed = ['capture_required', 'processing', 'review', 'verified', 'rejected', 'expired'];
  if (!allowed.includes(result.status)) throw new BadRequestException('Invalid verification result');
  if (result.status !== 'verified') return { status: result.status };
  const doc = result.document ?? {};
  const normalize = (value: unknown) => typeof value === 'string' ? value.normalize('NFKC').trim().replace(/\s+/g, ' ').toUpperCase() : '';
  const number = (value: unknown) => normalize(value).replace(/[\s-]/g, '');
  const checks: IdentityChecks = {
    documentAuthenticity: doc.authentic === true,
    documentSides: Array.isArray(doc.capturedSides) && requiredDocumentSides(user.onboarding!.identityType).every(side => doc.capturedSides.includes(side)),
    registrationMatch: doc.type === user.onboarding!.identityType &&
      normalize(doc.fullName) === normalize(user.fullName) &&
      number(doc.number) === number(user.nationalId) && doc.dateOfBirth === user.onboarding!.dateOfBirth,
    liveness: result.liveness?.passed === true,
    faceMatch: result.faceMatch?.passed === true,
  };
  // Even a provider's overall approval cannot waive an individual required check.
  return { status: Object.values(checks).every(Boolean) ? 'verified' : 'review', checks };
}
