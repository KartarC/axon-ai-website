# Ovrendi user guide

Updated October 2026. This guide describes the current software; quoting is a staff-operated pilot.

## Your first quotation

### Before you begin

Use an owner, admin or manager login with Quoting access. Have a single-run Han’s LaserNest quotation workbook (up to 2 MB), sheet pricing, machine costs, gas rates and electricity costs ready. The supplied export is supported; other layouts may need review.

### Set your identity

Open Quoting → Company & user profiles. Save your company name and address, then your name and title. Company details are shared; only owners and admins edit them. Your user profile does not change your login email.

### Import and inspect

Choose the Han’s quotation file. Check material, thickness, sheet dimensions, requested versus nested quantities and processing times. Read every warning. The reference and blank sheet price may be filled from the report; confirm the highlighted values and currency.

### Enter your costs

Enter a customer name, validity and currency. Choose Shop cost estimate for your own costs. Load appropriate profiles or enter material, machine, setup, gas and electricity settings. Do not count gas, electricity or labor twice in a combined machine rate.

### Review and save

Select Calculate quote. Resolve the Still needed list and warnings. Confirm that you reviewed the source and rates, then select Save revision. Unsaved form changes are not stored automatically.

### Create the customer document

After saving, select Download one-page PDF or Customer print / PDF. Mark issued records the quote status; it does not email the customer. Record acceptance is available after issuing. Job creation from a quotation is not yet part of the pilot.

## Machine, gas and electricity profiles

### Who can save standards

Owners and admins can save shared profiles. Managers can prepare quotes using available settings. Profiles are your shop’s assumptions, not manufacturer-certified standards.

### Machine settings

Use the operating cost per hour and separate setup or labor time where applicable. Processing time comes from the imported report. Electrical input is different from the laser’s optical output rating.

### Bottle or bottle-pack gas

Enter the pack price, bottles per pack, supplier-stated standard cubic metres per bottle and usable percentage. Use gas volume, not cylinder water capacity. Enter cutting and piercing flow in standard litres per minute using the same standard-volume convention.

### Other gas choices

You may use a price per standard cubic metre or a manual job charge. Additional gas-on seconds use cutting flow. Travel does not automatically add gas. If included elsewhere or excluded, enter a clear reason.

### Electricity

Enter average electrical input in kW and price per kWh. The estimate uses processing plus setup time. Include auxiliary equipment once. Alternatively enter a manual charge, or state where electricity is already included.

### Save and reuse

Under Save reusable standards choose the profile type, optional customer and machine associations, and a meaningful name. Select Save new profile. To reuse it, choose Saved profile → Load profile. Review the applied fields. Saved quote revisions retain their original snapshots.

## Understand your quote calculation

### Material

Full-sheet cost uses the stock quantity and price per sheet. Weight-based pricing uses dimensions, thickness, density and price per kg. An entered remnant credit is deducted. Customer-supplied material is a separate option.

### Processing and utilities

Machine cost uses imported processing time and your hourly rate. Setup and additional labor use entered time and rates. Gas uses the applicable flow and time, and electricity uses electrical input × hours × price per kWh. Missing rates stay incomplete rather than silently becoming zero.

### Margin versus markup

Markup adds a percentage to the cost basis. Margin describes profit as a percentage of selling price. For example, a cost of 100 with 20% markup gives 120; a 20% margin gives 125. A minimum charge can raise the result. Taxes are excluded.

### Comparison mode

Han’s charge comparison uses the report’s configured charges instead of the normal material, machine and labor calculations. Check whether utility charges are already included before adding them. Currency is selected by you; the app does not convert exchange rates.

### What the customer sees

The customer PDF presents the quotation without your internal hourly rates and margin. Review the document, terms, quantities, currency and totals before sharing. Estimates depend on the source report and settings you enter.

## Saved revisions, status and PDFs

### Find a saved quote

Scroll to Saved quotations and select Refresh if necessary. The list shows the most recent 100 revisions. Open a quotation to inspect its saved source and settings.

### Revise without losing history

Editing a saved quote and saving again creates a new revision. Earlier prices and profile snapshots remain unchanged. Recalculate after changing settings and confirm your review before saving.

### Draft, issued and accepted

A new saved quotation is a draft. Mark issued records that revision as issued, but sends no email. Record acceptance records your confirmation of the customer’s acceptance. These actions do not create a production job.

