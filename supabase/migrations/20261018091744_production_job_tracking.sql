BEGIN;
CREATE TABLE public.ovrendi_job_tracking (
 job_id uuid PRIMARY KEY REFERENCES public.jobs(id) ON DELETE CASCADE,
 account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 quote_id uuid, quote_family uuid, snapshot jsonb NOT NULL DEFAULT '{}',
 stage text NOT NULL DEFAULT 'planned' CHECK(stage IN ('planned','cutting','secondary','inspection','ready','completed','on_hold','cancelled')),
 machine_id uuid REFERENCES public.machines(id) ON DELETE SET NULL,
 instructions text NOT NULL DEFAULT '' CHECK(length(instructions)<=10000),
 actual_hours numeric CHECK(actual_hours BETWEEN 0 AND 1000000),
 material_used numeric CHECK(material_used BETWEEN 0 AND 1000000),
 material_unit text NOT NULL DEFAULT 'sheets' CHECK(material_unit IN ('sheets','kg','pieces')),
 material_cost numeric CHECK(material_cost BETWEEN 0 AND 100000000),
 labor_cost numeric CHECK(labor_cost BETWEEN 0 AND 100000000),
 version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(account_id,quote_family),
 FOREIGN KEY(account_id,quote_id) REFERENCES public.billet_laser_quotes(account_id,id)
);
CREATE INDEX ON public.ovrendi_job_tracking(account_id,stage);
CREATE TABLE public.ovrendi_job_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
 job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,user_id uuid NOT NULL REFERENCES auth.users(id),
 stage text NOT NULL,note text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ovrendi_job_events(account_id,job_id,created_at DESC);
ALTER TABLE public.ovrendi_job_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_job_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_job_tracking,public.ovrendi_job_events FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ovrendi_job_tracking,public.ovrendi_job_events TO service_role;
CREATE FUNCTION public.ovrendi_quote_to_job(p_account uuid,p_user uuid,p_quote uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE q public.billet_laser_quotes%ROWTYPE; j public.jobs%ROWTYPE; t public.ovrendi_job_tracking%ROWTYPE; n integer; cust uuid;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_account::text,17));
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules) AND ('laser-quoting'=ANY(modules) OR 'job-costing'=ANY(modules))) OR NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager')) THEN RETURN jsonb_build_object('error','Quoting and production access required'); END IF;
 SELECT * INTO q FROM public.billet_laser_quotes WHERE account_id=p_account AND id=p_quote;
 IF NOT FOUND OR q.status<>'accepted' THEN RETURN jsonb_build_object('error','Accept the quotation before creating a job'); END IF;
 SELECT * INTO t FROM public.ovrendi_job_tracking WHERE account_id=p_account AND quote_family=q.family_id;
 IF FOUND THEN RETURN jsonb_build_object('job_id',t.job_id,'existing',true); END IF;
 IF EXISTS(SELECT 1 FROM public.billet_laser_quotes WHERE account_id=p_account AND family_id=q.family_id AND revision>q.revision) THEN RETURN jsonb_build_object('error','Use the latest accepted revision'); END IF;
 SELECT sum((x->>'nested')::numeric)::integer INTO n FROM jsonb_array_elements(q.source->'parts') x;
 IF n IS NULL OR n<1 THEN RETURN jsonb_build_object('error','The accepted quote has no production quantities'); END IF;
 -- Match only an unambiguous existing customer. Keep the quoted name in the snapshot regardless.
 SELECT min(id::text)::uuid INTO cust FROM public.customers WHERE account_id=p_account AND lower(name)=lower(q.customer) HAVING count(*)=1;
 INSERT INTO public.jobs(account_id,job_number,part_name,quantity,customer_id,material,revision,created_by,notes)
 VALUES(p_account,'JQ-'||upper(left(replace(q.family_id::text,'-',''),12)),coalesce(nullif(q.reference,''),'Laser cutting batch'),n,cust,q.source->>'material',q.revision::text,p_user,'Created from accepted quotation LQ-'||upper(left(q.family_id::text,8))) RETURNING * INTO j;
 INSERT INTO public.ovrendi_job_tracking(job_id,account_id,quote_id,quote_family,snapshot)
 VALUES(j.id,p_account,q.id,q.family_id,jsonb_build_object('customer',q.customer,'reference',q.reference,'revision',q.revision,'source',q.source,'price',q.result->'price','currency',q.result->'currency','estimated_cost',q.result->'basis','accepted_at',q.accepted_at));
 INSERT INTO public.board_entries(account_id,job_id,operation) VALUES(p_account,j.id,'Laser cutting');
 INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,j.id,p_user,'planned','Created from accepted quote');
 RETURN jsonb_build_object('job_id',j.id,'existing',false);
