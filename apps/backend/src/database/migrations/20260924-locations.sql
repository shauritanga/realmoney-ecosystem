CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region varchar(100) NOT NULL,
  district varchar(150) NOT NULL,
  ward varchar(150) NOT NULL,
  CONSTRAINT uq_locations_region_district_ward UNIQUE (region, district, ward)
);

CREATE INDEX IF NOT EXISTS idx_locations_region ON locations (region);
CREATE INDEX IF NOT EXISTS idx_locations_district ON locations (region, district);
CREATE INDEX IF NOT EXISTS idx_locations_ward ON locations (region, district, ward);
