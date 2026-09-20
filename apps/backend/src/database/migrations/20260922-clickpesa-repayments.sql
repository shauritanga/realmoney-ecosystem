-- Apply before starting the new backend when TYPEORM_SYNC=false.
ALTER TYPE repayments_channel_enum ADD VALUE IF NOT EXISTS 'CLICKPESA_USSD_PUSH';
ALTER TYPE ledger_entries_accounttype_enum ADD VALUE IF NOT EXISTS 'CASH_CLICKPESA';
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "providerReference" varchar;
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "providerTransId" varchar;
CREATE UNIQUE INDEX IF NOT EXISTS idx_repayment_provider_reference ON repayments ("providerReference");
CREATE UNIQUE INDEX IF NOT EXISTS idx_repayment_provider_trans ON repayments ("providerTransId");
