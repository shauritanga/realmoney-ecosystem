# UI/UX & Functionality Inspiration — realMoney Ecosystem

Saved references for future implementation. Each section maps to one of our
three surfaces: borrower app, collector app, admin web.

## 1. Borrower app (`apps/borrower_mobile`) — Tala / Branch / M-KOPA / JUMO

- **Tala (tala.co)** and **Branch (Kenya/TZ)**: 5-min signup → instant decision,
  one loan slider, huge "amount + due date + fee" summary, 1-tap mobile-money
  repayment. Steal: fee-transparency screen, progressive loan-limit ladder
  (repay → unlock bigger loan).
- **M-KOPA (m-kopa.com)**: micropayment + USSD fallback UX, "pay small amounts
  anytime" progress bar. Copy for Selcom USSD-push self-repayment flow.
- **JUMO (jumo.world)** ($8B disbursed, incl. Tanzania): bank/wallet-partner
  model like our Selcom integration. Reference for loan-product cards and
  eligibility messaging.
- Also: FairMoney, Carbon (Nigeria), M-Shwari/Fuliza (Safaricom) onboarding.

### Borrower backlog (inspired)
- [x] Transparent apply screen: principal slider + live fee/interest/due-date breakdown (due date + wallet payout note added; tenure chips now product-driven)
- [x] Loan-limit ladder (200k → 500k → 1M by settled-loan count, shown on dashboard)
- [x] Repayment progress bar with part-payment support (25%/50%/Full chips + custom amount)
- [x] 1-tap Selcom USSD-push self-repayment + simulate-callback status polling (PIN-prompt dialog with demo simulate; backend `trigger-payment` opened to BORROWER role)
- [x] Eligibility explainer + status tracker (PENDING/APPROVED pipeline card with steps)

## 2. Collector app (`apps/collector_mobile`) — TrueAccord / Collectly / Lexop

- **TrueAccord (trueaccord.com)**: humane collections — omnichannel queue
  (call → SMS → WhatsApp → email), contact-history timeline, "best time to
  contact" hints, promise-to-pay tracking. HeartBeat engine personalizes
  tone/channel per debtor → copy as simple rule
  (D1–7 = friendly SMS, D8–30 = call + USSD push).
- **Collectly / Lexop pattern**: prioritized work queue sorted by
  days-overdue × balance (our D1–7/D8–30 buckets), 1-tap call/WhatsApp with
  auto-logged disposition modal.
- General CRM queue patterns: Salesforce collections, HubSpot tasks.

### Collector backlog (inspired)
- [x] Single-level daily queues (-2/-1/0/T1/T2/T3 from due date; backend `assertNoLevelMix` + `auto-assign` endpoint, app level tabs with counts)
- [x] Daily progress bar (worked X of Y from today's interactions)
- [x] Level-aware WhatsApp templates (friendly pre-due vs firm overdue)
- [x] PTP broken alerts (pending PTP past its date shows red escalate banner)
- [x] Level explainer banner per tab (tone ladder by level)
- [x] Collector home screen: day summary (assigned cases, calls, WhatsApp, SMS, settled) + compact rows (ID, LVL, phone)
- [x] Case detail screen per tap: Call/WhatsApp/SMS/USSD actions, PTP banner, contact-history timeline
- [ ] Next-best-action banner per account

## 3. Admin web (`apps/admin-web`) — Fineract / Mkopo / Mambu / Lendsqr

- **Apache Fineract / Mifos X (fineract.apache.org)**: open-source lending core —
  loan lifecycle, aging buckets, double-entry ledger, collector assignment.
  Closest functional match to our backend; reference for dashboard/ledger screens.
- **Mkopo LMS (github.com/rapaugustino/mkopo)** and
  **mkopo_loan_management_system (github.com/bria222/mkopo_loan_management_system)**:
  staff console + borrower portal + underwriter role. Cloneable flows
  (approve/reject, disbursement, stats).
- **Mambu / Lendsqr / Musoni / Craft Silicon**: portfolio-at-risk charts,
  aging-breakdown widgets, collector leaderboard.

### Admin backlog (inspired)
- [ ] Portfolio-at-risk + aging-breakdown charts
- [ ] Approval queue with borrower snapshot
- [ ] Ledger explorer (double-entry view)
- [ ] Collector leaderboard / performance

## Priority order agreed
1. Borrower app ← Tala/Branch onboarding + M-KOPA repayment bar
2. Collector app ← TrueAccord timeline + PTP nudges
3. Admin ← Fineract ledger/aging + Mkopo approval queue
