BEGIN;
CREATE TABLE public.ovrendi_time_submissions(account_id uuid NOT NULL REFERENCES public.accounts(id),user_id uuid NOT NULL REFERENCES auth.users(id),week_start date NOT NULL,status text NOT NULL CHECK(status IN ('submitted','approved','returned')),fingerprint text NOT NULL,version integer NOT NULL DEFAULT 1,submitted_at timestamptz NOT NULL DEFAULT now(),reviewed_at timestamptz,reviewed_by uuid REFERENCES auth.users(id),comment text NOT NULL DEFAULT '',PRIMARY KEY(account_id,user_id,week_start));
ALTER TABLE public.ovrendi_time_submissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_time_submissions FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ovrendi_time_submissions TO service_role;
CREATE FUNCTION public.ovrendi_person_week(p_account uuid,p_user uuid,p_week date) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('fingerprint',md5(coalesce(string_agg(id::text||':'||version::text,',' ORDER BY id),'')),'hours',coalesce(sum(hours),0),'sessions',count(*),'running',coalesce(bool_or(ended_at IS NULL),false)) FROM public.ovrendi_employee_time WHERE account_id=p_account AND user_id=p_user AND started_at >= (p_week::timestamp AT TIME ZONE 'UTC') AND started_at < ((p_week+7)::timestamp AT TIME ZONE 'UTC');
$$;
CREATE FUNCTION public.ovrendi_submit_week(p_account uuid,p_user uuid,p_week date,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE manager boolean; target uuid; entry public.ovrendi_time_submissions%ROWTYPE; snapshot jsonb; result jsonb; comment_text text; notify boolean:=false;
BEGIN
 SELECT role IN ('owner','admin','manager') INTO manager FROM public.account_users WHERE account_id=p_account AND user_id=p_user;
 IF manager IS NULL OR NOT EXISTS(SELECT 1 FROM public.accounts WHERE id=p_account AND status='active' AND 'production-board'=ANY(modules)) THEN RETURN jsonb_build_object('error','Production access required');END IF;
 IF p_week IS NULL OR extract(isodow FROM p_week)<>1 THEN RETURN jsonb_build_object('error','Choose a Monday');END IF;
 IF p_action='list' THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('user_id',au.user_id,'employee_name',coalesce(nullif(au.full_name,''),'Team member'),'week_start',p_week,'version',coalesce(s.version,0),'status',CASE WHEN s.fingerprint IS NOT NULL AND s.fingerprint<>x.data->>'fingerprint' THEN 'needs_resubmission' ELSE coalesce(s.status,'draft') END,'submitted_at',s.submitted_at,'reviewed_at',s.reviewed_at,'comment',coalesce(s.comment,''))||x.data),'[]') INTO result FROM public.account_users au LEFT JOIN public.ovrendi_time_submissions s ON s.account_id=au.account_id AND s.user_id=au.user_id AND s.week_start=p_week CROSS JOIN LATERAL (SELECT public.ovrendi_person_week(p_account,au.user_id,p_week) data) x WHERE au.account_id=p_account AND (au.user_id=p_user OR (manager AND s.user_id IS NOT NULL));
  RETURN jsonb_build_object('submissions',result,'can_review',manager);
 END IF;
 IF p_action NOT IN ('submit','approve','return') THEN RETURN jsonb_build_object('error','Invalid action');END IF;
 IF p_action<>'submit' AND NOT manager THEN RETURN jsonb_build_object('error','Manager access required');END IF;
 target:=CASE WHEN p_action='submit' THEN p_user ELSE (p_data->>'user_id')::uuid END;
 IF NOT EXISTS(SELECT 1 FROM public.account_users WHERE account_id=p_account AND user_id=target) THEN RETURN jsonb_build_object('error','Employee not found');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_account::text||target::text||p_week::text,43));
 SELECT * INTO entry FROM public.ovrendi_time_submissions WHERE account_id=p_account AND user_id=target AND week_start=p_week;
 snapshot:=public.ovrendi_person_week(p_account,target,p_week);
 IF (p_data->>'fingerprint') IS DISTINCT FROM snapshot->>'fingerprint' OR coalesce(entry.version,0) IS DISTINCT FROM (p_data->>'version')::integer THEN RETURN jsonb_build_object('error','Timesheet changed. Reload before continuing');END IF;
 IF p_action='submit' THEN
  IF (snapshot->>'sessions')::int=0 OR (snapshot->>'running')::boolean THEN RETURN jsonb_build_object('error','Stop your timers before submitting a non-empty timesheet');END IF;
  IF entry.status IN ('submitted','approved') AND entry.fingerprint=snapshot->>'fingerprint' THEN RETURN jsonb_build_object('ok',true,'notify',false);END IF;
  INSERT INTO public.ovrendi_time_submissions(account_id,user_id,week_start,status,fingerprint) VALUES(p_account,target,p_week,'submitted',snapshot->>'fingerprint') ON CONFLICT(account_id,user_id,week_start) DO UPDATE SET status='submitted',fingerprint=excluded.fingerprint,version=ovrendi_time_submissions.version+1,submitted_at=now(),reviewed_at=NULL,reviewed_by=NULL,comment='';notify:=true;
 ELSE
  IF entry.status IS DISTINCT FROM 'submitted' OR entry.fingerprint IS DISTINCT FROM snapshot->>'fingerprint' THEN RETURN jsonb_build_object('error','This timesheet must be submitted again before review');END IF;
  comment_text:=trim(coalesce(p_data->>'comment',''));
  IF length(comment_text)>1000 OR (p_action='return' AND length(comment_text)=0) THEN RETURN jsonb_build_object('error','Add a return comment (up to 1000 characters)');END IF;
  UPDATE public.ovrendi_time_submissions SET status=CASE WHEN p_action='approve' THEN 'approved' ELSE 'returned' END,version=version+1,reviewed_at=now(),reviewed_by=p_user,comment=comment_text WHERE account_id=p_account AND user_id=target AND week_start=p_week;
 END IF;
 INSERT INTO public.ovrendi_time_audit(account_id,user_id,kind,after_value,reason) VALUES(p_account,p_user,'employee_week_'||p_action,jsonb_build_object('employee',target,'week',p_week,'snapshot',snapshot,'comment',coalesce(comment_text,''),'previous_status',entry.status),'Employee weekly workflow');
 RETURN jsonb_build_object('ok',true,'notify',notify);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_person_week(uuid,uuid,date),public.ovrendi_submit_week(uuid,uuid,date,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_person_week(uuid,uuid,date),public.ovrendi_submit_week(uuid,uuid,date,text,jsonb) TO service_role;
COMMIT;
