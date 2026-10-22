-- Focused extension of the inspected, deployed access foundation. No grant reset,
-- account recreation, password changes or inventory schema deployment.
begin;

create table public.master_access_rules (
 id uuid primary key default gen_random_uuid(),
 rule_kind text not null check (rule_kind in ('override','global_permission','tab')),
 scope_type public.rule_scope not null,
 role_id uuid references public.roles(id), user_id uuid references public.profiles(id),
 module_id uuid not null references public.system_modules(id), action text not null,
 effect public.permission_effect not null, created_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now(),
 check ((scope_type='global' and role_id is null and user_id is null)
     or (scope_type='role' and role_id is not null and user_id is null)
     or (scope_type='user' and user_id is not null and role_id is null)),
 check ((rule_kind='override' and scope_type<>'global') or
        (rule_kind='global_permission' and scope_type='global') or (rule_kind='tab' and action='view'))
);
create unique index master_access_rules_scope_key on public.master_access_rules
 (rule_kind,scope_type,coalesce(role_id,'00000000-0000-0000-0000-000000000000'::uuid),
 coalesce(user_id,'00000000-0000-0000-0000-000000000000'::uuid),module_id,action);
create index master_access_rules_role on public.master_access_rules(role_id,module_id) where role_id is not null;
create index master_access_rules_module on public.master_access_rules(module_id,rule_kind,action);
create index master_access_rules_user on public.master_access_rules(user_id,module_id) where user_id is not null;
alter table public.master_access_rules enable row level security;
revoke all on public.master_access_rules from public,anon,authenticated;
grant select on public.master_access_rules to authenticated;
create policy master_rules_owner_read on public.master_access_rules for select to authenticated
 using ((select private.is_super_admin()));

alter table public.impersonation_sessions add column auth_session_id uuid;

-- Fail closed on invalid selectors. The original JWT and auth.sessions remain
-- authoritative; the browser cannot manufacture a role or target identity.
create function private.effective_user_id() returns uuid
language plpgsql stable security definer set search_path='' as $$
declare raw_id uuid:=auth.uid(); selected text; target uuid;
begin
 selected:=nullif(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-crm-impersonation','');
 if selected is null then return raw_id; end if;
 if selected !~* '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$' then
   raise exception 'Invalid impersonation session' using errcode='42501'; end if;
 select i.effective_actor_user_id into target from public.impersonation_sessions i
 join public.profiles actor on actor.id=i.real_actor_user_id and actor.status='active'
 join public.roles ar on ar.id=actor.role_id and ar.key='super_admin' and ar.active
 join auth.users au on au.id=actor.id and lower(au.email)='annasabbas01@gmail.com' and au.email_confirmed_at is not null
 join auth.sessions s on s.id=i.auth_session_id and s.user_id=actor.id
 join public.profiles p on p.id=i.effective_actor_user_id and p.status='active'
 join public.roles r on r.id=p.role_id and r.active and r.key<>'super_admin'
 join auth.users u on u.id=p.id
 where i.id=selected::uuid and i.real_actor_user_id=raw_id and i.status='active' and i.expires_at>now()
 and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now())
 and coalesce(auth.jwt()->>'aal','aal1')='aal2'
 and (au.banned_until is null or au.banned_until<=now()) and (u.banned_until is null or u.banned_until<=now());
 if target is null then raise exception 'Impersonation expired, revoked or inaccessible. Exit impersonation to recover the owner session.' using errcode='42501'; end if;
 return target;
end $$;
revoke all on function private.effective_user_id() from public,anon;
grant execute on function private.effective_user_id() to authenticated;

create or replace function private.current_role_key() returns text
language sql stable security definer set search_path='' as $$
 select r.key from public.profiles p join public.roles r on r.id=p.role_id and r.active
 join auth.users u on u.id=p.id where p.id=private.effective_user_id() and p.status='active'
 and not coalesce((auth.jwt()->>'is_anonymous')::boolean,false)
 and (u.banned_until is null or u.banned_until<=now())
 and (r.key<>'super_admin' or lower(u.email)='annasabbas01@gmail.com')
 and exists(select 1 from auth.sessions s join auth.users actor on actor.id=s.user_id
 where s.user_id=auth.uid() and s.id::text=auth.jwt()->>'session_id'
 and (s.not_after is null or s.not_after>now()) and (actor.banned_until is null or actor.banned_until<=now()))
$$;

-- Ordinary module states remain restrictive. An 'enabled' row is not a bypass.
create function private.module_state_for(p_user uuid,p_module text,p_platform public.platform_key)
returns public.access_state language plpgsql stable security definer set search_path='' as $$
declare rid uuid; cfg jsonb; page text:=private.crm_page_key(p_module); result public.access_state;
begin
 select role_id into rid from public.profiles where id=p_user and status='active';
 if rid is null or not exists(select 1 from public.system_modules where key=p_module and is_active and platform_scope in ('all',p_platform)) then return 'disabled'; end if;
 if exists(select 1 from public.system_lock_rules l where l.is_locked and (l.starts_at is null or l.starts_at<=now()) and (l.ends_at is null or l.ends_at>now()) and (l.scope='global' or (l.scope='platform' and l.platform=p_platform))) then return 'locked'; end if;
 select data into cfg from public.crm_records where collection='accessControl' and id='_';
 if cfg#>array['locks','pages',page]='true'::jsonb then return 'locked'; end if;
 if cfg#>array['global','pages',page]='false'::jsonb or cfg#>array['users',p_user::text,'pages',page]='false'::jsonb then return 'disabled'; end if;
 select mar.access_state into result from public.module_access_rules mar join public.system_modules m on m.id=mar.module_id
 where m.key=p_module and mar.platform in ('all',p_platform)
 and (mar.starts_at is null or mar.starts_at<=now()) and (mar.ends_at is null or mar.ends_at>now())
 and (mar.scope_type='global' or (mar.scope_type='role' and mar.role_id=rid) or (mar.scope_type='user' and mar.user_id=p_user))
 order by case mar.access_state when 'locked' then 4 when 'disabled' then 3 when 'readonly' then 2 else 1 end desc,
 case mar.scope_type when 'user' then 3 when 'role' then 2 else 1 end desc limit 1;
 return coalesce(result,'enabled');
