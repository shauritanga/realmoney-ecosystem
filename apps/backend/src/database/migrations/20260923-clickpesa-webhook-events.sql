-- Run after the ClickPesa repayment migration when TYPEORM_SYNC=false.
CREATE TABLE IF NOT EXISTS payment_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider varchar NOT NULL DEFAULT 'CLICKPESA',
  "payloadHash" varchar NOT NULL,
  "eventType" varchar NOT NULL,
  "paymentId" varchar,
  "orderReference" varchar,
  status varchar,
  payload jsonb NOT NULL,
  processed boolean NOT NULL DEFAULT false,
  "processedAt" timestamptz,
  "processingError" varchar,
  "createdAt" timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhook_dedup ON payment_webhook_events (provider, "payloadHash");
CREATE INDEX IF NOT EXISTS idx_webhook_provider ON payment_webhook_events (provider);
CREATE INDEX IF NOT EXISTS idx_webhook_payment ON payment_webhook_events ("paymentId");
CREATE INDEX IF NOT EXISTS idx_webhook_order ON payment_webhook_events ("orderReference");
