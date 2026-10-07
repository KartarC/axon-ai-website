-- service_role cannot read auth.sessions. Expose only this boolean check, never session rows.
alter function public.ovrendi_internal_session_valid(uuid,uuid) security definer;
revoke all on function public.ovrendi_internal_session_valid(uuid,uuid) from public, anon, authenticated;
grant execute on function public.ovrendi_internal_session_valid(uuid,uuid) to service_role;
