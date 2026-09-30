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
