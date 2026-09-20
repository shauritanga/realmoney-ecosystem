export type Tab = 'overview' | 'underwriting' | 'collections' | 'ledger' | 'settings';

export interface DashboardStats {
  totalLoans: number;
  activeLoans: number;
  overdueLoans: number;
  settledLoans: number;
  totalDisbursedAmount: number;
  totalOutstandingAmount: number;
  totalRepaymentsAmount: number;
  agingBreakdown: Array<any>;
  recentLoans: Array<any>;
}

export interface Loan {
  id: string;
  loanNumber: string;
  borrower: { id: string; fullName: string; phone: string; nationalId?: string };
  product: { name: string };
  principalAmount: string;
  interestAmount: string;
  outstandingBalance: string;
  totalPaid: string;
  tenureDays: number;
  status: string;
  agingBucket: string;
  daysOverdue: number;
  dueDate: string;
  assignments?: Array<{ collector: { fullName: string; phone: string } }>;
}

export interface AppRequest {
  (path: string, init?: RequestInit): Promise<any>;
}

export interface LedgerEntry {
  id: string;
  createdAt: string;
  accountType: string;
  debit: number;
  credit: number;
  description: string;
  loan?: { loanNumber?: string };
}
