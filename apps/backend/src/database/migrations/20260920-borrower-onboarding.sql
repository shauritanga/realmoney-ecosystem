-- Non-destructive. Existing borrowers must finish onboarding before applying.
ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding jsonb;
CREATE TABLE IF NOT EXISTS phone_challenges (
  phone varchar PRIMARY KEY,
  "codeHash" varchar NOT NULL DEFAULT '',
  "expiresAt" timestamptz,
  "sentAt" timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  "proofHash" varchar,
  "verifiedAt" timestamptz,
  mode varchar NOT NULL DEFAULT 'live'
);
CREATE TABLE IF NOT EXISTS onboarding_rate_limits (
  key varchar PRIMARY KEY,
  "windowStart" timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0
);
