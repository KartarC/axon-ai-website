
BEGIN;
CREATE TABLE public.ovrendi_sales (
 id uuid PRIMARY KEY, enquiry_id uuid UNIQUE REFERENCES public.ovrendi_website_enquiries(id),
 account_id uuid REFERENCES public.accounts(id), company text NOT NULL CHECK(length(company) BETWEEN 1 AND 160),
 contact_name text NOT NULL DEFAULT '' CHECK(length(contact_name)<=160), email text NOT NULL DEFAULT '' CHECK(length(email)<=254),
 stage text NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead','qualified','demo','trial','active','paid','lost')),
 owner_name text NOT NULL DEFAULT '' CHECK(length(owner_name)<=160),next_action text NOT NULL DEFAULT '' CHECK(length(next_action)<=300),
 due_date date, estimated_monthly_usd numeric(12,2) NOT NULL DEFAULT 0 CHECK(estimated_monthly_usd>=0),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=6000),lost_reason text NOT NULL DEFAULT '' CHECK(length(lost_reason)<=500),
 version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 stage_changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ovrendi_sales(stage,due_date);
CREATE TABLE public.ovrendi_sales_history (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),sales_id uuid NOT NULL REFERENCES public.ovrendi_sales(id),
 from_stage text,to_stage text NOT NULL,actor_email text NOT NULL,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ovrendi_sales_history(sales_id,created_at);
ALTER TABLE public.ovrendi_crm_tasks ADD COLUMN sales_id uuid REFERENCES public.ovrendi_sales(id), ADD COLUMN template_key text;
CREATE UNIQUE INDEX ovrendi_sales_task_once ON public.ovrendi_crm_tasks(sales_id,template_key) WHERE sales_id IS NOT NULL AND template_key IS NOT NULL;
ALTER TABLE public.ovrendi_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_sales_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_sales,public.ovrendi_sales_history FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.ovrendi_sales TO service_role;
GRANT SELECT,INSERT ON public.ovrendi_sales_history TO service_role;

