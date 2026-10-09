# Website enquiries and policy release

October 9, 2026. Public contact and transactional Reply-To: hello@getovrendi.com. Existing verified notification/auth From domains are retained so deliverability and untracked authentication links keep working. Customer-entered quoting/profile email addresses are not replaced.

Contact page submits to /api/submit-contact; records go to ovrendi_website_enquiries, visible to authorized staff under Website enquiries. New → In progress → Resolved/Closed, private notes and a reply-by-email link. No automatic email is sent by the contact form and no phone support is offered. Existing demo requests remain in website_leads; this release does not silently copy old leads or expose them publicly.

Security: validated length/type/topic/email, required privacy acknowledgement, honeypot, exact browser origin allowlist, HMAC-based 5-attempt/hour IP bucket, request UUID duplicate protection. Restricted table with RLS, service-only permissions and existing staff session guard for reads/updates. Query IDs never authorize access. Raw IP is not stored in the enquiry table. Contact conversions are recorded after a successful insert only and require analytics permission.

Cookie page describes local/session storage as well as cookies, persistent preference, 30-minute visit timeout and 30-day server event cleanup. Allow/Decline remain equally accessible. Footer opens preferences. GPC/DNT override Allow. No bundled marketing consent on contact form.

Terms remain a noindex draft: operator name/address and final contractual clauses are unconfirmed. Privacy disclosure is expanded to include enquiry CRM, private staff notes, written-only support and browser storage. Do not assert the documents are legally finalized. Source guidance: https://www.priv.gc.ca/en/privacy-topics/privacy-for-businesses/appropriate-handling-of-personal-information/collecting-personal-information-and-consent/consent/gl_omc_201805/

Colourful static footer works without JavaScript across public pages, with company, product, education, contact and policy links. Cookie preferences falls back to the cookie page if JavaScript is disabled.
