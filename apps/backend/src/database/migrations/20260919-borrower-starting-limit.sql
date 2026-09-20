-- Apply to an existing installation; does not change existing loans.
UPDATE loan_products
SET "minAmount" = 8000
WHERE name = 'Quick Cash 14 Days' AND "minAmount" = 20000;
