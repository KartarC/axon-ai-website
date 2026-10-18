BEGIN;
CREATE TABLE public.ovrendi_employee_time(
 id uuid PRIMARY KEY,account_id uuid NOT NULL REFERENCES public.accounts(id),job_id uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
 user_id uuid NOT NULL REFERENCES auth.users(id),employee_name text NOT NULL,
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),ended_at timestamptz,
 hours numeric CHECK(hours>=0 AND hours<=1000000),reviewed_at timestamptz,reviewed_by uuid REFERENCES auth.users(id),review_note text NOT NULL DEFAULT '' CHECK(length(review_note)<=1000),
 CHECK((ended_at IS NULL AND hours IS NULL) OR (ended_at>=started_at AND hours IS NOT NULL)),CHECK(reviewed_at IS NULL OR ended_at IS NOT NULL)
);
CREATE UNIQUE INDEX ovrendi_employee_one_timer ON public.ovrendi_employee_time(account_id,user_id) WHERE ended_at IS NULL;
CREATE INDEX ON public.ovrendi_employee_time(account_id,job_id,started_at DESC);
CREATE INDEX ON public.ovrendi_employee_time(account_id,started_at DESC);
ALTER TABLE public.ovrendi_employee_time ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_employee_time FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ovrendi_employee_time TO service_role;
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
 IF t.timer_started_at IS NOT NULL AND (p_data ? 'actual_hours' OR p_data->>'stage' IN ('completed','cancelled','ready','on_hold')) THEN RETURN jsonb_build_object('error','Stop the timer before changing hours or closing/pausing the job'); END IF;
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
 IF p_data->>'stage' IN ('completed','cancelled','ready','on_hold') AND EXISTS(SELECT 1 FROM public.ovrendi_employee_time WHERE account_id=p_account AND job_id=p_job AND ended_at IS NULL) THEN RETURN jsonb_build_object('error','Stop all employee timers before closing or pausing the job'); END IF;
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


