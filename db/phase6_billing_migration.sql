-- ============================================================
-- Billet — Phase 6: Stripe billing + email lifecycle
-- Idempotent. Applied live via Supabase MCP on 2026-07.
-- ============================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS stripe_customer_id text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS trial_reminder_sent boolean NOT NULL DEFAULT false;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS trial_expired_email_sent boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_accounts_stripe_sub ON public.accounts(stripe_subscription_id);