end $$;

create function private.override_for(p_user uuid,p_module text,p_action text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rid uuid; decision jsonb; implied integer;
begin
 select role_id into rid from public.profiles where id=p_user;
 select jsonb_build_object('allowed',a.effect='allow','rank',case a.scope_type when 'user' then 2 else 1 end,'source',case a.scope_type when 'user' then 'explicit_profile_override' else 'explicit_role_override' end,'rule_id',a.id)
 into decision from public.master_access_rules a join public.system_modules m on m.id=a.module_id
 where a.rule_kind='override' and m.key=p_module and a.action=p_action
 and ((a.scope_type='user' and a.user_id=p_user) or (a.scope_type='role' and a.role_id=rid))
 order by case a.scope_type when 'user' then 2 else 1 end desc,case a.effect when 'deny' then 1 else 0 end desc limit 1;
 if p_action='view' then
   -- An action allow supplies only its route/view prerequisite. Explicit view deny
   -- at the same or a higher scope wins. It never supplies other write actions.
   select max(rank) into implied from (
     select distinct on (a.action) a.action,a.effect,case a.scope_type when 'user' then 2 else 1 end as rank
     from public.master_access_rules a join public.system_modules m on m.id=a.module_id
     where a.rule_kind='override' and m.key=p_module and a.action<>'view'
     and ((a.scope_type='user' and a.user_id=p_user) or (a.scope_type='role' and a.role_id=rid))
     order by a.action,case a.scope_type when 'user' then 2 else 1 end desc,case a.effect when 'deny' then 1 else 0 end desc
   ) resolved where effect='allow';
   if implied is not null and (decision is null or implied>(decision->>'rank')::integer) then
     decision:=jsonb_build_object('allowed',true,'rank',implied,'source','override_view_prerequisite');
   end if;
 end if;
 return decision;
end $$;

create function private.access_decision(p_user uuid,p_module text,p_action text,p_platform public.platform_key default 'web')
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare rid uuid; role_key text; decision jsonb; state public.access_state; ef public.permission_effect; cfg jsonb; cap text;
begin
 select p.role_id,r.key into rid,role_key from public.profiles p join public.roles r on r.id=p.role_id and r.active
 join auth.users u on u.id=p.id where p.id=p_user and p.status='active' and (u.banned_until is null or u.banned_until<=now());
 if role_key is null then return jsonb_build_object('allowed',false,'source','inactive_profile'); end if;
 if role_key='super_admin' and exists(select 1 from auth.users where id=p_user and lower(email)='annasabbas01@gmail.com' and email_confirmed_at is not null) then return jsonb_build_object('allowed',true,'source','designated_super_admin'); end if;
 if p_module='master_control' then return jsonb_build_object('allowed',false,'source','protected_master_control'); end if;
 if not exists(select 1 from public.permissions pe join public.system_modules m on m.id=pe.module_id where m.key=p_module and pe.action=p_action and m.is_active and m.platform_scope in ('all',p_platform)) then return jsonb_build_object('allowed',false,'source','unregistered_action'); end if;
 if p_module='users' and p_action in ('create','update','delete','block','change_role','change_password') and role_key not in ('admin','manager') then return jsonb_build_object('allowed',false,'source','account_role_safeguard'); end if;
 if p_action<>'view' and not (private.access_decision(p_user,p_module,'view',p_platform)->>'allowed')::boolean then return jsonb_build_object('allowed',false,'source','module_view_required'); end if;
 decision:=private.override_for(p_user,p_module,p_action);
 if decision is not null then return decision; end if;
 state:=private.module_state_for(p_user,p_module,p_platform);
 if state in ('disabled','locked') or (state='readonly' and p_action<>'view') then return jsonb_build_object('allowed',false,'source','module_'||state); end if;
 select data into cfg from public.crm_records where collection='accessControl' and id='_';
 cap:=case p_module when 'leads' then 'lead_manage' when 'quotations' then case when p_action='export' then 'quote_download' else 'quote_manage' end
 when 'jobs' then 'job_manage' when 'tasks' then 'task_manage' when 'chat' then 'chat_send' when 'inventory' then 'inventory_adjust'
 when 'warehouse' then 'picking_scan' when 'purchasing' then 'purchasing_receive' when 'billing' then 'billing_manage' when 'users' then 'user_manage' end;
 if p_action<>'view' and cap is not null and (cfg#>array['locks','capabilities',cap]='true'::jsonb or cfg#>array['global','capabilities',cap]='false'::jsonb or cfg#>array['users',p_user::text,'capabilities',cap]='false'::jsonb) then return jsonb_build_object('allowed',false,'source','legacy_function_restriction'); end if;
 if exists(select 1 from public.master_access_rules a join public.system_modules m on m.id=a.module_id where a.rule_kind='global_permission' and m.key=p_module and a.action=p_action and a.effect='deny') then return jsonb_build_object('allowed',false,'source','global_action_deny'); end if;
 -- Keep the deployed ordinary account-role denial behavior. Only explicit rules
 -- above bypass it; an ordinary individual allow still cannot do so.
 if p_module='users' and p_action in ('update','block','delete','change_role','change_password') and exists(select 1 from public.role_permissions rp join public.permissions pe on pe.id=rp.permission_id where rp.role_id=rid and pe.key=p_module||'.'||p_action and rp.effect='deny') then return jsonb_build_object('allowed',false,'source','ordinary_role_deny'); end if;
 select up.effect into ef from public.user_permissions up join public.permissions pe on pe.id=up.permission_id where up.user_id=p_user and pe.key=p_module||'.'||p_action and (up.starts_at is null or up.starts_at<=now()) and (up.ends_at is null or up.ends_at>now());
 if ef is not null then return jsonb_build_object('allowed',ef='allow','source','ordinary_profile_'||ef); end if;
 select rp.effect into ef from public.role_permissions rp join public.permissions pe on pe.id=rp.permission_id where rp.role_id=rid and pe.key=p_module||'.'||p_action;
 if ef is not null then return jsonb_build_object('allowed',ef='allow','source','ordinary_role_'||ef); end if;
 select a.effect into ef from public.master_access_rules a join public.system_modules m on m.id=a.module_id where a.rule_kind='global_permission' and m.key=p_module and a.action=p_action;
 return jsonb_build_object('allowed',coalesce(ef='allow',false),'source',case when ef is null then 'no_grant' else 'global_action_'||ef end);
end $$;

create or replace function private.has_module_access(p_module_key text,p_action text default 'view',p_platform public.platform_key default 'web')
returns boolean language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role_key() is null then return false; end if;
 return (private.access_decision(private.effective_user_id(),p_module_key,p_action,p_platform)->>'allowed')::boolean;
end $$;
create or replace function private.resolve_module_state(p_module_key text,p_platform public.platform_key)
returns public.access_state language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role_key() is null then return 'disabled'; end if;
 if private.is_super_admin() then return 'enabled'; end if;
 if p_module_key='master_control' then return 'disabled'; end if;
 return private.module_state_for(private.effective_user_id(),p_module_key,p_platform);
end $$;

create function private.tab_visible_for(p_user uuid,p_module text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce((select a.effect='allow' from public.master_access_rules a join public.system_modules m on m.id=a.module_id
 where a.rule_kind='tab' and m.key=p_module and (a.scope_type='global' or (a.scope_type='user' and a.user_id=p_user) or (a.scope_type='role' and a.role_id=(select role_id from public.profiles where id=p_user)))
 order by case a.scope_type when 'user' then 3 when 'role' then 2 else 1 end desc,case a.effect when 'deny' then 1 else 0 end desc limit 1),true)
$$;
create function private.access_modules_for(p_user uuid,p_platform public.platform_key) returns jsonb
language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('key',m.key,'route',m.route_key,'state',case when p_user=private.effective_user_id() then private.resolve_module_state(m.key,p_platform) else private.module_state_for(p_user,m.key,p_platform) end,
 'tab_visible',case when exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_user and r.key='super_admin') then true else private.tab_visible_for(p_user,m.key) end,
 'decisions',(select coalesce(jsonb_object_agg(pe.action,private.access_decision(p_user,m.key,pe.action,p_platform)),'{}') from public.permissions pe where pe.module_id=m.id))
 ||(select coalesce(jsonb_object_agg('can_'||pe.action,(private.access_decision(p_user,m.key,pe.action,p_platform)->>'allowed')::boolean),'{}') from public.permissions pe where pe.module_id=m.id) order by m.name),'[]')
 from public.system_modules m where m.is_active and m.platform_scope in ('all',p_platform)
