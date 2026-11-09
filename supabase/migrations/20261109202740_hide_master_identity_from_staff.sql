-- Keep the master identity and its activity out of staff data responses.
-- The existing permissive policies remain; these restrictive policies apply
-- to every authenticated SELECT path, including the Data API.

create or replace function private.crm_identity_is_master(p_id text)
returns boolean
language sql stable security definer
set search_path to ''
as $function$
  select exists (
    select 1 from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id::text = p_id and r.key = 'super_admin'
  )
$function$;

revoke all on function private.crm_identity_is_master(text) from public, anon;
grant execute on function private.crm_identity_is_master(text) to authenticated;

create policy master_profile_hidden_from_staff on public.profiles
as restrictive for select to authenticated
using (
  private.current_role_key() = 'super_admin'
  or not private.crm_identity_is_master(id::text)
);

create policy master_profile_staff_update_guard on public.profiles
as restrictive for update to authenticated
using (
  private.current_role_key() = 'super_admin'
  or not private.crm_identity_is_master(id::text)
)
with check (
  private.current_role_key() = 'super_admin'
  or not private.crm_identity_is_master(id::text)
);

create or replace function public.crm_staff()
returns table(id uuid, email text, full_name text, role_key text, role_name text)
language sql stable security definer
set search_path to ''
as $function$
  select p.id, p.email, p.full_name, r.key, r.name
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.status = 'active'
    and public.crm_role() in ('super_admin','admin','manager','installer')
    and (private.current_role_key() = 'super_admin' or r.key <> 'super_admin')
$function$;

create policy master_logs_hidden_from_staff on public.crm_records
as restrictive for select to authenticated
using (
  collection <> 'logs'
  or (
    private.can_view_actor_log(data->>'actorRole')
    and (
      private.current_role_key() = 'super_admin'
      or not private.crm_identity_is_master(data->>'userId')
    )
  )
);

create policy master_audit_hidden_from_staff on public.audit_logs
as restrictive for select to authenticated
using (
  private.current_role_key() = 'super_admin'
  or not private.crm_identity_is_master(actor_user_id::text)
);

create policy master_security_events_hidden_from_staff on public.privileged_security_events
as restrictive for select to authenticated
using (
  private.current_role_key() = 'super_admin'
  or not private.crm_identity_is_master(real_actor_user_id::text)
);

notify pgrst, 'reload schema';
