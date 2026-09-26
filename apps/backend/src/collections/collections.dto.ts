import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import {
  CALL_OUTCOMES,
  CUSTOMER_OUTCOMES,
  CommunicationChannel,
  DURATION_SOURCES,
  DispositionCode,
} from '../database/enums.js';
import type { CallOutcome, CustomerOutcome, DurationSource } from '../database/enums.js';
import { CollectionLevel } from './collection-level.js';

/**
 * Request shapes for collections.
 *
 * Until now every body here was an inline TypeScript object-literal type, which the
 * global ValidationPipe cannot see -- so nothing was validated at runtime and a bogus
 * channel string reached Postgres as a 500. Style follows `onboarding.dto.ts`:
 * one file, terse single-line decorators.
 *
 * Note what is deliberately absent: `origin`, `connected` and `borrowerId`. The pipe
 * runs with `whitelist: true`, so omitting them means a client cannot forge the
 * provenance of a touch or claim a contact it did not make -- the server derives all
 * three.
 */
export class LogInteractionDto {
  @IsUUID() loanId: string;
  @IsEnum(CommunicationChannel) channel: CommunicationChannel;
  @IsEnum(DispositionCode) disposition: DispositionCode;

  /** What the borrower actually said, as opposed to the action taken. */
  @IsOptional() @IsIn(CUSTOMER_OUTCOMES) outcome?: CustomerOutcome;

  @IsOptional() @IsString() @Length(0, 500) notes?: string;

  /** Capped at four hours; anything longer is a data-entry slip, not a call. */
  @IsOptional() @IsInt() @Min(0) @Max(14400) durationSeconds?: number;
  @IsOptional() @IsIn(DURATION_SOURCES) durationSource?: DurationSource;
  @IsOptional() @IsIn(CALL_OUTCOMES) callOutcome?: CallOutcome;

  @IsOptional() @IsDateString() followUpAt?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(100000000) ptpAmount?: number;
  @IsOptional() @IsDateString() ptpDate?: string;

  /**
   * Client-generated idempotency key. The app is online-only and surfaces failures
   * rather than queuing, so a collector whose submit times out will retry; without
   * this, one call becomes two and the admin's counts drift upward on every hiccup.
   */
  @IsOptional() @IsString() @Length(8, 64) clientRef?: string;
}

export class AssignLoanDto {
  @IsUUID() loanId: string;
  @IsUUID() collectorId: string;
}

export class UnassignLoanDto {
  @IsUUID() loanId: string;
}

export class AutoAssignDto {
  @IsUUID() collectorId: string;
  @IsEnum(CollectionLevel) level: CollectionLevel;
  @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
}

/**
 * Accepts the local 0XXXXXXXXX and international 255XXXXXXXXX forms of a Tanzanian
 * mobile number, with or without a leading +. ClickPesaService normalises it; this
 * only keeps obvious rubbish out of the push.
 */
export const TZ_MOBILE = /^(?:\+?255|0)[67]\d{8}$/;

export class TriggerPaymentDto {
  @IsUUID() loanId: string;
  @IsNumber() @Min(500) amount: number;

  /**
   * Prompt someone other than the borrower -- a relative or friend settling on their
   * behalf. Recorded on the repayment only, never written to the customer's profile.
   * `whitelist: true` strips undeclared fields, so these must be declared here to
   * survive validation at all.
   */
  @IsOptional() @Matches(TZ_MOBILE, { message: 'Enter a valid Tanzanian mobile number for the person paying' })
  payerPhone?: string;

  @IsOptional() @IsString() @Length(2, 120) payerName?: string;
}

/**
 * Buying more time. The amount is not the client's to choose -- the server prices the
 * fee from the outstanding balance and the configured percentage, so a stale or
 * tampered client cannot sell an extension cheap.
 */
export class ExtendLoanDto {
  @IsUUID() loanId: string;

  @IsOptional() @Matches(TZ_MOBILE, { message: 'Enter a valid Tanzanian mobile number for the person paying' })
  payerPhone?: string;

  @IsOptional() @IsString() @Length(2, 120) payerName?: string;
}

export class QueueQueryDto {
  @IsOptional() @IsEnum(CollectionLevel) level?: CollectionLevel;
}

/** Cursor pagination over a case's history. */
export class InteractionHistoryQueryDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) limit?: number;
  @IsOptional() @IsDateString() before?: string;
}

export class PromiseQueryDto {
  @IsOptional() @IsIn(['PENDING', 'OVERDUE', 'HONORED', 'BROKEN']) status?: string;
}

export class FollowUpQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) on?: string;
}

/**
 * Shared shape for the admin activity reports. Dates are EAT calendar days, not
 * instants, because that is what a date picker means and what an admin reads.
 *
 * `@Type(() => Number)` is required on the numerics: the global pipe is configured
 * without `enableImplicitConversion`, so a query string would otherwise arrive as
 * text and fail `@IsInt`.
 */
export class ActivityQueryDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) from?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) to?: string;
  @IsOptional() @IsUUID() collectorId?: string;
  @IsOptional() @IsUUID() borrowerId?: string;
  @IsOptional() @IsEnum(CommunicationChannel) channel?: CommunicationChannel;
  @IsOptional() @IsInt() @Min(1) @Max(500) @Type(() => Number) limit?: number;
  @IsOptional() @IsInt() @Min(0) @Type(() => Number) offset?: number;
  /** Include the untracked historical promise backlog in the kept-rate. */
  @IsOptional() @IsBoolean() @Type(() => Boolean) includeBackfilled?: boolean;
}
