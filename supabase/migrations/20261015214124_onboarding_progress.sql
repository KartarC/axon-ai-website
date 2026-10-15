create table public.ovrendi_onboarding_progress (
 account_id uuid not null references public.accounts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 task_id text not null check(task_id in ('company','quoting-rates','quoting-first','production-first','costing-first','traveler-first')),
 completed boolean not null default false,
 updated_at timestamptz not null default now(),
 primary key(account_id,user_id,task_id)
);
alter table public.ovrendi_onboarding_progress enable row level security;
revoke all on public.ovrendi_onboarding_progress from public,anon,authenticated;
grant select,insert,update,delete on public.ovrendi_onboarding_progress to service_role;
comment on table public.ovrendi_onboarding_progress is 'User-reported onboarding checklist, accessed through authenticated account-scoped API; not verified task completion.';
