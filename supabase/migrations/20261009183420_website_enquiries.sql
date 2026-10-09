BEGIN;
CREATE TABLE public.ovrendi_website_enquiries (
 id uuid PRIMARY KEY, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
 email text NOT NULL CHECK(length(email)<=254), company text NOT NULL DEFAULT '' CHECK(length(company)<=160),
 topic text NOT NULL CHECK(topic IN ('ERP','CRM','Studio','AI','Support','Privacy','Other')),
 message text NOT NULL CHECK(length(message) BETWEEN 1 AND 6000), status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','in_progress','resolved','closed')),
 staff_notes text NOT NULL DEFAULT '' CHECK(length(staff_notes)<=4000), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 privacy_notice_version text NOT NULL DEFAULT '2026-10-09'
);
CREATE INDEX ON public.ovrendi_website_enquiries(created_at DESC);
ALTER TABLE public.ovrendi_website_enquiries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_website_enquiries FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.ovrendi_website_enquiries TO service_role;
CREATE FUNCTION public.ovrendi_contact_allow(p_bucket text) RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE n int; BEGIN
 INSERT INTO public.ovrendi_event_limits(bucket,hits,expires_at) VALUES('contact:'||p_bucket,1,now()+interval '2 hours')
 ON CONFLICT(bucket) DO UPDATE SET hits=public.ovrendi_event_limits.hits+1 RETURNING hits INTO n;
 RETURN n<=5;
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_contact_allow(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_contact_allow(text) TO service_role;
ALTER TABLE public.ovrendi_web_events DROP CONSTRAINT ovrendi_web_events_form_check;
ALTER TABLE public.ovrendi_web_events ADD CONSTRAINT ovrendi_web_events_form_check CHECK(form IN ('','demo','signup','contact'));
COMMIT;
