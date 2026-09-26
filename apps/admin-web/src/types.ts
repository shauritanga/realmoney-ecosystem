export type Tab = 'overview' | 'kyc' | 'underwriting' | 'collections' | 'ledger' | 'settings';

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

/* ---------------------------------------------------------------------------
 * Collections follow-up tracing
 * ------------------------------------------------------------------------- */

export type CommunicationChannel = 'CALL' | 'SMS' | 'WHATSAPP';

export type DispositionCode =
  | 'PROMISED_TO_PAY'
  | 'CALLBACK_REQUESTED'
  | 'DISPUTED'
  | 'REFUSED_TO_PAY'
  | 'UNREACHABLE'
  | 'WRONG_NUMBER'
  | 'PAID';

export type PtpStatus = 'PENDING' | 'HONORED' | 'BROKEN';

/** How a call duration was obtained — the difference between measured and claimed. */
export type DurationSource = 'CALL_LOG' | 'IN_APP_TIMER' | 'MANUAL' | 'NONE';

export type CallOutcome = 'ANSWERED' | 'NO_ANSWER' | 'MISSED' | 'DECLINED' | 'BUSY' | 'UNKNOWN';

/** COLLECTOR is work an agent did; SYSTEM is the server recording its own action. */
export type InteractionOrigin = 'COLLECTOR' | 'SYSTEM';

/** One collector, as /admin/collectors returns it. */
export interface Collector {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isActive: boolean;
  activeAssignmentsCount: number;
  workedLevel: string | null;
  workedLevelLabel: string | null;
  maxCapacity: number | null;
  assignedLoans?: AssignedLoan[];
}

/** Shape returned by GET /admin/collectors (see AdminService.getCollectors). */
export interface AssignedLoan {
  /** The assignment row id, not the loan id. */
  id: string;
  loanId: string;
  loanNumber: string;
  borrowerName: string;
  borrowerPhone: string;
  outstandingBalance: number;
  dueDate: string;
  assignedAt: string;
}

export interface TimelineInteraction {
  id: string;
  at: string;
  loanId: string;
  loanNumber: string | null;
  channel: CommunicationChannel;
  disposition: DispositionCode;
  outcome: string | null;
  connected: boolean | null;
  callOutcome: CallOutcome | null;
  durationSeconds: number;
  durationSource: DurationSource | null;
  followUpAt: string | null;
  notes: string | null;
  origin: InteractionOrigin;
  collectorName: string | null;
}

export interface TimelinePromise {
  id: string;
  at: string;
  loanId: string;
  loanNumber: string | null;
  promisedAmount: string | number;
  promisedDate: string;
  status: PtpStatus;
  state: 'NONE' | 'PENDING' | 'OVERDUE';
  resolvedAt: string | null;
  resolvedReason: string | null;
  collectorName: string | null;
}

export interface BorrowerTimeline {
  range: ReportRange;
  borrower: { id: string; fullName: string; phone: string } | null;
  interactions: TimelineInteraction[];
  promises: TimelinePromise[];
}

export interface ReportRange {
  from: string;
  to: string;
  timezone: string;
}

/** Rates are nullable on purpose: null means "does not apply", never 0%. */
export interface ActivityTotals {
  interactions: number;
  calls: number;
  callsConnected: number;
  contactRate: number | null;
  talkTimeSeconds: number;
  verifiedTalkTimeSeconds: number;
  verifiedShare: number | null;
  averageCallSeconds: number | null;
  smsInitiated: number;
  whatsappInitiated: number;
  borrowersTouched: number;
  casesTouched: number;
  activeCollectors: number;
}

export interface ChannelRollup {
  channel: CommunicationChannel;
  count: number;
  talkTimeSeconds: number;
  connected: number;
  verified: number;
  verifiedTalkTimeSeconds: number;
}

export interface DayBucket {
  day: string;
  interactions: number;
  calls: number;
  talkTimeSeconds: number;
}

export interface PtpRollup {
  created: number;
  pending: number;
  honored: number;
  broken: number;
  /** Genuine misses only — excludes renegotiated and historical-backfill promises. */
  brokenTracked: number;
  backfilled: number;
  superseded: number;
  promisedAmount: number;
  keptRate: number | null;
  brokenNeedingEscalation: BrokenPromise[];
}

export interface BrokenPromise {
  ptpId: string;
  loanId: string;
  loanNumber: string | null;
  borrowerId: string | null;
  borrowerName: string | null;
  borrowerPhone: string | null;
  collectorName: string | null;
  promisedAmount: string | number;
  promisedDate: string;
  resolvedAt: string | null;
  outstandingBalance: string | number | null;
}

export interface CollectorActivity {
  collectorId: string;
  fullName: string;
  phone: string;
  isActive: boolean;
  interactions: number;
  calls: number;
  callsConnected: number;
  talkTimeSeconds: number;
  verifiedTalkTimeSeconds: number;
  smsInitiated: number;
  whatsappInitiated: number;
  casesTouched: number;
  borrowersTouched: number;
  lastActivityAt: string | null;
  contactRate: number | null;
  averageCallSeconds: number | null;
  verifiedShare: number | null;
  ptps: Omit<PtpRollup, 'brokenNeedingEscalation'>;
  /** Money from payments this collector triggered — causation, not attribution. */
  recoveredInitiatedAmount: number;
}

export interface BorrowerActivity {
  borrowerId: string;
  fullName: string;
  phone: string;
  loanCount: number;
  outstandingBalance: number;
  interactions: number;
  calls: number;
  callsConnected: number;
  talkTimeSeconds: number;
  verifiedTalkTimeSeconds: number;
  smsInitiated: number;
  whatsappInitiated: number;
  lastContactAt: string | null;
  ptpsCreated: number;
  ptpsBroken: number;
}

export interface CollectionActivityReport {
  range: ReportRange;
  totals: ActivityTotals;
  byChannel: ChannelRollup[];
  byDisposition: Array<{ disposition: DispositionCode; count: number }>;
  byOutcome: Array<{ outcome: string; count: number }>;
  byDay: DayBucket[];
  byCollector: CollectorActivity[];
  ptps: PtpRollup;
  byBorrower: { total: number; limit: number; offset: number; rows: BorrowerActivity[] };
}

export interface CollectionAlerts {
  brokenPtpCount: number;
  callbacksDueToday: number;
}

export interface ActivityExport {
  range: ReportRange;
  truncated: boolean;
  cap: number;
  rows: Array<Record<string, unknown>>;
}
