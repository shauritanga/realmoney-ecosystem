import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity.js';
import { LoanProduct } from './entities/loan-product.entity.js';
import { Loan } from './entities/loan.entity.js';
import { CollectorAssignment } from './entities/collector-assignment.entity.js';
import { InteractionLog } from './entities/interaction-log.entity.js';
import { PromiseToPay } from './entities/promise-to-pay.entity.js';
import {
  AgingBucket,
  CommunicationChannel,
  DispositionCode,
  KycStatus,
  LoanStatus,
  PtpStatus,
  UserRole,
} from './enums.js';
import { APP_ENTITIES } from './database.module.js';

/**
 * Fills a collector's daily queue to its cap so the app can be seen under real load.
 *
 * 45 is the maximum a collector may hold for tiers T-2 through T2
 * (`maxCapacityForLevel` in collections/collection-level.ts), so it is the worst case
 * the queue screen has to stay usable at.
 *
 * Additive and repeatable: it never truncates, and re-running replaces only the rows
 * it created (loan numbers prefixed `QT-`). `npm run seed` still resets everything.
 *
 *   npm run seed:queue                 # 45 cases, all 1 day overdue (tier T1)
 *   QUEUE_SIZE=20 npm run seed:queue   # fewer
 *   QUEUE_LEVEL=ZERO npm run seed:queue  # due today instead
 */

/// Case numbers this script owns, so cleanup can find them without a prefix in the
/// number itself (case numbers are bare 4-digit values now). Anything from 2000-2999
/// belongs to the queue seed.
const CASE_NUMBER_BASE = 2000;

/** Days from today for each tier, matching getCollectionLevel. */
const LEVEL_OFFSETS: Record<string, number> = {
  M2: 2,
  M1: 1,
  ZERO: 0,
  T1: -1,
  T2: -2,
  T3: -5,
};

const FIRST_NAMES = [
  'Amina', 'Baraka', 'Neema', 'Juma', 'Zawadi', 'Hamisi', 'Rehema', 'Salum',
  'Fatuma', 'Emmanuel', 'Glory', 'Frank', 'Mwajuma', 'Deo', 'Halima', 'Peter',
  'Asha', 'Godfrey', 'Sophia', 'Elias', 'Maria', 'Ally', 'Grace', 'Rashid',
  'Joyce', 'Said', 'Anna', 'Musa', 'Lightness', 'Kelvin', 'Tatu', 'Daudi',
  'Upendo', 'Yusuf', 'Happiness', 'Nuru', 'Bahati', 'Shabani', 'Esther',
  'Ibrahim', 'Sanura', 'Method', 'Witness', 'Omary', 'Pendo',
];

const SURNAMES = [
  'Mwakasege', 'Kimaro', 'Mushi', 'Shirima', 'Massawe', 'Mkwawa', 'Nyerere',
  'Lyimo', 'Mbise', 'Kessy', 'Macha', 'Swai', 'Mollel', 'Temba', 'Urassa',
  'Msuya', 'Mrema', 'Ngowi', 'Kileo', 'Minja', 'Mbwambo', 'Chuwa', 'Kweka',
  'Sanga', 'Mtei', 'Nkya', 'Moshi', 'Laizer', 'Mtui', 'Rweyemamu', 'Bukuku',
  'Mapunda', 'Haule', 'Komba', 'Ndosi', 'Mwaipopo', 'Mgaya', 'Kajuna',
  'Sereka', 'Mwanri', 'Lema', 'Kimario', 'Nnko', 'Maro', 'Assey',
];

const WARDS = [
  'Mbezi Beach', 'Kinondoni', 'Ubungo', 'Tegeta', 'Kimara', 'Sinza',
  'Mikocheni', 'Msasani', 'Segerea', 'Tabata', 'Kariakoo', 'Ilala',
];

/** Deterministic pseudo-random, so a re-run produces the same queue. */
function seeded(n: number) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const dataSource = new DataSource({
  type: 'postgres',
  url:
    process.env.DATABASE_URL ??
    'postgres://postgres:postgrespassword@localhost:5432/realmoney_db',
  entities: APP_ENTITIES,
  synchronize: true,
});