END $$;
CREATE FUNCTION public.ovrendi_update_job(p_account uuid,p_user uuid,p_job uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs%ROWTYPE; t public.ovrendi_job_tracking%ROWTYPE; role_name text; stage_name text;
BEGIN
 SELECT role INTO role_name FROM public.account_users WHERE account_id=p_account AND user_id=p_user;
 IF role_name IS NULL OR role_name NOT IN ('owner','admin','manager','operator') OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production editing access required'); END IF;
 IF role_name='operator' AND p_data - ARRAY['stage','instructions','actual_hours','material_used','material_unit'] <> '{}'::jsonb THEN RETURN jsonb_build_object('error','Operators can record progress, usage and instructions only'); END IF;
 SELECT * INTO j FROM public.jobs WHERE account_id=p_account AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Job not found'); END IF;
 SELECT * INTO t FROM public.ovrendi_job_tracking WHERE account_id=p_account AND job_id=p_job;
 IF NOT FOUND THEN
  IF p_version<>0 THEN RETURN jsonb_build_object('error','Job changed. Reload before saving'); END IF;
  INSERT INTO public.ovrendi_job_tracking(account_id,job_id,stage,version) VALUES(p_account,p_job,CASE WHEN j.status IN ('complete','shipped') THEN 'completed' WHEN j.status='cancelled' THEN 'cancelled' WHEN j.status='on_hold' THEN 'on_hold' WHEN j.status='in_progress' THEN 'cutting' ELSE 'planned' END,0) RETURNING * INTO t;
 END IF;
 IF p_version IS DISTINCT FROM t.version THEN RETURN jsonb_build_object('error','Job changed. Reload before saving'); END IF;
 IF p_data->>'machine_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.machines WHERE account_id=p_account AND id=(p_data->>'machine_id')::uuid) THEN RETURN jsonb_build_object('error','Machine not found in this company'); END IF;
 stage_name:=coalesce(p_data->>'stage',t.stage);
 UPDATE public.ovrendi_job_tracking SET stage=stage_name,
 machine_id=CASE WHEN p_data ? 'machine_id' THEN (p_data->>'machine_id')::uuid ELSE machine_id END,
 instructions=coalesce(p_data->>'instructions',instructions),
 actual_hours=CASE WHEN p_data ? 'actual_hours' THEN (p_data->>'actual_hours')::numeric ELSE actual_hours END,
 material_used=CASE WHEN p_data ? 'material_used' THEN (p_data->>'material_used')::numeric ELSE material_used END,
 material_unit=coalesce(p_data->>'material_unit',material_unit),
 material_cost=CASE WHEN p_data ? 'material_cost' THEN (p_data->>'material_cost')::numeric ELSE material_cost END,
 labor_cost=CASE WHEN p_data ? 'labor_cost' THEN (p_data->>'labor_cost')::numeric ELSE labor_cost END,
 version=version+1,updated_at=now() WHERE job_id=p_job;
 UPDATE public.jobs SET due_date=CASE WHEN p_data ? 'due_date' THEN (p_data->>'due_date')::date ELSE due_date END,
 priority=coalesce(p_data->>'priority',priority),
 status=CASE stage_name WHEN 'planned' THEN 'open' WHEN 'on_hold' THEN 'on_hold' WHEN 'cancelled' THEN 'cancelled' WHEN 'ready' THEN 'complete' WHEN 'completed' THEN 'shipped' ELSE 'in_progress' END WHERE id=p_job AND account_id=p_account;
 INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,stage_name,CASE WHEN t.stage<>stage_name THEN 'Stage changed from '||t.stage||' to '||stage_name ELSE 'Job details updated' END);
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_quote_to_job(uuid,uuid,uuid),public.ovrendi_update_job(uuid,uuid,uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_quote_to_job(uuid,uuid,uuid),public.ovrendi_update_job(uuid,uuid,uuid,integer,jsonb) TO service_role;
COMMIT;
