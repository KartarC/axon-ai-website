# Guided quotations and customer approvals

The Quoting workspace now includes Import, Review report, Price, Preview, and Issue & share navigation with readiness hints. New and restored working drafts require source review. Saved revisions can be previewed with customer-facing fields before issuing.

After issuing, create a private link, copy it and share it yourself. No email is sent automatically. Links use 256-bit random tokens in the URL fragment, sent to the API only in a POST body. Only SHA-256 hashes are stored. The customer page loads no analytics, external fonts or third-party scripts. Referrer policy is no-referrer.

Anyone holding a link can view and submit its first response. Name and email are self-declared, not verified identity or a certified signature. A confirmation records authority and review of the quote terms. Acceptance takes no payment. Customers can accept, decline or request changes, with an optional purchase order and message (required for changes). Responses are immutable through the public API; identical request retries are idempotent. A change request closes that link's response form but leaves the quote issued; staff can revise or replace the link. Staff see responses under Customer approval and refresh explicitly.

Links expire at the earlier of quote validity and 30 days. Replacing/revoking disables previous links. A newer revision makes previous links unavailable. Acceptance, new revisions and revocation use the existing account advisory lock, preventing stale acceptance races. Staff access requires tenant, module and quoting-role authorization. New table and RPCs are service-only with RLS enabled and browser roles revoked. Public output allowlists final price, quantities, terms and company identity; internal rates, source charges, margins and supplier costs are excluded.

No customers are automatically emailed and no existing quotes are modified by deployment. Test using synthetic data, including expired/revoked/superseded links and another company. Subscription payments are separate from customer quotation approvals.
