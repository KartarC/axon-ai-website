
BEGIN;
CREATE TABLE public.ovrendi_quote_links (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL,
 quote_id uuid NOT NULL, token_hash text NOT NULL UNIQUE CHECK(token_hash ~ '^[a-f0-9]{64}$'),
 created_by uuid NOT NULL REFERENCES auth.users(id), created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL, revoked_at timestamptz,
 response text CHECK(response IN ('accepted','declined','changes_requested')),
 responder_name text CHECK(length(responder_name)<=160), responder_email text CHECK(length(responder_email)<=254),
 purchase_order text CHECK(length(purchase_order)<=160), message text CHECK(length(message)<=2000),
 responded_at timestamptz, request_id uuid,
 FOREIGN KEY(account_id,quote_id) REFERENCES public.billet_laser_quotes(account_id,id)
);
CREATE INDEX ON public.ovrendi_quote_links(account_id,quote_id,created_at DESC);
ALTER TABLE public.ovrendi_quote_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_quote_links FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ovrendi_quote_links TO service_role;

CREATE FUNCTION public.ovrendi_manage_quote_link(p_account uuid,p_user uuid,p_quote uuid,p_action text,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.billet_laser_quotes%ROWTYPE; l public.ovrendi_quote_links%ROWTYPE;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,17));
 IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager')) THEN RETURN jsonb_build_object('error','Quoting role required.'); END IF;
 SELECT * INTO q FROM public.billet_laser_quotes WHERE id=p_quote AND account_id=p_account;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Quote not found.'); END IF;
 IF p_action='revoke' THEN
  UPDATE public.ovrendi_quote_links SET revoked_at=now() WHERE account_id=p_account AND quote_id=p_quote AND revoked_at IS NULL;
  RETURN jsonb_build_object('ok',true);
 ELSIF p_action='list' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)-'token_hash'-'request_id' ORDER BY x.created_at DESC) FROM public.ovrendi_quote_links x WHERE account_id=p_account AND quote_id=p_quote),'[]'::jsonb);
 ELSIF p_action<>'create' THEN RETURN jsonb_build_object('error','Unsupported link action.'); END IF;
 IF q.status<>'issued' OR q.issued_at IS NULL OR now()>=q.issued_at+make_interval(days=>q.valid_days) OR EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=p_account AND family_id=q.family_id AND revision>q.revision) THEN RETURN jsonb_build_object('error','Issue the latest unexpired revision before creating a link.'); END IF;
 IF (SELECT count(*) FROM public.ovrendi_quote_links WHERE quote_id=p_quote)>=30 THEN RETURN jsonb_build_object('error','Link limit reached. Create a new quote revision.'); END IF;
 UPDATE public.ovrendi_quote_links SET revoked_at=now() WHERE account_id=p_account AND quote_id=p_quote AND revoked_at IS NULL;
 INSERT INTO public.ovrendi_quote_links(account_id,quote_id,token_hash,created_by,expires_at) VALUES(p_account,p_quote,p_hash,p_user,least(q.issued_at+make_interval(days=>q.valid_days),now()+interval '30 days')) RETURNING * INTO l;
 RETURN to_jsonb(l)-'token_hash';
END $$;

CREATE FUNCTION public.ovrendi_public_quote(p_hash text,p_action text,p_response jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE l public.ovrendi_quote_links%ROWTYPE; q public.billet_laser_quotes%ROWTYPE;
BEGIN
 SELECT * INTO l FROM public.ovrendi_quote_links WHERE token_hash=p_hash;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','This link is unavailable. Ask the sender for a current quotation.'); END IF;
 -- Same lock as save/status/manage, so accepting cannot race a revision or revocation.
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(l.account_id::text,17));
 SELECT * INTO l FROM public.ovrendi_quote_links WHERE token_hash=p_hash FOR UPDATE;
 SELECT * INTO q FROM public.billet_laser_quotes WHERE id=l.quote_id AND account_id=l.account_id;
 IF l.revoked_at IS NOT NULL OR now()>=l.expires_at OR q.status IN ('draft','expired') OR now()>=q.issued_at+make_interval(days=>q.valid_days) OR EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=q.account_id AND family_id=q.family_id AND revision>q.revision) THEN RETURN jsonb_build_object('error','This link is unavailable. Ask the sender for a current quotation.'); END IF;
 IF p_action='respond' THEN
  IF l.response IS NOT NULL THEN
   IF l.request_id::text IS DISTINCT FROM p_response->>'request_id' OR l.response IS DISTINCT FROM p_response->>'decision' THEN RETURN jsonb_build_object('error','A response was already recorded. Contact the sender to change it.'); END IF;
  ELSE
   IF q.status<>'issued' THEN RETURN jsonb_build_object('error','This quotation is no longer awaiting a response.'); END IF;
   IF p_response->>'decision' IS NULL OR p_response->>'decision' NOT IN ('accepted','declined','changes_requested') OR coalesce(p_response->>'confirmed','false')<>'true' OR length(trim(coalesce(p_response->>'name','')))=0 OR length(trim(coalesce(p_response->>'email','')))=0 OR p_response->>'request_id' IS NULL THEN RETURN jsonb_build_object('error','Complete the response and confirmation.'); END IF;
   UPDATE public.ovrendi_quote_links SET response=p_response->>'decision',responder_name=p_response->>'name',responder_email=p_response->>'email',purchase_order=p_response->>'purchase_order',message=p_response->>'message',responded_at=now(),request_id=(p_response->>'request_id')::uuid WHERE id=l.id RETURNING * INTO l;
   IF l.response IN ('accepted','declined') THEN
    UPDATE public.billet_laser_quotes SET status=l.response,accepted_at=CASE WHEN l.response='accepted' THEN now() ELSE accepted_at END WHERE id=q.id RETURNING * INTO q;
   END IF;
  END IF;
 ELSIF p_action<>'read' THEN RETURN jsonb_build_object('error','Unsupported response action.'); END IF;
 -- Server-only return; the HTTP boundary projects an explicit customer-safe allowlist.
 RETURN jsonb_build_object('quote',to_jsonb(q),'response',l.response,'responded_at',l.responded_at,'expires_at',l.expires_at);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_manage_quote_link(uuid,uuid,uuid,text,text),public.ovrendi_public_quote(text,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_manage_quote_link(uuid,uuid,uuid,text,text),public.ovrendi_public_quote(text,text,jsonb) TO service_role;
COMMIT;
