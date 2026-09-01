-- Authentication foundation for the Interior Blinds CRM.
-- Run this once in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

create table if not exists public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  is_system_role boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.roles (key, name)
select new_role.key, new_role.name
from (
  values
    ('super_admin', 'Super Admin'),
    ('admin', 'Administrator'),
    ('manager', 'Manager'),
    ('installer', 'Installer')
) as new_role(key, name)
where not exists (
  select 1
  from public.roles existing_role
  where existing_role.key = new_role.key
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  role_id uuid references public.roles(id),
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended', 'blocked', 'deactivated')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Reconcile projects where profiles.status already uses the account_status
-- enum. CREATE TABLE IF NOT EXISTS does not update an existing enum, so make
-- sure it accepts every status used by this CRM before the signup trigger runs.
do $$
declare
  status_value text;
begin
  if to_regtype('public.account_status') is not null then
    foreach status_value in array array[
      'pending',
      'active',
      'suspended',
      'blocked',
      'deactivated'
    ]
    loop
      execute format(
        'alter type public.account_status add value if not exists %L',
        status_value
      );
    end loop;
  end if;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name, role_id, status)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    (select id from public.roles where key = 'installer'),
    'pending'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- CREATE OR REPLACE preserves an old owner. Force the dashboard-created
-- function to run with the postgres owner's privileges so Auth can insert a
-- profile even though profiles has RLS enabled.
alter function public.handle_new_user() owner to postgres;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.is_crm_admin()
returns boolean
language sql
stable
security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.id = auth.uid()
      and p.status = 'active'
      and r.key in ('super_admin', 'admin')
  );
$$;

alter function public.is_crm_admin() owner to postgres;

alter table public.roles enable row level security;
alter table public.profiles enable row level security;

drop policy if exists "authenticated users can read roles" on public.roles;
create policy "authenticated users can read roles"
  on public.roles for select
  to authenticated
  using (true);

drop policy if exists "users can read their profile" on public.profiles;
create policy "users can read their profile"
  on public.profiles for select
  to authenticated
  using (id = auth.uid());

drop policy if exists "admins can read profiles" on public.profiles;
create policy "admins can read profiles"
  on public.profiles for select
  to authenticated
  using (public.is_crm_admin());

drop policy if exists "admins can update profiles" on public.profiles;
create policy "admins can update profiles"
  on public.profiles for update
  to authenticated
  using (public.is_crm_admin())
  with check (public.is_crm_admin());

grant usage on schema public to authenticated;
grant select on public.roles to authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, role_id, status, updated_at) on public.profiles to authenticated;

-- After your first signup, bootstrap that user once in the SQL Editor:
-- update public.profiles
-- set status = 'active',
--     role_id = (select id from public.roles where key = 'super_admin'),
--     updated_at = now()
-- where id = (select id from auth.users order by created_at asc limit 1);
