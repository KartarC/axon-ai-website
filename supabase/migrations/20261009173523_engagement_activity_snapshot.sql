
ALTER TABLE public.ovrendi_user_presence ALTER COLUMN last_seen_at DROP NOT NULL;
ALTER TABLE public.ovrendi_user_presence ALTER COLUMN last_seen_at DROP DEFAULT;
ALTER TABLE public.ovrendi_user_presence ADD COLUMN last_login_at timestamptz, ADD COLUMN email text;
INSERT INTO public.ovrendi_user_presence(account_id,user_id,last_login_at,email)
 SELECT au.account_id,au.user_id,u.last_sign_in_at,u.email FROM public.account_users au JOIN auth.users u ON u.id=au.user_id
 ON CONFLICT(account_id,user_id) DO NOTHING;
CREATE OR REPLACE FUNCTION public.ovrendi_customer_activity() RETURNS TABLE(account_id uuid,user_id uuid,full_name text,email text,last_login_at timestamptz,last_seen_at timestamptz,page text,recently_active boolean)
LANGUAGE sql SET search_path='' AS $$
 SELECT au.account_id,au.user_id,au.full_name,p.email,p.last_login_at,p.last_seen_at,p.page,
 coalesce(p.last_seen_at>now()-interval '5 minutes',false)
 FROM public.account_users au LEFT JOIN public.ovrendi_user_presence p ON p.account_id=au.account_id AND p.user_id=au.user_id
 ORDER BY p.last_seen_at DESC NULLS LAST LIMIT 2000
$$;
REVOKE ALL ON FUNCTION public.ovrendi_customer_activity() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.ovrendi_customer_activity() TO service_role;