### PDF checklist

Save the company and user identity before saving the quote revision. Download the one-page PDF. Check customer details, currency, quantities, validity and terms. Downloading a PDF does not deliver it to the customer.

## Account access and your team

### Join the right company

Open the private invitation link supplied by your administrator. Use the invited email address. Follow the acceptance page to create your password or authenticate an existing identity. Never share your password or invitation link publicly.

### Roles and modules

Module access is set per company. Owners and admins manage company settings; Quoting is available to owners, admins and managers. Operator and viewer access does not include the quoting editor. A missing module may indicate that it is not included in your company’s trial or plan.

### Request a change

Ask your company administrator or Ovrendi contact to correct your name, role or company access. Ovrendi’s internal CRM is restricted to approved Ovrendi staff. Removing access from one company does not delete the person’s global login.

### Password resets

An approved administrator can send a password-reset email to the email stored on your login. Follow the secure email link to choose your own password. If you did not request a reset, ignore it. Check junk mail and ask the administrator to inspect the delivery result if needed.

### Appearance and navigation

Use the sidebar to open enabled modules, Settings, Getting started and Education. Light and Dark switch appearance. On a phone, use the menu button; on desktop, collapse the sidebar to make more room.

## Troubleshooting your first quote

### The workbook will not import

Confirm that this is a supported single-run Han’s export, no larger than 2 MB. The supplied workbook format may use an .xls extension with XLSX content. Multiple reports, unsupported layouts and formula-dependent files may be rejected. Do not rename a different format to bypass validation.

### The estimate is incomplete

Read Still needed and use the question mark next to a field. Enter actual gas consumption and electrical input values, or choose a manual charge. When a cost is included elsewhere or excluded, provide a reason.

### Save revision is not working

Import a report, enter the required customer details, complete the calculation and select the review checkbox. Check the status message. Do not close the page until the revision appears in Saved quotations.

### The PDF has old details

Saved revisions keep a snapshot. Update the profile, open the quotation and save a new revision to capture current details. Review the new PDF before sharing.

### Access or trial message

Confirm you are in the correct company and have an allowed role and module. An expired trial can block operational actions. Ask your administrator to review access or billing; repeatedly signing in will not extend a trial.

## Production Board basics

### Check access

Production Board must be enabled for your company. It is not included in a Quoting-only trial. Available actions depend on your role.

### Create or find work

Open Production Board. Use New Job and enter the required job number and part name, then the quantity, priority and other available job details. Review before saving.

### Track progress

Use the board’s Queue, Setup, Running and Complete stages to follow active work. Refresh to retrieve current information. Operators can update progress; viewers cannot edit. Machine assignments and instructions require a suitable management role.

### Review the day

Use the total active, running, past-due and rush-job indicators to decide what needs attention. Confirm job details before moving work; a status change represents real production progress.

## Job Costing basics

### Check access

Job Costing is separately enabled for the company and is not part of a Quoting-only pilot. It compares quoted and actual job costs; the Han’s import workflow lives in Quoting.

### Find the job

Open Job Costing and choose All, At Risk, Over budget, On budget or No quote set. Select a job row for its detailed breakdown and cost entry.

### Review actual costs

Check labor, material and overhead entries against the quote before interpreting the margin. Enter accurate expenses with a permitted role. Refresh after updates to review the latest totals.

### Use AI deliberately

Suggest price with AI is optional and requires the on-screen consent. It sends job references and historical quote/cost totals to Anthropic; part names and notes are excluded. Review any estimate before use. If the provider is not configured, continue with manual costing.

## Shop Traveler basics

### Open the correct job

Shop Traveler must be enabled for your company. Locate the job and review its instructions before recording work. This module is not included in a Quoting-only trial.

### Prepare the steps

With a permitted management role, use Apply Template or Add Step. Enter a clear title, instructions and any required dimension label and unit. Manage Templates lets the team reuse standard sequences.

### Complete required checks

Follow the step instructions and record required dimensions and sign-offs. The software checks required fields before completion. Enter observed values; a completed step should reflect work actually performed.

### Record an issue

Use Flag Issue when work needs attention. Describe the problem and any action taken. Share the issue with the appropriate supervisor. A traveler record is not a certification of regulatory compliance.
