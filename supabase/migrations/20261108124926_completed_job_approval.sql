-- Completed-job approval for the current crm_records job workflow.
-- Independent of inventory allocation approval and all billing/payment state.
begin;
create table public.job_approval_state (
 job_collection text not null default 'jobs' check(job_collection='jobs'),
 job_id text primary key,
 revision bigint not null default 1 check(revision>0),
 approval_id uuid,
 updated_at timestamptz not null default now(),
 foreign key(job_collection,job_id) references public.crm_records(collection,id) on delete cascade
);
create table public.job_approval_history (
 id uuid primary key default gen_random_uuid(), job_id text not null,
 job_collection text not null default 'jobs' check(job_collection='jobs'),
 revision bigint not null, approved_by uuid references public.profiles(id) on delete set null,
 reviewer_name text not null, approved_at timestamptz not null default now(),
 review_notes text not null default '' check(length(review_notes)<=4000),
 review_snapshot jsonb not null,
 invalidated_at timestamptz, invalidated_by uuid references public.profiles(id) on delete set null,
 invalidation_reason text,
 unique(job_id,revision),
 foreign key(job_collection,job_id) references public.crm_records(collection,id) on delete restrict
);
alter table public.job_approval_state add foreign key(approval_id) references public.job_approval_history(id);
create index job_approval_reviewer on public.job_approval_history(approved_by);
create index job_approval_invalidated_by on public.job_approval_history(invalidated_by);
create table public.job_approval_notifications (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 job_id text not null references public.job_approval_state(job_id) on delete cascade,
 revision bigint not null, event text not null check(event in ('pending','approved')),
 title text not null, body text not null, created_at timestamptz not null default now(), read_at timestamptz,
 unique(user_id,job_id,revision,event)
);
create index job_approval_notifications_recipient on public.job_approval_notifications(user_id,created_at desc);
create index job_approval_notifications_job on public.job_approval_notifications(job_id);
create index if not exists crm_review_related_jobs on public.crm_records(collection,(data->>'jobId')) where collection in ('tasks','returns');

-- Read authorization uses the existing resolver, including revoked Auth sessions.
create function private.job_review_visible(p_job_id text) returns boolean
language sql stable security definer set search_path='' as $$
 select private.has_module_access('jobs','view','web') and exists(
  select 1 from public.crm_records j where j.collection='jobs' and j.id=p_job_id and
  (private.current_role_key() in ('super_admin','admin','manager') or j.data->>'installerId'=auth.uid()::text
   or exists(select 1 from public.crm_records t where t.collection='tasks' and t.data->>'jobId'=j.id and t.data->>'assignedTo'=auth.uid()::text)))
$$;

