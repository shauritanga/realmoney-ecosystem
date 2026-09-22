# realMoney Fintech Ecosystem: Digital Lending & Debt Collection Suite

A production-ready digital lending and debt recovery platform designed for the East African market (integrated with ClickPesa Tanzania for M-Pesa, Tigo Pesa, Airtel Money, and HaloPesa).

---

## 🏛️ Ecosystem Architecture

```
realmoney-ecosystem/
├── apps/
│   ├── backend/             # NestJS API + PostgreSQL + ClickPesa Gateway
│   ├── admin-web/           # React + Vite + Tailwind Admin Operations Dashboard
│   ├── collector_mobile/    # Flutter Mobile App for Office Debt Recovery Agents
│   └── borrower_mobile/     # Flutter Mobile App for Public Loan Customers
```

---

## 🚀 Quick Start Guide

From the repository root, start the API and admin dashboard in separate terminals:

```bash
npm run dev:api
npm run dev:web
```

### 1. Database & Backend (NestJS)
```bash
cd apps/backend

# Seed database with demo accounts and loan products (auto-syncs schema via TypeORM)
npm run seed

# Start the development server (runs on port 3001)
npm run start:dev
```
* **API Prefix**: `http://localhost:3001/api/v1`
* **Swagger/Health**: `http://localhost:3001/api/v1/loans/products`

### 2. Admin Web Dashboard (React)
```bash
cd apps/admin-web

# Install & launch
bun install
bun run dev
```
* **URL**: `http://localhost:4000`
* **Credentials**:
  * Email: `admin@realmoney.tz`
  * Password: `Secret@123`

### 3. Collector Mobile App (Flutter — Office Staff)
```bash
cd apps/collector_mobile

# Run on Linux, Web, or Android emulator:
flutter run -d linux   # or -d chrome, or -d android
```
* **Credentials**:
  * Email: `collector1@realmoney.tz`
  * Password: `Secret@123`
* **Features**:
  * Single-level daily queues (T-2, T-1, T0, T1, T2, T3 from due date — never mixed; bulk via `POST /api/v1/collections/auto-assign`).
  * Home screen: cases assigned today, calls / WhatsApp / SMS made, cases settled; compact rows (ID, LVL, phone).
  * Case detail per tap: Call / WhatsApp / SMS / USSD push, disposition + PTP logging, contact-history timeline, broken-PTP alerts.

### 4. realMoney Borrower Mobile App (Flutter — Public)
```bash
cd apps/borrower_mobile

# Run on Linux, Web, or Android emulator:
flutter run -d linux   # or -d chrome, or -d android
```
* **Demo Borrower**:
  * Phone: `+255712345678`
  * Password: `Secret@123`
* **Features**:
  * Interactive loan slider and product selection.
  * Digital loan application and status tracking.
  * 1-tap ClickPesa USSD push self-repayment.

### Borrower limit policy

`GET /api/v1/loans/my-limit` returns the authenticated borrower's allowance.
New borrowers start at TZS 8,000. For returning borrowers, the latest
settled loan's actual principal is the basis: full settlement at or before
`dueDate` earns a 25% increase; late settlement keeps the same principal amount.
Missing settlement timestamps receive no increase. Limits round down to whole
TZS and are calculated from stored loans, so refreshing cannot compound them.
For example, TZS 100,000 paid on time allows TZS 125,000 next time; paid late,
it allows TZS 100,000. Product minimums and maximums still apply. Outstanding
loans (including defaulted loans) prevent a new application.

The backend enforces this allowance on application; the borrower dashboard and
product amount slider use the same endpoint. Settlement timing currently uses
the timestamp recorded when the payment callback is processed.

---

## 💳 ClickPesa Payment Gateway Workflows

1. **C2B USSD Push (Collection & Repayment)**:
   * Triggers an interactive USSD pop-up directly to borrower's mobile handset requesting M-Pesa / Tigo / Airtel PIN.
   * `POST /api/v1/collections/trigger-payment`
2. **B2C Loan Payouts (Disbursements)**:
   * Instant wallet payout when credit officer approves loan.
   * `POST /api/v1/loans/:id/disburse`
3. **Webhook Callback**:
   * Cryptographically validated webhook listener with atomic double-entry bookkeeping (`CASH_CLICKPESA` debit, `LOAN_RECEIVABLE` credit).
   * `POST /api/v1/webhooks/clickpesa`

### Admin interest settings

Admin **Settings → 7-day interest rate (%)** controls interest on new applications
across all products. The default is 40% per 7 days. The API exposes admin-only
`GET /api/v1/admin/settings` and `PUT /api/v1/admin/settings` with
`{"interestRateMonthly": 40}`. Values from 0 to 100 with up to two decimal places
are accepted and stored in `lending_settings`.

Interest retains the existing calculation: principal × 7-day rate ÷ 100 ×
tenure days ÷ 7, rounded to whole TZS. Processing fees remain separate.
Existing loan amounts do not change when settings are updated. The borrower
product quote uses the same configured rate. The 25% on-time limit reward is separate.

With schema synchronization disabled, apply the SQL files in
`apps/backend/src/database/migrations/` before deploying. Apply the starter-limit
SQL to existing installations as well, so the Quick Cash minimum supports TZS 8,000;
do not reseed a populated database.

### Staged borrower registration

The borrower app now has phone verification, personal details, address and document
acceptance, followed by identity, income and wallet checks before borrowing.
See [borrower onboarding setup](docs/borrower-onboarding.md) for provider
credentials, migrations, development testing and legal-document requirements.
Live NIDA integration still requires approved stakeholder access and an adapter.
