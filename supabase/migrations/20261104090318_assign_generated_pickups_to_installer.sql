-- Register the two field workflows in the existing access registry. Master
-- Control already supports global, role and profile rules for every module.
insert into public.system_modules (key, name, platform_scope, route_key, is_active)
values ('picking', 'Picking & Scan', 'all', '/picking', true),
       ('returns', 'Returns', 'all', '/returns', true)
on conflict (key) do nothing;

insert into public.permissions (key, module_id, action, description)
select m.key || '.' || action.name, m.id, action.name,
       m.name || ' ' || action.name
from public.system_modules m
cross join (values ('view'), ('update')) action(name)
where m.key in ('picking', 'returns')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id, effect)
select r.id, p.id, 'allow'::public.permission_effect
from public.roles r
join public.permissions p on p.key in (
  'picking.view', 'picking.update', 'returns.view', 'returns.update'
)
where r.key in ('super_admin', 'admin', 'manager', 'installer')
on conflict (role_id, permission_id) do nothing;

-- Viewing inventory is already an installer role permission. Its snapshot
-- function used to reject installers regardless of their effective grants.
create or replace function private.inventory_require_access(p_module text, p_action text)
returns void language plpgsql stable set search_path = '' as $$
begin
  if auth.uid() is null
     or coalesce((auth.jwt()->>'is_anonymous')::boolean, false)
     or (private.current_role_key() not in ('super_admin','admin','manager')
         and not (private.current_role_key() = 'installer'
                  and p_module = 'inventory' and p_action = 'view'))
     or not private.has_module_access(p_module, 'view', 'web')
     or not private.has_module_access(p_module, p_action, 'web') then
    raise exception 'Permission denied for %.%', p_module, p_action
      using errcode = '42501';
  end if;
end $$;

-- The quote-to-job RPC currently assigns the generated pickup task and Pick
-- List to a manager even when the job already has an installer.
do $$
declare source text;
begin
  select pg_get_functiondef(p.oid) into strict source
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'crm_job_workflow_command';
  if position('''schedule-work'',''confirm-location'',''resolve-shortage''' in source) = 0
     or position('''assignedTo'',coalesce(manager_id,actor::text)' in source) = 0 then
    raise exception 'Review changed quote-to-job assignment before applying migration';
  end if;
  source := replace(source,
    '''schedule-work'',''confirm-location'',''resolve-shortage''',
    '''schedule-work'',''resolve-shortage''');
  source := replace(source,
    '''assignedTo'',coalesce(manager_id,actor::text),''status'',''Pending''',
    '''assignedTo'',coalesce(nullif(j->>''installerId'',''''),manager_id,actor::text),''status'',''Pending''');
  execute source;
end $$;

create or replace function private.assign_installer_job_work()
returns trigger language plpgsql security definer set search_path = '' as $$
declare installer_id text;
begin
  if new.collection not in ('tasks', 'pickLists') or new.data->>'jobId' is null
     or new.data->>'status' in ('Completed', 'Not applicable', 'Matched', 'Collected')
     or new.data->>'requestId' is not null or new.data->>'returnId' is not null
     or new.data->>'workflowAction' in
       ('replacement-approval', 'return-plan', 'return-receive') then
    return new;
  end if;
  select data->>'installerId' into installer_id
  from public.crm_records
  where collection = 'jobs' and id = new.data->>'jobId';
  if nullif(installer_id, '') is not null then
    new.data := jsonb_set(new.data, '{assignedTo}', to_jsonb(installer_id), true);
  end if;
  return new;
end $$;

create trigger ab_assign_installer_job_work
before insert or update on public.crm_records
for each row execute function private.assign_installer_job_work();

create or replace function private.reassign_installer_job_work()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.collection = 'jobs' and tg_op = 'UPDATE'
     and new.data->>'installerId' is distinct from old.data->>'installerId'
     and nullif(new.data->>'installerId', '') is not null then
    update public.crm_records work
    set data = jsonb_set(work.data, '{assignedTo}',
                         to_jsonb(new.data->>'installerId'), true)
    where work.collection in ('tasks', 'pickLists')
      and work.data->>'jobId' = new.id
      and work.data->>'status' not in
        ('Completed', 'Not applicable', 'Matched', 'Collected')
      and work.data->>'requestId' is null and work.data->>'returnId' is null
      and work.data->>'workflowAction' not in
        ('replacement-approval', 'return-plan', 'return-receive')
      and work.data->>'assignedTo' is distinct from new.data->>'installerId';
  end if;
  return null;
end $$;

create trigger zy_reassign_installer_job_work
after update on public.crm_records
for each row execute function private.reassign_installer_job_work();

-- Reconcile only outstanding operational work; completed history and manager
-- approval tasks remain untouched.
update public.crm_records work
set data = jsonb_set(work.data, '{assignedTo}',
                     to_jsonb(job.data->>'installerId'), true)
from public.crm_records job
where job.collection = 'jobs' and job.id = work.data->>'jobId'
  and work.collection in ('tasks', 'pickLists')
  and nullif(job.data->>'installerId', '') is not null
  and work.data->>'status' not in
    ('Completed', 'Not applicable', 'Matched', 'Collected')
  and work.data->>'requestId' is null and work.data->>'returnId' is null
  and work.data->>'workflowAction' not in
    ('replacement-approval', 'return-plan', 'return-receive')
  and work.data->>'assignedTo' is distinct from job.data->>'installerId';
