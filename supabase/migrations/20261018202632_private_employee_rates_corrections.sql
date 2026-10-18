BEGIN;
CREATE TABLE public.ovrendi_employee_rates(account_id uuid NOT NULL REFERENCES public.accounts(id),user_id uuid NOT NULL REFERENCES auth.users(id),hourly_rate numeric NOT NULL CHECK(hourly_rate BETWEEN 0 AND 1000000),currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),version integer NOT NULL DEFAULT 1,updated_by uuid NOT NULL REFERENCES auth.users(id),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(account_id,user_id));
ALTER TABLE public.ovrendi_employee_rates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_employee_rates FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ovrendi_employee_rates TO service_role;
ALTER TABLE public.ovrendi_employee_time ADD COLUMN hourly_rate numeric CHECK(hourly_rate BETWEEN 0 AND 1000000),ADD COLUMN rate_currency text,ADD COLUMN rate_source text NOT NULL DEFAULT '',ADD COLUMN version integer NOT NULL DEFAULT 1,ADD COLUMN original_hours numeric,ADD COLUMN correction_reason text NOT NULL DEFAULT '';
UPDATE public.ovrendi_employee_time e SET hourly_rate=t.labor_rate,rate_currency=coalesce(t.snapshot->>'currency',t.labor_currency),rate_source='Previous job rate',original_hours=e.hours FROM public.ovrendi_job_tracking t WHERE t.job_id=e.job_id AND t.account_id=e.account_id;
CREATE TABLE public.ovrendi_time_audit(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL REFERENCES public.accounts(id),entry_id uuid REFERENCES public.ovrendi_employee_time(id),user_id uuid NOT NULL REFERENCES auth.users(id),kind text NOT NULL,before_value jsonb,after_value jsonb,reason text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.ovrendi_time_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_time_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.ovrendi_time_audit TO service_role;
CREATE FUNCTION public.ovrendi_time_snapshot() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE t public.ovrendi_job_tracking%ROWTYPE; r public.ovrendi_employee_rates%ROWTYPE; q jsonb; currency_name text;
BEGIN
 IF TG_OP='INSERT' THEN
  SELECT * INTO t FROM public.ovrendi_job_tracking WHERE account_id=NEW.account_id AND job_id=NEW.job_id;
  currency_name:=coalesce(t.snapshot->>'currency',t.labor_currency);
  SELECT * INTO r FROM public.ovrendi_employee_rates WHERE account_id=NEW.account_id AND user_id=NEW.user_id;
  IF FOUND THEN NEW.hourly_rate:=r.hourly_rate;NEW.rate_currency:=r.currency;NEW.rate_source:='Employee rate';
  ELSE
   SELECT result->'rates' INTO q FROM public.billet_laser_quotes WHERE account_id=NEW.account_id AND id=t.quote_id;
   NEW.hourly_rate:=coalesce(t.labor_rate,nullif(q->>'laborHourly','')::numeric);NEW.rate_currency:=coalesce(t.labor_currency,q->>'currency');NEW.rate_source:='Job rate fallback';
  END IF;
  IF currency_name IS NOT NULL AND NEW.hourly_rate IS NOT NULL AND NEW.rate_currency IS DISTINCT FROM currency_name THEN RAISE EXCEPTION 'A manager must resolve the job cost configuration before timing'; END IF;
 ELSE
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL THEN NEW.original_hours:=NEW.hours; END IF;
  NEW.version:=OLD.version+1;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ovrendi_time_snapshot BEFORE INSERT OR UPDATE ON public.ovrendi_employee_time FOR EACH ROW EXECUTE FUNCTION public.ovrendi_time_snapshot();
CREATE FUNCTION public.ovrendi_labor_total() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE employee_hours numeric; employee_cost numeric; missing integer; other_hours numeric; currency_name text;
BEGIN
 IF NEW.labor_mode='auto' THEN
  currency_name:=coalesce(NEW.snapshot->>'currency',NEW.labor_currency);
  IF currency_name IS NULL THEN SELECT CASE WHEN count(DISTINCT rate_currency)=1 THEN min(rate_currency) END INTO currency_name FROM public.ovrendi_employee_time WHERE account_id=NEW.account_id AND job_id=NEW.job_id AND ended_at IS NOT NULL;NEW.labor_currency:=currency_name; END IF;
  SELECT coalesce(sum(hours),0),coalesce(sum(round(hours*hourly_rate,2)),0),count(*) FILTER(WHERE hours>0 AND (hourly_rate IS NULL OR rate_currency IS DISTINCT FROM currency_name)) INTO employee_hours,employee_cost,missing FROM public.ovrendi_employee_time WHERE account_id=NEW.account_id AND job_id=NEW.job_id AND ended_at IS NOT NULL;
  IF EXISTS(SELECT 1 FROM public.ovrendi_employee_time WHERE account_id=NEW.account_id AND job_id=NEW.job_id AND ended_at IS NOT NULL) THEN
   other_hours:=greatest(coalesce(NEW.actual_hours,0)-employee_hours,0);
   NEW.labor_cost:=CASE WHEN missing>0 OR (other_hours>0 AND NEW.labor_rate IS NULL) THEN NULL ELSE employee_cost+round(other_hours*coalesce(NEW.labor_rate,0),2) END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ovrendi_labor_total BEFORE UPDATE ON public.ovrendi_job_tracking FOR EACH ROW EXECUTE FUNCTION public.ovrendi_labor_total();
CREATE FUNCTION public.ovrendi_time_refresh() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.ended_at IS NOT NULL THEN UPDATE public.ovrendi_job_tracking SET labor_cost=labor_cost,version=version+1,updated_at=now() WHERE account_id=NEW.account_id AND job_id=NEW.job_id; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ovrendi_time_refresh AFTER INSERT OR UPDATE OF hours,hourly_rate,ended_at ON public.ovrendi_employee_time FOR EACH ROW EXECUTE FUNCTION public.ovrendi_time_refresh();
CREATE FUNCTION public.ovrendi_time_admin(p_account uuid,p_user uuid,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE r public.ovrendi_employee_rates%ROWTYPE; e public.ovrendi_employee_time%ROWTYPE; t public.ovrendi_job_tracking%ROWTYPE; result jsonb; new_hours numeric; new_rate numeric; new_currency text; reason text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager')) OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Manager access required'); END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',au.user_id,'name',coalesce(nullif(au.full_name,''),'Team member '||left(au.user_id::text,8)),'hourly_rate',er.hourly_rate,'currency',er.currency,'version',coalesce(er.version,0))),'[]') INTO result FROM public.account_users au LEFT JOIN public.ovrendi_employee_rates er ON er.account_id=au.account_id AND er.user_id=au.user_id WHERE au.account_id=p_account;
  RETURN jsonb_build_object('employees',result);
 END IF;
 reason:=trim(coalesce(p_data->>'reason',''));
 IF length(reason)<1 OR length(reason)>1000 THEN RETURN jsonb_build_object('error','Enter a reason (up to 1000 characters)'); END IF;
 IF p_action='rate' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||(p_data->>'user_id'),29));
  IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=(p_data->>'user_id')::uuid) THEN RETURN jsonb_build_object('error','Employee not found in this company'); END IF;
  SELECT * INTO r FROM public.ovrendi_employee_rates WHERE account_id=p_account AND user_id=(p_data->>'user_id')::uuid;
  IF coalesce(r.version,0) IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('error','Rate changed. Reload before saving'); END IF;
  new_rate:=(p_data->>'hourly_rate')::numeric;new_currency:=p_data->>'currency';
  IF new_rate IS NULL OR new_rate<0 OR new_rate>1000000 OR new_currency IS NULL OR new_currency !~ '^[A-Z]{3}$' THEN RETURN jsonb_build_object('error','Enter a valid rate and currency'); END IF;
  INSERT INTO public.ovrendi_employee_rates(account_id,user_id,hourly_rate,currency,updated_by) VALUES(p_account,(p_data->>'user_id')::uuid,new_rate,new_currency,p_user) ON CONFLICT(account_id,user_id) DO UPDATE SET hourly_rate=excluded.hourly_rate,currency=excluded.currency,updated_by=p_user,updated_at=now(),version=ovrendi_employee_rates.version+1;
  INSERT INTO public.ovrendi_time_audit(account_id,user_id,kind,before_value,after_value,reason) VALUES(p_account,p_user,'rate',to_jsonb(r),p_data,reason);
 ELSIF p_action='correct' THEN
  SELECT * INTO e FROM public.ovrendi_employee_time WHERE account_id=p_account AND id=(p_data->>'entry_id')::uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Time entry not found'); END IF;
  PERFORM 1 FROM public.jobs WHERE account_id=p_account AND id=e.job_id FOR UPDATE;
  SELECT * INTO e FROM public.ovrendi_employee_time WHERE id=e.id FOR UPDATE;
  IF e.ended_at IS NULL THEN RETURN jsonb_build_object('error','Stop the timer before correcting it'); END IF;
  IF e.version IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('error','Entry changed. Reload before correcting'); END IF;
  SELECT * INTO t FROM public.ovrendi_job_tracking WHERE job_id=e.job_id;
  new_hours:=(p_data->>'hours')::numeric;new_rate:=CASE WHEN p_data ? 'hourly_rate' THEN (p_data->>'hourly_rate')::numeric ELSE e.hourly_rate END;new_currency:=coalesce(p_data->>'currency',e.rate_currency);
  IF new_hours IS NULL OR new_hours<0 OR new_hours>1000000 OR new_rate<0 OR new_rate>1000000 OR coalesce(t.actual_hours,0)+new_hours-e.hours NOT BETWEEN 0 AND 1000000 THEN RETURN jsonb_build_object('error','Enter valid hours and rate'); END IF;
  IF new_rate IS NOT NULL AND (new_currency IS NULL OR new_currency !~ '^[A-Z]{3}$' OR new_currency IS DISTINCT FROM coalesce(t.snapshot->>'currency',t.labor_currency,new_currency)) THEN RETURN jsonb_build_object('error','Rate currency must match this job'); END IF;
  UPDATE public.ovrendi_employee_time SET hours=new_hours,hourly_rate=new_rate,rate_currency=new_currency,rate_source=CASE WHEN p_data ? 'hourly_rate' THEN 'Manager correction' ELSE rate_source END,correction_reason=reason,reviewed_at=NULL,reviewed_by=NULL,review_note='' WHERE id=e.id;
  UPDATE public.ovrendi_job_tracking SET actual_hours=coalesce(t.actual_hours,0)+new_hours-e.hours,version=version+1,updated_at=now() WHERE job_id=e.job_id;
  INSERT INTO public.ovrendi_time_audit(account_id,entry_id,user_id,kind,before_value,after_value,reason) VALUES(p_account,e.id,p_user,'correction',to_jsonb(e),p_data,reason);
  INSERT INTO public.ovrendi_job_events(account_id,job_id,user_id,stage,note) VALUES(p_account,e.job_id,p_user,t.stage,'Timesheet corrected by a manager; review required');
 ELSE RETURN jsonb_build_object('error','Invalid manager action');
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
CREATE OR REPLACE FUNCTION public.ovrendi_timesheets(p_account uuid,p_user uuid,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE role_name text; result jsonb;
BEGIN
 SELECT role INTO role_name FROM public.account_users WHERE account_id=p_account AND user_id=p_user;
 IF role_name IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production access required'); END IF;
 SELECT coalesce(jsonb_agg(CASE WHEN role_name IN ('owner','admin','manager') THEN to_jsonb(x) ELSE to_jsonb(x)-ARRAY['hourly_rate','rate_currency','rate_source','correction_reason','review_note'] END),'[]') INTO result FROM (
 SELECT e.*,j.job_number,j.part_name,(SELECT coalesce(nullif(au.full_name,''),'Manager '||left(au.user_id::text,8)) FROM public.account_users au WHERE au.account_id=e.account_id AND au.user_id=e.reviewed_by) AS reviewed_name FROM public.ovrendi_employee_time e JOIN public.jobs j ON j.id=e.job_id AND j.account_id=e.account_id
 WHERE e.account_id=p_account AND (role_name IN ('owner','admin','manager') OR e.user_id=p_user)
 AND (e.ended_at IS NULL OR (e.started_at>=p_from AND e.started_at<p_to)) ORDER BY (e.ended_at IS NULL) DESC,e.started_at DESC LIMIT 500
 ) x;
 RETURN jsonb_build_object('entries',result,'can_review',role_name IN ('owner','admin','manager'),'limit',500,'server_time',clock_timestamp());
END $$;

REVOKE ALL ON FUNCTION public.ovrendi_time_snapshot(),public.ovrendi_labor_total(),public.ovrendi_time_refresh(),public.ovrendi_time_admin(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_time_snapshot(),public.ovrendi_labor_total(),public.ovrendi_time_refresh(),public.ovrendi_time_admin(uuid,uuid,text,jsonb) TO service_role;
COMMIT;