-- Offline recipients need no active session. Resolve their stored grants and
-- module locks without impersonating them or changing request JWT settings.
create function private.job_review_recipient(p_user uuid) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare rid uuid; role_key text; eff public.permission_effect; module_state public.access_state; cfg jsonb; act text;
begin
 select p.role_id,r.key into rid,role_key from public.profiles p join public.roles r on r.id=p.role_id
 join auth.users u on u.id=p.id where p.id=p_user and p.status='active' and r.active
 and (u.banned_until is null or u.banned_until<=now());
 if role_key='super_admin' then return exists(select 1 from auth.users where id=p_user and lower(email)='annasabbas01@gmail.com' and email_confirmed_at is not null); end if;
 if role_key is null or role_key not in ('admin','manager') then return false; end if;
 if not exists(select 1 from public.system_modules where key='jobs' and is_active) then return false; end if;
 if exists(select 1 from public.system_lock_rules where is_locked and (scope='global' or (scope='platform' and platform='web')) and (starts_at is null or starts_at<=now()) and (ends_at is null or ends_at>now())) then return false; end if;
 select data into cfg from public.crm_records where collection='accessControl' and id='_';
 if cfg#>'{locks,pages,jobs}'='true'::jsonb or cfg#>'{global,pages,jobs}'='false'::jsonb or cfg#>array['users',p_user::text,'pages','jobs']='false'::jsonb then return false; end if;
 if exists(select 1 from public.module_access_rules mar join public.system_modules sm on sm.id=mar.module_id where sm.key='jobs' and mar.scope_type='global' and mar.access_state in ('locked','disabled') and mar.platform in ('all','web') and (mar.starts_at is null or mar.starts_at<=now()) and (mar.ends_at is null or mar.ends_at>now())) then return false; end if;
 select mar.access_state into module_state from public.module_access_rules mar join public.system_modules sm on sm.id=mar.module_id
 where sm.key='jobs' and mar.platform in ('all','web') and (mar.starts_at is null or mar.starts_at<=now()) and (mar.ends_at is null or mar.ends_at>now())
 and ((mar.scope_type='user' and mar.user_id=p_user) or (mar.scope_type='role' and mar.role_id=rid) or mar.scope_type='global')
 order by case mar.scope_type when 'user' then 3 when 'role' then 2 else 1 end desc,case when mar.platform='web' then 1 else 0 end desc,mar.updated_at desc limit 1;
 if module_state in ('readonly','disabled','locked') then return false; end if;
 foreach act in array array['view','approve'] loop
  eff:=null;
  select up.effect into eff from public.user_permissions up join public.permissions pe on pe.id=up.permission_id where up.user_id=p_user and pe.key='jobs.'||act and (up.starts_at is null or up.starts_at<=now()) and (up.ends_at is null or up.ends_at>now());
  if eff is null then select rp.effect into eff from public.role_permissions rp join public.permissions pe on pe.id=rp.permission_id where rp.role_id=rid and pe.key='jobs.'||act; end if;
  if eff is distinct from 'allow'::public.permission_effect then return false; end if;
 end loop;
 return true;
end $$;

alter table public.job_approval_state enable row level security;
alter table public.job_approval_history enable row level security;
alter table public.job_approval_notifications enable row level security;
revoke all on public.job_approval_state,public.job_approval_history,public.job_approval_notifications from public,anon,authenticated;
grant select on public.job_approval_state,public.job_approval_history,public.job_approval_notifications to authenticated;
create policy job_approval_state_read on public.job_approval_state for select to authenticated using(private.job_review_visible(job_id));
create policy job_approval_history_read on public.job_approval_history for select to authenticated using(private.job_review_visible(job_id));
create policy job_approval_notification_read on public.job_approval_notifications for select to authenticated using(user_id=(select auth.uid()) and private.job_review_visible(job_id) and (event='approved' or ((select private.current_role_key()) in ('super_admin','admin','manager') and (select private.has_module_access('jobs','approve','web')))));

create function private.job_review_material(j jsonb) returns jsonb language sql immutable set search_path='' as $$
 select jsonb_build_object('installer',j->'installerId','items',j->'items','extraItems',j->'extraItems',
 'proof',j->'installationProof','photos',j->'photos','evidenceRequiredAfter',j->'evidenceRequiredAfter',
 'collectionIssuedAt',j->'collectionIssuedAt','address',j->'address','suburb',j->'suburb','service',j->'service','notes',j->'notes')
$$;
create function private.job_review_notify(p_job text) returns void
language plpgsql security definer set search_path='' as $$
declare j jsonb; rev bigint;
begin
 select c.data,s.revision into j,rev from public.crm_records c join public.job_approval_state s on s.job_id=c.id where c.collection='jobs' and c.id=p_job and s.approval_id is null;
 if j->>'status' is distinct from 'Completed' then return; end if;
 insert into public.job_approval_notifications(user_id,job_id,revision,event,title,body)
 select p.id,p_job,rev,'pending','Job approval required',coalesce(j->>'number',p_job)||' · '||coalesce(j->>'customer','')||' is completed and pending approval.' from public.profiles p where private.job_review_recipient(p.id)
 on conflict(user_id,job_id,revision,event) do nothing;
end $$;

