# Ovrendi email activation — prepared, not activated

The responsive website and account screens can ship independently. No SMTP provider or verified sending domain has been supplied, and no live template, SMTP or project-wide authentication setting has been changed.

## Sender

Display name: Ovrendi
Sender address: info@ovrendi.com
Support: info@ovrendi.com

A sending service does not create an inbox. Ensure this address can receive support replies as well as send mail. Create a transactional SMTP account, verify ovrendi.com using the provider's DNS records (SPF/DKIM, then appropriate DMARC), and enter the SMTP host, port, username and password directly into Supabase's custom SMTP settings. Never commit credentials or paste them into chat. Disable provider click tracking on authentication messages, since it can interfere with one-time links.

## Project and shared-app impact

Current Supabase project: emdgtyaggcbqaxsdrsaa (wavlon-autonomous), shared with another app. Email templates, sender settings, rate limits and authentication options apply to the entire project. Review the other app's email flows before applying Ovrendi branding globally; a dedicated Ovrendi project is preferable for independently branded auth. Do not overwrite the shared project's Site URL or remove existing allowed redirects.

Add these exact URLs to the existing authentication redirect allowlist:
- https://axon-ai-website-three.vercel.app/app/confirm-email.html
- https://axon-ai-website-three.vercel.app/app/reset-password.html

The application sends these redirect URLs explicitly. Do not use wildcard production redirects. If the public domain changes, update these URLs, the Vercel SITE_URL setting, and support links in the notification templates.

## Templates

The versioned HTML in supabase/email-templates uses Supabase's standard ConfirmationURL and Token variables. Keep the placeholders intact. auth-email-settings.json contains the corresponding Management API template keys; it contains no secrets and does not include SMTP credentials or site configuration.

- confirmation.html: branded welcome plus email verification.
- recovery.html: one-time password reset.
- email_change.html: confirm an email-address change.
- reauthentication.html: verification code.
- password_changed_notification.html and email_changed_notification.html: security notices; enable their notification toggles.
- invite.html and magic_link.html: prepared for native Supabase invitation/passwordless flows if adopted later.

Existing Ovrendi team invitations use custom account_invites links, not Supabase's native invite endpoint. Updating the native invitation template does not activate custom team invitation email delivery. The existing Resend integration for team invitations, trial reminders and other transactional messages remains a separate setup task. Do not turn on unused auth methods merely to use a template.

## Activation sequence

1. Confirm the shared-project branding decision, verify the sender domain, and configure custom SMTP in Supabase.
2. Add the two allowed redirect URLs, paste the approved templates, and enable password/email-change security notifications.
3. Keep the app's email/signup activation flag OFF until a controlled recovery email reaches an owned test inbox and the full reset flow works. Test spam placement, mobile email rendering, expiry and reuse. Do not reset the public demo account to test.
4. Set OVRENDI_AUTH_EMAILS_ENABLED=true in Vercel Production, then redeploy. This makes NEW Ovrendi signup identities unconfirmed and sends the Supabase confirmation email after workspace creation. It does not alter existing users.
5. Create an owned test signup. Confirm that it receives the welcome/verification email, cannot log in before verification, can resend if delivery fails, and can sign in after verification. Complete onboarding, then verify password reset and the password-change notification.
6. Check provider/Supabase rate limits, CAPTCHA/abuse protection, deliverability and logs before unrestricted public signup. Never log passwords, reset tokens or raw authentication responses.

The existing development signup behavior is retained while the flag is absent, to avoid blocking users on unconfigured email delivery. It still auto-confirms new users and is not a substitute for completing launch security work.

## Password recovery behavior

Forgot-password requests go directly to Supabase using its public anon key and built-in rate limits. The screen gives a generic eligibility message instead of revealing whether an account exists. Recovery credentials are read from the URL fragment, immediately removed from browser history, held only in memory, and validated by Supabase. Password changes use the user's recovery bearer token, never an admin password-update endpoint. Missing/invalid links and mismatched passwords fail safely. A successful reset clears this browser's Ovrendi session and requests sign-out before returning the user to login.

## Validation in this release

Automated tests cover confirmation gating, no login tokens before confirmation, email delivery failure, signup input validation, and HTML escaping in welcome email content. Browser checks cover phone/iPad/desktop layouts and mocked recovery/confirmation flows. No live email deliverability claim is made until sender setup and owned-inbox testing are complete.

Official references:
- https://supabase.com/docs/guides/auth/auth-smtp
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/redirect-urls
