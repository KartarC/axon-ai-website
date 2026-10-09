# Bug reports, customer activity and website analytics

Shipped October 9, 2026.

- App sidebar > Report a bug: any signed-in company member, including an expired trial, can submit and view their own reports. Titles, reproduction details and categorized page paths are saved. Report conversations now support optional user-selected screenshots and public replies; no automatic screenshots are collected. See WORKFLOW_SUPPORT_RELEASE.md.
- Internal CRM > Bug reports: latest 500, searchable by company/title/status. Staff can set new/investigating/resolved/closed and private notes. No automatic customer emails are sent.
- Internal CRM > Customer activity: up to 2,000 company memberships with authoritative Supabase last sign-in and latest heartbeat. Recently active means the last heartbeat was within five minutes. Visible app pages send once per minute only while interaction was within two minutes. This is approximate presence, not a live connection indicator; use Refresh to update the snapshot.
- Internal CRM > Website analytics: 30-day page views, tab visits, converted visits, signup CTA clicks, form starts/completions, popular pages, broad sources and daily UTC totals. Anonymous people are not identified as customer accounts. Paid/email attribution uses allowlisted utm_medium categories only.
- Optional public analytics require consent. GPC and DNT disable collection. Authentication/reset/invitation pages are excluded except the signup page. No full query strings, form values or raw IP addresses enter the analytics event table. A minute-specific HMAC of client IP enforces a rate limit; daily cleanup deletes expired limits.
- A visit uses sessionStorage, expires after 30 minutes idle and is not a unique-person count. Form completions are server-recorded after successful signup membership or demo-lead creation. Bots, declined consent and blockers affect coverage. Email-only contact links are not counted as completed enquiries.
- Analytics failure never fails a customer submission. The daily billing cron removes events older than 30 days; no historical visit data is backfilled.
- `data-use.html` explains the new data handling. Keep this synchronized with any broader privacy policy as the business's legal documentation is finalized.

Security: new tables use RLS and deny direct anon/authenticated access. Customer identities come only from validated sessions. Reporting RPCs are service-role-only, staff routes require the existing internal staff authorization. All report text renders as escaped text; private staff notes are excluded from customer reads.

Tests: engagement.test.cjs validates authorization, tenant scoping, event field allowlists, conversion integrity, database permissions, deduplication and rate limits. engagement-browser.cjs exercises consent, form starts, safe rendering, report submission, CRM triage and mobile layout. Existing regression tests must remain green.
