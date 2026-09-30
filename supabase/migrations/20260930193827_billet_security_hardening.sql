-- Billet-only hardening. Preserve all tables/data and service_role permissions.
-- The browser calls Vercel APIs; it does not need direct PostgREST table access.
-- Do not change global default privileges: this project also hosts Wavlon.
BEGIN;

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['accounts','account_users','account_invites','axon_admins',
    'machines','customers','jobs','board_entries','job_quotes','job_cost_entries',
    'traveler_templates','traveler_template_steps','traveler_steps','website_leads']
  LOOP
    IF to_regclass('public.' || table_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL PRIVILEGES ON TABLE public.%I FROM PUBLIC, anon, authenticated', table_name);
      EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', table_name);
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
    END IF;
  END LOOP;
END $$;

-- Billet metric views are consumed by Wavlon's service-key client. Ordinary
-- Supabase users must not obtain cross-shop metrics through owner-rights views.
DO $$
DECLARE view_name text;
BEGIN
  FOREACH view_name IN ARRAY ARRAY['v_axon_mrr','v_axon_account_health','v_axon_job_health','v_axon_module_adoption','v_axon_churn_signals'] LOOP
    IF to_regclass('company.' || view_name) IS NOT NULL THEN
      EXECUTE format('REVOKE ALL ON company.%I FROM PUBLIC,anon,authenticated',view_name);
      EXECUTE format('GRANT SELECT ON company.%I TO service_role',view_name);
    END IF;
  END LOOP;
END $$;

ALTER FUNCTION public.my_account_id() SET search_path = '';
ALTER FUNCTION public.my_role() SET search_path = '';
ALTER FUNCTION public.is_axon_admin() SET search_path = '';
ALTER FUNCTION public.set_updated_at() SET search_path = '';
REVOKE ALL ON FUNCTION public.my_account_id(),public.my_role(),public.is_axon_admin() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.my_account_id(),public.my_role(),public.is_axon_admin() TO service_role;

-- Service-role-only, security-invoker RPC: membership and consumption succeed together.
CREATE OR REPLACE FUNCTION public.billet_accept_invite(p_token text, p_user_id uuid, p_email text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE invitation public.account_invites%ROWTYPE;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));
  SELECT * INTO invitation FROM public.account_invites WHERE token = p_token FOR UPDATE;
  IF NOT FOUND OR invitation.accepted_at IS NOT NULL OR invitation.expires_at <= now() THEN
    RETURN jsonb_build_object('ok',false,'error','Invite is invalid, expired, or already used');
  END IF;
  IF lower(invitation.email) IS DISTINCT FROM lower(p_email) THEN
    RETURN jsonb_build_object('ok',false,'error','Invitation identity does not match');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id=invitation.account_id AND status='active') THEN
    RETURN jsonb_build_object('ok',false,'error','Shop is not active');
  END IF;
  -- The current UI has no account switcher. Reject ambiguous memberships explicitly.
  IF EXISTS (SELECT 1 FROM public.account_users WHERE user_id=p_user_id AND account_id<>invitation.account_id) THEN
    RETURN jsonb_build_object('ok',false,'error','This login already belongs to another shop. Contact support to move it.');
  END IF;
  INSERT INTO public.account_users(account_id,user_id,role,full_name)
    VALUES(invitation.account_id,p_user_id,invitation.role,split_part(p_email,'@',1))
    ON CONFLICT (account_id,user_id) DO NOTHING;
  -- Re-inviting an existing member must never silently elevate their role.
  UPDATE public.account_invites SET accepted_at=now() WHERE id=invitation.id;
  RETURN jsonb_build_object('ok',true,'account_id',invitation.account_id);