CREATE FUNCTION public.ovrendi_save_sale(p_id uuid,p_version integer,p_data jsonb,p_actor text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE old public.ovrendi_sales%ROWTYPE; saved public.ovrendi_sales%ROWTYPE; enquiry public.ovrendi_website_enquiries%ROWTYPE; st text;
BEGIN
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('ovrendi_sales',44));
 IF p_version=0 AND nullif(p_data->>'enquiry_id','') IS NOT NULL THEN
  SELECT * INTO saved FROM public.ovrendi_sales WHERE enquiry_id=(p_data->>'enquiry_id')::uuid;
  IF FOUND THEN RETURN to_jsonb(saved); END IF;
  SELECT * INTO enquiry FROM public.ovrendi_website_enquiries WHERE id=(p_data->>'enquiry_id')::uuid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','Enquiry not found.'); END IF;
 END IF;
 SELECT * INTO old FROM public.ovrendi_sales WHERE id=p_id FOR UPDATE;
 IF FOUND AND p_version=0 THEN RETURN to_jsonb(old); END IF;
 IF coalesce(old.version,0)<>p_version THEN RETURN jsonb_build_object('error','This opportunity changed. Refresh and open it again before saving.'); END IF;
 st:=coalesce(p_data->>'stage','lead');
 IF st='lost' AND length(trim(coalesce(p_data->>'lost_reason','')))=0 THEN RETURN jsonb_build_object('error','Record a reason for a lost opportunity.'); END IF;
 IF st IN ('qualified','demo','trial','active') AND (length(trim(coalesce(p_data->>'owner_name','')))=0 OR length(trim(coalesce(p_data->>'next_action','')))=0 OR nullif(p_data->>'due_date','') IS NULL) THEN RETURN jsonb_build_object('error','Set an owner, next action and due date for this stage.'); END IF;
 IF st IN ('trial','active','paid') AND nullif(p_data->>'account_id','') IS NULL THEN RETURN jsonb_build_object('error','Link the company account before moving to this stage.'); END IF;
 IF old.id IS NOT NULL AND old.account_id IS DISTINCT FROM nullif(p_data->>'account_id','')::uuid AND EXISTS(SELECT 1 FROM public.ovrendi_crm_tasks WHERE sales_id=p_id) THEN RETURN jsonb_build_object('error','This opportunity has onboarding tasks. Keep its linked company.'); END IF;
 INSERT INTO public.ovrendi_sales(id,enquiry_id,account_id,company,contact_name,email,stage,owner_name,next_action,due_date,estimated_monthly_usd,notes,lost_reason)
 VALUES(p_id,enquiry.id,nullif(p_data->>'account_id','')::uuid,coalesce(nullif(enquiry.company,''),p_data->>'company'),coalesce(enquiry.name,p_data->>'contact_name',''),coalesce(enquiry.email,p_data->>'email',''),st,coalesce(p_data->>'owner_name',''),coalesce(p_data->>'next_action',''),nullif(p_data->>'due_date','')::date,coalesce((p_data->>'estimated_monthly_usd')::numeric,0),coalesce(p_data->>'notes',''),coalesce(p_data->>'lost_reason',''))
 ON CONFLICT(id) DO UPDATE SET account_id=EXCLUDED.account_id,company=EXCLUDED.company,contact_name=EXCLUDED.contact_name,email=EXCLUDED.email,stage=EXCLUDED.stage,owner_name=EXCLUDED.owner_name,next_action=EXCLUDED.next_action,due_date=EXCLUDED.due_date,estimated_monthly_usd=EXCLUDED.estimated_monthly_usd,notes=EXCLUDED.notes,lost_reason=EXCLUDED.lost_reason,version=public.ovrendi_sales.version+1,updated_at=now(),stage_changed_at=CASE WHEN old.stage IS DISTINCT FROM EXCLUDED.stage THEN now() ELSE old.stage_changed_at END
 RETURNING * INTO saved;
 IF old.stage IS DISTINCT FROM saved.stage THEN INSERT INTO public.ovrendi_sales_history(sales_id,from_stage,to_stage,actor_email) VALUES(saved.id,old.stage,saved.stage,p_actor); END IF;
 RETURN to_jsonb(saved);
END $$;

CREATE FUNCTION public.ovrendi_sales_onboarding(p_id uuid,p_start date)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE s public.ovrendi_sales%ROWTYPE; n integer;
BEGIN
 SELECT * INTO s FROM public.ovrendi_sales WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR s.account_id IS NULL THEN RETURN jsonb_build_object('error','Link a company account before adding onboarding tasks.'); END IF;
 IF s.stage='lost' OR length(trim(s.owner_name))=0 OR p_start IS NULL THEN RETURN jsonb_build_object('error','Choose an owner and start date for an open opportunity.'); END IF;
 INSERT INTO public.ovrendi_crm_tasks(account_id,sales_id,template_key,title,owner_name,due_date,notes)
 SELECT s.account_id,s.id,t.key,t.title,s.owner_name,p_start+t.days,'Sales onboarding for '||s.company||'. Review before contacting the customer.' FROM (VALUES
 ('access','Confirm invitation, sign-in and module access',0),('rates','Validate machine, gas and electricity settings',2),('first_quote','Review the first real quotation with the customer',7),('trial_review','Review pilot progress and agree the next step',14)) AS t(key,title,days)
 ON CONFLICT(sales_id,template_key) WHERE sales_id IS NOT NULL AND template_key IS NOT NULL DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 INSERT INTO public.ovrendi_crm_workflows(account_id,stage,owner_name,next_step,target_date) VALUES(s.account_id,'setup',s.owner_name,'Confirm account access and quoting settings',p_start) ON CONFLICT(account_id) DO NOTHING;
 RETURN jsonb_build_object('created',n);
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_save_sale(uuid,integer,jsonb,text),public.ovrendi_sales_onboarding(uuid,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_save_sale(uuid,integer,jsonb,text),public.ovrendi_sales_onboarding(uuid,date) TO service_role;
COMMIT;
