# Laser Quoting pilot

Separate module: `/app/modules/laser-quoting/`. Owner/admin/manager access. During the pilot, an account with `job-costing` or `laser-quoting` entitlement can use it; subscription pricing and existing module allocations are unchanged.

## Working scope

- Authenticated Han’s LaserNest import: single worksheet, single processing run, one report per quote. Recognizes XLSX content even when named `.xls`. Actual binary XLS is rejected with a re-export explanation.
- Report review with source totals, part quantities and discrepancy warnings. The provided sample yields 187 parts, 403 pierces, 2128.986 seconds and a 505.87 charge total. Currency must be confirmed. Rounded part mass disagrees with the source total and is flagged.
- Shop costing or Han’s charge comparison, full-sheet/per-kg/customer-owned material, remnant credit, machine/setup/labor costs, gas bottle packs/unit rates/manual charges, electricity load × time/manual charges, margin/markup and minimum selling charge.
- Named shop profiles saved by owner/admin; explicit missing-value handling and reasons for excluded/included expenses.
- Server-calculated immutable quote snapshots, revision history, latest-revision issuance and acceptance recording. Issuing does not send email.
- Customer print/PDF view with a batch total. Internal costing is excluded. Taxes are not calculated.

Gas uses customer-entered standard-volume data. Bottle water capacity is not a gas volume. Electricity uses average electrical input, not laser optical output. Profiles contain assumptions, including job-specific setup/labor quantities, and must be reviewed for each quote. No customer rates or machine consumption are prefilled as facts.

## Storage and access

The upload is parsed server-side, then discarded; immutable normalized source data and its SHA-256 hash are retained in `billet_laser_imports`. No original workbook or images are stored. `billet_laser_profiles` stores named settings. `billet_laser_quotes` stores complete source and rate/result snapshots with revisions.

The new tables and RPCs are service-role-only. All API actions check the authenticated account, entitlement and staff role. Browser-supplied totals are ignored and calculations use account-owned imported source records. Composite foreign keys protect import/revision ownership. The migration touches only newly named quoting objects; Wavlon is unchanged.

File limits: 2 MB compressed, bounded entry count and declared/streamed XML expansion, one worksheet, 500 parts. Formula cells, entity definitions and external workbook sheet relationships are rejected. Parser fixtures are synthetic; no customer workbook or drawings are committed.

## Run tests

From the repository root:

```text
npm ci
npm ci --prefix tests
npm test --prefix tests
npm exec --prefix tests -- playwright install chromium
npm run test:browser --prefix tests
```

The browser test starts a loopback-only server and an isolated PGlite database. It exercises the real API handler and migration, with test-only authentication. No production data or credentials are involved. `BILLET_BROWSER_EXECUTABLE` may point to an installed Chrome executable. Screenshots default to ignored `tests/.artifacts`; override with `BILLET_SCREENSHOTS`.

## Preview deployment

Apply `supabase/migrations/20260930201957_billet_laser_quoting.sql` to the intended test backend before testing persistence in Vercel. The app uses existing Supabase server environment variables. The SQL is additive and can be installed while the production app continues unchanged. Do not expose the service key to the browser.

Push the feature branch for a Vercel preview. Validate authentication, import, calculation, profile persistence and saved revisions before merging into production. Existing security checks and the new unit/database/browser tests run in GitHub Actions.

## Pilot test script

1. Sign in and open Laser Quoting. Upload the supplied report. Confirm the 187 parts and the weight warning.
2. For source reconciliation, choose Han’s charge comparison, CAD, markup 0, other costs 0, minimum 0. Explicitly mark gas/electricity included in the source comparison with a reason. Confirm 505.87. This comparison is not a claim that the source charge covers actual utilities.
3. Switch to shop costing. Enter your actual sheet price or material price/density, machine rate, gas-pack contents/price and gas flows, electricity tariff and input kW. Enter margin or markup. Check the full breakdown and estimated consumption.
4. Save a named profile. Confirm the import review checkbox and save a quote for a clearly labelled test customer.
5. Mark issued, inspect customer print/PDF, change a rate and save a second revision. Refresh and reopen both revisions: the first must retain its original price. Only the newest revision may be issued/accepted.
6. Remove a required gas or electricity rate: the total must become incomplete and saving must fail. A viewer/operator must not access quote data.

## Follow-up scope

Multi-sheet and repeated-run semantics need further real exports. Per-part selling-price allocation, tax handling, conversion of accepted quotes into production jobs, remnant inventory, file retention and direct Han’s API/SDK integration are not in this pilot. Accepted quotes are recorded but do not create jobs. The pilot has no public/customer upload form.

## Guided profiles and report autofill

Each field has an accessible, keyboard-operable help button and a required/optional label. Conditional setup/labor requirements update with time values. Optional adjustments default to zero; unknown gas and electrical consumption do not. The guide explains report review, profile loading, costing, saving and customer printing.

Import fills a blank reference from the report program and suggests a blank full-sheet price from the report material charge divided by sheet count. Suggestions are marked for review and never silently overwrite manual values. Other report inputs remain visible in the source summary. Imported charges are not asserted to be supplier costs.

Profiles have customer, machine, gas, electricity or complete-shop types. Type and optional customer/machine associations are stored in the existing rates JSON under _profile, so no schema change is needed. Parent IDs are checked for account ownership and profile type. Customer profiles load commercial defaults; machine profiles load machine cost, power and labor rates; gas profiles load gas settings; electricity profiles load the tariff/mode. Currency mismatch blocks loading a monetary profile instead of converting it. All saves remain staff/account scoped; only owners/admins create profiles. Saved quotes retain rate snapshots and selected customer/machine profile IDs and names, so later profile changes cannot rewrite historical prices.

The customer document includes a high-level explanation of material, processing, utility estimates and commercial terms. It omits hourly rates, component costs and margins.

The local browser fixture accepts an optional dataDir for a durable PGlite database. Its default remains isolated memory for tests. The persistence test creates a temporary directory, saves all four profile types and a quotation through the real API, closes the database, reopens it and verifies values and associations. This local test fixture uses synthetic authentication and must never be deployed or exposed beyond loopback. The active desktop pilot stores saved records under the Codex workspace work/laser-quoting-data directory. Press Save revision or Save new profile; unsaved form changes are not automatically stored. Local persistence is not cloud sync or a backup service.

## Built-in one-page PDF and identity profiles

Company and user contact profiles are edited in the module's Company & user profiles section. Company edits require owner/admin; user edits always target the authenticated staff member. These contact settings do not change login credentials. Profiles persist in reserved identity records in the existing account-scoped profile table; the standard profile endpoints exclude them and cannot overwrite them. User identities are fetched only for the authenticated user.

New quote revisions snapshot company and preparer details. PDF download authorizes the saved quote by account and renders an explicit customer-facing projection using bundled pdf-lib, without external services, a browser print dialog or desktop PDF software. Profile edits do not rewrite existing quote snapshots. Older quotes without identity snapshots require a new revision after saving both profiles.

The PDF has one A4 page. Up to eight short part names are listed with sizes and quantities; larger/long-name batches use an explicit complete-batch summary and report reference. Detailed part lists remain available in the saved quote and detailed print view. Excess text produces an actionable error instead of clipping terms. The current built-in font supports Latin/Western European text; unsupported characters produce an error rather than silent substitution. Tests cover PDF page count, private projection, access control, direct browser download, persistent identities and historical snapshot stability.