END $$;
REVOKE ALL ON FUNCTION public.billet_accept_invite(text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billet_accept_invite(text,uuid,text) TO service_role;

-- Defense in depth for references written with the service key. Avoid adding duplicate
-- foreign keys, which would make existing PostgREST embeds ambiguous.
CREATE OR REPLACE FUNCTION public.billet_check_tenant_links()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE row_data jsonb := to_jsonb(NEW); parent_account uuid; parent_job uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.account_id IS DISTINCT FROM OLD.account_id THEN
    RAISE EXCEPTION 'Account ownership cannot be changed' USING ERRCODE='23514';
  END IF;
  IF row_data->>'job_id' IS NOT NULL THEN
    SELECT account_id INTO parent_account FROM public.jobs WHERE id=(row_data->>'job_id')::uuid;
    IF parent_account IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Job does not belong to account' USING ERRCODE='23514';
    END IF;
  END IF;
  IF row_data->>'customer_id' IS NOT NULL THEN
    SELECT account_id INTO parent_account FROM public.customers WHERE id=(row_data->>'customer_id')::uuid;
    IF parent_account IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Customer does not belong to account' USING ERRCODE='23514';
    END IF;
  END IF;
  IF row_data->>'machine_id' IS NOT NULL THEN
    SELECT account_id INTO parent_account FROM public.machines WHERE id=(row_data->>'machine_id')::uuid;
    IF parent_account IS DISTINCT FROM NEW.account_id THEN
      RAISE EXCEPTION 'Machine does not belong to account' USING ERRCODE='23514';
    END IF;
  END IF;
  IF row_data->>'board_entry_id' IS NOT NULL THEN
    SELECT account_id,job_id INTO parent_account,parent_job FROM public.board_entries WHERE id=(row_data->>'board_entry_id')::uuid;
    IF parent_account IS DISTINCT FROM NEW.account_id OR parent_job IS DISTINCT FROM (row_data->>'job_id')::uuid THEN
      RAISE EXCEPTION 'Board entry does not belong to job' USING ERRCODE='23514';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.billet_check_tenant_links() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billet_check_tenant_links() TO service_role;
DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['jobs','board_entries','job_quotes','job_cost_entries','traveler_steps'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS billet_tenant_links ON public.%I',table_name);
    EXECUTE format('CREATE TRIGGER billet_tenant_links BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.billet_check_tenant_links()',table_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS public.billet_billing_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  event_created bigint NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.billet_billing_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.billet_billing_events FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.billet_billing_events TO service_role;
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS stripe_event_created bigint NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.billet_process_billing_event(p_event jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE obj jsonb := p_event#>'{data,object}'; acc public.accounts%ROWTYPE;
  event_time bigint := (p_event->>'created')::bigint; chosen_plan text; module_limit int;
  all_modules text[] := ARRAY['production-board','job-costing','shop-traveler','customer-portal','maintenance','materials','coc','crm','outside-service'];
  chosen_modules text[];
BEGIN
  INSERT INTO public.billet_billing_events(event_id,event_type,event_created)
    VALUES(p_event->>'id',p_event->>'type',event_time) ON CONFLICT DO NOTHING;
  IF NOT FOUND THEN RETURN jsonb_build_object('duplicate',true); END IF;

  IF p_event->>'type'='checkout.session.completed' THEN
    IF obj->>'mode' IS DISTINCT FROM 'subscription' OR coalesce(obj->>'payment_status','') NOT IN ('paid','no_payment_required')
      OR obj->>'subscription' IS NULL OR obj->>'customer' IS NULL THEN
      RETURN jsonb_build_object('ignored',true);
    END IF;
    chosen_plan := obj#>>'{metadata,plan}';
    module_limit := CASE chosen_plan WHEN 'starter' THEN 1 WHEN 'growth' THEN 3 WHEN 'suite' THEN 9 ELSE 0 END;
    IF module_limit=0 THEN RETURN jsonb_build_object('ignored',true); END IF;
    SELECT * INTO acc FROM public.accounts WHERE id=(obj#>>'{metadata,account_id}')::uuid FOR UPDATE;
    IF NOT FOUND OR event_time < acc.stripe_event_created OR acc.status='suspended' THEN
      RETURN jsonb_build_object('ignored',true);
    END IF;
    IF acc.stripe_customer_id IS NOT NULL AND acc.stripe_customer_id<>obj->>'customer' THEN
      RAISE EXCEPTION 'Billing customer mismatch';
    END IF;
    SELECT array_agg(m ORDER BY first_position) INTO chosen_modules FROM (
      SELECT m,min(ord) AS first_position FROM unnest(ARRAY['production-board'] || coalesce(acc.modules,'{}') || all_modules) WITH ORDINALITY AS x(m,ord)
      WHERE m=ANY(all_modules) GROUP BY m ORDER BY min(ord) LIMIT module_limit
    ) selected;
    UPDATE public.accounts SET plan=chosen_plan,modules=chosen_modules,status='active',
      stripe_customer_id=obj->>'customer',stripe_subscription_id=obj->>'subscription',
      trial_ends_at=NULL,stripe_event_created=event_time WHERE id=acc.id;
  ELSIF p_event->>'type'='customer.subscription.deleted' THEN
    SELECT * INTO acc FROM public.accounts
      WHERE stripe_subscription_id=obj->>'id'
         OR (stripe_subscription_id IS NULL AND id=(obj#>>'{metadata,account_id}')::uuid)
      FOR UPDATE;
    IF FOUND AND event_time >= acc.stripe_event_created THEN
      UPDATE public.accounts SET status='suspended',stripe_event_created=event_time WHERE id=acc.id;
    END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.billet_process_billing_event(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.billet_process_billing_event(jsonb) TO service_role;
COMMIT;
