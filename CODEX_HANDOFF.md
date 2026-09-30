# BILLET — Full Project Handoff & Analysis Report

**For:** Codex (or any agent/developer taking over)
**Prepared:** 2026-09-30
**Owner:** Kartar Chalotra (GitHub: KartarC, email kartar.c@risetekmachinery.com)
**Status at handoff:** marketing site fully redesigned + product live through Phase 6 (billing). Head commit `8907dcb` on `main`, working tree clean, deployed.

---

## 1. What Billet is

**Billet** (formerly "Axon AI" — renamed because Axon AI is a registered trademark of Axon Enterprise) is flat-rate, modular shop-management SaaS for **small commercial CNC machine shops and metal fabrication shops**.

- **Brand:** Billet · **Legal entity (planned):** Billet Technologies Inc. / YC application name "Billet AI"
- **Domain (chosen, NOT yet purchased):** `billet.app`. Currently live at the Vercel default URL.
- **Positioning:** the wedge against ProShop ERP (PE-backed incumbent for regulated aerospace/defense). Billet deliberately does NOT compete on AS9100/CUI/FedRAMP compliance. It wins on: flat pricing (unlimited users), self-serve signup in minutes (no implementation project), and fab-shop coverage. Never add compliance claims or "AI that learns your shop" marketing — that's ProShop's lane (their AI "Chip" ships it already).
- **Honesty discipline (important):** all testimonials, invented stats, and claims for unbuilt features were deliberately REMOVED from the marketing site (YC-diligence risk). Do not re-add metrics, testimonials, or feature claims that aren't real. tools.html tags 3 modules **LIVE** and 6 **IN DEVELOPMENT** on purpose.