CREATE OR REPLACE FUNCTION public.ovrendi_job_timer(p_account uuid,p_user uuid,p_job uuid,p_version integer,p_action text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.ovrendi_job_tracking%ROWTYPE; j public.jobs%ROWTYPE; r jsonb; elapsed numeric; hours numeric; stopped_at timestamptz;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) OR NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager','operator')) THEN RETURN jsonb_build_object('error','Production editing access required'); END IF;
 IF p_action NOT IN ('start','stop') OR p_action IS NULL THEN RETURN jsonb_build_object('error','Choose start or stop'); END IF;
 SELECT * INTO j FROM public.jobs WHERE account_id=p_account AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Job not found'); END IF;
 SELECT * INTO t FROM public.ovrendi_job_tracking WHERE account_id=p_account AND job_id=p_job;
 IF NOT FOUND THEN
  IF p_version IS DISTINCT FROM 0 THEN RETURN jsonb_build_object('error','Job changed. Reload before timing'); END IF;
  IF p_action='stop' THEN RETURN jsonb_build_object('error','Timer is not running'); END IF;
  IF j.status IN ('complete','shipped','cancelled','on_hold') THEN RETURN jsonb_build_object('error','Reopen the job before starting its timer'); END IF;
  INSERT INTO public.ovrendi_job_tracking(account_id,job_id,stage,version) VALUES(p_account,p_job,'planned',0) RETURNING * INTO t;
 END IF;
 IF p_version IS DISTINCT FROM t.version THEN RETURN jsonb_build_object('error','Job changed. Reload before timing'); END IF;
 IF p_action='start' AND EXISTS(SELECT 1 FROM public.ovrendi_employee_time WHERE account_id=p_account AND job_id=p_job AND ended_at IS NULL) THEN RETURN jsonb_build_object('error','Employee timers are running; do not also use the shared job timer'); END IF;
 IF p_action='start' THEN
  IF t.timer_started_at IS NOT NULL THEN RETURN jsonb_build_object('error','Timer is already running'); END IF;
  IF t.stage IN ('completed','cancelled','ready','on_hold') OR j.status IN ('complete','shipped','cancelled','on_hold') THEN RETURN jsonb_build_object('error','Reopen the job before starting its timer'); END IF;
  UPDATE public.ovrendi_job_tracking SET timer_started_at=clock_timestamp(),version=version+1,updated_at=now() WHERE job_id=p_job;
  INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,t.stage,'Job timer started');
 ELSE
  IF t.timer_started_at IS NULL THEN RETURN jsonb_build_object('error','Timer is not running'); END IF;
  stopped_at:=clock_timestamp();elapsed:=greatest(0,extract(epoch FROM stopped_at-t.timer_started_at));
  hours:=round(coalesce(t.actual_hours,0)+elapsed/3600,6);
  IF hours>1000000 THEN RETURN jsonb_build_object('error','Recorded hours exceed the supported limit'); END IF;
  -- Clear only inside this transaction so the regular hours update can calculate labour.
  UPDATE public.ovrendi_job_tracking SET timer_started_at=NULL WHERE job_id=p_job;
  r:=public.ovrendi_update_job(p_account,p_user,p_job,p_version,jsonb_build_object('actual_hours',hours));
  IF r ? 'error' THEN
   UPDATE public.ovrendi_job_tracking SET timer_started_at=t.timer_started_at WHERE job_id=p_job;
   RETURN r;
  END IF;
  INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,t.stage,'Job timer stopped; added '||round(elapsed/3600,6)||' hours');
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.ovrendi_employee_timer(p_account uuid,p_user uuid,p_job uuid,p_entry uuid,p_action text,p_note text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text; employee text; entry public.ovrendi_employee_time%ROWTYPE; t public.ovrendi_job_tracking%ROWTYPE; j public.jobs%ROWTYPE; r jsonb; stop_time timestamptz; duration numeric; target_user uuid;
BEGIN
 SELECT role,coalesce(nullif(full_name,''),'Team member '||left(user_id::text,8)) INTO role_name,employee FROM public.account_users WHERE account_id=p_account AND user_id=p_user;
 IF role_name IS NULL OR role_name NOT IN ('owner','admin','manager','operator') OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production editing access required'); END IF;
 IF p_action IS NULL OR p_action NOT IN ('start','stop','review') OR p_entry IS NULL THEN RETURN jsonb_build_object('error','Invalid time entry action'); END IF;
 IF length(coalesce(p_note,''))>1000 THEN RETURN jsonb_build_object('error','Review note is too long'); END IF;
 target_user:=p_user;
 IF p_action<>'start' THEN
  SELECT * INTO entry FROM public.ovrendi_employee_time WHERE account_id=p_account AND id=p_entry AND job_id=p_job;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Time entry not found'); END IF;
  IF p_action='review' AND role_name NOT IN ('owner','admin','manager') THEN RETURN jsonb_build_object('error','Manager review required'); END IF;
  IF entry.user_id<>p_user AND role_name NOT IN ('owner','admin','manager') THEN RETURN jsonb_build_object('error','You can stop only your own timer'); END IF;
  target_user:=entry.user_id;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||target_user::text,28));
 SELECT * INTO j FROM public.jobs WHERE account_id=p_account AND id=p_job FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','Job not found'); END IF;
 SELECT * INTO t FROM public.ovrendi_job_tracking WHERE account_id=p_account AND job_id=p_job;
 IF p_action='start' THEN
  SELECT * INTO entry FROM public.ovrendi_employee_time WHERE id=p_entry;
  IF FOUND THEN
   IF entry.account_id=p_account AND entry.user_id=p_user AND entry.job_id=p_job THEN RETURN jsonb_build_object('ok',true,'entry_id',entry.id,'existing',true); END IF;
   RETURN jsonb_build_object('error','Time entry identifier already used');
  END IF;
  IF EXISTS(SELECT 1 FROM public.ovrendi_employee_time WHERE account_id=p_account AND user_id=p_user AND ended_at IS NULL) THEN RETURN jsonb_build_object('error','Stop your active timer before starting another'); END IF;
  IF t.timer_started_at IS NOT NULL THEN RETURN jsonb_build_object('error','Stop the shared job timer before starting employee timers'); END IF;
  IF j.status IN ('complete','shipped','cancelled','on_hold') OR t.stage IN ('completed','cancelled','ready','on_hold') THEN RETURN jsonb_build_object('error','Reopen the job before starting a timer'); END IF;
  IF t.job_id IS NULL THEN
   INSERT INTO public.ovrendi_job_tracking(account_id,job_id,stage,version) VALUES(p_account,p_job,CASE WHEN j.status='in_progress' THEN 'cutting' ELSE 'planned' END,0) RETURNING * INTO t;
  END IF;
  INSERT INTO public.ovrendi_employee_time(id,account_id,job_id,user_id,employee_name) VALUES(p_entry,p_account,p_job,p_user,employee);
  UPDATE public.ovrendi_job_tracking SET version=version+1,updated_at=now() WHERE job_id=p_job;
  INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,t.stage,'Employee timer started: '||employee);
 ELSE
  SELECT * INTO entry FROM public.ovrendi_employee_time WHERE account_id=p_account AND id=p_entry FOR UPDATE;
  IF p_action='review' THEN
   IF entry.ended_at IS NULL THEN RETURN jsonb_build_object('error','Stop the timer before reviewing'); END IF;
   IF entry.reviewed_at IS NULL THEN
    UPDATE public.ovrendi_employee_time SET reviewed_at=now(),reviewed_by=p_user,review_note=coalesce(p_note,'') WHERE id=p_entry;
    INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,t.stage,'Timesheet reviewed: '||entry.employee_name);
   END IF;
  ELSE
   IF entry.ended_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'existing',true); END IF;
   stop_time:=clock_timestamp();duration:=round(greatest(0,extract(epoch FROM stop_time-entry.started_at))/3600,6);
   IF coalesce(t.actual_hours,0)+duration>1000000 THEN RETURN jsonb_build_object('error','Hours exceed the supported limit'); END IF;
   r:=public.ovrendi_update_job(p_account,p_user,p_job,t.version,jsonb_build_object('actual_hours',coalesce(t.actual_hours,0)+duration));
   IF r ? 'error' THEN RETURN r; END IF;
   UPDATE public.ovrendi_employee_time SET ended_at=stop_time,hours=duration WHERE id=p_entry;
   INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,p_job,p_user,t.stage,'Employee timer stopped: '||entry.employee_name||'; added '||duration||' hours');
  END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'entry_id',p_entry);
