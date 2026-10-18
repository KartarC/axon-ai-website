
BEGIN;
CREATE TABLE public.ovrendi_week_approvals(account_id uuid NOT NULL REFERENCES public.accounts(id),week_start date NOT NULL, fingerprint text NOT NULL,approved_by uuid NOT NULL REFERENCES auth.users(id),approved_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(account_id,week_start));
ALTER TABLE public.ovrendi_week_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_week_approvals FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ovrendi_week_approvals TO service_role;
CREATE FUNCTION public.ovrendi_week_timesheet(p_account uuid,p_user uuid,p_week date,p_approve boolean,p_fingerprint text) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE rows jsonb; stamp text; approval public.ovrendi_week_approvals%ROWTYPE; running boolean; missing boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=p_user AND role IN ('owner','admin','manager')) OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Manager access required'); END IF;
 IF p_week IS NULL OR extract(isodow FROM p_week)<>1 THEN RETURN jsonb_build_object('error','Choose a Monday'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||p_week::text,35));
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO rows FROM (
 SELECT e.id,e.user_id,e.employee_name,j.job_number,e.started_at,e.ended_at,e.hours,e.hourly_rate,e.rate_currency,e.version,round(e.hours*e.hourly_rate,2) AS labor_cost FROM public.ovrendi_employee_time e JOIN public.jobs j ON j.id=e.job_id AND j.account_id=e.account_id WHERE e.account_id=p_account AND e.started_at >= (p_week::timestamp AT TIME ZONE 'UTC') AND e.started_at < ((p_week+7)::timestamp AT TIME ZONE 'UTC')
 ) x;
 stamp:=md5(rows::text);
 SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE x->>'ended_at' IS NULL),EXISTS(SELECT 1 FROM jsonb_array_elements(rows) x WHERE (x->>'hours')::numeric>0 AND (x->>'hourly_rate' IS NULL OR x->>'rate_currency' IS NULL)) INTO running,missing;
 SELECT * INTO approval FROM public.ovrendi_week_approvals WHERE account_id=p_account AND week_start=p_week;
 IF p_approve THEN
  IF p_fingerprint IS DISTINCT FROM stamp THEN RETURN jsonb_build_object('error','Entries changed. Reload the week before approving'); END IF;
  IF running OR missing OR jsonb_array_length(rows)=0 THEN RETURN jsonb_build_object('error','Stop running timers and resolve missing rates before approving a non-empty week'); END IF;
  IF approval.fingerprint IS DISTINCT FROM stamp THEN
   INSERT INTO public.ovrendi_week_approvals(account_id,week_start,fingerprint,approved_by) VALUES(p_account,p_week,stamp,p_user) ON CONFLICT(account_id,week_start) DO UPDATE SET fingerprint=excluded.fingerprint,approved_by=p_user,approved_at=now() RETURNING * INTO approval;
   INSERT INTO public.ovrendi_time_audit(account_id,user_id,kind,after_value,reason) VALUES(p_account,p_user,'week_approval',jsonb_build_object('week_start',p_week,'fingerprint',stamp,'entries',rows),'Weekly timesheet approval');
  END IF;
 END IF;
 RETURN jsonb_build_object('entries',rows,'fingerprint',stamp,'approved',coalesce(approval.fingerprint=stamp,false),'approved_at',approval.approved_at,'approved_by',approval.approved_by,'running',running,'missing_rates',missing,'week_start',p_week);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_week_timesheet(uuid,uuid,date,boolean,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_week_timesheet(uuid,uuid,date,boolean,text) TO service_role;
COMMIT;
