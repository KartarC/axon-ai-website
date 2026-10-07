create table public.ovrendi_internal_staff (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  user_id uuid unique references auth.users(id) on delete set null,
  active boolean not null default true,
  setup_token_hash text unique,
  setup_expires_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.ovrendi_internal_staff enable row level security;
revoke all on public.ovrendi_internal_staff from public, anon, authenticated;
grant all on public.ovrendi_internal_staff to service_role;
create function public.ovrendi_internal_session_valid(p_user_id uuid, p_session_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
 select exists(select 1 from auth.sessions s join public.ovrendi_internal_staff a on a.user_id=s.user_id
 where a.active and s.id=p_session_id and s.user_id=p_user_id
 and (s.not_after is null or s.not_after > now()));
$$;
revoke all on function public.ovrendi_internal_session_valid(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ovrendi_internal_session_valid(uuid,uuid) to service_role;
