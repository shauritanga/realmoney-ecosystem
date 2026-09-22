# realMoney privacy notice — development draft

**Not approved for live customers. Do not enter real personal information in development.**

## Information used by this application

Registration collects a mobile number, password, legal name, birth date, identity
document type and number, residential address, optional email, and account-term
and privacy-notice acceptance records. Passwords are stored as hashes. The app
records phone verification and optional marketing preferences.

Before a loan application it collects occupation or income source, typical monthly
income, essential expenses, existing loan repayment amounts, mobile-money provider,
and verification results. Loan and payment records are stored separately.

## Purposes and verification providers

This information supports account security, identity and wallet checks, application
assessment, lending operations, customer support and record keeping. SMS delivery
uses a configured provider. Identity and wallet checks send the necessary identity
or account details to the configured verification providers. Development-mode
checks are simulations, not real identity verification.

The proposed integrations are Beem for SMS, an approved NIDA stakeholder adapter
for identity, and ClickPesa for mobile wallet disbursements and collections. The operator must confirm the
actual providers, processing arrangements, recipients, locations and legal bases
before publishing a live notice.

## Access and optional choices

The onboarding API restricts borrower profile access to the borrower and authorised
administrators. Income information is made available to authorised administrators
for application review. Marketing is optional and separate from account and loan
service messages. This registration flow does not request access to phone contacts,
SMS history, a photo gallery, or continuous location.

## Operator review required before publication

The operator must specify its legal identity and data-protection contact, purposes
and lawful bases, recipients, international transfers and safeguards if any,
retention periods and deletion processes, data-subject rights and how to exercise
them, marketing preference withdrawal, complaint channels, and any automated
assessment practices. Do not represent this draft as an approved privacy notice.