create function private.job_review_changed(p_job text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare old_approval uuid;
begin
 -- Parent row first for every command/child change, then approval state.
 perform 1 from public.crm_records where collection='jobs' and id=p_job for update;
 if not found then return; end if;
 insert into public.job_approval_state(job_id) values(p_job) on conflict do nothing;
 select approval_id into old_approval from public.job_approval_state where job_id=p_job for update;
 if old_approval is not null then
  update public.job_approval_history set invalidated_at=now(),invalidated_by=auth.uid(),invalidation_reason=p_reason where id=old_approval and invalidated_at is null;
 end if;
 update public.job_approval_state set revision=revision+1,approval_id=null,updated_at=now() where job_id=p_job;
 perform private.job_review_notify(p_job);
end $$;

-- JSON never carries authoritative approval. Strip spoofed or stale projection
-- fields, even for admins; only the approval RPC can write the review tables.
create function private.job_review_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.collection='jobs' then
  if lower(trim(new.data->>'status')) in ('approved','pending approval') then raise exception 'Approval must stay separate from operational job status'; end if;
  if auth.uid() is null or private.current_role_key() is null or not private.has_module_access('jobs','update','web') then raise exception 'jobs.update permission required' using errcode='42501'; end if;
  if private.current_role_key()='installer' and
   ((tg_op='INSERT' and new.data->>'installerId' is distinct from auth.uid()::text) or
    (tg_op='UPDATE' and (not private.job_review_visible(old.id) or new.data->>'installerId' is distinct from old.data->>'installerId'))) then raise exception 'Assigned job required' using errcode='42501'; end if;
  new.data:=new.data-array['approvalStatus','approval_status','approvedBy','approved_by','approvedAt','approved_at','reviewNotes','review_notes','approval','approvalRevision'];
 end if;
 return new;
end $$;
create trigger job_review_guard before insert or update on public.crm_records for each row execute function private.job_review_guard();

create function private.job_review_record_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb; b jsonb; col text; jid text;
begin
 if tg_op<>'INSERT' then a:=old.data; end if;
 if tg_op<>'DELETE' then b:=new.data; end if;
 col:=coalesce(new.collection,old.collection);
 if col='jobs' then
  if tg_op='INSERT' then
   insert into public.job_approval_state(job_id) values(new.id) on conflict do nothing;
   perform private.job_review_notify(new.id);
  elsif tg_op='UPDATE' and (private.job_review_material(a) is distinct from private.job_review_material(b) or a->>'status' is distinct from b->>'status') then
   perform private.job_review_changed(new.id,case when b->>'status'<>'Completed' then 'Job reopened or operational stage changed' else 'Job work or evidence changed' end);
  end if;
 elsif col in ('tasks','returns') and (a-array['updatedAt','timeline','readBy']) is distinct from (b-array['updatedAt','timeline','readBy']) then
  for jid in select distinct x from unnest(array[a->>'jobId',b->>'jobId']) x where x is not null order by x loop
   perform private.job_review_changed(jid,case when col='tasks' then 'Linked task changed' else 'Related return changed' end);
  end loop;
 end if;
 return null;
end $$;
create trigger job_review_record_changed after insert or update or delete on public.crm_records for each row execute function private.job_review_record_changed();

-- Replacing/removing a saved file is a material evidence change even when its
-- JSON metadata is untouched. Preserve history and revoke the current approval.
create function private.job_review_media_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare jid text; a jsonb; b jsonb;
begin
 if tg_op='UPDATE' and (to_jsonb(old)-array['updated_at','last_accessed_at']) is not distinct from (to_jsonb(new)-array['updated_at','last_accessed_at']) then return null; end if;
 if tg_op<>'INSERT' then a:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then b:=to_jsonb(new); end if;
 if a->>'bucket_id'='crm-media' or b->>'bucket_id'='crm-media' then
  for jid in select c.id from public.crm_records c where c.collection='jobs' and exists(select 1 from jsonb_array_elements(coalesce(c.data->'installationProof','[]')) p where (a->>'bucket_id'='crm-media' and p->>'blobId'=a->>'name') or (b->>'bucket_id'='crm-media' and p->>'blobId'=b->>'name')) order by c.id loop
   perform private.job_review_changed(jid,'Saved evidence file replaced or removed');
  end loop;
 end if;
 return null;
end $$;
create trigger job_review_media_changed after insert or update or delete on storage.objects for each row execute function private.job_review_media_changed();

-- The warehouse extension links normalized returns to these same text jobs
-- through allocations. Remain usable before that optional extension is applied.
create function private.job_review_inventory_returns(p_job text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if to_regclass('public.inventory_job_allocations') is null then return '[]'::jsonb; end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'jobId',p_job,'source','inventory','number','RET-'||r.return_number,
 'status',case when r.inventory_posted_at is not null then 'Processed' when r.workflow_status='cancelled' or r.status='cancelled' then 'Cancelled' else coalesce(r.workflow_status,r.status) end,
 'reason',r.reason,'warehouse_id',r.warehouse_id,'delivered_at',r.delivered_at,'processed_at',r.inventory_posted_at,
 'items',(select coalesce(jsonb_agg(to_jsonb(ri)),'[]') from public.product_return_items ri join public.inventory_job_allocations a on a.id=ri.inventory_allocation_id where ri.product_return_id=r.id and a.job_id=p_job))),'[]') into result
 from public.product_returns r where exists(select 1 from public.product_return_items ri join public.inventory_job_allocations a on a.id=ri.inventory_allocation_id where ri.product_return_id=r.id and a.job_id=p_job);
 return result;