$$;

create or replace function public.get_access_context(p_platform text default 'web') returns jsonb
language plpgsql stable set search_path='' as $$
declare u uuid; profile jsonb; modules jsonb; locked jsonb; imp jsonb;
begin
 if auth.uid() is null or private.current_role_key() is null then raise exception 'Active authenticated session required' using errcode='42501'; end if;
 if p_platform not in ('web','android','ios') or p_platform is null then raise exception 'Invalid platform'; end if;
 u:=private.effective_user_id();
 select jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name,'status',p.status,'role',r.key,'mfa_required',p.mfa_required) into profile from public.profiles p join public.roles r on r.id=p.role_id where p.id=u;
 modules:=private.access_modules_for(u,p_platform::public.platform_key);
 locked:=private.get_effective_system_lock(p_platform::public.platform_key);
 locked:=locked||jsonb_build_object('access_blocked',not exists(select 1 from jsonb_array_elements(modules) m where (m->>'can_view')::boolean));
 imp:=private.impersonation_context();
 return jsonb_build_object('profile',profile,'system_lock',locked,'modules',modules,'impersonation',imp,'generated_at',now());
end $$;

create function private.impersonation_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.effective_user_id(); result jsonb;
begin
 if u=auth.uid() then return null; end if;
 select jsonb_build_object('id',i.id,'real_actor_user_id',i.real_actor_user_id,'effective_actor_user_id',i.effective_actor_user_id,'expires_at',i.expires_at)
 into result from public.impersonation_sessions i where i.id=(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-crm-impersonation')::uuid;
 return result;
end $$;

create function public.admin_get_master_control(p_user_id uuid default null,p_role_key text default null) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb; preview_user uuid:=p_user_id;
begin
 if not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if preview_user is null and p_role_key is not null then select p.id into preview_user from public.profiles p join public.roles r on r.id=p.role_id where r.key=p_role_key and p.status='active' order by p.created_at limit 1; end if;
 result:=jsonb_build_object('schema_version',2,'impersonation_supported',true,
 'active_impersonations',(select coalesce(jsonb_agg(to_jsonb(i)),'[]') from (select id,effective_actor_user_id,reason,expires_at from public.impersonation_sessions where real_actor_user_id=auth.uid() and status='active' order by expires_at desc limit 25) i),
 'modules',(select coalesce(jsonb_agg(to_jsonb(m) order by m.name),'[]') from public.system_modules m),
 'permissions',(select coalesce(jsonb_agg(to_jsonb(pe) order by pe.key),'[]') from public.permissions pe),
 'roles',(select coalesce(jsonb_agg(to_jsonb(r) order by r.rank desc),'[]') from public.roles r where r.active),
 'role_permissions',(select coalesce(jsonb_agg(to_jsonb(rp)),'[]') from public.role_permissions rp),
 'user_permissions',(select coalesce(jsonb_agg(to_jsonb(up)),'[]') from public.user_permissions up),
 'module_rules',(select coalesce(jsonb_agg(to_jsonb(mar)),'[]') from public.module_access_rules mar),
 'rules',(select coalesce(jsonb_agg(to_jsonb(a)),'[]') from public.master_access_rules a),
 'system_locks',(select coalesce(jsonb_agg(to_jsonb(l)),'[]') from public.system_lock_rules l),
 'effective',case when preview_user is not null then private.access_modules_for(preview_user,'web') else '[]'::jsonb end,
 'preview_user_id',preview_user);
 return result;
end $$;

create function public.admin_set_access_rule(p_kind text,p_scope text,p_target_id uuid,p_module_key text,p_action text,p_effect text)
returns boolean language plpgsql security definer set search_path='' as $$
declare mid uuid; rid uuid; uid uuid; target_role text;
begin
 if not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_kind not in ('override','global_permission','tab') or p_kind is null or p_scope not in ('global','role','user') or p_scope is null or p_effect not in ('allow','deny','default') or p_effect is null then raise exception 'Invalid access rule'; end if;
 if (p_kind='override' and p_scope='global') or (p_kind='global_permission' and p_scope<>'global') or (p_kind='tab' and p_action<>'view') then raise exception 'Invalid rule scope or action'; end if;
 select id into mid from public.system_modules where key=p_module_key;
 if mid is null or p_module_key='master_control' or not exists(select 1 from public.permissions where module_id=mid and action=p_action) then raise exception 'Unknown or protected module/action'; end if;
 if p_scope='global' and p_target_id is not null then raise exception 'Global scope has no target'; end if;
 if p_scope='role' then select id,key into rid,target_role from public.roles where id=p_target_id and active and key<>'super_admin'; if rid is null then raise exception 'Invalid staff role'; end if;
 elsif p_scope='user' then select p.id,r.key into uid,target_role from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_target_id and r.key<>'super_admin'; if uid is null then raise exception 'Invalid staff profile'; end if; end if;
 if p_effect='allow' and p_module_key='users' and p_action in ('create','update','delete','block','change_role','change_password') and p_scope<>'global' and target_role not in ('admin','manager') then raise exception 'Installers cannot administer other accounts'; end if;
 perform pg_advisory_xact_lock(hashtextextended('master-rule/'||p_kind||'/'||p_scope||'/'||coalesce(p_target_id::text,'')||'/'||p_module_key||'/'||p_action,0));
 delete from public.master_access_rules where rule_kind=p_kind and scope_type=p_scope::public.rule_scope and module_id=mid and action=p_action and role_id is not distinct from rid and user_id is not distinct from uid;
 if p_effect<>'default' then insert into public.master_access_rules(rule_kind,scope_type,role_id,user_id,module_id,action,effect,created_by) values(p_kind,p_scope::public.rule_scope,rid,uid,mid,p_action,p_effect::public.permission_effect,auth.uid()); end if;
 insert into public.privileged_security_events(event_type,real_actor_user_id,target_type,target_id,metadata) values('master.access_rule_changed',auth.uid(),'module',mid::text,jsonb_build_object('kind',p_kind,'scope',p_scope,'target',p_target_id,'action',p_action,'effect',p_effect));
 return true;
end $$;

create function public.admin_set_system_lock(p_locked boolean,p_title text default null,p_message text default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 if not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_locked is null then raise exception 'Lock state required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('master-system-lock',0));
 update public.system_lock_rules set is_locked=p_locked,title=p_title,message=p_message,starts_at=null,ends_at=null,locked_by=auth.uid(),locked_at=now(),updated_at=now() where scope='global';
 if not found then insert into public.system_lock_rules(scope,is_locked,title,message,locked_by,locked_at) values('global',p_locked,p_title,p_message,auth.uid(),now()); end if;
 insert into public.privileged_security_events(event_type,real_actor_user_id,target_type,metadata) values('system.lock_changed',auth.uid(),'system',jsonb_build_object('locked',p_locked));
 return true;
end $$;

-- Default removes only the selected ordinary permission, preserving all others.
create or replace function private.admin_set_role_permission(p_role_key text,p_permission_key text,p_effect text)
returns boolean language plpgsql security definer set search_path='' as $$
declare rid uuid; pid uuid;
begin
 if not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_role_key not in ('admin','manager','installer') or p_role_key is null or p_effect not in ('allow','deny','default') or p_effect is null then raise exception 'Invalid role permission'; end if;
 if p_effect='allow' and p_role_key='installer' and p_permission_key in ('users.create','users.update','users.delete','users.block','users.change_role','users.change_password') then raise exception 'Installer cannot administer accounts'; end if;
 select id into strict rid from public.roles where key=p_role_key and active;
 select id into strict pid from public.permissions where key=p_permission_key and key not like 'master_control.%';
 if p_effect='default' then delete from public.role_permissions where role_id=rid and permission_id=pid;
 else insert into public.role_permissions(role_id,permission_id,effect) values(rid,pid,p_effect::public.permission_effect) on conflict(role_id,permission_id) do update set effect=excluded.effect,updated_at=now(); end if;
 insert into public.privileged_security_events(event_type,real_actor_user_id,target_type,target_id,metadata) values('role.permission_changed',auth.uid(),'role',rid::text,jsonb_build_object('permission',p_permission_key,'effect',p_effect));
 return true;
end $$;

create or replace function public.start_impersonation(p_target_user_id uuid,p_reason text,p_ticket_reference text default null)
returns uuid language plpgsql set search_path='' as $$
declare sid uuid; ttl integer;
begin
 if not private.is_super_admin() or private.effective_user_id() is distinct from auth.uid() then raise exception 'Super Admin permission required' using errcode='42501'; end if;
 if coalesce(auth.jwt()->>'aal','aal1')<>'aal2' then raise exception 'MFA assurance level 2 required' using errcode='42501'; end if;
 if nullif(btrim(p_reason),'') is null then raise exception 'Reason is required'; end if;
 if p_target_user_id=auth.uid() or not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_target_user_id and p.status='active' and r.active and r.key<>'super_admin') then raise exception 'Active ordinary target required'; end if;
 perform pg_advisory_xact_lock(hashtextextended('impersonation/'||auth.uid()::text,0));
 if exists(select 1 from public.impersonation_sessions where real_actor_user_id=auth.uid() and status='active' and expires_at>now()) then raise exception 'Nested or concurrent impersonation is not allowed'; end if;
 select least(greatest(coalesce((value#>>'{}')::integer,15),5),60) into ttl from public.super_admin_security_settings where key='impersonation_ttl_minutes';
 insert into public.impersonation_sessions(real_actor_user_id,effective_actor_user_id,reason,ticket_reference,expires_at,auth_session_id)
 values(auth.uid(),p_target_user_id,p_reason,p_ticket_reference,now()+make_interval(mins=>coalesce(ttl,15)),(auth.jwt()->>'session_id')::uuid) returning id into sid;
 insert into public.privileged_security_events(event_type,real_actor_user_id,effective_actor_user_id,impersonation_session_id,reason) values('impersonation.started',auth.uid(),p_target_user_id,sid,p_reason);
 return sid;
end $$;

-- Existing audits retain the real actor while business ownership uses the target.
create function private.audit_impersonation_actor() returns trigger
language plpgsql security definer set search_path='' as $$
declare context jsonb:=private.impersonation_context();
begin
 if context is not null then
   new.real_actor_user_id:=auth.uid(); new.effective_actor_user_id:=(context->>'effective_actor_user_id')::uuid;
   new.impersonation_session_id:=(context->>'id')::uuid;
 end if;
 return new;
end $$;
create trigger master_impersonation_audit before insert on public.privileged_security_events
for each row execute function private.audit_impersonation_actor();

-- The following inspected identity-dependent policies and functions are patched
-- below. Their signatures, grants and non-identity business checks are retained.

do $patch$
declare r record; original text;
begin
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_delete_user' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'5ced13bc204c8d694d964e9744964c33' then raise exception 'Access migration baseline changed: private.admin_delete_user. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_update_user_access' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'471240a06018ff00e820b296f9e01fae' then raise exception 'Access migration baseline changed: private.admin_update_user_access. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='chat_can_manage' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'381880840d70580bbac78e28c724173f' then raise exception 'Access migration baseline changed: private.chat_can_manage. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='chat_is_active_member' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'d46a4b7f6116dc33295d3366faba77c6' then raise exception 'Access migration baseline changed: private.chat_is_active_member. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_upgrade_require' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'62aa4c11b06d1e0398dd79f93f3c1f80' then raise exception 'Access migration baseline changed: private.crm_upgrade_require. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='inventory_validate_image' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'2fc64989d64bf7a6c37c5d3dcb88a3d3' then raise exception 'Access migration baseline changed: private.inventory_validate_image. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_assigned_job_object' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'f79ad4b2275df39fbc6310b117c7e6be' then raise exception 'Access migration baseline changed: private.is_assigned_job_object. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='protect_designated_owner_profile' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'1a537e69b76f7a9d82ed22e956358479' then raise exception 'Access migration baseline changed: private.protect_designated_owner_profile. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='update_own_profile' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'b0d58f7bdf5254efdced404679de96c6' then raise exception 'Access migration baseline changed: private.update_own_profile. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_quotation_and_create_job' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'f8bc022297001df29f1c68f940a1e48d' then raise exception 'Access migration baseline changed: public.accept_quotation_and_create_job. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='allocate_payment' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'a12d29b4cd99068ea8abf299d139aa1b' then raise exception 'Access migration baseline changed: public.allocate_payment. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_group_conversation' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'b2767bc9463633c20d0bbaae17395f42' then raise exception 'Access migration baseline changed: public.create_group_conversation. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_or_get_direct_conversation' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'a5927072c05210f66d176c2dde3e408d' then raise exception 'Access migration baseline changed: public.create_or_get_direct_conversation. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_records_touch' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'3ec08d87dc2e27dc15d19fe96c8187a9' then raise exception 'Access migration baseline changed: public.crm_records_touch. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='inventory_save_image' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'4538096d7ece1517acd60c86e041ef32' then raise exception 'Access migration baseline changed: public.inventory_save_image. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='mark_conversation_read' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'6424b9f990313a426817645f5f60919e' then raise exception 'Access migration baseline changed: public.mark_conversation_read. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_stock_movement' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'ec4e892380569d591a521561379d83b0' then raise exception 'Access migration baseline changed: public.record_stock_movement. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_chat_conversation' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'e138b4f889c87fbe44425ad503054e43' then raise exception 'Access migration baseline changed: public.review_chat_conversation. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_chat_message' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'4f82ac1f7f296645198300582bc88540' then raise exception 'Access migration baseline changed: public.send_chat_message. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
 for r in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_chat_members' and p.prokind='f' loop
  original:=pg_get_functiondef(r.oid);
  if md5(original)<>'63e391c6d452970ffbdd189b0112a494' then raise exception 'Access migration baseline changed: public.update_chat_members. Review before deployment'; end if;
  execute replace(original,'auth.uid()','private.effective_user_id()');
 end loop;
end $patch$;

do $policies$
declare r record; clause text;
begin
 for r in select * from pg_policies where schemaname='public' and tablename='device_tokens' and policyname='device_tokens_own' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_own_read' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_own_update' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='files' and policyname='files_read' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='job_orders' and policyname='job_orders_select' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='job_assignments' and policyname='job_assignments_select' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='job_order_items' and policyname='job_order_items_select' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks_select' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks_update' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_read' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_conversations' and policyname='chat_conversations_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_conversation_members' and policyname='chat_members_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_conversation_members' and policyname='chat_members_update_own' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_update' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_message_reads' and policyname='chat_reads_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_message_attachments' and policyname='chat_attachments_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_message_reactions' and policyname='chat_reactions_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='chat_message_reactions' and policyname='chat_reactions_delete' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='profiles' and policyname='users can read their profile' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='product_requests' and policyname='crm_upgrade_read' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='return_forms' and policyname='crm_upgrade_read' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
 for r in select * from pg_policies where schemaname='public' and tablename='product_images' and policyname='inventory_images_insert' loop
  clause:=format('alter policy %I on %I.%I',r.policyname,r.schemaname,r.tablename);
  if r.qual is not null then clause:=clause||' using ('||replace(r.qual,'auth.uid()','private.effective_user_id()')||')'; end if;
  if r.with_check is not null then clause:=clause||' with check ('||replace(r.with_check,'auth.uid()','private.effective_user_id()')||')'; end if;
  execute clause;
 end loop;
end $policies$;


-- Assignment is an additional data boundary, never a substitute for the current
-- module/action grant. Preserve each inspected assignment predicate unchanged.
do $assignment_guards$
declare r record; mod text; action text; clause text;
begin
 for r in select * from pg_policies where schemaname='public' and
   ((tablename='tasks' and policyname in ('tasks_select','tasks_update')) or
    (tablename='job_assignments' and policyname='job_assignments_select') or
    (tablename='job_order_items' and policyname='job_order_items_select')) loop
   mod:=case when r.tablename='tasks' then 'tasks' else 'jobs' end;
   action:=case when r.cmd='UPDATE' then 'update' else 'view' end;
   clause:=format('alter policy %I on public.%I',r.policyname,r.tablename);
   if r.qual is not null then clause:=clause||format(' using ((select private.has_module_access(%L,%L,''web'')) and (%s))',mod,action,r.qual); end if;
   if r.with_check is not null then clause:=clause||format(' with check ((select private.has_module_access(%L,%L,''web'')) and (%s))',mod,action,r.with_check); end if;
   execute clause;
 end loop;
end $assignment_guards$;


-- Existing generic CRM records must obey the same module grants and assignment
-- boundaries as the normalized tables, including impersonation and direct API calls.
create function private.crm_record_access(p_collection text,p_data jsonb,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare module_key text; uid text:=private.effective_user_id()::text; assigned boolean; role_key text:=private.current_role_key();
begin
 if role_key is null then return false; end if;
 if p_collection='accessControl' then return private.is_super_admin(); end if;
 -- Existing operational logs and broadcast notifications accompany ordinary
 -- workflow writes. They do not grant access to the protected business records.
 if p_collection='logs' then
   if p_action='view' then return private.has_module_access('settings','view','web'); end if;
   if private.is_super_admin() then return true; end if;
   return p_action='create' and p_data->>'userId'=auth.uid()::text
     and (case when uid=auth.uid()::text then p_data->>'actingAsUserId' is null else p_data->>'actingAsUserId'=uid end);
 end if;
 if p_collection='notifications' then
   if p_data->>'userId' is not null and p_data->>'userId'<>uid then return false; end if;
   if p_action='create' then
     return exists(select 1 from public.permissions pe join public.system_modules m on m.id=pe.module_id
       where pe.action in ('create','update','send') and private.has_module_access(m.key,pe.action,'web'));
   end if;
   return p_action in ('view','update') and private.has_module_access(case p_data->>'page'
     when 'quotes' then 'quotations' when 'picking' then 'warehouse' when 'returns' then 'warehouse'
     when 'calendar' then 'tasks' when 'contacts' then 'leads' when 'email' then 'quotations'
     else coalesce(nullif(p_data->>'page',''),'dashboard') end,'view','web');
 end if;
 module_key:=case p_collection when 'contacts' then 'leads' when 'leads' then 'leads' when 'quotes' then 'quotations'
 when 'quoteEmailEvents' then 'quotations' when 'jobs' then 'jobs' when 'productRequests' then 'jobs' when 'tasks' then 'tasks' when 'appointments' then 'tasks'
 when 'pickLists' then 'warehouse' when 'returns' then 'warehouse' when 'purchaseOrders' then 'purchasing' when 'suppliers' then 'purchasing'
 when 'products' then 'inventory' when 'stockMovements' then 'inventory' when 'invoices' then 'billing' when 'payments' then 'billing'
 when 'chaseActivities' then 'billing' when 'credits' then 'billing' when 'creditNotes' then 'billing' when 'refunds' then 'billing' when 'conversations' then 'chat' when 'messages' then 'chat'
 when 'logs' then 'settings' when 'notifications' then 'dashboard' else 'settings' end;
 if p_collection in ('products','stockMovements') and p_action<>'view' then return false; end if;
 if p_collection in ('quoteEmailEvents','chaseActivities') and p_action='create' then return private.has_module_access(module_key,'update','web'); end if;
 if not private.has_module_access(module_key,case when module_key='chat' and p_action<>'view' then 'send' else p_action end,'web') then return false; end if;
 if p_collection='conversations' then return coalesce(p_data->'memberIds' ? uid,false); end if;
 if p_collection='messages' then return exists(select 1 from public.crm_records c where c.collection='conversations' and c.id=p_data->>'conversationId' and c.data->'memberIds' ? uid) and (p_action='view' or p_data->>'senderId'=uid); end if;
 if role_key<>'installer' then return true; end if;
 if p_collection='jobs' then return coalesce(p_data->>'installerId'=uid,false); end if;
 if p_collection='tasks' then return coalesce(p_data->>'assignedTo'=uid,false); end if;
 if p_collection in ('pickLists','returns','productRequests') then
   assigned:=coalesce(p_data->>'installerId'=uid or p_data->>'pickupInstallerId'=uid or p_data->>'assignedTo'=uid or p_data->>'requestedBy'=uid,false);
   return assigned or exists(select 1 from public.crm_records j where j.collection='jobs' and j.id=p_data->>'jobId' and j.data->>'installerId'=uid);
 end if;
 return p_collection in ('products','stockMovements');
end $$;
revoke all on function private.crm_record_access(text,jsonb,text) from public,anon;
grant execute on function private.crm_record_access(text,jsonb,text) to authenticated;
alter policy "staff read records" on public.crm_records using (private.crm_record_access(collection,data,'view'));
alter policy "staff insert records" on public.crm_records with check (private.crm_record_access(collection,data,'create'));
alter policy "staff update records" on public.crm_records using (private.crm_record_access(collection,data,'update')) with check (private.crm_record_access(collection,data,'update'));
alter policy "managers delete records" on public.crm_records using (private.crm_record_access(collection,data,'delete'));


-- Existing RPC audits retain both actors through master_impersonation_audit.
-- The generic JSON store and stock ledger also need a durable operation trail.
create function private.audit_impersonated_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare effective uuid; selected text; row_data jsonb;
begin
 selected:=nullif(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-crm-impersonation','');
 if selected is null then return null; end if;
 effective:=private.effective_user_id();
 row_data:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 insert into public.privileged_security_events(event_type,real_actor_user_id,effective_actor_user_id,impersonation_session_id,target_type,target_id,metadata)
 values('impersonation.data_write',auth.uid(),effective,selected::uuid,tg_table_name,row_data->>'id',jsonb_build_object('operation',tg_op,'collection',row_data->>'collection'));
 return null;
end $$;
revoke all on function private.audit_impersonated_write() from public,anon,authenticated;
create trigger master_impersonated_crm_write after insert or update or delete on public.crm_records
for each row execute function private.audit_impersonated_write();
do $ledger_audit$ begin
 if to_regclass('public.stock_movements') is not null then
   execute 'create trigger master_impersonated_stock_write after insert on public.stock_movements for each row execute function private.audit_impersonated_write()';
 end if;
end $ledger_audit$;

create function public.admin_bulk_access(p_scope text,p_target_id uuid,p_mode text,p_kind text default 'full') returns boolean
language plpgsql security definer set search_path='' as $$
declare m record; pe record; target_role text;
begin
 if not private.is_super_admin() then raise exception 'Super Admin required' using errcode='42501'; end if;
 if p_scope not in ('global','role','user') or p_scope is null or p_mode is null or p_kind not in ('full','module','permission') or p_kind is null then raise exception 'Invalid bulk action'; end if;
 if p_kind='full' and (p_scope='global' or p_mode not in ('grant','hide','default')) then raise exception 'Invalid full-access action'; end if;
 if p_kind<>'full' and p_mode not in ('enable','disable','default') then raise exception 'Invalid bulk effect'; end if;
 if p_scope='global' and p_target_id is not null then raise exception 'Global scope has no target'; end if;
 if p_scope='role' then select key into target_role from public.roles where id=p_target_id and active and key<>'super_admin';
 else select r.key into target_role from public.profiles p join public.roles r on r.id=p.role_id where p.id=p_target_id and r.key<>'super_admin'; end if;
 if p_scope<>'global' and target_role is null then raise exception 'Invalid staff target'; end if;
 for m in select * from public.system_modules where is_active and key<>'master_control' loop
   if p_kind='module' then perform private.admin_set_module_access(m.key,p_scope,p_target_id,case p_mode when 'enable' then 'enabled' when 'disable' then 'disabled' else 'default' end); continue; end if;
   if p_kind='permission' then
     for pe in select * from public.permissions where module_id=m.id loop
       if p_mode='enable' and m.key='users' and pe.action in ('create','update','delete','block','change_role','change_password') and p_scope<>'global' and target_role not in ('admin','manager') then continue; end if;
       if p_scope='global' then perform public.admin_set_access_rule('global_permission','global',null,m.key,pe.action,case p_mode when 'enable' then 'allow' when 'disable' then 'deny' else 'default' end);
       elsif p_scope='role' then perform private.admin_set_role_permission(target_role,pe.key,case p_mode when 'enable' then 'allow' when 'disable' then 'deny' else 'default' end);
       else perform private.admin_set_user_permission(p_target_id,pe.key,case p_mode when 'enable' then 'allow' when 'disable' then 'deny' else 'default' end); end if;
     end loop;
     continue;
   end if;
   perform private.admin_set_module_access(m.key,p_scope,p_target_id,case p_mode when 'hide' then 'disabled' else 'default' end);
   for pe in select * from public.permissions where module_id=m.id loop
     if p_mode='grant' and m.key='users' and pe.action in ('create','update','delete','block','change_role','change_password') and target_role not in ('admin','manager') then continue; end if;
     perform public.admin_set_access_rule('override',p_scope,p_target_id,m.key,pe.action,case p_mode when 'grant' then 'allow' else 'default' end);
   end loop;
   if p_mode<>'grant' then perform public.admin_set_access_rule('tab',p_scope,p_target_id,m.key,'view','default'); end if;
 end loop;
 return true;
end $$;
revoke all on function public.admin_bulk_access(text,uuid,text,text) from public,anon;
grant execute on function public.admin_bulk_access(text,uuid,text,text) to authenticated;


-- The existing service-only finalizer must use the same precedence as the initial
-- authenticated check; otherwise an explicit grant would change the password but
-- fail session cleanup under the older role-deny-first implementation.
create or replace function private.finalize_owner_password_change(p_actor_id uuid,p_user_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner boolean;
begin
 if not (private.access_decision(p_actor_id,'users','change_password','web')->>'allowed')::boolean then raise exception 'Password management permission required' using errcode='42501'; end if;
 select exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id join auth.users u on u.id=p.id where p.id=p_actor_id and r.key='super_admin' and lower(u.email)='annasabbas01@gmail.com' and u.email_confirmed_at is not null) into owner;
 if not exists(select 1 from public.profiles where id=p_user_id) then raise exception 'Profile not found'; end if;
 if not owner and exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id join auth.users u on u.id=p.id where p.id=p_user_id and (r.key='super_admin' or lower(u.email)='annasabbas01@gmail.com')) then raise exception 'Super Admin account is protected' using errcode='42501'; end if;
 update auth.refresh_tokens set revoked=true,updated_at=now() where user_id=p_user_id::text;
 delete from auth.sessions where user_id=p_user_id;
 insert into public.privileged_security_events(event_type,real_actor_user_id,effective_actor_user_id,target_type,target_id,metadata) values('user.password_changed',p_actor_id,p_user_id,'profile',p_user_id::text,jsonb_build_object('sessions_revoked',true));
 return true;
end $$;
-- Keep this helper service-only; do not add an authenticated grant.
revoke all on function private.finalize_owner_password_change(uuid,uuid) from public,anon,authenticated;

-- No helper is anonymously callable. Only the existing invoker endpoints/RLS
-- receive the helpers they need; preview/decision internals remain private.
revoke all on function private.module_state_for(uuid,text,public.platform_key),private.override_for(uuid,text,text),private.access_decision(uuid,text,text,public.platform_key),private.tab_visible_for(uuid,text),private.access_modules_for(uuid,public.platform_key),private.impersonation_context(),private.audit_impersonation_actor() from public,anon,authenticated;
grant execute on function private.access_modules_for(uuid,public.platform_key),private.impersonation_context() to authenticated;
revoke all on function public.admin_get_master_control(uuid,text),public.admin_set_access_rule(text,text,uuid,text,text,text),public.admin_set_system_lock(boolean,text,text) from public,anon;
grant execute on function public.admin_get_master_control(uuid,text),public.admin_set_access_rule(text,text,uuid,text,text,text),public.admin_set_system_lock(boolean,text,text) to authenticated;
notify pgrst,'reload schema';
commit;
