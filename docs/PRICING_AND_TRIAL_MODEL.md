# Launch pricing and trial model

Approved October 8, 2026. All subscription prices are USD per company per month, with unlimited team users.

| Plan | New subscription price | Entitlements |
| --- | --- | --- |
| Starter | US$49 | Standalone Quoting pilot |
| Growth | US$99 | Production Board, Job Costing, Shop Traveler; Quoting pilot included through Job Costing |
| Suite | Contact us | Not sold online while additional modules are in development |

Existing subscriptions retain their agreed rates and module selection. The webhook distinguishes launch pricing using server-written subscription metadata `price_version=launch-2026-10`; legacy prices remain valid. Do not edit existing Stripe prices or add this marker to old subscriptions without an agreed migration.

## Customer journey
1. Existing self-serve signup remains a 14-day no-card trial. Changing signup to require a card has not been approved.
2. An owner/admin opens Plan & Billing, sees USD prices and the first charge date, accepts monthly automatic renewal, and completes Stripe Checkout with a card.
3. Stripe preserves the remaining trial through its original UTC end date. Trials with less than 48 hours remaining receive a short extension to satisfy Checkout requirements. Expired trials start payment immediately; an active paid customer cannot open another subscription through this flow.
4. Verified Stripe events sync the subscription and plan's module access. Active trial subscriptions retain their trial date for reminders. Successful conversion clears that date.
5. Daily lifecycle emails remind customers near the trial end. Subscribers are told billing will start unless canceled; accounts without a subscription are told to choose a plan and will not be charged. Failed delivery is retried on a later run.
6. Manage billing provides Stripe cancellation, card management and invoices. Plan changes currently require assistance; do not promise self-serve plan switching.

Edward's special Quoting trial ends January 7, 2027. It is not shortened by enrollment; the earliest configured charge is January 8 UTC. No subscription or card enrollment has been created for him by this change.

Checkout disables Adaptive Pricing and explicitly uses USD card payments. Canadian customers may incur their issuer's CAD conversion and fees. Tax registration and collection settings require review before real payments; this change does not configure tax registrations.

## Competitor research
Reviewed October 8, 2026 using vendor sources. Pricing is not a like-for-like feature comparison.
- [MRPeasy](https://www.mrpeasy.com/pricing/): Starter US$49/user/month; Professional US$69; Enterprise US$99. Five Starter users cost US$245/month. Broader manufacturing ERP scope than today's Ovrendi.
- [Odoo](https://www.odoo.com/pricing): advertised annual introductory Standard offer US$24.90/user/month in the fetched search result; regional, annual, introductory and renewal terms matter. Use its current calculator for a customer quote; do not advertise this as an unconditional monthly rate.
- [ProShop](https://get.proshoperp.com/): request a quote, based on total employees. Removed unsupported dollar estimates from Ovrendi's pricing comparison.
- [Paperless Parts](https://www.paperlessparts.com/pricing/): request pricing for manufacturing quoting.

US$49 provides a lower-risk single-workflow entry point. US$99 is attractive for teams because it is per company. This is a launch positioning decision, not evidence of profitability: track support time, import usage, storage and AI costs before expanding included services.

## Operations and verification
- Stripe remains in sandbox until live credentials and a live webhook are deliberately configured. A production website deployment does not imply live money collection.
- Vercel daily cron `/api/billing?action=cron` uses `CRON_SECRET`; never expose it in client code.
- Backend tests cover consent, USD, both prices, trial preservation, expired/paid trial rejection, Suite rejection and legacy webhook compatibility.
- Isolated PostgreSQL checks cover launch entitlements, trial date preservation, conversion and service-role-only execution.
- Browser checks cover billing consent, responsive pricing and contact-only Suite.
- Existing subscriptions and Edward's account are checked after deployment; no real charge is part of verification.
