BEGIN;
ALTER TABLE public.billet_laser_quotes DROP CONSTRAINT billet_laser_quotes_status_check;
ALTER TABLE public.billet_laser_quotes ADD CONSTRAINT billet_laser_quotes_status_check CHECK(status IN ('draft','issued','accepted','declined','expired'));
CREATE OR REPLACE FUNCTION public.billet_laser_status(p_account uuid,p_id uuid,p_status text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.billet_laser_quotes%ROWTYPE;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,17));
 SELECT * INTO q FROM public.billet_laser_quotes WHERE id=p_id AND account_id=p_account FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Quote not found.'); END IF;
 IF EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=p_account AND family_id=q.family_id AND revision>q.revision) THEN RETURN jsonb_build_object('error','Open the latest revision to change its status.'); END IF;
 IF NOT ((q.status='draft' AND p_status='issued') OR (q.status='issued' AND p_status IN ('accepted','declined','expired'))) THEN RETURN jsonb_build_object('error','Invalid quote status transition.'); END IF;
 IF p_status='accepted' AND now()>=q.issued_at+make_interval(days=>q.valid_days) THEN RETURN jsonb_build_object('error','This quote has expired. Create and issue a new revision before recording acceptance.'); END IF;
 IF p_status='expired' AND now()<q.issued_at+make_interval(days=>q.valid_days) THEN RETURN jsonb_build_object('error','This quote has not expired yet.'); END IF;
 UPDATE public.billet_laser_quotes SET status=p_status,issued_at=CASE WHEN p_status='issued' THEN now() ELSE issued_at END,accepted_at=CASE WHEN p_status='accepted' THEN now() ELSE accepted_at END WHERE id=p_id RETURNING * INTO q;
 RETURN to_jsonb(q);
END $$;
CREATE TABLE public.ovrendi_quote_drafts (
 account_id uuid NOT NULL REFERENCES public.accounts(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 payload jsonb, version integer NOT NULL DEFAULT 0, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(account_id,user_id),
 CHECK(payload IS NULL OR octet_length(payload::text)<=50000)
);
CREATE OR REPLACE FUNCTION public.ovrendi_save_draft(p_account uuid,p_user uuid,p_version integer,p_payload jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d public.ovrendi_quote_drafts%ROWTYPE;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text||p_user::text,21));
 SELECT * INTO d FROM public.ovrendi_quote_drafts WHERE account_id=p_account AND user_id=p_user FOR UPDATE;
 IF coalesce(d.version,0)<>p_version THEN RETURN jsonb_build_object('error','Draft changed in another tab. Reload and restore the latest draft before editing.'); END IF;
 INSERT INTO public.ovrendi_quote_drafts(account_id,user_id,payload,version) VALUES(p_account,p_user,p_payload,p_version+1)
 ON CONFLICT(account_id,user_id) DO UPDATE SET payload=EXCLUDED.payload,version=EXCLUDED.version,updated_at=now() RETURNING * INTO d;
 RETURN to_jsonb(d);
END $$;
CREATE TABLE public.ovrendi_support_messages (
 id uuid PRIMARY KEY, report_id uuid NOT NULL REFERENCES public.ovrendi_bug_reports(id) ON DELETE CASCADE,
 sender text NOT NULL CHECK(sender IN ('customer','staff')), author_id uuid NOT NULL REFERENCES auth.users(id),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 6000), screenshot text,
 has_screenshot boolean GENERATED ALWAYS AS (screenshot IS NOT NULL) STORED,
 created_at timestamptz NOT NULL DEFAULT now(), notified_at timestamptz,
 CHECK(screenshot IS NULL OR length(screenshot)<=550000)
);
CREATE INDEX ON public.ovrendi_support_messages(report_id,created_at);
CREATE INDEX ON public.ovrendi_support_messages(author_id,created_at);
ALTER TABLE public.ovrendi_quote_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_support_messages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_quote_drafts,public.ovrendi_support_messages FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ovrendi_quote_drafts,public.ovrendi_support_messages TO service_role;
REVOKE ALL ON FUNCTION public.ovrendi_save_draft(uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_save_draft(uuid,uuid,integer,jsonb) TO service_role;
COMMIT;
