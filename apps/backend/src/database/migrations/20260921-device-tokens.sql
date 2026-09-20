-- For installations with TYPEORM_SYNC=false. Existing loans are unchanged.
CREATE TABLE IF NOT EXISTS device_tokens (
  id uuid PRIMARY KEY,
  "borrowerId" uuid NOT NULL,
  token text NOT NULL UNIQUE,
  platform text NOT NULL DEFAULT 'android',
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_device_tokens_borrower ON device_tokens ("borrowerId");
