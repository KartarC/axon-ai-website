CREATE TABLE public.ovrendi_crm_contacts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES public.accounts(id),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120), email text NOT NULL DEFAULT '',
 phone text NOT NULL DEFAULT '', notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ovrendi_crm_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid REFERENCES public.accounts(id),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 200), owner_name text NOT NULL DEFAULT '',
 due_date date, status text NOT NULL DEFAULT 'todo' CHECK(status IN ('todo','doing','blocked','done')),
 notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ovrendi_crm_workflows (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL UNIQUE REFERENCES public.accounts(id),
 stage text NOT NULL DEFAULT 'discovery' CHECK(stage IN ('discovery','setup','invited','training','pilot','live')),
 owner_name text NOT NULL DEFAULT '', next_step text NOT NULL DEFAULT '', target_date date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.ovrendi_crm_activity (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid, resource text NOT NULL,
 action text NOT NULL, record_id uuid, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION public.ovrendi_crm_audit() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO public.ovrendi_crm_activity(account_id,resource,action,record_id)
 VALUES(CASE WHEN TG_TABLE_NAME='accounts' THEN NEW.id ELSE (to_jsonb(NEW)->>'account_id')::uuid END,TG_TABLE_NAME,TG_OP,NEW.id);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_crm_audit() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_crm_audit() TO service_role;
CREATE TRIGGER ovrendi_crm_accounts_audit AFTER INSERT OR UPDATE OF name,plan,modules,status ON public.accounts FOR EACH ROW EXECUTE FUNCTION public.ovrendi_crm_audit();
CREATE TRIGGER ovrendi_crm_contacts_audit AFTER INSERT OR UPDATE ON public.ovrendi_crm_contacts FOR EACH ROW EXECUTE FUNCTION public.ovrendi_crm_audit();
CREATE TRIGGER ovrendi_crm_tasks_audit AFTER INSERT OR UPDATE ON public.ovrendi_crm_tasks FOR EACH ROW EXECUTE FUNCTION public.ovrendi_crm_audit();
CREATE TRIGGER ovrendi_crm_workflows_audit AFTER INSERT OR UPDATE ON public.ovrendi_crm_workflows FOR EACH ROW EXECUTE FUNCTION public.ovrendi_crm_audit();
ALTER TABLE public.ovrendi_crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_crm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_crm_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_crm_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_crm_contacts,public.ovrendi_crm_tasks,public.ovrendi_crm_workflows,public.ovrendi_crm_activity FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.ovrendi_crm_contacts,public.ovrendi_crm_tasks,public.ovrendi_crm_workflows,public.ovrendi_crm_activity TO service_role;
CREATE INDEX ON public.ovrendi_crm_contacts(account_id);
CREATE INDEX ON public.ovrendi_crm_tasks(account_id);
CREATE INDEX ON public.ovrendi_crm_activity(created_at DESC);