end $$;
create function private.job_review_inventory_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare a jsonb; b jsonb; jid text;
begin
 if to_regclass('public.inventory_job_allocations') is null then return null; end if;
 if tg_op<>'INSERT' then a:=to_jsonb(old); end if;
 if tg_op<>'DELETE' then b:=to_jsonb(new); end if;
 if (a-'updated_at') is not distinct from (b-'updated_at') then return null; end if;
 if tg_table_name='product_return_items' then
  for jid in select distinct job_id from public.inventory_job_allocations where id::text in (a->>'inventory_allocation_id',b->>'inventory_allocation_id') order by job_id loop
   perform private.job_review_changed(jid,'Warehouse return item changed');
  end loop;
 else
  for jid in select distinct al.job_id from public.product_return_items ri join public.inventory_job_allocations al on al.id=ri.inventory_allocation_id where ri.product_return_id::text in (a->>'id',b->>'id') order by al.job_id loop
   perform private.job_review_changed(jid,'Warehouse return changed');
  end loop;
 end if;
 return null;
end $$;
create trigger job_review_inventory_header after insert or update or delete on public.product_returns for each row execute function private.job_review_inventory_changed();
create trigger job_review_inventory_line after insert or update or delete on public.product_return_items for each row execute function private.job_review_inventory_changed();

