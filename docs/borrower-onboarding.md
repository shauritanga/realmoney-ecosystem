# Borrower registration and verification

## Implemented flow

1. **Account:** verify a Tanzanian mobile number by SMS OTP; choose and confirm a
   password of at least 10 characters. Codes expire after five minutes, allow five
   attempts, and cannot be reused. Resends wait 60 seconds. Sending is limited to
   five attempts per phone and twenty per source IP per hour using database records.
2. **Personal details:** legal name, birth date (adult-customer policy: 18+),
   NIDA/NIN or passport number, optional email.
3. **Address and acceptance:** region, district, ward, street/village, optional
   landmark; account-term acceptance and privacy acknowledgement; marketing is
   separately optional. The server records document hashes, exact accepted text
   and timestamps. Registration consumes the phone proof atomically with account
   creation. Passwords are hashed; OTPs and verification proofs are HMAC-hashed.
4. **Before borrowing:** verify identity; submit employment/income source, monthly
   income, essential expenses and other loan repayments; verify that the wallet on
   the registered phone belongs to the verified legal name. Financial information
   must be refreshed after 90 days. The application API independently enforces all
   completion checks, including for existing borrowers.

The app deliberately supports payouts only to the registered, verified phone.
An administrator can review income/expense figures from the Underwriting desk.
These are borrower-declared figures, not verified earnings or an automated credit
approval. The existing credit-officer approval process remains in place.

Registration does not yet persist an unfinished form across app termination. After
an account is created, pre-loan verification progress is persisted on the server.

## Providers selected

- **SMS:** Beem SMS API, https://docs.beem.africa/ and
  https://beem.africa/sms-api/. A direct adapter sends generated OTPs through Beem.
  Requires a business account, funded SMS balance, API credentials and approved
  sender ID. A provider acceptance response means queued for delivery, not proof
  of delivery; only a correct code proves phone control.
- **Wallet ownership:** Selcom IMT wallet-name lookup,
  https://developers.selcommobile.com/#wallet-name-look-up. Requires the merchant's
  credentials and entitlement to this API. No payment is initiated by this check.
  Legal names must match after whitespace/case normalization; mismatches fail and
  require support rather than silently accepting a different owner.
- **Identity:** NIDA stakeholder verification,
  https://services.nida.go.tz/ and https://nida.go.tz/Ushirikishanaji-Taarifa.
  Its approved stakeholder access and integration specifications are not included
  in this repository. The app exposes a private HTTPS adapter contract for the
  approved NIDA integration. Passport verification requires an approved provider
  behind that adapter; NIDA support must not be assumed for passports.

The identity adapter is **not a completed NIDA integration**. Live onboarding is
blocked without a configured, working provider. Do not use a self-declared ID or
SMS verification as a substitute for identity verification.

## Configuration and deployment

Merge `apps/backend/.env.onboarding.example` into your configuration; never commit
real credentials. Set `OTP_SECRET` to a cryptographically random secret of at least
32 bytes. Set Beem and Selcom credentials through your secrets manager.

Apply `apps/backend/src/database/migrations/20260920-borrower-onboarding.sql` when
schema auto-sync is disabled. It adds nullable onboarding data to existing users
and two security tables; it does not approve existing users or erase their loans.
The previous starting-limit migration is also needed for existing starter products.
Do not run the destructive demo seed against an existing customer database.

Configure the mobile API endpoint for the device/network:

```bash
flutter run --dart-define=API_BASE_URL=https://your-api-host/api/v1
```

Behind a proxy, source-IP limits currently use the immediate peer address. Set a
trusted-proxy policy explicitly in the deployment if needed; never trust arbitrary
client-supplied forwarding headers. Shared proxy addresses may otherwise hit the
same send limit. Do not log request bodies on authentication/onboarding endpoints.
Periodically remove expired challenge/rate-limit records under your data-retention
policy; expired records are rejected even before cleanup.

## Identity adapter contract

`VERIFICATION_BRIDGE_URL` must be HTTPS. The server sends
`POST {base}/identity`, authenticated with
`Authorization: Bearer {VERIFICATION_BRIDGE_TOKEN}`:

```json
{
  "fullName": "Synthetic Test Customer",
  "nationalId": "19900101123450000101",
  "identityType": "NIDA",
  "dateOfBirth": "1990-01-01"
}
```

The adapter must perform the approved verification and match **all supplied identity
attributes**, returning HTTP 200 with `{"verified":true,"reference":"provider-reference"}`
only after successful verification. It must return `verified:false` for mismatches
or insufficient evidence. Timeouts, unconfigured providers and invalid responses
fail closed. The adapter must never simply echo a client-supplied verification flag.
Credentials, raw provider responses and biometrics are not returned to the mobile app.

## Development and legal drafts

With `NODE_ENV` other than `production` and explicit `ONBOARDING_DEV_MODE=true`,
SMS codes are returned for testing and identity/wallet checks are simulated. The
app visibly labels this mode. Use synthetic data only. Production ignores this
flag and rejects development verification evidence stored on an account.

Development draft documents live in `docs/legal/` and are embedded in
`legal-drafts.ts`. They identify the missing operator-specific legal decisions.
For live use, supply reviewed `ACCOUNT_TERMS_TEXT` and `PRIVACY_NOTICE_TEXT`, and set
`LEGAL_REVIEW_APPROVED=true`. Production registration will not accept development
drafts. Account registration is not acceptance of a future loan agreement.

## Endpoints

Public: `GET /auth/legal`, `POST /auth/phone-code`, `POST /auth/verify-phone`,
`POST /auth/register`. Registration rejects the old minimal payload.

Borrower-only: `GET /onboarding`, `PUT /onboarding/profile`,
`POST /onboarding/verify-identity`, `PUT /onboarding/financial`.

Admin-only: `GET /admin/borrowers/:id/onboarding`.

All paths are under `/api/v1`. Clients cannot set verified status, verification
references, approval roles, timestamps, or legal text through registration input.
