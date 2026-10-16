-- Generic CRM record store. One row per CRM record (lead, job, quote, invoice, ...).
-- Requires: public.roles, public.profiles (auth foundation) and public.owner_portal_access().
-- Review before applying. Does not touch existing tables.

create table if not exists public.crm_records (
  collection text not null,
  id text not null,
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  primary key (collection, id)
);

create index if not exists crm_records_collection_idx on public.crm_records (collection);

create or replace function public.crm_role()
returns text
language sql
stable
security definer set search_path = ''
as $$
  select r.key
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.id = auth.uid() and p.status = 'active';
$$;
revoke all on function public.crm_role() from public;
grant execute on function public.crm_role() to authenticated;

create or replace function public.crm_records_touch()
returns trigger
language plpgsql
security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists crm_records_touch on public.crm_records;
create trigger crm_records_touch
  before insert or update on public.crm_records
  for each row execute function public.crm_records_touch();

alter table public.crm_records enable row level security;

-- Collections only the verified owner may change (access settings, email config).
-- Operational collections follow the role rules below.
drop policy if exists "staff read records" on public.crm_records;
create policy "staff read records" on public.crm_records for select to authenticated
  using (public.crm_role() in ('super_admin','admin','manager','installer'));

drop policy if exists "staff insert records" on public.crm_records;
create policy "staff insert records" on public.crm_records for insert to authenticated
  with check (
    case
      when collection in ('accessControl','emailConfig') then public.owner_portal_access()
      when public.crm_role() in ('super_admin','admin','manager') then true
      when public.crm_role() = 'installer' then collection in
        ('jobs','tasks','messages','conversations','logs','notifications','stockMovements','pickLists','returns')
      else false
    end);

drop policy if exists "staff update records" on public.crm_records;
create policy "staff update records" on public.crm_records for update to authenticated
  using (
    case
      when collection in ('accessControl','emailConfig') then public.owner_portal_access()
      when public.crm_role() in ('super_admin','admin','manager') then true
      when public.crm_role() = 'installer' then collection in
        ('jobs','tasks','messages','conversations','logs','notifications','stockMovements','pickLists','returns')
      else false
    end)
  with check (
    case
      when collection in ('accessControl','emailConfig') then public.owner_portal_access()
      when public.crm_role() in ('super_admin','admin','manager') then true
      when public.crm_role() = 'installer' then collection in
        ('jobs','tasks','messages','conversations','logs','notifications','stockMovements','pickLists','returns')
      else false
    end);

drop policy if exists "managers delete records" on public.crm_records;
create policy "managers delete records" on public.crm_records for delete to authenticated
  using (
    case
      when collection in ('accessControl','emailConfig') then public.owner_portal_access()
      else public.crm_role() in ('super_admin','admin','manager')
    end);

grant select, insert, update, delete on public.crm_records to authenticated;

-- Staff directory: lets every active staff member see names/roles of colleagues
-- (profiles RLS only exposes your own row to non-admins). Read-only, no email-less rows.
create or replace function public.crm_staff()
returns table (id uuid, email text, full_name text, role_key text, role_name text)
language sql
stable
security definer set search_path = ''
as $$
  select p.id, p.email, p.full_name, r.key, r.name
  from public.profiles p
  join public.roles r on r.id = p.role_id
  where p.status = 'active'
    and public.crm_role() in ('super_admin','admin','manager','installer');
$$;
revoke all on function public.crm_staff() from public;
grant execute on function public.crm_staff() to authenticated;

-- Private storage bucket for installation proof photos/videos and return forms.
insert into storage.buckets (id, name, public)
values ('crm-media', 'crm-media', false)
on conflict (id) do nothing;

drop policy if exists "staff read media" on storage.objects;
create policy "staff read media" on storage.objects for select to authenticated
  using (bucket_id = 'crm-media'
    and public.crm_role() in ('super_admin','admin','manager','installer'));

drop policy if exists "staff upload media" on storage.objects;
create policy "staff upload media" on storage.objects for insert to authenticated
  with check (bucket_id = 'crm-media'
    and public.crm_role() in ('super_admin','admin','manager','installer'));

drop policy if exists "staff delete media" on storage.objects;
create policy "staff delete media" on storage.objects for delete to authenticated
  using (bucket_id = 'crm-media'
    and public.crm_role() in ('super_admin','admin','manager','installer'));