create function private.job_review_completion_error(p_job text) returns text
language plpgsql stable security definer set search_path='' as $$
declare j jsonb;
begin
 select data into j from public.crm_records where collection='jobs' and id=p_job;
 if j is null or j->>'status' is distinct from 'Completed' then return 'Only Completed jobs can be approved'; end if;
 if exists(select 1 from public.crm_records where collection='tasks' and data->>'jobId'=p_job and data->>'status' is distinct from 'Completed') then return 'Complete all linked tasks before approval'; end if;
 if exists(select 1 from public.crm_records where collection='returns' and data->>'jobId'=p_job and coalesce(data->>'status','') not in ('Processed','Cancelled')) then return 'Process all relevant returns before approval'; end if;
 if exists(select 1 from jsonb_array_elements(private.job_review_inventory_returns(p_job)) r where r->>'status' not in ('Processed','Cancelled')) then return 'Process all warehouse returns before approval'; end if;
 if not exists(select 1 from jsonb_array_elements(coalesce(j->'installationProof','[]')) p join storage.objects o on o.bucket_id='crm-media' and o.name=p->>'blobId'
 where o.archived_at is null and not coalesce(o.is_delete_marker,false) and p->>'userId'=j->>'installerId' and p->>'kind' in ('photo','video') and p#>>'{location,source}'='Device geolocation'
 and jsonb_typeof(p#>'{location,latitude}')='number' and jsonb_typeof(p#>'{location,longitude}')='number' and jsonb_typeof(p#>'{location,accuracy}')='number'
 and (p#>>'{location,latitude}')::numeric between -90 and 90 and (p#>>'{location,longitude}')::numeric between -180 and 180 and (p#>>'{location,accuracy}')::numeric>=0
 and nullif(p->>'createdAt','')::timestamptz is not null and (j->>'evidenceRequiredAfter' is null or (p->>'createdAt')::timestamptz>=(j->>'evidenceRequiredAfter')::timestamptz)) then return 'Saved installation evidence with device location is required'; end if;
 return null;
end $$;

create function private.approve_completed_job(p_job_id text,p_revision bigint,p_notes text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare actor uuid; s public.job_approval_state; j jsonb; h public.job_approval_history; reason text; snap jsonb;
begin
 actor:=private.crm_upgrade_require('jobs','approve',true);
 if not private.has_module_access('jobs','view','web') then raise exception 'jobs.view permission required' using errcode='42501'; end if;
 if length(coalesce(p_notes,''))>4000 then raise exception 'Review notes must be at most 4000 characters'; end if;
 select data into j from public.crm_records where collection='jobs' and id=p_job_id for update;
 if j is null then raise exception 'Job not found'; end if;
 select * into s from public.job_approval_state where job_id=p_job_id for update;
 if s.revision is distinct from p_revision then raise exception 'Job changed since review. Refresh and review it again' using errcode='40001'; end if;
 reason:=private.job_review_completion_error(p_job_id);
 if reason is not null then raise exception '%',reason; end if;
 if s.approval_id is not null then return jsonb_build_object('id',s.approval_id,'job_id',p_job_id,'revision',s.revision,'approval_status','Approved'); end if;
 select jsonb_build_object('job',j,'tasks',coalesce(jsonb_agg(c.data) filter(where c.collection='tasks'),'[]'),'returns',coalesce(jsonb_agg(c.data) filter(where c.collection='returns'),'[]')) into snap from public.crm_records c where c.collection in ('tasks','returns') and c.data->>'jobId'=p_job_id;
 insert into public.job_approval_history(job_id,revision,approved_by,reviewer_name,review_notes,review_snapshot)
 values(p_job_id,s.revision,actor,coalesce((select full_name from public.profiles where id=actor),'Reviewer'),trim(coalesce(p_notes,'')),snap||jsonb_build_object('inventory_returns',private.job_review_inventory_returns(p_job_id))) returning * into h;
 update public.job_approval_state set approval_id=h.id,updated_at=now() where job_id=p_job_id;
 insert into public.job_approval_notifications(user_id,job_id,revision,event,title,body)
 select p.id,p_job_id,s.revision,'approved','Job approved',coalesce(j->>'number',p_job_id)||' was approved by '||h.reviewer_name||'.' from public.profiles p where p.id::text=j->>'installerId' and p.status='active'
 on conflict(user_id,job_id,revision,event) do nothing;
 insert into public.audit_logs(actor_user_id,action,entity_type,new_data,metadata) values(actor,'Job approved','Job',to_jsonb(h)-'review_snapshot',jsonb_build_object('job_id',p_job_id));
 return jsonb_build_object('id',h.id,'job_id',p_job_id,'revision',s.revision,'approval_status','Approved');
end $$;
create function public.approve_completed_job(p_job_id text,p_revision bigint,p_notes text default '') returns jsonb
language sql security invoker set search_path='' as $$ select private.approve_completed_job(p_job_id,p_revision,p_notes) $$;

create function private.job_approval_snapshot() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or private.current_role_key() is null or not private.has_module_access('jobs','view','web') then raise exception 'jobs.view permission required' using errcode='42501'; end if;
 return jsonb_build_object('jobs',coalesce((select jsonb_agg(jsonb_build_object('job',j.data,'job_id',j.id,'revision',s.revision,'approval_status',case when j.data->>'status'<>'Completed' then 'Not Ready' when s.approval_id is null then 'Pending Approval' else 'Approved' end,'approval_id',s.approval_id,'approved_by',h.approved_by,'reviewer_name',h.reviewer_name,'approved_at',h.approved_at,'review_notes',h.review_notes)) from public.job_approval_state s join public.crm_records j on j.collection='jobs' and j.id=s.job_id left join public.job_approval_history h on h.id=s.approval_id where private.job_review_visible(s.job_id)),'[]'),
 'tasks',coalesce((select jsonb_agg(c.data) from public.crm_records c where c.collection='tasks' and private.job_review_visible(c.data->>'jobId') and (private.current_role_key() in ('super_admin','admin','manager') or c.data->>'assignedTo'=auth.uid()::text)),'[]'),
 'returns',coalesce((select jsonb_agg(c.data) from public.crm_records c where c.collection='returns' and private.job_review_visible(c.data->>'jobId')),'[]'),
 'inventory_returns',coalesce((select jsonb_agg(r) from public.job_approval_state s cross join lateral jsonb_array_elements(private.job_review_inventory_returns(s.job_id)) r where private.job_review_visible(s.job_id)),'[]'),
 'history',coalesce((select jsonb_agg(to_jsonb(h)-'review_snapshot' order by h.approved_at desc) from public.job_approval_history h where private.job_review_visible(h.job_id)),'[]'),
 'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from public.job_approval_notifications n join public.job_approval_state s on s.job_id=n.job_id join public.crm_records j on j.collection='jobs' and j.id=s.job_id where n.user_id=auth.uid() and private.job_review_visible(n.job_id) and (n.event='approved' or (n.revision=s.revision and s.approval_id is null and j.data->>'status'='Completed' and private.current_role_key() in ('super_admin','admin','manager') and private.has_module_access('jobs','approve','web')))),'[]'));
end $$;
create function public.job_approval_snapshot() returns jsonb language sql security invoker set search_path='' as $$ select private.job_approval_snapshot() $$;
create function private.read_job_approval_notification(p_id uuid) returns boolean language plpgsql security definer set search_path='' as $$
begin
 if private.current_role_key() is null then raise exception 'Active session required' using errcode='42501'; end if;
 update public.job_approval_notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=auth.uid() and private.job_review_visible(job_id);
 return found;
end $$;
create function public.read_job_approval_notification(p_id uuid) returns boolean language sql security invoker set search_path='' as $$ select private.read_job_approval_notification(p_id) $$;

-- Initialize only review state. Existing completed jobs remain pending; no
-- operational, task, invoice, payment, evidence, or account record is changed.
insert into public.job_approval_state(job_id) select id from public.crm_records where collection='jobs';
do $$ declare j text; begin for j in select job_id from public.job_approval_state loop perform private.job_review_notify(j); end loop; end $$;

revoke all on function private.job_review_visible(text),private.job_review_recipient(uuid),private.job_review_material(jsonb),private.job_review_notify(text),private.job_review_changed(text,text),private.job_review_guard(),private.job_review_record_changed(),private.job_review_completion_error(text),private.approve_completed_job(text,bigint,text),private.job_approval_snapshot(),private.read_job_approval_notification(uuid) from public,anon,authenticated;
revoke all on function private.job_review_media_changed() from public,anon,authenticated;
revoke all on function private.job_review_inventory_returns(text),private.job_review_inventory_changed() from public,anon,authenticated;
grant execute on function private.job_review_visible(text),private.approve_completed_job(text,bigint,text),private.job_approval_snapshot(),private.read_job_approval_notification(uuid) to authenticated;
revoke all on function public.approve_completed_job(text,bigint,text),public.job_approval_snapshot(),public.read_job_approval_notification(uuid) from public,anon;
grant execute on function public.approve_completed_job(text,bigint,text),public.job_approval_snapshot(),public.read_job_approval_notification(uuid) to authenticated;
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['job_approval_state','job_approval_history','job_approval_notifications'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
commit;
