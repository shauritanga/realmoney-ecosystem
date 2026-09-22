# ClickPesa repayments and disbursements

Borrower and assigned-collector repayments use ClickPesa mobile-money USSD push.
Loan disbursements also use ClickPesa mobile-money payouts. Mobile wallet onboarding
verifies the phone-matched wallet for ClickPesa disbursements.

## Loan processing fee

New loan processing fees are calculated as:

```text
amount-based RealMoney percentage fee + ClickPesa payout fee
```

The result is rounded up to the nearest TZS 50. For example, an TZS 8,000 loan on
the 3% small-loan rate has a TZS 240 RealMoney fee plus the TZS 430 ClickPesa
payout fee, resulting in a displayed processing fee of TZS 700. RealMoney's rates
are 3% below TZS 50,000, 2.75% from TZS 50,000 to 199,999, 2.5% from TZS 200,000
to 499,999, and 2.25% from TZS 500,000 upward. This fee is stored
in the loan balance before approval, so the mobile quote and backend repayment total
use the same amount. The fee table is maintained in
`apps/backend/src/clickpesa/clickpesa-fees.ts` and should be reviewed if ClickPesa
changes its published pricing.

## Configuration

Keep these values in `apps/backend/.env` or your deployment secret manager:

```dotenv
CLICKPESA_API_KEY=your-api-key
CLICKPESA_CLIENT_ID=your-client-id
CLICKPESA_CHECKSUM_KEY=
```

The supplied credentials are configured locally, never in mobile/web bundles.
Replace the chat-shared key before production. Use an API application with mobile
collection enabled. Enable canonical checksum signing in the ClickPesa dashboard,
set its separate key as CLICKPESA_CHECKSUM_KEY in production, and restart the backend.
The API key is not the checksum key. Webhooks reject requests with HTTP 503 when
the checksum key is missing, and HTTP 401 for invalid or missing checksums.
Restart after any credential change. The API origin is fixed to ClickPesa's HTTPS
endpoint to prevent accidentally sending credentials to another host.

For `TYPEORM_SYNC=false`, apply
`apps/backend/src/database/migrations/20260922-clickpesa-repayments.sql`, followed by
`apps/backend/src/database/migrations/20260923-clickpesa-webhook-events.sql` and
`apps/backend/src/database/migrations/20260924-quick-cash-minimum-8000.sql`, before
starting the updated backend. It adds provider reference columns and enum values
without rewriting historical Selcom records. Development schema synchronization
also discovers these additions.

In the ClickPesa application settings, set both PAYMENT RECEIVED and PAYMENT FAILED
webhooks to:

```text
https://money-api.zanua.co.tz/api/v1/webhooks/clickpesa
```

The `/api/v1` prefix is set globally by NestJS. The previous
`/api/v1/clickpesa/webhook` route remains an alias with identical checksum verification.
Configure the server's outbound IP in ClickPesa if IP whitelisting is enabled.
These source changes must be deployed before the new route is available; local
implementation does not configure the production server or ClickPesa dashboard.

## Flow and verification

1. The existing authenticated `POST /api/v1/collections/trigger-payment` accepts
   `{ "loanId": "uuid", "amount": 1000 }`. ClickPesa's mobile-money minimum is
   TZS 500. Borrowers may pay their own loans;
   collectors must have an active assignment; administrators may access all loans.
2. A pending repayment is stored before dispatch. Its `orderId` is an alphanumeric
   20-character reference. A pending ClickPesa repayment prevents duplicate pushes
   for the same loan.
3. Authorize the prompt on the customer's phone. No application screen accepts a PIN.
4. The borrower's **Check payment status** button calls authenticated
   `GET /api/v1/clickpesa/payments/:orderId`. Webhooks also trigger reconciliation.
5. The backend queries ClickPesa directly, matching application ID, order reference,
   amount and TZS currency. Only SUCCESS/SETTLED credits the loan. Callback-supplied
   amounts and statuses are never trusted. Loan and repayment row locks serialize
   updates, and the two ledger entries are committed in the same transaction.

## Webhook event history and retries

A dedicated `ClickPesaWebhookController` verifies the full parsed JSON payload using
canonical HMAC-SHA256 and a constant-time checksum comparison. `checksum` and
`checksumMethod` are excluded from signing, as documented by ClickPesa. Only the
canonical method is supported. Authenticated, structurally valid payloads are stored
in `payment_webhook_events` before querying ClickPesa. Payloads are not written to
application logs; restrict database access because these records contain payer data.

A unique `(provider, payloadHash)` index deduplicates identical events independently
of JSON property order. Distinct status updates for the same payment remain separate
events. Repayment transaction uniqueness and loan/repayment locks protect against
duplicate credits even across different events, simultaneous deliveries, or a crash
between crediting the loan and marking the event processed.

Verified terminal reconciliation sets `processed` and `processedAt`. Pending, unknown,
mismatched, or unavailable verification leaves the event unprocessed, records a generic
processing error, and returns HTTP 503. Redelivering the signed event retries it safely.
Unrelated authenticated event types are stored and acknowledged without changing loans.
There is no internal retry worker: monitor unprocessed events and arrange provider
redelivery or operator reconciliation if retries stop. A successful status poll credits
the loan safely, but the event remains unprocessed until its next successful delivery.

This application has a loan balance and due date, not a separate installment schedule.
Reconciliation updates total paid and outstanding balance and marks a fully paid loan
SETTLED. No installment-allocation logic is implemented.

The legacy public Selcom webhook and simulated-success routes are no longer
registered. Existing integrations sending callbacks to those routes must be retired
or reconciled separately before deploying this change.

Timeouts leave the order pending because a push may already have been accepted.
Use its status endpoint instead of retrying payment creation. Explicit provider
FAILED status permits a new attempt. If an order never appears at ClickPesa (for
example, a rejected push request), an operator must verify non-collection with the
provider before manually resolving the pending record. No automatic expiry or
background reconciliation job is configured. Check pending payments after outages.
An amount mismatch or overpayment requires manual reconciliation and does not
silently reduce the loan balance.

## Testing

```sh
npm test --prefix apps/backend
npm run build --prefix apps/backend
```

Tests use mocked provider responses; they do not initiate real transactions.
ClickPesa has no sandbox. An authentication-only check does not prove collection
permissions, checksum configuration, public webhook delivery, or successful
mobile-money collection. Verify the public webhook and a deliberately authorized
small live payment before launch.

Official references:
- [Authorization](https://docs.clickpesa.com/api-reference/authorization/generate-token)
- [USSD push](https://docs.clickpesa.com/api-reference/collection/ussd-push-requests/initiate-ussd-push-request)
- [Payment status](https://docs.clickpesa.com/api-reference/collection/querying-for-payments/querying-for-payments)
- [Checksum](https://docs.clickpesa.com/home/checksum)
- [Webhooks](https://docs.clickpesa.com/home/webhooks)
- [Testing environment](https://docs.clickpesa.com/home/sandbox-and-testing-environment)
