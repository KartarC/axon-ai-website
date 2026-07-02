-- ============================================================
-- Billet — Phase 4B: self-serve trial signup
-- Adds trial tracking + onboarding flag to accounts.
-- Idempotent. Applied live via Supabase MCP on 2026-07.
-- ============================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS trial_ends_at date;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

-- Allow 'trial' as a plan value (self-serve signups start here).
ALTER TABLE public.accounts DROP CONSTRAINT IF EXISTS accounts_plan_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_plan_check
  CHECK (plan = ANY (ARRAY['trial'::text,'starter'::text,'growth'::text,'suite'::text]));

-- Existing accounts predate onboarding — mark them done so they skip the wizard.
UPDATE public.accounts SET onboarded = true WHERE onboarded = false;