END $$;
CREATE FUNCTION public.ovrendi_timesheets(p_account uuid,p_user uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text; result jsonb;
BEGIN
 SELECT role INTO role_name FROM public.account_users WHERE account_id=p_account AND user_id=p_user;
 IF role_name IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production access required'); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO result FROM (
 SELECT e.*,j.job_number,j.part_name,(SELECT coalesce(nullif(au.full_name,''),'Manager '||left(au.user_id::text,8)) FROM public.account_users au WHERE au.account_id=e.account_id AND au.user_id=e.reviewed_by) AS reviewed_name FROM public.ovrendi_employee_time e JOIN public.jobs j ON j.id=e.job_id AND j.account_id=e.account_id
 WHERE e.account_id=p_account AND (role_name IN ('owner','admin','manager') OR e.user_id=p_user)
 AND (e.ended_at IS NULL OR (e.started_at>=p_from AND e.started_at<p_to)) ORDER BY (e.ended_at IS NULL) DESC,e.started_at DESC LIMIT 500
 ) x;
 RETURN jsonb_build_object('entries',result,'can_review',role_name IN ('owner','admin','manager'),'limit',500,'server_time',clock_timestamp());
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_employee_timer(uuid,uuid,uuid,uuid,text,text),public.ovrendi_timesheets(uuid,uuid,timestamptz,timestamptz) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_employee_timer(uuid,uuid,uuid,uuid,text,text),public.ovrendi_timesheets(uuid,uuid,timestamptz,timestamptz) TO service_role;
COMMIT;
