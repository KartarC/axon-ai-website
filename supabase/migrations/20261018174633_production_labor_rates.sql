BEGIN;
ALTER TABLE public.ovrendi_job_tracking
 ADD COLUMN labor_mode text NOT NULL DEFAULT 'auto' CHECK(labor_mode IN ('auto','manual')),
 ADD COLUMN labor_rate numeric CHECK(labor_rate BETWEEN 0 AND 1000000),
 ADD COLUMN labor_currency text CHECK(labor_currency ~ '^[A-Z]{3}$'),
 ADD COLUMN labor_source text NOT NULL DEFAULT '',
 ADD COLUMN labor_note text NOT NULL DEFAULT '' CHECK(length(labor_note)<=1000);
-- Preserve previously entered totals; do not retroactively recalculate customers' costs.
UPDATE public.ovrendi_job_tracking SET labor_mode='manual',labor_note='Previously recorded manual total' WHERE labor_cost IS NOT NULL;
CREATE OR REPLACE FUNCTION public.ovrendi_update_job(p_account uuid,p_user uuid,p_job uuid,p_version integer,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE j public.jobs%ROWTYPE; t public.ovrendi_job_tracking%ROWTYPE; role_name text; stage_name text; mode_name text; rate_value numeric; currency_name text; source_name text; hours_value numeric; total_value numeric; note_value text; profile public.billet_laser_profiles%ROWTYPE; quote_result jsonb;
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

 mode_name:=coalesce(p_data->>'labor_mode',CASE WHEN p_data ? 'labor_cost' THEN 'manual' ELSE t.labor_mode END);
 IF mode_name NOT IN ('auto','manual') THEN RETURN jsonb_build_object('error','Choose automatic or manual labour'); END IF;
 rate_value:=t.labor_rate; currency_name:=t.labor_currency; source_name:=t.labor_source;
 IF p_data ? 'labor_profile_id' THEN
  IF p_data->>'labor_profile_id' IS NOT NULL THEN
   SELECT * INTO profile FROM public.billet_laser_profiles WHERE account_id=p_account AND id=(p_data->>'labor_profile_id')::uuid;
   IF NOT FOUND THEN RETURN jsonb_build_object('error','Rate profile not found in this company'); END IF;
   quote_result:=profile.rates; source_name:='Profile: '||profile.name;
  ELSE
   SELECT result->'rates' INTO quote_result FROM public.billet_laser_quotes WHERE account_id=p_account AND id=t.quote_id;
   source_name:='Accepted quote labour rate';
  END IF;
  rate_value:=nullif(quote_result->>'laborHourly','')::numeric; currency_name:=quote_result->>'currency';
 ELSIF rate_value IS NULL AND t.quote_id IS NOT NULL THEN
  SELECT result->'rates' INTO quote_result FROM public.billet_laser_quotes WHERE account_id=p_account AND id=t.quote_id;
  rate_value:=nullif(quote_result->>'laborHourly','')::numeric; currency_name:=quote_result->>'currency';source_name:='Accepted quote labour rate';
 END IF;
 IF rate_value IS NOT NULL AND (rate_value<0 OR rate_value>1000000 OR currency_name IS NULL OR currency_name !~ '^[A-Z]{3}$') THEN RETURN jsonb_build_object('error','Saved labour rate or currency is invalid'); END IF;
 IF rate_value IS NOT NULL AND t.snapshot->>'currency' IS NOT NULL AND currency_name IS DISTINCT FROM t.snapshot->>'currency' THEN RETURN jsonb_build_object('error','Rate currency must match the accepted quote'); END IF;
 hours_value:=CASE WHEN p_data ? 'actual_hours' THEN (p_data->>'actual_hours')::numeric ELSE t.actual_hours END;
 note_value:=coalesce(p_data->>'labor_note',t.labor_note);
 IF p_data->>'labor_mode'='manual' AND length(trim(note_value))=0 THEN RETURN jsonb_build_object('error','Add a reason for the manual labour total'); END IF;
 total_value:=CASE WHEN mode_name='auto' THEN round(hours_value*rate_value,2) WHEN p_data ? 'labor_cost' THEN (p_data->>'labor_cost')::numeric ELSE t.labor_cost END;
 IF total_value>100000000 OR total_value<0 THEN RETURN jsonb_build_object('error','Labour total is outside the supported range'); END IF;
 stage_name:=coalesce(p_data->>'stage',t.stage);
 UPDATE public.ovrendi_job_tracking SET stage=stage_name,
 machine_id=CASE WHEN p_data ? 'machine_id' THEN (p_data->>'machine_id')::uuid ELSE machine_id END,
 instructions=coalesce(p_data->>'instructions',instructions),
 actual_hours=CASE WHEN p_data ? 'actual_hours' THEN (p_data->>'actual_hours')::numeric ELSE actual_hours END,
 material_used=CASE WHEN p_data ? 'material_used' THEN (p_data->>'material_used')::numeric ELSE material_used END,
 material_unit=coalesce(p_data->>'material_unit',material_unit),
 material_cost=CASE WHEN p_data ? 'material_cost' THEN (p_data->>'material_cost')::numeric ELSE material_cost END,
 labor_cost=total_value,labor_mode=mode_name,labor_rate=rate_value,labor_currency=currency_name,labor_source=source_name,labor_note=note_value,
 version=version+1,updated_at=now() WHERE job_id=p_job;
 UPDATE public.jobs SET due_date=CASE WHEN p_data ? 'due_date' THEN (p_data->>'due_date')::date ELSE due_date END,
 priority=coalesce(p_data->>'priority',priority),
 status=CASE stage_name WHEN 'planned' THEN 'open' WHEN 'on_hold' THEN 'on_hold' WHEN 'cancelled' THEN 'cancelled' WHEN 'ready' THEN 'complete' WHEN 'completed' THEN 'shipped' ELSE 'in_progress' END WHERE id=p_job AND account_id=p_account;
 INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,stage_name,CASE WHEN t.stage<>stage_name THEN 'Stage changed from '||t.stage||' to '||stage_name ELSE 'Job details updated' END || CASE WHEN role_name IN ('owner','admin','manager') AND (p_data ? 'labor_mode' OR p_data ? 'labor_profile_id' OR p_data ? 'labor_cost') THEN ' · Labour calculation updated ('||mode_name||')' ELSE '' END);
 RETURN jsonb_build_object('ok',true);
END $$;

COMMIT;
