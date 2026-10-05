# Ovrendi launch work — October 5, 2026

## Completed

- Added subscription lifecycle handling for renewals, payment failures/action-required, subscription updates, scheduled cancellation and cancellation. The backend retrieves current Stripe state before applying a notification, verifies the expected price and updates account billing state atomically.
- Fixed account context to include subscription ID. Checkout rejects an existing non-ended subscription. Repeated identical checkout requests share a time-bounded Stripe idempotency key.
- Added database event deduplication, stale-event protection, customer/subscription binding and a backend-only synchronization function. Administrative suspension cannot be removed by a payment event.
- Billing problems block operational APIs with a payment-required response while permitting billing recovery. Updated billing-page messaging.
- Inspected live access grants: all 16 inspected Ovrendi core/quoting tables have RLS enabled and deny direct anonymous and authenticated client reads/writes. Access goes through the authorized backend.
- Re-ran tenant isolation, staff role, invitation, quotation and database checks. Added tests for lifecycle events, wrong prices, payment recovery and a synthetic encrypted-export recovery drill.
- Optional AI suggestions now require a disclosure checkbox and API confirmation. Part names and free-text notes are excluded from the provider request. Removed email addresses from lead-success logs and suppressed raw provider/auth errors in several relevant paths.
- Added ignored secret/backup patterns and excluded maintenance scripts from public deployment.
- Prepared separate Terms of Use and Privacy Policy review drafts.

## Still needed before accepting paying customers

1. Accept Stripe marketplace terms at https://vercel.com/infinara/~/integrations/accept-terms/stripe?source=cli and connect the business's Stripe account. Complete Stripe identity/bank verification as required. Confirm pricing and USD versus CAD. Current code retains existing USD prices of 99/199/349 monthly; no real charging is activated.
2. Configure test keys and the webhook secret securely. Register checkout completion/async success, subscription created/updated/deleted/paused/resumed, and invoice paid/payment_failed/payment_action_required events. Configure billing portal cancellation/payment methods; do not enable arbitrary price changes until approved price mappings exist. Review tax, refunds, dispute notifications and cancellation settings.
3. Perform real Stripe sandbox checkout, renewal, failed-payment recovery, cancellation and duplicate-checkout tests. Automated mocks are not a substitute. Production Vercel currently has no Stripe credentials.
4. Complete a verified production backup and an isolated full restore. The included application export utility is narrower than a full database backup and has only been tested with synthetic records. Vercel did not release protected production credentials. No production backup or restore was performed.
5. Enable leaked-password protection if supported by the Supabase plan. Review Supabase database upgrade availability: current reported version is 17.6.1.127; the published September security update is 17.11. Do not upgrade the shared project without checking both applications and verifying backups.
6. Confirm the legal operator, mailing address, privacy owner, working contact inbox, refund policy and retention periods. Have counsel review the completed documents; then publish linked policy pages and record the version accepted at signup/checkout. Drafts are deliberately not represented as effective legal agreements.

## Shared Supabase project

Project: `emdgtyaggcbqaxsdrsaa` / `wavlon-autonomous`, Canada Central. The October 5 advisor report also flags two security-definer views and thirteen mutable-search-path functions in the other application's `company` schema, three authenticated-callable definer functions there, and the shared public `vector` extension. These were not modified blindly. The Ovrendi server-only tables' “RLS enabled, no policies” informational findings are consistent with deliberately denied direct client access.

Review guidance: [Supabase security advisors](https://supabase.com/docs/guides/database/database-linter), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), [database security update](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes).

## Recovery procedure

Use Supabase's supported database backup/export facilities for a full recovery strategy. Verify the newest backup and retention in the project dashboard; do not assume a plan includes backups. Database backups do not include Storage object contents. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).

The repository includes `scripts/backup-ovrendi.cjs` for an encrypted application-data export of an explicit Ovrendi table allowlist. Supply a temporary environment file containing the project URL and authorized service-role credential, an output path outside the checkout, and a random 32-byte base64 `OVRENDI_BACKUP_KEY` through a secure process environment. Retain the key separately in a secure recovery store. Never put keys or plaintext exports into Git, public outputs or chat. The script authenticates/decrypts the written archive and compares recovered content before reporting success.

This utility excludes Auth identities/passwords, Storage files, schema and provider settings. Reads are paginated and are not a transactional snapshot; it is supplemental protection, not the full recovery plan.

For a full restore drill, restore to a separate isolated environment with outbound email, Stripe and production callbacks disabled. Check table counts, foreign keys, quotes and profile histories, permissions, login recovery and representative customer PDFs. Record elapsed recovery time and actual recovered timestamp. Never restore this shared project in place merely to test a backup. Confirm effects on the other application before any production restore.

## Legal draft basis

The documents reflect the inspected application and provider configuration rather than claims of universal compliance. They address collection purpose, access/correction, retention, safeguards and accountability using the [Canadian privacy regulator's principles](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/p_principle/). Provider contracts and the operator's actual practices must support the no-sale commitment. Billing handling follows [Stripe subscription webhook guidance](https://docs.stripe.com/billing/subscriptions/webhooks).
