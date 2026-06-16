-- ============================================================
-- Billet — Phase 1 Database Migration
-- Run this in the Supabase SQL Editor (project emdgtyaggcbqaxsdrsaa)
-- ============================================================

-- ── EXTENSIONS ──────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ACCOUNTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  plan        text NOT NULL DEFAULT 'starter'
              CHECK (plan IN ('starter','growth','suite')),
  modules     text[] NOT NULL DEFAULT '{}',
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','suspended','cancelled')),
  timezone    text NOT NULL DEFAULT 'America/Toronto',
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ── ACCOUNT USERS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text NOT NULL DEFAULT 'viewer'
              CHECK (role IN ('owner','admin','manager','operator','viewer')),
  full_name   text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_account_users_account ON public.account_users(account_id);
CREATE INDEX IF NOT EXISTS idx_account_users_user    ON public.account_users(user_id);

-- ── ACCOUNT INVITES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.account_invites (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  email       text NOT NULL,
  role        text NOT NULL DEFAULT 'owner'
              CHECK (role IN ('owner','admin','manager','operator','viewer')),
  token       text UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by  uuid REFERENCES auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invites_token ON public.account_invites(token);

-- ── AXON ADMINS (internal team) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.axon_admins (
  user_id     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ── MACHINES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.machines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name        text NOT NULL,
  machine_no  text,
  type        text DEFAULT 'mill'
              CHECK (type IN ('mill','lathe','grind','edm','waterjet','laser','press','weld','inspect','other')),
  status      text NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','offline','maintenance')),
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_machines_account ON public.machines(account_id);

-- ── CUSTOMERS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.customers (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  name         text NOT NULL,
  contact_name text,
  email        text,
  phone        text,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customers_account ON public.customers(account_id);

-- ── JOBS (core shared object) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id    uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  customer_id   uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  job_number    text NOT NULL,
  part_name     text NOT NULL,
  revision      text,
  quantity      int NOT NULL DEFAULT 1,
  material      text,
  due_date      date,
  priority      text NOT NULL DEFAULT 'normal'
                CHECK (priority IN ('low','normal','high','rush')),
  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','in_progress','on_hold','complete','shipped','cancelled')),
  notes         text,
  public_token  text UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (account_id, job_number)
);
CREATE INDEX IF NOT EXISTS idx_jobs_account ON public.jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_token   ON public.jobs(public_token);
CREATE INDEX IF NOT EXISTS idx_jobs_status  ON public.jobs(account_id, status);

-- ── BOARD ENTRIES (Production Board module) ──────────────────
CREATE TABLE IF NOT EXISTS public.board_entries (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  machine_id   uuid REFERENCES public.machines(id) ON DELETE SET NULL,
  operation    text NOT NULL DEFAULT 'Machining',
  op_sequence  int NOT NULL DEFAULT 1,
  status       text NOT NULL DEFAULT 'queue'
               CHECK (status IN ('queue','setup','running','paused','complete')),
  board_col    text NOT NULL DEFAULT 'queue'
               CHECK (board_col IN ('queue','setup','running','complete')),
  sort_order   int NOT NULL DEFAULT 0,
  est_hours    numeric(6,2),
  actual_hours numeric(6,2),
  started_at   timestamptz,
  completed_at timestamptz,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_board_account ON public.board_entries(account_id);
CREATE INDEX IF NOT EXISTS idx_board_job     ON public.board_entries(job_id);
CREATE INDEX IF NOT EXISTS idx_board_machine ON public.board_entries(machine_id);

-- ── HELPER FUNCTIONS ─────────────────────────────────────────

-- Returns the account_id for the currently authenticated user
CREATE OR REPLACE FUNCTION public.my_account_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT account_id FROM public.account_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns the role for the currently authenticated user
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.account_users
  WHERE user_id = auth.uid()
  LIMIT 1;
$$;

-- Returns true if the current user is an Billet admin
CREATE OR REPLACE FUNCTION public.is_axon_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (SELECT 1 FROM public.axon_admins WHERE user_id = auth.uid());
$$;

-- Auto-update updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_jobs_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE TRIGGER trg_board_entries_updated_at
  BEFORE UPDATE ON public.board_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── ROW LEVEL SECURITY ───────────────────────────────────────

ALTER TABLE public.accounts        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_users   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.axon_admins     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machines        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.board_entries   ENABLE ROW LEVEL SECURITY;

-- ACCOUNTS
CREATE POLICY "accounts_select" ON public.accounts
  FOR SELECT USING (id = public.my_account_id() OR public.is_axon_admin());

CREATE POLICY "accounts_update" ON public.accounts
  FOR UPDATE USING (id = public.my_account_id() AND public.my_role() IN ('owner','admin'));

-- ACCOUNT USERS
CREATE POLICY "account_users_select" ON public.account_users
  FOR SELECT USING (account_id = public.my_account_id() OR public.is_axon_admin());

CREATE POLICY "account_users_manage" ON public.account_users
  FOR ALL USING (
    (account_id = public.my_account_id() AND public.my_role() IN ('owner','admin'))
    OR public.is_axon_admin()
  );

-- ACCOUNT INVITES (service role only — bypass RLS in API)
CREATE POLICY "invites_admin_only" ON public.account_invites
  FOR ALL USING (public.is_axon_admin());

-- AXON ADMINS (read-only to authenticated)
CREATE POLICY "axon_admins_select" ON public.axon_admins
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- MACHINES
CREATE POLICY "machines_select" ON public.machines
  FOR SELECT USING (account_id = public.my_account_id());

CREATE POLICY "machines_write" ON public.machines
  FOR ALL USING (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

-- CUSTOMERS
CREATE POLICY "customers_select" ON public.customers
  FOR SELECT USING (account_id = public.my_account_id());

CREATE POLICY "customers_write" ON public.customers
  FOR ALL USING (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

-- JOBS
CREATE POLICY "jobs_select" ON public.jobs
  FOR SELECT USING (account_id = public.my_account_id());

CREATE POLICY "jobs_insert" ON public.jobs
  FOR INSERT WITH CHECK (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

CREATE POLICY "jobs_update" ON public.jobs
  FOR UPDATE USING (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

CREATE POLICY "jobs_delete" ON public.jobs
  FOR DELETE USING (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin')
  );

-- BOARD ENTRIES
CREATE POLICY "board_select" ON public.board_entries
  FOR SELECT USING (account_id = public.my_account_id());

CREATE POLICY "board_insert" ON public.board_entries
  FOR INSERT WITH CHECK (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

CREATE POLICY "board_update" ON public.board_entries
  FOR UPDATE USING (account_id = public.my_account_id());

CREATE POLICY "board_delete" ON public.board_entries
  FOR DELETE USING (
    account_id = public.my_account_id()
    AND public.my_role() IN ('owner','admin','manager')
  );

-- ── SERVICE ROLE GRANTS ──────────────────────────────────────
-- Allow service_role to bypass RLS (for API routes using service key)
GRANT ALL ON public.accounts        TO service_role;
GRANT ALL ON public.account_users   TO service_role;
GRANT ALL ON public.account_invites TO service_role;
GRANT ALL ON public.axon_admins     TO service_role;
GRANT ALL ON public.machines        TO service_role;
GRANT ALL ON public.customers       TO service_role;
GRANT ALL ON public.jobs            TO service_role;
GRANT ALL ON public.board_entries   TO service_role;

-- ── DONE ─────────────────────────────────────────────────────
-- After running this migration:
-- 1. Insert yourself as axon_admin:
--    INSERT INTO public.axon_admins (user_id)
--    VALUES ((SELECT id FROM auth.users WHERE email = 'your@email.com'));
-- 2. Add RESEND_API_KEY to Vercel env vars
-- 3. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are in Vercel env vars
