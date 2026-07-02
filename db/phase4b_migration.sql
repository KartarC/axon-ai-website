-- ============================================================
-- Billet — Phase 4B: self-serve trial signup
-- Adds trial tracking + onboarding flag to accounts.
-- Idempotent. Applied live via Supabase MCP on 2026-07.
-- ============================================================

ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS trial_ends_at date;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS onboarded boolean NOT NULL DEFAULT false;

-- Existing accounts predate onboarding — mark them done so they skip the wizard.
UPDATE public.accounts SET onboarded = true WHERE onboarded = false;
