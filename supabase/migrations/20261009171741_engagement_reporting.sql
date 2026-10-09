
CREATE TABLE public.ovrendi_bug_reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), account_id uuid NOT NULL REFERENCES public.accounts(id),
 user_id uuid NOT NULL REFERENCES auth.users(id), title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
 details text NOT NULL CHECK(length(details) BETWEEN 1 AND 6000), page text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'new' CHECK(status IN ('new','investigating','resolved','closed')),
 staff_notes text NOT NULL DEFAULT '', created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ovrendi_bug_reports(account_id,created_at DESC);
CREATE TABLE public.ovrendi_user_presence (
 account_id uuid NOT NULL REFERENCES public.accounts(id), user_id uuid NOT NULL REFERENCES auth.users(id),
 last_seen_at timestamptz NOT NULL DEFAULT now(), page text NOT NULL DEFAULT '', PRIMARY KEY(account_id,user_id)
);
CREATE TABLE public.ovrendi_web_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), session_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN ('page_view','form_start','cta_click','form_success')),
 page text NOT NULL CHECK(length(page)<=120), source text NOT NULL DEFAULT '' CHECK(length(source)<=80),
 form text NOT NULL DEFAULT '' CHECK(form IN ('','demo','signup')), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON public.ovrendi_web_events(created_at DESC);
CREATE INDEX ON public.ovrendi_web_events(session_id,created_at DESC);
ALTER TABLE public.ovrendi_bug_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_user_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ovrendi_web_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_bug_reports,public.ovrendi_user_presence,public.ovrendi_web_events FROM anon,authenticated;
GRANT ALL ON public.ovrendi_bug_reports,public.ovrendi_user_presence,public.ovrendi_web_events TO service_role;
CREATE FUNCTION public.ovrendi_customer_activity() RETURNS TABLE(account_id uuid,user_id uuid,full_name text,email text,last_login_at timestamptz,last_seen_at timestamptz,page text,recently_active boolean)
LANGUAGE sql SET search_path='' AS $$
 SELECT au.account_id,au.user_id,au.full_name,u.email::text,u.last_sign_in_at,p.last_seen_at,p.page,
 coalesce(p.last_seen_at>now()-interval '5 minutes',false)
 FROM public.account_users au JOIN auth.users u ON u.id=au.user_id
 LEFT JOIN public.ovrendi_user_presence p ON p.account_id=au.account_id AND p.user_id=au.user_id
 ORDER BY p.last_seen_at DESC NULLS LAST LIMIT 2000
$$;
CREATE FUNCTION public.ovrendi_web_summary() RETURNS jsonb LANGUAGE sql SET search_path='' AS $$
 WITH events AS (SELECT * FROM public.ovrendi_web_events WHERE created_at>now()-interval '30 days'),
 totals AS (SELECT count(*) FILTER(WHERE kind='page_view') AS page_views,count(*) FILTER(WHERE kind='cta_click') AS cta_clicks,count(DISTINCT session_id) FILTER(WHERE kind='page_view') AS visits,
 count(DISTINCT session_id) FILTER(WHERE kind='form_success' AND session_id IN (SELECT session_id FROM events WHERE kind='page_view')) AS converted_visits FROM events),
 pages AS (SELECT page,count(*) AS views FROM events WHERE kind='page_view' GROUP BY page ORDER BY views DESC LIMIT 30),
 sources AS (SELECT source,count(DISTINCT session_id) AS visits FROM events WHERE kind='page_view' GROUP BY source ORDER BY visits DESC LIMIT 20),
 forms AS (SELECT form,count(DISTINCT session_id) FILTER(WHERE kind='form_start') AS starts,count(DISTINCT session_id) FILTER(WHERE kind='form_success') AS successes FROM events WHERE form<>'' GROUP BY form),
 daily AS (SELECT (created_at AT TIME ZONE 'UTC')::date AS day,count(*) FILTER(WHERE kind='page_view') AS views,count(DISTINCT session_id) FILTER(WHERE kind='form_success') AS conversions FROM events GROUP BY 1 ORDER BY 1)
 SELECT jsonb_build_object('totals',(SELECT to_jsonb(t) FROM totals t),'pages',coalesce((SELECT jsonb_agg(p) FROM pages p),'[]'::jsonb),'sources',coalesce((SELECT jsonb_agg(s) FROM sources s),'[]'::jsonb),'forms',coalesce((SELECT jsonb_agg(f) FROM forms f),'[]'::jsonb),'daily',coalesce((SELECT jsonb_agg(d) FROM daily d),'[]'::jsonb))
$$;
REVOKE ALL ON FUNCTION public.ovrendi_customer_activity(),public.ovrendi_web_summary() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_customer_activity(),public.ovrendi_web_summary() TO service_role;

CREATE TABLE public.ovrendi_event_limits (bucket text PRIMARY KEY,hits int NOT NULL,expires_at timestamptz NOT NULL);
ALTER TABLE public.ovrendi_event_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ovrendi_event_limits FROM anon,authenticated;
GRANT ALL ON public.ovrendi_event_limits TO service_role;
CREATE FUNCTION public.ovrendi_event_allow(p_bucket text) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE n int;
BEGIN
 INSERT INTO public.ovrendi_event_limits(bucket,hits,expires_at) VALUES(p_bucket,1,now()+interval '2 minutes')
 ON CONFLICT(bucket) DO UPDATE SET hits=public.ovrendi_event_limits.hits+1 RETURNING hits INTO n;
 RETURN n<=120;
END $$;
REVOKE ALL ON FUNCTION public.ovrendi_event_allow(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_event_allow(text) TO service_role;
