-- Corrects the disbursement double-entry so LOAN_RECEIVABLE carries everything the
-- borrower owes, and recognises interest and fee income at origination.
--
-- The bug: disbursement debited LOAN_RECEIVABLE with principalAmount alone, while
-- repayment credits it with the full amount collected (principal + interest + fee).
-- Every settled loan therefore left LOAN_RECEIVABLE at -(interest + fee), and
-- INTEREST_INCOME and FEE_INCOME were declared in the enum but written nowhere.
--
-- Past entries are NOT rewritten -- restating posted financial history is worse than a
-- documented discontinuity. Instead this posts one dated adjusting journal entry per
-- affected loan, which is what an accountant would do. Safe to re-run: the marker in
-- the description makes each loan's correction post exactly once.

-- Guard: if this somehow runs on a database where the corrections already exist,
-- the NOT EXISTS clauses below make every INSERT a no-op.
--
-- Note the explicit ::enum casts in the INSERT below. `entryType` and `accountType`
-- are Postgres enum columns; a bare string literal is coerced in an INSERT ... VALUES
-- but not through a SELECT, and a UNION unifies the branches as `text`, which Postgres
-- then refuses to assign. Without the casts this fails outright.

WITH affected AS (
  SELECT
    l.id                                AS loan_id,
    l."loanNumber"                      AS loan_number,
    ROUND(l."interestAmount", 2)        AS interest,
    ROUND(l."processingFee", 2)         AS fee
  FROM loans l
  WHERE EXISTS (
          SELECT 1 FROM ledger_entries e
           WHERE e."loanId" = l.id AND e."entryType" = 'DISBURSEMENT'
        )
    AND NOT EXISTS (
          SELECT 1 FROM ledger_entries e
           WHERE e."loanId" = l.id
             AND e.description LIKE 'Ledger correction 2026-09-26%'
        )
    -- Only loans still posted under the old scheme: the receivable raised at
    -- disbursement falls short of what was actually owed.
    AND (
          SELECT COALESCE(SUM(e.debit), 0) FROM ledger_entries e
           WHERE e."loanId" = l.id
             AND e."entryType" = 'DISBURSEMENT'
             AND e."accountType" = 'LOAN_RECEIVABLE'
        ) < ROUND(l."principalAmount" + l."interestAmount" + l."processingFee", 2)
    AND ROUND(l."interestAmount" + l."processingFee", 2) > 0
)
INSERT INTO ledger_entries ("loanId", "entryType", "accountType", debit, credit, description)
SELECT loan_id,
       'DISBURSEMENT'::ledger_entries_entrytype_enum,
       'LOAN_RECEIVABLE'::ledger_entries_accounttype_enum,
       interest + fee, 0,
       'Ledger correction 2026-09-26: receivable understated at disbursement on ' || loan_number
  FROM affected
UNION ALL
SELECT loan_id,
       'DISBURSEMENT'::ledger_entries_entrytype_enum,
       'INTEREST_INCOME'::ledger_entries_accounttype_enum,
       0, interest,
       'Ledger correction 2026-09-26: interest recognised on ' || loan_number
  FROM affected WHERE interest > 0
UNION ALL
SELECT loan_id,
       'DISBURSEMENT'::ledger_entries_entrytype_enum,
       'FEE_INCOME'::ledger_entries_accounttype_enum,
       0, fee,
       'Ledger correction 2026-09-26: processing fee recognised on ' || loan_number
  FROM affected WHERE fee > 0;

-- Verify: this should return zero rows once the correction has been applied.
--
--   SELECT "accountType", SUM(debit) - SUM(credit) AS net
--     FROM ledger_entries GROUP BY "accountType";
--
-- and the whole ledger should net to zero:
--
--   SELECT SUM(debit) - SUM(credit) FROM ledger_entries;
