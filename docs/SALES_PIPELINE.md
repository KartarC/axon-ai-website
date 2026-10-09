# Internal sales pipeline

Open Sales pipeline in the staff CRM. Add a manual opportunity or prepare one from the website enquiry inbox. Enquiries remain visible independently; a unique source link prevents duplicate conversion, including concurrent requests. Support/privacy enquiries should be reviewed before conversion.

Stages: Lead, Qualified, Demo, Trial, Active, Paid, Lost. Qualified through Active require an owner, next action and due date. Trial/Active/Paid require a linked company account. Lost requires a reason. Paid is a manual sales label, not verified revenue. Estimated values are USD monthly estimates, not Stripe prices. Stage edits never grant modules, extend trials, invite users or charge a card. Staff check actual trial/usage signals through Customer follow-ups and manage access separately.

Opportunities have optimistic version checks and stage history attributed to the signed-in staff email. Link the correct company before adding onboarding. The onboarding action adds four existing CRM task records and initializes company onboarding only if absent. Repeated actions do not duplicate the template tasks or overwrite their dates/status. Once tasks exist, the opportunity's linked company cannot change. Onboarding tasks use the selected start date plus 0/2/7/14 days; they are pilot review prompts, not automatic trial-expiry reminders. Edit tasks under Tasks & planning.

The sales table and history are RLS-enabled, service-only and accessed behind the existing verified staff guard. No new public endpoint or automatic outbound email was added. Lists show latest 1,000 opportunities and 500 website enquiries. Search/owner filters and overdue/unassigned totals apply to the loaded records.
