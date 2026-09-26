-- Partial payments, loan extensions and third-party payers.
--
-- For installations with TYPEORM_SYNC=false. Safe to re-run. Every new column is
-- nullable or defaulted so this cannot fail on a populated table, and `purpose` is a
-- plain varchar rather than a Postgres enum -- ALTER TYPE ... ADD VALUE is
-- irreversible and cannot run inside a transaction on older PG.

-- What a payment was for, and how it was applied. The four legs sum to `amount` for a
-- COMPLETED repayment and are all zero for an EXTENSION_FEE, which settles nothing.
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS purpose varchar NOT NULL DEFAULT 'REPAYMENT';
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "penaltyPaid" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "interestPaid" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "feePaid" numeric(12,2) NOT NULL DEFAULT 0;
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "principalPaid" numeric(12,2) NOT NULL DEFAULT 0;

-- The number actually prompted, when someone else is paying on the borrower's behalf.
-- NULL means the borrower's own phone.
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "payerPhone" varchar;
ALTER TABLE repayments ADD COLUMN IF NOT EXISTS "payerName" varchar;

-- Historical repayments predate the waterfall, so their legs are all zero and do not
-- sum to `amount`. Back-filling them would be a guess: nothing recorded what those
-- payments were applied to. Anything reading the legs must therefore treat a
-- COMPLETED repayment whose legs sum to zero as unallocated, not as zero-value.

ALTER TABLE loans ADD COLUMN IF NOT EXISTS "originalDueDate" timestamptz;
ALTER TABLE loans ADD COLUMN IF NOT EXISTS "penaltyAccruedThrough" timestamptz;

-- Freeze the contracted due date for every loan already disbursed, so the first
-- extension cannot make a late borrower look punctual to borrowingLimit().
UPDATE loans SET "originalDueDate" = "dueDate" WHERE "originalDueDate" IS NULL;

-- Do not back-charge penalties for the entire history of every overdue loan the
-- moment accrual ships. Starting the clock at today means borrowers are billed from
-- the point the policy actually existed.
UPDATE loans
   SET "penaltyAccruedThrough" = now()
 WHERE "penaltyAccruedThrough" IS NULL
   AND status IN ('ACTIVE', 'OVERDUE', 'DEFAULTED', 'DISBURSED');

ALTER TABLE lending_settings ADD COLUMN IF NOT EXISTS "extensionFeePercent" numeric(5,2) NOT NULL DEFAULT 25;
ALTER TABLE lending_settings ADD COLUMN IF NOT EXISTS "maxExtensions" int NOT NULL DEFAULT 2;
ALTER TABLE lending_settings ADD COLUMN IF NOT EXISTS "maxPenaltyPercentOfPrincipal" numeric(6,2) NOT NULL DEFAULT 100;

-- One row per granted extension. The cap is counted from this table rather than a
-- denormalised counter: extensions are capped at two, so the count is never hot, and
-- one source of truth beats a cache that can drift from the history it summarises.
CREATE TABLE IF NOT EXISTS loan_extensions (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "loanId"                uuid NOT NULL REFERENCES loans (id) ON DELETE CASCADE,
  "repaymentId"           uuid REFERENCES repayments (id) ON DELETE SET NULL,
  "previousDueDate"       timestamptz NOT NULL,
  "newDueDate"            timestamptz NOT NULL,
  "feeAmount"             numeric(12,2) NOT NULL,
  "outstandingAtExtension" numeric(12,2) NOT NULL,
  "grantedById"           uuid REFERENCES users (id) ON DELETE SET NULL,
  "createdAt"             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_loan_extension_loan ON loan_extensions ("loanId");

-- Partial payments make `purpose` and the allocation legs a common filter on the
-- repayment history views.
CREATE INDEX IF NOT EXISTS idx_repayment_purpose ON repayments (purpose);