async function main() {
  const size = Number(process.env.QUEUE_SIZE ?? 45);
  const level = (process.env.QUEUE_LEVEL ?? 'T1').toUpperCase();
  const collectorEmail = process.env.QUEUE_COLLECTOR ?? 'collector1@realmoney.tz';

  if (!(level in LEVEL_OFFSETS)) {
    throw new Error(
      `Unknown QUEUE_LEVEL "${level}". Use one of: ${Object.keys(LEVEL_OFFSETS).join(', ')}`,
    );
  }
  if (!Number.isInteger(size) || size < 1 || size > 200) {
    throw new Error(`QUEUE_SIZE must be between 1 and 200 (got ${size}).`);
  }

  await dataSource.initialize();
  const users = dataSource.getRepository(User);
  const products = dataSource.getRepository(LoanProduct);
  const loans = dataSource.getRepository(Loan);
  const assignments = dataSource.getRepository(CollectorAssignment);
  const interactions = dataSource.getRepository(InteractionLog);
  const ptps = dataSource.getRepository(PromiseToPay);

  const collector = await users.findOne({
    where: { email: collectorEmail, role: UserRole.COLLECTOR },
  });
  if (!collector) {
    throw new Error(`No collector found for ${collectorEmail}. Run "npm run seed" first.`);
  }

  const admin = await users.findOne({ where: { role: UserRole.ADMIN } });
  const product = await products.findOne({ where: {} });
  if (!product) throw new Error('No loan product found. Run "npm run seed" first.');

  // Remove anything a previous run of this script created, so re-running does not
  // stack duplicate queues on the collector.
  const previous = await loans.find({ where: {}, select: { id: true, loanNumber: true } });
  const mine = previous
    .filter((l) => {
      const n = Number(l.loanNumber);
      return Number.isInteger(n) && n >= CASE_NUMBER_BASE && n < CASE_NUMBER_BASE + 1000;
    })
    .map((l) => l.id);
  if (mine.length) {
    await dataSource.query('DELETE FROM interaction_logs WHERE "loanId" = ANY($1)', [mine]);
    await dataSource.query('DELETE FROM promises_to_pay WHERE "loanId" = ANY($1)', [mine]);
    await dataSource.query('DELETE FROM collector_assignments WHERE "loanId" = ANY($1)', [mine]);
    await dataSource.query('DELETE FROM loans WHERE id = ANY($1)', [mine]);
    await dataSource.query(
      `DELETE FROM users WHERE role = 'BORROWER' AND phone LIKE '+2557999%'`,
    );
    console.log(`Cleared ${mine.length} case(s) from a previous run.`);
  }

  // A collector works exactly one tier per day (assertNoLevelMix), so anything they
  // already hold has to come off the queue or the app shows a mixed assignment and
  // reports no tier at all.
  const detached = await dataSource.query(
    `UPDATE collector_assignments SET "isActive" = false, "reassignedAt" = now()
      WHERE "collectorId" = $1 AND "isActive" = true`,
    [collector.id],
  );
  if (detached?.[1]) {
    console.log(`Unassigned ${detached[1]} case(s) already held by this collector.`);
  }

  const password = await bcrypt.hash('Secret@123', 10);
  const now = new Date();
  const dueDate = new Date(now.getTime() + LEVEL_OFFSETS[level] * 86_400_000);
  const daysOverdue = Math.max(0, -LEVEL_OFFSETS[level]);

  let withPendingPtp = 0;
  let withBrokenPtp = 0;
  let workedToday = 0;

  for (let i = 0; i < size; i++) {
    const r = seeded(i + 1);
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${SURNAMES[(i * 7) % SURNAMES.length]}`;
    // +2557999XXXXX is reserved for this script, so the cleanup above cannot touch
    // a borrower created by the main seed.
    const phone = `+2557999${String(10000 + i).slice(-5)}`;

    const borrower = await users.save(
      users.create({
        phone,
        email: null,
        passwordHash: password,
        role: UserRole.BORROWER,
        fullName: name,
        nationalId: `19900101-${String(70000 + i)}-00000-${String(10 + (i % 80))}`,
        address: `${WARDS[i % WARDS.length]}, Dar es Salaam`,
        kycStatus: KycStatus.VERIFIED,
      }),
    );

    // Spread principals across the Quick Cash range so the list is not uniform.
    const principal = Math.round((20000 + r * 160000) / 500) * 500;
    const interest = Math.round(principal * 0.4 * (14 / 7));
    const fee = Math.round(principal * 0.03);
    const penalty = daysOverdue > 0 ? Math.round(principal * 0.01 * daysOverdue) : 0;
    const total = principal + interest + fee + penalty;

    const loan = await loans.save(
      loans.create({
        // Scattered rather than sequential, matching how production allocates them,
        // but deterministic so re-running reproduces the same queue.
        loanNumber: String(CASE_NUMBER_BASE + ((i * 37) % 1000)),
        borrowerId: borrower.id,
        productId: product.id,
        principalAmount: principal,
        interestAmount: interest,
        processingFee: fee,
        penaltyAmount: penalty,
        totalAmount: total,
        outstandingBalance: total,
        totalPaid: 0,
        tenureDays: 14,
        disbursementDate: new Date(now.getTime() - 15 * 86_400_000),
        dueDate,
        status: daysOverdue > 0 ? LoanStatus.OVERDUE : LoanStatus.ACTIVE,
        daysOverdue,
        agingBucket: daysOverdue > 7 ? AgingBucket.D8_30 : daysOverdue > 0 ? AgingBucket.D1_7 : AgingBucket.CURRENT,
        approvedBy: admin?.id ?? null,
        approvedAt: new Date(now.getTime() - 15 * 86_400_000),
        disbursedAt: new Date(now.getTime() - 15 * 86_400_000),
      }),
    );

    await assignments.save(
      assignments.create({
        collectorId: collector.id,
        loanId: loan.id,
        assignedBy: admin?.id ?? null,
        isActive: true,
      }),
    );

    // A realistic mix, so the queue is not 45 identical untouched rows: roughly a
    // fifth already worked today, a fifth carrying a live promise, and a few who
    // have already broken one.
    if (i % 5 === 0) {
      workedToday++;
      await interactions.save(
        interactions.create({
          loanId: loan.id,
          borrowerId: borrower.id,
          collectorId: collector.id,
          channel: CommunicationChannel.CALL,
          disposition: i % 10 === 0 ? DispositionCode.PROMISED_TO_PAY : DispositionCode.UNREACHABLE,
          outcome: i % 10 === 0 ? 'WILL_PAY_LATER' : 'NO_ANSWER',
          notes: i % 10 === 0 ? 'Said they will pay after payday.' : null,
          durationSeconds: i % 10 === 0 ? 60 + Math.round(r * 220) : 0,
          durationSource: i % 10 === 0 ? 'CALL_LOG' : 'CALL_LOG',
          callOutcome: i % 10 === 0 ? 'ANSWERED' : 'NO_ANSWER',
          connected: i % 10 === 0,
          origin: 'COLLECTOR',
          createdAt: new Date(now.getTime() - Math.round(r * 5 * 3_600_000)),
        }),
      );

      if (i % 10 === 0) {
        withPendingPtp++;
        await ptps.save(
          ptps.create({
            loanId: loan.id,
            collectorId: collector.id,
            promisedAmount: Math.round(total / 2 / 500) * 500,
            promisedDate: new Date(now.getTime() + 2 * 86_400_000),
            status: PtpStatus.PENDING,
            notes: 'Said they will pay after payday.',
          }),
        );
      }
    } else if (i % 7 === 3) {
      // Already missed a promise: the escalation cases.
      withBrokenPtp++;
      // 30 hours back, so the deadline (promise + 24h grace) has passed but lands
      // after PTP_TRACKING_START. Dated further back it would be swept in as
      // pre-tracking backfill and, correctly, not counted as a broken promise.
      const promisedDate = new Date(now.getTime() - 30 * 3_600_000);
      await ptps.save(
        ptps.create({
          loanId: loan.id,
          collectorId: collector.id,
          promisedAmount: Math.round(total / 3 / 500) * 500,
          promisedDate,
          // Left PENDING on purpose: the sweep resolves it to BROKEN on first read,
          // which is the path the app actually exercises.
          status: PtpStatus.PENDING,
          notes: 'Promised at the branch.',
          createdAt: new Date(now.getTime() - 3 * 86_400_000),
        }),
      );
    }
  }

  console.log(
    `Seeded ${size} cases at tier ${level} (due ${dueDate.toISOString().slice(0, 10)}) for ${collector.fullName}.`,
  );
  console.log(
    `  ${workedToday} already worked today · ${withPendingPtp} with a live promise · ${withBrokenPtp} with a missed promise`,
  );
  await dataSource.destroy();
}

main().catch(async (error) => {
  console.error(error.message ?? error);
  if (dataSource.isInitialized) await dataSource.destroy();
  process.exit(1);
});
