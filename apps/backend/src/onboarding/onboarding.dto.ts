import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';

export class PhoneDto {
  @IsString() @Length(9, 20) phone: string;
}
export class VerifyPhoneDto extends PhoneDto {
  @IsString() @Matches(/^\d{6}$/) code: string;
}
export class ProfileDto extends PhoneDto {
  @IsString() @Length(32, 128) phoneProof: string;
  @IsString() @Length(3, 120) fullName: string;
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) dateOfBirth: string;
  @IsIn(['NIDA', 'PASSPORT']) identityType: string;
  @IsString() @Length(5, 40) nationalId: string;
  @IsString() @Length(2, 80) region: string;
  @IsString() @Length(2, 80) district: string;
  @IsString() @Length(2, 80) ward: string;
  @IsString() @Length(2, 160) street: string;
  @IsOptional() @IsString() @Length(0, 160) landmark?: string;
  @IsOptional() @IsEmail() @Length(3, 254) email?: string;
  @IsString() @Length(1, 64) termsVersion: string;
  @IsString() @Length(1, 64) privacyVersion: string;
  @IsBoolean() acceptTerms: boolean;
  @IsBoolean() acknowledgePrivacy: boolean;
  @IsBoolean() marketingConsent: boolean;
}
export class RegisterDto extends ProfileDto {
  @IsString() @Length(10, 72) password: string;
  @IsString() @Length(10, 72) confirmPassword: string;
}
export class FinancialProfileDto {
  @IsIn(['EMPLOYED', 'SELF_EMPLOYED', 'OTHER']) employmentStatus: string;
  @IsString() @Length(2, 120) occupation: string;
  @IsNumber() @Min(0) @Max(1000000000) monthlyIncome: number;
  @IsNumber() @Min(0) @Max(1000000000) essentialExpenses: number;
  @IsNumber() @Min(0) @Max(1000000000) existingLoanRepayments: number;
  @IsString() @Length(9, 20) walletPhone: string;
  @IsIn(['MPESA', 'AIRTEL_MONEY', 'TIGO_PESA', 'HALOPESA']) walletProvider: string;
}
