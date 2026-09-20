-- For installations with TYPEORM_SYNC=false. Existing loans are unchanged.
CREATE TABLE IF NOT EXISTS lending_settings (
  id integer PRIMARY KEY,
  "interestRateMonthly" numeric(5,2) NOT NULL DEFAULT 40
);
INSERT INTO lending_settings (id, "interestRateMonthly") VALUES (1, 40)
ON CONFLICT (id) DO NOTHING;
