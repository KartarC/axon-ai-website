# Billet security hardening

## Backend location

- PostgreSQL and authentication: Supabase project `emdgtyaggcbqaxsdrsaa`, dashboard name **wavlon-autonomous**, region **ca-central-1 (Canada Central)**. Billet's tables are in `public`; Wavlon consumes Billet metrics through `company.v_axon_*` views.
- Server application code: Vercel project **axon-ai-website**, source in `api/`. The reviewed production deployment runs in Vercel region `iad1`.
- Browser application: static HTML/JavaScript in `app/`, served by Vercel.

## Changes

- Invitation acceptance authenticates existing users instead of overwriting their passwords. New invitations may create a new identity but cannot update an existing one. Invitation links remain bearer credentials and should only be shared with the intended recipient.
- A service-role-only transaction consumes each invite and creates membership together. Reuse, mismatched email, inactive shops, cross-shop membership ambiguity, and implicit role elevation are rejected. Existing users must enter their current password; old admin-precreated identities without a password require account recovery.
- Owner/admin checks protect invitation tokens and billing portal access. Viewer mutations are blocked; operators can update progress but cannot edit scheduling assignments or traveler instructions. Paid AI quote generation requires owner/admin/manager role.
- Record IDs and bearer-token formats are checked before database queries. Customer, machine, job, and template ownership is verified, with database triggers providing additional tenant checks.
- QR requests are limited to the token's job and active entitlement. Required dimensions and authenticated sign-off are enforced. Viewers no longer receive QR write tokens from authenticated APIs.
- Browser roles lose direct access to Billet tables, so the API's tenant, role, and trial checks cannot be bypassed. Wavlon's service-role access is preserved; its unrelated tables and functions are unchanged. Billet metrics views become service-role-only.
- Shared authentication configuration fixes refresh/logout after navigation. Concurrent refresh failures terminate cleanly and retries are bounded. Login return URLs must stay on this app.
- Admin secrets travel in headers. Cron fails closed without a configured secret. Webhooks enforce timestamp freshness, tolerate multiple v1 signatures, bound payload size, and apply events atomically with deduplication and stale-event protection.
- A traveler dimension label is escaped before HTML rendering. Authentication/API responses are not cached and referrer policy limits token leakage. SQL, tests, and handoff documents are excluded from deployment.

## Verification

Run from the repository root:

```text
npm ci --prefix tests
npm test --prefix tests
```

The suite includes 20 API/auth security tests and isolated PostgreSQL migration checks. It never connects to production. PGlite is pinned under `tests/`; it is not a production dependency. The migration test uses a reduced database fixture plus the existing phase-one/4b/six migrations. Its random-byte fixture is test-only; production continues using pgcrypto.

GitHub Actions runs the same suite for pushes and pull requests. Browser visual checks and a complete live Stripe lifecycle test remain separate release checks.

## Coordinated release

1. Review `supabase/migrations/20260930193827_billet_security_hardening.sql` and confirm a current Supabase backup. The migration changes only named Billet tables/functions and the five Billet metric views. It does not delete customer data or change project-wide default grants.
2. Apply that exact migration to `emdgtyaggcbqaxsdrsaa` before deploying the API change. The old APIs use the service role and remain compatible with the narrowed browser grants. New invitation and webhook APIs require the new database functions.
3. Deploy the tested security branch to Vercel. Production changes when the branch is merged/pushed to `main`.
4. Verify demo login, data reads, an isolated invitation, viewer restrictions, operator progress, and Wavlon metric reads. Use Stripe test mode for webhook/portal checks. Confirm `CRON_SECRET` exists before expecting lifecycle emails.
5. Run Supabase security advisors again. The five service-only metric views intentionally use owner privileges for the trusted metrics consumer; unrelated Wavlon advisory findings require separate review.

Do not roll back by reopening browser writes. Keep database hardening in place while fixing or reverting an application deployment.

## Remaining actions and scope

- Remove credentials from the local Git remote and rotate the previously embedded GitHub token. Removing the URL credential does not revoke the token or erase earlier copies.
- Supabase reported leaked-password protection disabled. Enabling it is a project-wide Auth setting affecting both applications; review it separately with the shared-project owner.
- This release does not complete general product work: subscription plan-change/recovery design, accurate labor-time accounting, full historical migrations, marketing cleanup, and module selection remain outstanding.
- Existing users already holding copied QR tokens retain those bearer capabilities until the corresponding tokens are rotated. Rotating all job tokens would invalidate printed QR codes and needs a planned rollout.
- Database invitation transactions preserve the current single-shop-per-login model; adding multi-shop support requires an explicit account selector and scoped session context.

Database guidance: [Supabase roles and privileges](https://supabase.com/docs/guides/database/postgres/roles), [privileged database functions](https://supabase.com/docs/guides/database/functions), [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
