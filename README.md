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
Four tabs over one shared load of the collector's day:

| Tab | Contents |
| :--- | :--- |
| **Home** | Greeting, day summary (worked / recovered / talk time, per-channel counts), alerts for broken promises and callbacks due, and the next three cases to work |
| **Cases** | The full queue, searchable by name, phone or loan number, filtered by To do / Worked / Promises / Broken / All |
| **Promises** | Promises by state (Overdue / Upcoming / Broken / Kept) plus callbacks owed, each with a one-tap dialer |
| **Profile** | Who you are and your tier, today's figures, a 30-day performance summary, the call-log setting, and sign out |

Tab icons badge what is waiting: untouched cases on **Cases**, overdue promises on **Promises**.

Assignment still follows the single-level daily rule (T-2, T-1, T0, T1, T2, S from due
date — never mixed; bulk via `POST /api/v1/collections/auto-assign`). Tapping a case
opens Call / WhatsApp / SMS / USSD push, the full paginated contact history, and
broken-promise alerts.

The app is **light-themed** and uses **Hugeicons**, matching the borrower app so the
two read as one product. Icons are named once in `lib/theme/app_icons.dart` rather
than reached for at each call site, so a swap is one edit.

#### Case numbers

A case is identified by a bare **four-digit number** (`6501`, `1102`) — short enough
for a collector to read out on a call and a borrower to repeat back. Numbers are drawn
at random rather than sequentially, so a borrower holding two loan papers cannot infer
how many loans the business has written.

> **This format supports at most 9,000 loans.** `loans.loanNumber` is UNIQUE and four
> digits is 9,000 values (1000-9999); settled loans keep theirs. Allocation also slows
> as the space fills, since it retries on collision. `nextCaseNumber` logs a warning
> past 80% and throws a named error rather than looping once it is full. Widening to
> five digits is a one-line change in `apps/backend/src/loans/loan-number.ts` — the
> column is a varchar, so nothing else moves.

#### Filling a queue to capacity

45 is the most a collector may hold for tiers T-2 through T2, so it is the load the
queue has to stay usable at. To see it:

```bash
cd apps/backend
npm run seed:queue                    # 45 cases, all 1 day overdue (tier T1)
QUEUE_SIZE=20 npm run seed:queue      # fewer
QUEUE_LEVEL=ZERO npm run seed:queue   # due today instead
```

Additive and repeatable — it never truncates, and re-running replaces only the rows it
created (loan numbers prefixed `QT-`, borrower phones `+2557999…`). It also unassigns
anything the collector already holds, since a collector works exactly one tier per day.
`npm run seed` still resets the database from scratch.

The generated mix is deliberately uneven: roughly a fifth already worked today, five
carrying a live promise, five who have already broken one.

#### Recording the customer's response

Tapping **Call** hands the number to the dialer and records when. On return, the app
reads the device call log for that number and prefills the response sheet with the
**real** duration and whether the call connected, then asks what the customer said
(`WILL_PAY_LATER`, `NO_MONEY`, `DISPUTES_AMOUNT`, …) alongside the action taken.
Promise amounts and dates, and callback date **and time**, are validated before
submission.

Every touch records where its duration came from, so an admin can tell measured talk
time from self-reported:

| `durationSource` | Meaning |
| :--- | :--- |
| `CALL_LOG` | Read from the device call log — the collector cannot influence it |
| `IN_APP_TIMER` | Measured by the app (fallback; see the Play Store note) |
| `MANUAL` | Typed by the collector |
| `NONE` | Not recorded (every interaction logged before this shipped) |

The permission is requested through a small MethodChannel in `MainActivity.kt` rather
than `permission_handler`: that package exposes no `Permission.callLog` (only
`Permission.phone`, which requests the whole PHONE group) and its Android half
requires `compileSdk 37`.

> **Distribution note.** Reading the call log needs `READ_CALL_LOG`, which Google Play
> restricts to eligible use cases (default dialer, caller ID, spam blocking). A
> collections CRM is not one, so this app is for **internal distribution** — Managed
> Google Play private app, or direct APK/MDM to company devices. For a public listing,
> drop the permission and switch to `IN_APP_TIMER`, which needs none; the value already
> exists server-side so that change is client-only. **iOS has no call-log API at all**,
> so iOS installs are permanently on the self-reported path.
>
> The call log cannot be exercised on an emulator — verify the flow on a physical
> Android device: grant the permission, place a call, hang up after a known duration,
> and confirm the response sheet prefills it as "Verified from your call log".

SMS and WhatsApp are handed to the phone's own apps, so the platform never learns
whether they arrived. Those counts mean **messages initiated**, and every screen that
shows them says so.

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

### Collections activity tracing

Admin **Collections Activity** (`/collections/activity`) reports follow-up work over
any date range: contacts and talk time by channel, a daily series, per-collector
productivity, the promise pipeline, and a **per-borrower breakdown** answering "how
many calls, for how long, and how many messages have we sent this customer?" — with a
drill-down timeline per borrower. **Collector performance**
(`/collectors/:id/performance`) covers one agent. Both export to CSV.

The collector app has its own scoped views of the same data:
`GET /api/v1/collections/promises` (their promises with a tally by state) and
`GET /api/v1/collections/me/performance` (their own figures over a date range).

API (all admin-only): `GET /api/v1/admin/collections/activity`,
`.../borrowers/:id/timeline`, `.../collectors/:id/performance`,
`.../activity/export`, `.../alerts`, and `POST .../ptp/sweep`.

Ranges are **East Africa Time calendar days** (`from`/`to` as `YYYY-MM-DD`), not UTC
and not server-local — a collector's shift starting at 08:00 EAT belongs to that day.
`getCollectorStats` was previously computing "today" in server local time, so on a UTC
host the first three hours of every shift were counted against the previous day;
fixing that changes existing figures.

Reports count only collector-initiated touches. The server writes a `SYSTEM`
interaction of its own when a USSD push succeeds, and including it would credit
collectors with messages they never sent.

### Promise-to-pay lifecycle

A promise is **HONORED** when cumulative completed repayments since it was made reach
the promised amount, or the loan settles — resolved inside the ClickPesa settlement
transaction. It is **BROKEN** 24 hours after its promised date, dated at that deadline
rather than whenever a sweep noticed, so "days late" does not depend on how often
someone opened a dashboard. Renegotiating records a new promise and marks the old one
`SUPERSEDED`.

Two resolutions are excluded from kept-rate because neither is the borrower failing:
`SUPERSEDED` (replaced, and the replacement carries the outcome) and
`BACKFILL_UNVERIFIED` (lapsed before any of this was tracked). Set
`PTP_TRACKING_START` if a deployment goes live on a day other than the default.

Before this, `HONORED` and `BROKEN` were never written anywhere and every promise
stayed `PENDING` forever, so the first sweep after deploying resolves the whole
historical backlog at once — all of it tagged `BACKFILL_UNVERIFIED`.

### Staged borrower registration

The borrower app now has phone verification, personal details, address and document
acceptance, followed by identity, income and wallet checks before borrowing.
See [borrower onboarding setup](docs/borrower-onboarding.md) for provider
credentials, migrations, development testing and legal-document requirements.
Live NIDA integration still requires approved stakeholder access and an adapter.
