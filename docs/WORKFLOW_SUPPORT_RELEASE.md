# Quoting, support and customer follow-ups

## Customer workflow
- Quoting autosaves incomplete working fields to Supabase after 900 ms of inactivity, per authenticated user/company. Wait for “Working draft saved” before leaving. Restoring a draft never restores the review checkbox. One working draft per user/company; stale tabs are rejected with a conflict. Profiles and identity forms still require their own Save buttons.
- Saving a reviewed revision remains explicit and recalculates server-side. Old snapshots stay immutable. Duplicate as new quote reuses the import/settings but creates a separate quote family on save.
- Status sequence: draft → issued → accepted / declined / expired. Only the latest revision can change status. Expired-by-date issued quotes cannot be accepted. Create a new revision to renew. Expired status is derived in the list; the explicit action records it. Marking issued does not email the quote.
- Report a bug → open conversation → add reply/screenshot. PNG/JPEG/WebP, browser input up to 8 MB, 24 million pixels maximum; re-encoded JPEG at max 1600 pixels and 400 KB on the server. No SVG or HTML. Attachments are stored in the private support-message table and fetched only for an authorized conversation. At most 100 messages per report and 20 customer replies per hour. Screenshots are fetched individually on request to keep conversations fast and within response limits. The initial report and later screenshot are separate submissions.

## Staff workflow
- Bug reports: keep confidential notes in Internal notes. Open Conversation and screenshots; save a public reply for the reporter. To notify them, explicitly click Send email notification and confirm. A resolved status alone does not send an email. Provider acceptance is not proof of inbox delivery. Saved replies can retry an unconfirmed notification using a stable provider idempotency key; successful sends are marked in the database.
- Customer follow-ups: first user, first app use, 7+ days inactive, first quote, trials within 14 days or ended, billing problems. Flags are computed on load/Refresh. Create a persistent task, then assign an owner and due date in Tasks & planning. No automatic marketing/re-engagement email is sent.
- Check payment method reads Stripe live and returns default-method presence, live/test mode, subscription state and scheduled cancellation, without card details. A configured method is not a guarantee that a charge will succeed.

## Privacy and rollout
New tables use RLS and are denied to anon/authenticated; server routes enforce identity and staff permissions. No broad grants or changes to the other application sharing Supabase. Existing rate profiles, users, trial end dates, prices and subscriptions are preserved.
Policy completion remains dependent on operator legal name/address and qualified review. See LAUNCH_POLICY_REVIEW.md. /terms.html is intentionally a draft, noindex and not represented as accepted contractual terms.

## Verification
103 automated tests plus PostgreSQL migration/security and persistence checks. Browser tests cover cloud draft restore, duplication, review reset, state transitions, support image preparation/replies, deliberate notification action, follow-up task creation, phone/iPad/desktop layout, reduced motion and keyboard skip link. These are targeted checks, not a WCAG certification or full screen-reader audit.
Six website images optimized losslessly: 2,417,605 → 1,452,370 bytes (40% smaller in aggregate); decoded pixel equality checked. Savings vary by which images a page uses and are not a measured Core Web Vitals claim.

## Shared-project advisor follow-up
Supabase security advisors found no new permissive access on the new tables. The informational “RLS enabled, no policy” result is intentional: direct browser roles are denied; only authenticated server handlers access these records.

Existing shared-project findings remain outside this release: `company` schema security-definer views/functions, mutable function search paths, public vector extension, and disabled leaked-password protection. Review the other application’s authorization before changing shared objects. Do not claim the whole project is fully security-cleared.
- [Security-definer view guidance](https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view)
- [Function execution guidance](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [Password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
