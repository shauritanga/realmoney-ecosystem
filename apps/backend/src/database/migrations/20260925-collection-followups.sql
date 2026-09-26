-- Follow-up tracing for collections: structured customer responses, verified call
-- duration, callback scheduling, and system-vs-collector attribution.
--
-- For installations with TYPEORM_SYNC=false. Safe to re-run. Every new column is
-- nullable or defaulted, so this cannot fail on a populated table, and the new
-- taxonomies are plain varchar rather than Postgres enums -- ALTER TYPE ... ADD VALUE
-- is irreversible and cannot run inside a transaction on older PG, and these
-- vocabularies will grow.

ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS "borrowerId" uuid;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS outcome varchar;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS connected boolean;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS "callOutcome" varchar;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS "durationSource" varchar;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS "clientRef" varchar;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS "followUpAt" timestamptz;
ALTER TABLE interaction_logs ADD COLUMN IF NOT EXISTS origin varchar NOT NULL DEFAULT 'COLLECTOR';

ALTER TABLE promises_to_pay ADD COLUMN IF NOT EXISTS "resolvedReason" varchar;

-- Back-fill the denormalised borrower so per-customer reports need no join.
UPDATE interaction_logs l
   SET "borrowerId" = loans."borrowerId"
  FROM loans
 WHERE loans.id = l."loanId"
   AND l."borrowerId" IS NULL;

-- Rows written by triggerUssdPushPayment are system events, not collector-sent SMS.
-- Left as COLLECTOR they inflate every SMS and PTP count. Check the affected row
-- count before and after: any row whose notes were edited is unrecoverable.
UPDATE interaction_logs
   SET origin = 'SYSTEM'
 WHERE channel = 'SMS'
   AND notes LIKE 'ClickPesa payment requested. Order ID:%';

CREATE INDEX IF NOT EXISTS idx_interaction_created ON interaction_logs ("createdAt");
CREATE INDEX IF NOT EXISTS idx_interaction_borrower ON interaction_logs ("borrowerId");
CREATE INDEX IF NOT EXISTS idx_interaction_followup ON interaction_logs ("followUpAt");

-- Composite indexes matching the activity reports' access pattern
-- (one collector or borrower over a date range).
CREATE INDEX IF NOT EXISTS idx_interaction_collector_created
  ON interaction_logs ("collectorId", "createdAt");
CREATE INDEX IF NOT EXISTS idx_interaction_borrower_created
  ON interaction_logs ("borrowerId", "createdAt");

-- One logged touch per collector per client-generated key, so a retried submit
-- after a network timeout cannot double-count a call.
CREATE UNIQUE INDEX IF NOT EXISTS idx_interaction_client_ref
  ON interaction_logs ("collectorId", "clientRef") WHERE "clientRef" IS NOT NULL;

-- Drives the promise sweep.
CREATE INDEX IF NOT EXISTS idx_ptp_status_date ON promises_to_pay (status, "promisedDate");