### Product modules (9)
| # | Module | Status | App page |
|---|--------|--------|----------|
| M-01 | Production Board (drag queue/setup/running/complete, QR operator flow, auto labor logging) | **LIVE** | `app/modules/` board |
| M-02 | Job Costing + AI Quoting (quoted vs actual, 80% amber / over red, owner email alert, AI quote suggestions, quote PDF) | **LIVE** | costing |
| M-03 | Digital Shop Traveler (templates, dimension capture, sign-offs, flags, audit trail) | **LIVE** | traveler |
| M-04–M-09 | Customer Portal, PM Tracker, Material Inventory, CoC Generator, Shop CRM, Outside Services | **NOT BUILT** (tiles exist but pages don't) | — |

Pricing: Starter $99 (1 module) / Growth $199 (3) / Suite $349 (all 9), flat, unlimited users. 14-day free trial, all modules, no card.

---

## 2. Locations — everything you need

### Code (this repo)
- **Local path:** `C:\Users\Karta\OneDrive\Desktop\_Projects\axon-ai-website\`
- **GitHub:** `https://github.com/KartarC/axon-ai-website` (private, owner KartarC). Repo name deliberately NOT renamed to billet — cosmetic only.
- **Deploy:** **Vercel** (Kartar's account, **Pro plan**), project auto-deploys on every push to `main`. Live at `https://axon-ai-website-three.vercel.app`. `vercel.json` holds routes + the daily billing cron.
- ⚠️ The local git remote embeds a GitHub PAT in the URL. Treat the checkout as containing a live credential; rotate if leaked.

### Backend
- **Supabase project:** `emdgtyaggcbqaxsdrsaa` (ca-central-1) — **shared** with the separate `wavlon-autonomous` repo (its AI "C-suite" reads Billet metrics via views in its `db/migrations/002_axon_ai_metrics_views.sql`). Don't drop Billet tables without checking that dependency.
- Auth = Supabase Auth (email/password, auto-confirm for signups). Data = Postgres via PostgREST, RLS on, multi-tenant by `account_id`.
- All server code = **Vercel serverless functions in `api/`** using plain `fetch` (NO SDKs — no stripe, no @supabase/supabase-js, no anthropic SDK).

### Related repos / projects
- `wavlon-autonomous` (metrics consumer, see above)
- Design-system sources: Kartar's forks `github.com/KartarC/hallmark` (the main system — "anti-AI-slop" rules), `KartarC/taste-skill`, `KartarC/astryx` (React-only, unused). Clones may exist in the Claude session scratchpad; re-clone if needed.
- Business/corporate docs (not code): `C:\Users\Karta\OneDrive\Desktop\_Projects\Business\` — see §8.

### Demo account (seeded)
- Login: `demo@axon.ai` / `Demo1234!` at `/app/login.html`
- Seed: `db/demo_seed.sql` (idempotent) — jobs J-005..J-014 incl. an over-budget flagged job, at-risk jobs, completed margin history, full board, 2 travelers.

---

## 3. Repository map

```
axon-ai-website/
├── index.html            ← homepage, FULL Workbench rebuild (self-contained, no styles.css)
├── pricing.html          ← FULL Workbench rebuild (self-contained)
├── tools.html            ← FULL Workbench rebuild (module catalog M-01..M-09, LIVE/IN-DEV tags)
├── compare-proshop.html  ← honest ProShop comparison (legacy styles + billet-theme.css)
├── website-design.html   ← website-design service page (legacy + theme layer)
├── packages/             ← service packages (legacy + theme layer)
├── admin.html            ← lead dashboard (password via ADMIN_SECRET)
├── styles.css            ← LEGACY stylesheet (only for non-rebuilt pages)
├── billet-theme.css      ← override layer loaded AFTER styles.css on legacy pages (retokens blue→amber/bronze, Archivo/Plex Mono)
├── app.js                ← marketing-site JS (nav, forms; null-guarded)
├── favicon.svg, assets/  ← logo v2: graphite squircle "B" + amber chamfer corner; assets/screens/ = 5 REAL app screenshots (2880×1800)
├── robots.txt, sitemap.xml
├── vercel.json           ← rewrites + cron: 0 13 * * * → /api/billing?action=cron
├── app/                  ← the PRODUCT (vanilla HTML/JS pages)
│   ├── signup.html/.js       ← self-serve trial signup (see §5)
│   ├── onboarding.html/.js   ← wizard: machines (mill+fab presets), sample jobs
│   ├── login.html/.js, dashboard.html/.js
│   ├── settings.html/.js     ← Shop/Machines/Team/Customers tabs, role-gated
│   ├── billing.html/.js      ← plan cards + Stripe portal; 402 target
│   ├── quote-doc.html        ← print-to-PDF branded quote
│   ├── accept-invite.html/.js, operator/ (QR flow), jobs/, modules/, axon-admin/, _shared/
├── api/                  ← 13 Vercel serverless functions (Pro plan; limit lifted)
│   ├── _lib/supabase.js  ← sb() PostgREST helper (Prefer: return=representation on POST/PUT/PATCH), requireAuth (402 trial gate; {allowExpired:true} opt-out), requireAxonAdmin
│   ├── _lib/email.js     ← Resend REST; graceful no-op without key; FROM fallback "Billet <onboarding@resend.dev>"
│   ├── auth.js           ← ?action=signup | complete-onboarding (ACCOUNT CREATION — §5)
│   ├── billing.js        ← ?action=checkout | portal | webhook | cron (Stripe REST — §6)
│   ├── board.js, costing.js, traveler.js, jobs.js, machines.js, customers/, operator.js
│   ├── quote-suggest.js  ← Anthropic REST (model default claude-sonnet-4-6), grounded in shop's own comparable jobs
│   ├── settings.js, leads.js, submit-demo.js, axon-admin.js
└── db/                   ← migrations run manually in Supabase SQL editor
    ├── phase1_migration.sql, phase4b_migration.sql (trial cols + plan CHECK), phase6_billing_migration.sql (Stripe cols), demo_seed.sql
```

**Naming quirk (deliberate):** internal identifiers still say "axon" — `axon-admin` route, `axon_admins` table, `is_axon_admin()`, `requireAxonAdmin`, sessionStorage keys `axon_access_token` etc., and the repo name. Only user-visible copy was rebranded to Billet. Do not "fix" these casually; it's a coordinated migration.

---

## 4. Design system (do not break this)

Three pages (`index`, `pricing`, `tools`) are **self-contained** on the "machined amber-on-graphite" system derived from KartarC/hallmark:

- **Tokens (OKLCH):** paper `oklch(97.5% .004 85)`, ink `oklch(27% .03 258)`, accent amber `oklch(75% .155 70)`, deep bronze `oklch(58% .14 60)`; brand hexes graphite `#1F2937` + amber `#F59E0B`.
- **Type:** Archivo 800/900 display · Inter body · IBM Plex Mono for spec labels ("Fig. 01 — …", "M-01 · LIVE", plan labels).
- **Macrostructure:** Workbench — real screenshots ARE the content; N9 edge-aligned nav (inline SVG "B" mark); Ft4 mono colophon footer; engineering-drawing voice throughout.
- **Hard rules learned this project:**
  - `.fig-frame img { width:100%; height:auto }` — never fixed heights (caused skew bug).
  - Sections inside `.wrap` use `padding-block`, NEVER `padding: X 0` shorthand (it kills the inline gutter → content touches screen edge at 375px).
  - `html,body{overflow-x:clip}`, grids use `minmax(0,1fr)`, tap targets ≥44px, no horizontal scroll at 375px, h1 left inset = 16px on mobile.
  - Bright amber only on solid fills/underlines, never body text (contrast). Bronze `--accent-deep`/`#7E5205` family for text-safe accent.
  - **No invented numbers, testimonials, or unbuilt-feature claims. Ever.**
- Remaining legacy pages get the look via `billet-theme.css` override layer — cheaper than rebuilds, fine to leave.

**Verification rig** (how the site was tested; Vercel has no CI): headless `puppeteer-core` + local Chrome at `C:/Program Files/Google/Chrome/Application/chrome.exe`, against a local static server on port 5503 (Claude desktop launch config "billet"; any static server over the repo root works). Standard checks per page: desktop screenshot, images loaded at natural ratio, mobile 375px → no hscroll + 16px h1 inset, zero console errors.

---

## 5. Account creation ("the account location") — exact flow

This is the wedge feature: **self-serve trial signup, minutes not months.**

1. Marketing CTAs → `/app/signup.html` (public).
2. `app/signup.js` POSTs to **`/api/auth.js?action=signup`** which:
   - creates the Supabase **auth user** (service-role, **auto-confirmed** — no email verification step),
   - creates an **`accounts`** row: `plan='trial'`, `trial_ends_at = now()+14 days`, **all 9 modules** in `modules[]`, `onboarded=false`,
   - creates the owner **`members`** row (role owner) linking user→account,
   - auto-logs the user in (returns session) and sends the welcome email (Resend, no-op if key missing).
3. → `/app/onboarding.html` wizard: shop name, add machines (mill + fab presets, `hourly_rate`), optionally load sample jobs → `?action=complete-onboarding` sets `onboarded=true` → dashboard.
4. Trial countdown banner in the app nav. At expiry, `requireAuth` in `api/_lib/supabase.js` returns **402** for expired-trial accounts; frontends route 402 → `/app/billing.html`. Endpoints billing/session pass `{allowExpired:true}` so the user can still pay.
5. DB constraint: `accounts_plan_check` allows `trial|starter|growth|suite` (`db/phase4b_migration.sql` — a signup 500'd before this was widened; watch for it if rebuilding the DB).

Multi-tenancy: every domain table carries `account_id`; RLS + the `sb()` helper scope all queries. Team growth via invite links (`settings` → `accept-invite.html`), deliberately no email dependency.

---

## 6. Billing, email, cron (Phase 6)

- **Stripe via raw REST** in `api/billing.js`: Checkout Sessions with **inline `price_data`** (no dashboard products needed), Billing Portal, webhook with **HMAC signature verification on the raw body** (`export const config={api:{bodyParser:false}}` — do not remove). Webhook events: `checkout.session.completed` (set plan, trim `modules[]` to plan limit {starter:1, growth:3, suite:9}, store Stripe IDs) and `customer.subscription.deleted` (suspend).
- **Cron:** Vercel cron `0 13 * * *` → `/api/billing?action=cron` (guarded by `CRON_SECRET`): trial reminder + expiry emails; "email sent" flags only burn when Resend actually accepts.
- **Email:** `api/_lib/email.js` (Resend REST). Welcome, trial lifecycle, over-budget alert (fired by `costing.js` on the quoted-cost crossing transition).
- **Known REST gotcha (already fixed, don't regress):** PostgREST one-to-one embeds (e.g. `job_quotes` on jobs) return an **object**, not an array — code handles both (`Array.isArray(x)?x[0]:x`). And `sb()` must send `Prefer: return=representation` on PATCH.

### Environment variables (Vercel) — set vs missing
| Var | Status | Purpose |
|---|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | ✅ set | all data access |
| `ADMIN_SECRET` | ✅ set | admin.html lead dashboard |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | ❌ **missing — blocks revenue.** Create webhook endpoint `<site>/api/billing?action=webhook` with the two events above | billing |
| `RESEND_API_KEY` | ❌ missing (emails silently no-op) | lifecycle emails |
| `CRON_SECRET` | ❌ missing | cron auth |
| `ANTHROPIC_API_KEY` (opt. `ANTHROPIC_MODEL`) | ❌ missing (button shows "not configured") | AI Quote Suggestor |
| `SITE_URL` | ❌ missing | absolute links in emails/Stripe redirects |

Values live in Kartar's Vercel/Stripe/Resend/Anthropic dashboards — never commit them.

---

## 7. Deployment & ops

- Push to `main` ⇒ Vercel auto-deploys. No CI, no tests — the puppeteer rig (§4) is the QA gate; run it before pushing UI changes.
- DB migrations: run `db/*.sql` by hand in the Supabase SQL editor (ordered phase1 → 4b → 6). `demo_seed.sql` is idempotent.
- Supabase is on the free tier ⇒ **project auto-pauses when idle** ("failed to fetch" from the app usually means paused project — wake it in the dashboard). Upgrade pending.
- Vercel Pro ⇒ serverless function count is no longer a hard limit (currently 13), but the codebase convention is action-multiplexed files (`?action=`) — keep consolidating rather than adding files.

## 8. Non-code assets & reports (context for the takeover)

Under `C:\Users\Karta\OneDrive\Desktop\_Projects\Business\`:
- `CORPORATE_STRUCTURE.md` (+PDF) — master playbook: Billet AI Inc. (to be incorporated, CBCA, held personally) as operating AI/services co; Infinara Ventures Corp. (CBCA #1724888-1) as holdco/venture studio; invoice-instead-of-salary model.
- `Infinara/s85-rollover/` — 6-document s.85(1) rollover package (MV 25% → Infinara), all DRAFT-for-CPA.
- `Billet AI/incorporation/` + `Billet AI/service-agreements/` — incorporation package + 3 MSAs (Rise Tek, CNC Pro, Machinists Vault). **Business-side only — never blend these entities' billing into the SaaS product's revenue.**
- All the above also exist as PDFs alongside the .md files.

Strategy reference: `compare-proshop.html` encodes the competitive stance; the pricing page's `PRICING_LOG.md` tracks price decisions.

## 9. Backlog (priority order at handoff)

1. **Set the missing env vars** (§6) — Stripe first; it's the revenue switch. Then buy `billet.app` + point the Vercel domain; upgrade Supabase; verify a Resend domain and change the FROM.
2. Hide the 6 unbuilt module tiles on the app dashboard (marketing already honest; app isn't yet).
3. AI quote-suggest button on the Job Detail page (currently only in the costing "Set Quote" modal).
4. Build M-04..M-09 (suggested order: Outside Services → Materials → CoC — each feeds Job Costing).
5. Demo video; fab-shop nesting/WS2 features; eventual axon→billet internal identifier migration (coordinated: DB + routes + storage keys + repo rename).

---

*Prepared by Claude (Anthropic) as a handoff. Verify anything time-sensitive (env-var status, Supabase pause state, Stripe setup) against the live dashboards before acting.*
