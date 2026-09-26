export enum UserRole {
  ADMIN = 'ADMIN',
  COLLECTOR = 'COLLECTOR',
  BORROWER = 'BORROWER',
}

export enum KycStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
}

export enum LoanStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  DISBURSED = 'DISBURSED',
  ACTIVE = 'ACTIVE',
  OVERDUE = 'OVERDUE',
  DEFAULTED = 'DEFAULTED',
  SETTLED = 'SETTLED',
}

export enum AgingBucket {
  CURRENT = 'CURRENT',
  D1_7 = 'D1_7',
  D8_30 = 'D8_30',
  D31_60 = 'D31_60',
  D60_PLUS = 'D60_PLUS',
}

export enum RepaymentChannel {
  CLICKPESA_USSD_PUSH = 'CLICKPESA_USSD_PUSH',
  SELCOM_USSD_PUSH = 'SELCOM_USSD_PUSH',
  SELCOM_PAYBILL = 'SELCOM_PAYBILL',
  CASH = 'CASH',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum RepaymentStatus {
  PENDING = 'PENDING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}

export enum CommunicationChannel {
  CALL = 'CALL',
  WHATSAPP = 'WHATSAPP',
  SMS = 'SMS',
}

export enum DispositionCode {
  PROMISED_TO_PAY = 'PROMISED_TO_PAY',
  CALLBACK_REQUESTED = 'CALLBACK_REQUESTED',
  DISPUTED = 'DISPUTED',
  REFUSED_TO_PAY = 'REFUSED_TO_PAY',
  UNREACHABLE = 'UNREACHABLE',
  WRONG_NUMBER = 'WRONG_NUMBER',
  PAID = 'PAID',
}

export enum PtpStatus {
  PENDING = 'PENDING',
  HONORED = 'HONORED',
  BROKEN = 'BROKEN',
}

/**
 * What the borrower actually said, as distinct from `DispositionCode`, which
 * records the action the collector took. Stored as plain varchar so the list can
 * grow without an irreversible `ALTER TYPE ... ADD VALUE`.
 */
export const CUSTOMER_OUTCOMES = [
  'WILL_PAY_NOW',
  'WILL_PAY_LATER',
  'PARTIAL_ONLY',
  'NO_MONEY',
  'LOST_JOB',
  'ILLNESS_EMERGENCY',
  'DISPUTES_AMOUNT',
  'CLAIMS_ALREADY_PAID',
  'THIRD_PARTY_ANSWERED',
  'NO_ANSWER',
  'PHONE_OFF',
  'OTHER',
] as const;
export type CustomerOutcome = (typeof CUSTOMER_OUTCOMES)[number];

/**
 * Where a recorded call duration came from, so verified talk time is separable
 * from self-reported.
 *
 * IN_APP_TIMER is listed from day one deliberately: READ_CALL_LOG is restricted by
 * Google Play to eligible use cases (default dialer, caller ID, spam blocking), and
 * a collections CRM is not one of them. If this app ever needs a public Play
 * listing, the fallback is a stopwatch started on dial and stopped on resume —
 * machine-measured rather than typed — and having the value here already makes that
 * pivot a client-only change with no schema or dashboard work.
 */
export const DURATION_SOURCES = ['CALL_LOG', 'IN_APP_TIMER', 'MANUAL', 'NONE'] as const;
export type DurationSource = (typeof DURATION_SOURCES)[number];

/** Mapped from the device call log's callType. */
export const CALL_OUTCOMES = [
  'ANSWERED',
  'NO_ANSWER',
  'MISSED',
  'DECLINED',
  'BUSY',
  'UNKNOWN',
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/**
 * Who created an interaction log. SYSTEM rows (e.g. the automatic note written
 * when a USSD push succeeds) must be excluded from collector activity reports.
 */
export const INTERACTION_ORIGINS = ['COLLECTOR', 'SYSTEM'] as const;
export type InteractionOrigin = (typeof INTERACTION_ORIGINS)[number];

/**
 * Why a promise-to-pay left PENDING.
 *
 * BACKFILL_UNVERIFIED exists because the first sweep after this ships will flip
 * every promise created before the lifecycle existed — all of them long past their
 * date — to BROKEN at once, cratering the kept-rate overnight. Those are marked with
 * this reason and excluded from kept-rate by default, so the metric describes
 * promises that were actually tracked rather than a backlog nobody was measuring.
 */
export const PTP_RESOLVED_REASONS = [
  'SETTLED_IN_FULL',
  'PARTIAL_PAYMENT',
  'DATE_PASSED',
  'SUPERSEDED',
  'BACKFILL_UNVERIFIED',
] as const;
export type PtpResolvedReason = (typeof PTP_RESOLVED_REASONS)[number];

export enum AccountType {
  CASH_CLICKPESA = 'CASH_CLICKPESA',
  LOAN_RECEIVABLE = 'LOAN_RECEIVABLE',
  CASH_SELCOM = 'CASH_SELCOM',
  INTEREST_INCOME = 'INTEREST_INCOME',
  PENALTY_INCOME = 'PENALTY_INCOME',
  FEE_INCOME = 'FEE_INCOME',
}

export enum EntryType {
  DISBURSEMENT = 'DISBURSEMENT',
  REPAYMENT = 'REPAYMENT',
  INTEREST_ACCRUAL = 'INTEREST_ACCRUAL',
  PENALTY_ACCRUAL = 'PENALTY_ACCRUAL',
  FEE = 'FEE',
}

/**
 * What a payment was *for*, as distinct from `RepaymentChannel`, which records the
 * rail it arrived on. An EXTENSION_FEE buys the borrower more time and does not pay
 * the debt down, so reconcile must branch on this before touching the balance.
 *
 * Plain varchar rather than a Postgres enum: `ALTER TYPE ... ADD VALUE` is
 * irreversible and cannot run inside a transaction on older PG.
 */
export const REPAYMENT_PURPOSES = ['REPAYMENT', 'EXTENSION_FEE'] as const;
export type RepaymentPurpose = (typeof REPAYMENT_PURPOSES)[number];

/**
 * The order a payment is applied in. Penalty first so the borrower stops paying
 * interest on charges, principal last so the debt shrinks only once the cost of
 * carrying it has been met.
 */
export const ALLOCATION_ORDER = ['penalty', 'interest', 'fee', 'principal'] as const;
export type AllocationLeg = (typeof ALLOCATION_ORDER)[number];
