-- Keep the first eligible Quick Cash loan aligned with the approved product rule.
-- This also corrects installations whose row was previously set to TZS 10,000.
UPDATE loan_products
SET "minAmount" = 8000
WHERE name = 'Quick Cash 14 Days' AND "minAmount" > 8000;
