-- Make admin@gmail.com the designated Super Admin. Run manually in the Supabase SQL editor.
-- Keeps the original session-validating design: public.owner_portal_access() delegates to
-- private.owner_portal_access(), which checks private.is_super_admin() and an unexpired auth session.
-- admin@gmail.com must already exist in auth.users (it does) with its password set.

-- 1) The owner identity check (same logic as before, new email).
create or replace function private.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select auth.uid() is not null and exists (
    select 1 from auth.users u
    join public.profiles p on p.id = u.id
    join public.roles r on r.id = p.role_id
    where u.id = auth.uid() and lower(u.email) = 'admin@gmail.com'
      and u.email_confirmed_at is not null
      and (u.banned_until is null or u.banned_until <= now())
      and p.status = 'active' and r.key = 'super_admin' and r.active = true
  )
$$;

-- 2) Restore the public function to delegate to the private session-checked one.
create or replace function public.owner_portal_access()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$ select private.owner_portal_access() $$;
grant execute on function public.owner_portal_access() to authenticated;

-- 3) admin@gmail.com is the only Super Admin; everyone else with that role becomes Admin.
update public.profiles
   set role_id = (select id from public.roles where key = 'admin')
 where role_id = (select id from public.roles where key = 'super_admin')
   and lower(email) <> 'admin@gmail.com';

update public.profiles
   set role_id = (select id from public.roles where key = 'super_admin'), status = 'active'
 where lower(email) = 'admin@gmail.com';

select p.email, r.key as role, p.status
from public.profiles p join public.roles r on r.id = p.role_id
where r.key in ('super_admin');   -- expect only admin@gmail.com
