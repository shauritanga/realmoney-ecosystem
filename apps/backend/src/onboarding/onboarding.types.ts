import type { IdentitySession } from './identity-verification.js';
export interface BorrowerOnboarding {
  dateOfBirth: string;
  identityType: string;
  region: string;
  district: string;
  ward: string;
  street: string;
  landmark: string;
  phoneVerifiedAt: string;
  phoneVerificationMode: 'live' | 'development';
  consents: Array<{
    acceptedAt: string; termsVersion: string; privacyVersion: string;
    termsText: string; privacyText: string; marketingConsent: boolean;
  }>;
  identity?: { verifiedAt: string; reference: string; mode: 'live' | 'development'; policyVersion?: number };
  identitySession?: IdentitySession;
  identityAttempts?: string[];
  financial?: {
    employmentStatus: string; occupation: string; monthlyIncome: number;
    essentialExpenses: number; existingLoanRepayments: number; updatedAt: string;
  };
  wallet?: { phone: string; provider: string; verifiedAt: string; reference: string; mode: 'live' | 'development' };
}
