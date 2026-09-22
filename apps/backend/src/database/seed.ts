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
  UserRole,
  KycStatus,
  LoanStatus,
  AgingBucket,
  CommunicationChannel,
  DispositionCode,
} from './enums.js';
import { APP_ENTITIES } from './database.module.js';

const dataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL ?? 'postgres://postgres:postgrespassword@localhost:5432/realmoney_db',
  entities: APP_ENTITIES,
  synchronize: true,
});

async function main() {
  console.log('Seeding initial database data...');
  await dataSource.initialize();

  const users = dataSource.getRepository(User);
  const products = dataSource.getRepository(LoanProduct);
  const loans = dataSource.getRepository(Loan);
  const assignments = dataSource.getRepository(CollectorAssignment);
  const interactions = dataSource.getRepository(InteractionLog);
  const ptps = dataSource.getRepository(PromiseToPay);

  // 1. Clean existing records for a fresh seed
  await dataSource.query(
    'TRUNCATE "interaction_logs", "promises_to_pay", "collector_assignments", "ledger_entries", "repayments", "loans", "loan_products", "users" CASCADE',
  );

  // 2. Hash default password
  const defaultPassword = await bcrypt.hash('Secret@123', 10);

  // 3. Create Super Admin
  const athanasPassword = await bcrypt.hash('Athanas@2015', 10);
  await users.save(
    users.create({
      phone: '+255700000000',
      email: 'shauritangaathanas@gmail.com',
      passwordHash: athanasPassword,
      role: UserRole.ADMIN,
      fullName: 'Athanas Shauritanga',
      nationalId: '19900101-12345-00000-01',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  const admin = await users.save(
    users.create({
      phone: '+255700000001',
      email: 'admin@realmoney.tz',
      passwordHash: defaultPassword,
      role: UserRole.ADMIN,
      fullName: 'Super Administrator',
      nationalId: '19900101-12345-00001-01',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  // 4. Create Office Collectors
  const collector1 = await users.save(
    users.create({
      phone: '+255700000002',
      email: 'collector1@realmoney.tz',
      passwordHash: defaultPassword,
      role: UserRole.COLLECTOR,
      fullName: 'Neema Mwangi',
      nationalId: '19950512-12345-00002-02',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  const collector2 = await users.save(
    users.create({
      phone: '+255700000003',
      email: 'collector2@realmoney.tz',
      passwordHash: defaultPassword,
      role: UserRole.COLLECTOR,
      fullName: 'Baraka Juma',
      nationalId: '19940820-12345-00003-03',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  // 5. Create Loan Products
  const productQuickCash = await products.save(
    products.create({
      name: 'Quick Cash 14 Days',
      minAmount: 8000,
      maxAmount: 200000,
      interestRateMonthly: 40.0,
      minTenureDays: 7,
      maxTenureDays: 14,
      latePenaltyRateDaily: 1.0,
      processingFeeRate: 2.5,
    }),
  );

  const productBusiness = await products.save(
    products.create({
      name: 'Business Booster 30 Days',
      minAmount: 100000,
      maxAmount: 1000000,
      interestRateMonthly: 40.0,
      minTenureDays: 14,
      maxTenureDays: 30,
      latePenaltyRateDaily: 1.0,
      processingFeeRate: 3.0,
    }),
  );

  // 6. Create Borrowers
  const borrower1 = await users.save(
    users.create({
      phone: '+255712345678',
      email: 'juma.rashid@gmail.com',
      passwordHash: defaultPassword,
      role: UserRole.BORROWER,
      fullName: 'Juma Rashid',
      nationalId: '19920315-99881-00010-04',
      address: 'Kinondoni, Dar es Salaam',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  const borrower2 = await users.save(
    users.create({
      phone: '+255754987654',
      email: 'amina.said@gmail.com',
      passwordHash: defaultPassword,
      role: UserRole.BORROWER,
      fullName: 'Amina Said',
      nationalId: '19961125-88772-00020-05',
      address: 'Mbezi Beach, Dar es Salaam',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  const borrower3 = await users.save(
    users.create({
      phone: '+255788112233',
      email: 'kelvin.peter@gmail.com',
      passwordHash: defaultPassword,
      role: UserRole.BORROWER,
      fullName: 'Kelvin Peter',
      nationalId: '19890704-77663-00030-06',
      address: 'Ilala, Dar es Salaam',
      kycStatus: KycStatus.VERIFIED,
    }),
  );

  // 7. Create Loans with different lifecycle states
  // Loan 1: ACTIVE, level -2 (due in 2 days, pre-due reminder stage)
  const now = new Date();
  const futureDueDate = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

  await loans.save(
    loans.create({
      loanNumber: 'RM-2026-0001',
      borrowerId: borrower1.id,
      productId: productQuickCash.id,
      principalAmount: 50000,
      interestAmount: 2500,
      processingFee: 1250,
      totalAmount: 53750,
      outstandingBalance: 53750,
      totalPaid: 0,
      tenureDays: 14,
      disbursementDate: now,
      dueDate: futureDueDate,
      status: LoanStatus.ACTIVE,
      agingBucket: AgingBucket.CURRENT,
      approvedBy: admin.id,
      approvedAt: now,
      disbursedAt: now,
    }),
  );

  // Loan 2: level T1 (1 day overdue - assigned to Neema)
  const pastDueDate1 = new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000);
  const loan2 = await loans.save(
    loans.create({
      loanNumber: 'RM-2026-0002',
      borrowerId: borrower2.id,
      productId: productQuickCash.id,
      principalAmount: 80000,
      interestAmount: 4000,
      processingFee: 2000,
      penaltyAmount: 3200, // 1% per day * 4 days
      totalAmount: 89200,
      outstandingBalance: 89200,
      totalPaid: 0,
      tenureDays: 14,
      disbursementDate: new Date(now.getTime() - 18 * 24 * 60 * 60 * 1000),
      dueDate: pastDueDate1,
      status: LoanStatus.OVERDUE,
      daysOverdue: 1,
      agingBucket: AgingBucket.D1_7,
      approvedBy: admin.id,
      approvedAt: now,
      disbursedAt: now,
    }),
  );

  // Assign Loan 2 to Collector 1 (Neema)
  await assignments.save(
    assignments.create({
      collectorId: collector1.id,
      loanId: loan2.id,
      assignedBy: admin.id,
      isActive: true,
    }),
  );

  // Add an interaction log for Loan 2
  await interactions.save(
    interactions.create({
      loanId: loan2.id,
      collectorId: collector1.id,
      channel: CommunicationChannel.CALL,
      disposition: DispositionCode.PROMISED_TO_PAY,
      notes: 'Customer promised to pay 40,000 TZS by tomorrow noon via ClickPesa USSD.',
      durationSeconds: 145,
    }),
  );

  // Add a PTP for Loan 2
  await ptps.save(
    ptps.create({
      loanId: loan2.id,
      collectorId: collector1.id,
      promisedAmount: 40000,
      promisedDate: new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000),
      notes: 'Part payment promised',
    }),
  );

  // Loan 3: OVERDUE (D8_30 days - assigned to Baraka)
  const pastDueDate2 = new Date(now.getTime() - 12 * 24 * 60 * 60 * 1000); // 12 days overdue
  const loan3 = await loans.save(
    loans.create({
      loanNumber: 'RM-2026-0003',
      borrowerId: borrower3.id,
      productId: productBusiness.id,
      principalAmount: 200000,
      interestAmount: 24000,
      processingFee: 6000,
      penaltyAmount: 24000, // 1% per day * 12 days
      totalAmount: 254000,
      outstandingBalance: 204000,
      totalPaid: 50000,
      tenureDays: 30,
      disbursementDate: new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000),
      dueDate: pastDueDate2,
      status: LoanStatus.OVERDUE,
      daysOverdue: 12,
      agingBucket: AgingBucket.D8_30,
      approvedBy: admin.id,
      approvedAt: now,
      disbursedAt: now,
    }),
  );

  // Assign Loan 3 to Collector 2 (Baraka)
  await assignments.save(
    assignments.create({
      collectorId: collector2.id,
      loanId: loan3.id,
      assignedBy: admin.id,
      isActive: true,
    }),
  );

  console.log('Seeding completed successfully!');
  console.log('Admin:', admin.email, 'password: Secret@123');
  console.log('Collector 1 (Neema):', collector1.email, 'password: Secret@123');
  console.log('Collector 2 (Baraka):', collector2.email, 'password: Secret@123');
  console.log('Borrower 1 (Juma):', borrower1.phone, 'password: Secret@123');
  console.log('Borrower 2 (Amina):', borrower2.phone, 'password: Secret@123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    if (dataSource.isInitialized) await dataSource.destroy();
  });
