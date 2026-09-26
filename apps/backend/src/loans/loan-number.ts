/**
 * Case numbers.
 *
 * Four digits, so a collector can read one out over the phone and a borrower can
 * repeat it back. Drawn at random rather than sequentially: a sequence would tell
 * anyone holding two loan papers roughly how many loans the business has written.
 *
 * ## The ceiling
 *
 * Four digits is 9,000 possible numbers (1000-9999) and `loans.loanNumber` is
 * UNIQUE, so this format supports **at most 9,000 loans ever** -- settled ones keep
 * their number. Allocation also gets slower as the space fills, because it retries
 * on collision.
 *
 * `nextCaseNumber` throws a named error rather than looping forever once the space
 * is effectively full. When that day approaches, widen to five digits: the column is
 * a varchar, so it takes a format change here and nothing else.
 */

export const CASE_NUMBER_MIN = 1000;
export const CASE_NUMBER_MAX = 9999;
export const CASE_NUMBER_SPACE = CASE_NUMBER_MAX - CASE_NUMBER_MIN + 1;

/** Past this, collisions make random allocation impractical. */
export const CASE_NUMBER_CAPACITY_WARNING = Math.floor(CASE_NUMBER_SPACE * 0.8);

export class CaseNumberSpaceExhaustedError extends Error {
  constructor(used: number) {
    super(
      `Cannot allocate a 4-digit case number: ${used} of ${CASE_NUMBER_SPACE} are in ` +
        'use. Widen the format to 5 digits in loan-number.ts.',
    );
    this.name = 'CaseNumberSpaceExhaustedError';
  }
}

/** A random candidate. Exported so it can be stubbed in tests. */
export function randomCaseNumber(random: () => number = Math.random): string {
  return String(CASE_NUMBER_MIN + Math.floor(random() * CASE_NUMBER_SPACE));
}

/**
 * Draws a case number not already taken.
 *
 * `isTaken` is injected so this stays a pure decision the service can test without a
 * database. The caller still has to handle a unique-violation on insert: two requests
 * can pass this check concurrently and only one will win.
 */
export async function nextCaseNumber(
  isTaken: (candidate: string) => Promise<boolean>,
  used: number,
  attempts = 12,
  random: () => number = Math.random,
): Promise<string> {
  if (used >= CASE_NUMBER_SPACE) throw new CaseNumberSpaceExhaustedError(used);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const candidate = randomCaseNumber(random);
    if (!(await isTaken(candidate))) return candidate;
  }
  // Repeated collisions mean the space is crowded, not that we were unlucky.
  throw new CaseNumberSpaceExhaustedError(used);
}
