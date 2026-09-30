-- Additive pilot tables only. Existing Billet and Wavlon records are unchanged.
BEGIN;
CREATE TABLE IF NOT EXISTS public.billet_laser_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 100), rates jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS public.billet_laser_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
  created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
  sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'), source jsonb NOT NULL,
  UNIQUE(account_id,sha256), UNIQUE(account_id,id)
);
CREATE TABLE IF NOT EXISTS public.billet_laser_quotes (
  id uuid PRIMARY KEY, account_id uuid NOT NULL REFERENCES public.accounts(id),
  family_id uuid NOT NULL, revision integer NOT NULL CHECK(revision > 0), previous_id uuid,
  import_id uuid NOT NULL, created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(), issued_at timestamptz, accepted_at timestamptz,
  customer text NOT NULL, reference text NOT NULL DEFAULT '', terms text NOT NULL DEFAULT '',
  valid_days integer NOT NULL DEFAULT 30 CHECK(valid_days BETWEEN 1 AND 365),
  status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','issued','accepted')),
  source jsonb NOT NULL, result jsonb NOT NULL,
  UNIQUE(account_id,id), UNIQUE(account_id,family_id,revision),
  FOREIGN KEY(account_id,import_id) REFERENCES public.billet_laser_imports(account_id,id),
  FOREIGN KEY(account_id,previous_id) REFERENCES public.billet_laser_quotes(account_id,id)
);
CREATE INDEX IF NOT EXISTS billet_laser_quotes_recent ON public.billet_laser_quotes(account_id,created_at DESC);
ALTER TABLE public.billet_laser_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billet_laser_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billet_laser_quotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billet_laser_profiles,public.billet_laser_imports,public.billet_laser_quotes FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.billet_laser_profiles TO service_role;
GRANT SELECT,INSERT ON public.billet_laser_imports TO service_role;
GRANT SELECT,INSERT,UPDATE ON public.billet_laser_quotes TO service_role;

CREATE OR REPLACE FUNCTION public.billet_laser_save(p_account uuid,p_user uuid,p_id uuid,p_import uuid,p_previous uuid,p_details jsonb,p_result jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE imported public.billet_laser_imports%ROWTYPE; prior public.billet_laser_quotes%ROWTYPE;
  saved public.billet_laser_quotes%ROWTYPE; family uuid:=p_id; rev integer:=1;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,17));
  SELECT * INTO saved FROM public.billet_laser_quotes WHERE id=p_id AND account_id=p_account;
  IF FOUND THEN RETURN to_jsonb(saved); END IF;
  IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager')) THEN
    RETURN jsonb_build_object('error','Quoting role required.'); END IF;
  SELECT * INTO imported FROM public.billet_laser_imports WHERE id=p_import AND account_id=p_account;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Import not found.'); END IF;
  IF p_result->>'complete' IS DISTINCT FROM 'true' OR (p_result->>'price')::numeric < 0 OR p_result->>'price' IS NULL THEN
    RETURN jsonb_build_object('error','A complete calculation is required.'); END IF;
  IF p_previous IS NOT NULL THEN
    SELECT * INTO prior FROM public.billet_laser_quotes WHERE id=p_previous AND account_id=p_account;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','Previous revision not found.'); END IF;
    IF prior.status='accepted' OR EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=p_account AND family_id=prior.family_id AND revision>prior.revision) THEN
      RETURN jsonb_build_object('error','Open the latest unaccepted revision before revising.'); END IF;
    family:=prior.family_id; rev:=prior.revision+1;
  END IF;
  INSERT INTO public.billet_laser_quotes(id,account_id,family_id,revision,previous_id,import_id,created_by,customer,reference,terms,valid_days,source,result)
    VALUES(p_id,p_account,family,rev,p_previous,p_import,p_user,p_details->>'customer',p_details->>'reference',p_details->>'terms',(p_details->>'valid_days')::integer,imported.source,p_result)
    RETURNING * INTO saved;
  RETURN to_jsonb(saved);
END $$;
CREATE OR REPLACE FUNCTION public.billet_laser_status(p_account uuid,p_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.billet_laser_quotes%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,17));
  SELECT * INTO q FROM public.billet_laser_quotes WHERE id=p_id AND account_id=p_account FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Quote not found.'); END IF;
  IF EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=p_account AND family_id=q.family_id AND revision>q.revision) THEN
    RETURN jsonb_build_object('error','Only the latest revision can be issued or accepted.'); END IF;
  IF NOT ((q.status='draft' AND p_status='issued') OR (q.status='issued' AND p_status='accepted')) THEN
    RETURN jsonb_build_object('error','Invalid quote status transition.'); END IF;
  UPDATE public.billet_laser_quotes SET status=p_status,issued_at=CASE WHEN p_status='issued' THEN now() ELSE issued_at END,
    accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END WHERE id=p_id RETURNING * INTO q;
  RETURN to_jsonb(q);
END $$;
CREATE OR REPLACE FUNCTION public.billet_laser_immutable_quote()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF (to_jsonb(NEW)-ARRAY['status','issued_at','accepted_at']) IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['status','issued_at','accepted_at']) THEN
    RAISE EXCEPTION 'Quote snapshots are immutable; create a new revision'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS billet_laser_quote_snapshot ON public.billet_laser_quotes;
CREATE TRIGGER billet_laser_quote_snapshot BEFORE UPDATE ON public.billet_laser_quotes FOR EACH ROW EXECUTE FUNCTION public.billet_laser_immutable_quote();
REVOKE ALL ON FUNCTION public.billet_laser_save(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb),public.billet_laser_status(uuid,uuid,text),public.billet_laser_immutable_quote() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billet_laser_save(uuid,uuid,uuid,uuid,uuid,jsonb,jsonb),public.billet_laser_status(uuid,uuid,text),public.billet_laser_immutable_quote() TO service_role;
COMMIT;
