-- Complete scoped Login as user without changing log visibility.
begin;
do $baseline$
begin
 if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='current_role_key')<>'6e8cd4013f012c7bd9b1e918a1c5a8e8' then raise exception 'Current role resolver changed'; end if;
 if (select md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='get_access_context')<>'9d30e0f0de08955e442682cd0a05b764' then raise exception 'Access context changed'; end if;
end $baseline$;
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

 and (au.banned_until is null or au.banned_until<=now()) and (u.banned_until is null or u.banned_until<=now());
 if target is null then raise exception 'Impersonation expired, revoked or inaccessible. Exit impersonation to recover the owner session.' using errcode='42501'; end if;
 return target;
end $$;

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



CREATE OR REPLACE FUNCTION private.has_module_access(p_module_key text, p_action text DEFAULT 'view'::text, p_platform platform_key DEFAULT 'web'::platform_key)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid:=private.effective_user_id(); v_role_id uuid; v_role text:=private.current_role_key(); v_effect public.permission_effect; v_state public.access_state;
BEGIN
 if v_role is null then return false; end if;
 if private.is_super_admin() then return true; end if;
 if p_module_key='master_control' then return false; end if;
 if p_module_key='users' and p_action in ('create','block','delete','update','change_role','change_password') and v_role not in ('admin','manager') then return false; end if;
 select role_id into v_role_id from public.profiles where id=v_user;
 v_state:=private.resolve_module_state(p_module_key,p_platform);
 if v_state in ('disabled','locked') or (v_state='readonly' and p_action<>'view') then return false; end if;
 -- A role-wide revoke of account-management powers overrides a user allow.
 if p_module_key='users' and p_action in ('update','block','delete','change_role','change_password') and exists(
   select 1 from public.role_permissions rp join public.permissions pe on pe.id=rp.permission_id
   where rp.role_id=v_role_id and pe.key=p_module_key||'.'||p_action and rp.effect='deny'
 ) then return false; end if;
 select up.effect into v_effect from public.user_permissions up join public.permissions pe on pe.id=up.permission_id
 where up.user_id=v_user and pe.key=p_module_key||'.'||p_action
 and (up.starts_at is null or up.starts_at<=now()) and (up.ends_at is null or up.ends_at>now());
 if v_effect is not null then return v_effect='allow'; end if;
 select rp.effect into v_effect from public.role_permissions rp join public.permissions pe on pe.id=rp.permission_id
 where rp.role_id=v_role_id and pe.key=p_module_key||'.'||p_action;
 return coalesce(v_effect='allow',false);
END $function$;


CREATE OR REPLACE FUNCTION private.resolve_module_state(p_module_key text, p_platform platform_key)
 RETURNS access_state
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_user uuid:=private.effective_user_id(); v_role uuid; v_state public.access_state; v_config jsonb; v_page text:=private.crm_page_key(p_module_key);
BEGIN
 if private.current_role_key() is null then return 'disabled'; end if;
 if private.is_super_admin() then return 'enabled'; end if;
 if p_module_key='master_control' then return 'disabled'; end if;
 select role_id into v_role from public.profiles where id=v_user;
 if not exists(select 1 from public.system_modules where key=p_module_key and is_active) then return 'disabled'; end if;
 if exists(select 1 from public.system_lock_rules l where l.is_locked
 and (l.starts_at is null or l.starts_at<=now()) and (l.ends_at is null or l.ends_at>now())
 and (l.scope='global' or (l.scope='platform' and l.platform=p_platform))) then return 'locked'; end if;
 select data into v_config from public.crm_records where collection='accessControl' and id='_';
 if v_config#>array['locks','pages',v_page]='true'::jsonb then return 'locked'; end if;
 if v_config#>array['global','pages',v_page]='false'::jsonb
 or v_config#>array['users',v_user::text,'pages',v_page]='false'::jsonb then return 'disabled'; end if;
 if exists(select 1 from public.module_access_rules mar join public.system_modules sm on sm.id=mar.module_id
 where sm.key=p_module_key and mar.scope_type='global' and mar.access_state in ('locked','disabled')
 and mar.platform in ('all'::public.platform_key,p_platform)
 and (mar.starts_at is null or mar.starts_at<=now()) and (mar.ends_at is null or mar.ends_at>now()))
 then return 'locked'; end if;
 select mar.access_state into v_state from public.module_access_rules mar join public.system_modules sm on sm.id=mar.module_id
 where sm.key=p_module_key and sm.is_active and mar.platform in ('all'::public.platform_key,p_platform)
 and (mar.starts_at is null or mar.starts_at<=now()) and (mar.ends_at is null or mar.ends_at>now())
 and ((mar.scope_type='user' and mar.user_id=v_user) or (mar.scope_type='role' and mar.role_id=v_role) or mar.scope_type='global')
 order by case mar.scope_type when 'user' then 3 when 'role' then 2 else 1 end desc,
 case when mar.platform=p_platform then 1 else 0 end desc,mar.updated_at desc limit 1;
 return coalesce(v_state,'enabled');
END $function$;


create function private.impersonation_context() returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare u uuid:=private.effective_user_id(); result jsonb;
begin
 if u=auth.uid() then return null; end if;
 select jsonb_build_object('id',i.id,'real_actor_user_id',i.real_actor_user_id,'effective_actor_user_id',i.effective_actor_user_id,'expires_at',i.expires_at)
 into result from public.impersonation_sessions i where i.id=(coalesce(current_setting('request.headers',true),'{}')::jsonb->>'x-crm-impersonation')::uuid;
 return result;
end $$;

CREATE OR REPLACE FUNCTION public.get_access_context(p_platform text DEFAULT 'web'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_user uuid := private.effective_user_id();
  v_platform public.platform_key;
  v_profile jsonb;
  v_modules jsonb;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_platform not in ('web','android','ios') then raise exception 'Invalid platform'; end if;
  v_platform := p_platform::public.platform_key;
  select jsonb_build_object('id',p.id,'email',p.email,'full_name',p.full_name,'status',p.status,'role',r.key,'mfa_required',p.mfa_required)
  into v_profile from public.profiles p join public.roles r on r.id=p.role_id where p.id=v_user;
  if v_profile is null or v_profile->>'status'<>'active' then raise exception 'Active profile required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'key',m.key,'route',m.route_key,'state',private.resolve_module_state(m.key,v_platform),
    'can_view',private.has_module_access(m.key,'view',v_platform),
    'can_create',private.has_module_access(m.key,'create',v_platform),
    'can_update',private.has_module_access(m.key,'update',v_platform),
    'can_delete',private.has_module_access(m.key,'delete',v_platform),
    'can_approve',private.has_module_access(m.key,'approve',v_platform),
    'can_block',case when m.key='users' then private.has_module_access(m.key,'block',v_platform) else false end,
    'can_change_role',case when m.key='users' then private.has_module_access(m.key,'change_role',v_platform) else false end,
    'can_change_password',case when m.key='users' then private.has_module_access(m.key,'change_password',v_platform) else false end
  ) order by m.name),'[]'::jsonb)
  into v_modules from public.system_modules m where m.is_active=true and m.platform_scope in ('all'::public.platform_key,v_platform);
  return jsonb_build_object('profile',v_profile,'system_lock',private.get_effective_system_lock(v_platform),'modules',v_modules,'impersonation',private.impersonation_context(),'impersonation_supported',true,'generated_at',now());
end;
$function$;


do $identity_dependencies$
declare original text; r record;
begin


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='chat_can_manage';
 if md5(original)<>'381880840d70580bbac78e28c724173f' then raise exception 'Inspected impersonation dependency changed: private.chat_can_manage';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='chat_is_active_member';
 if md5(original)<>'d46a4b7f6116dc33295d3366faba77c6' then raise exception 'Inspected impersonation dependency changed: private.chat_is_active_member';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='crm_upgrade_require';
 if md5(original)<>'62aa4c11b06d1e0398dd79f93f3c1f80' then raise exception 'Inspected impersonation dependency changed: private.crm_upgrade_require';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='is_assigned_job_object';
 if md5(original)<>'f79ad4b2275df39fbc6310b117c7e6be' then raise exception 'Inspected impersonation dependency changed: private.is_assigned_job_object';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='update_own_profile';
 if md5(original)<>'b0d58f7bdf5254efdced404679de96c6' then raise exception 'Inspected impersonation dependency changed: private.update_own_profile';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='protect_designated_owner_profile';
 if md5(original)<>'1a537e69b76f7a9d82ed22e956358479' then raise exception 'Inspected impersonation dependency changed: private.protect_designated_owner_profile';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_update_user_access';
 if md5(original)<>'471240a06018ff00e820b296f9e01fae' then raise exception 'Inspected impersonation dependency changed: private.admin_update_user_access';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='admin_delete_user';
 if md5(original)<>'5ced13bc204c8d694d964e9744964c33' then raise exception 'Inspected impersonation dependency changed: private.admin_delete_user';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='accept_quotation_and_create_job';
 if md5(original)<>'b4cef46ed7e973c0f5313668714cd409' then raise exception 'Inspected impersonation dependency changed: public.accept_quotation_and_create_job';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='allocate_payment';
 if md5(original)<>'a12d29b4cd99068ea8abf299d139aa1b' then raise exception 'Inspected impersonation dependency changed: public.allocate_payment';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='record_stock_movement';
 if md5(original)<>'ec4e892380569d591a521561379d83b0' then raise exception 'Inspected impersonation dependency changed: public.record_stock_movement';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_or_get_direct_conversation';
 if md5(original)<>'a5927072c05210f66d176c2dde3e408d' then raise exception 'Inspected impersonation dependency changed: public.create_or_get_direct_conversation';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='create_group_conversation';
 if md5(original)<>'b2767bc9463633c20d0bbaae17395f42' then raise exception 'Inspected impersonation dependency changed: public.create_group_conversation';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='update_chat_members';
 if md5(original)<>'63e391c6d452970ffbdd189b0112a494' then raise exception 'Inspected impersonation dependency changed: public.update_chat_members';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='review_chat_conversation';
 if md5(original)<>'e138b4f889c87fbe44425ad503054e43' then raise exception 'Inspected impersonation dependency changed: public.review_chat_conversation';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='send_chat_message';
 if md5(original)<>'4f82ac1f7f296645198300582bc88540' then raise exception 'Inspected impersonation dependency changed: public.send_chat_message';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='mark_conversation_read';
 if md5(original)<>'6424b9f990313a426817645f5f60919e' then raise exception 'Inspected impersonation dependency changed: public.mark_conversation_read';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


 select pg_get_functiondef(p.oid) into strict original from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='crm_job_workflow_command';
 if md5(original)<>'c691a47b391cc35dde5ac9e1929ef564' then raise exception 'Inspected impersonation dependency changed: public.crm_job_workflow_command';end if;
 execute replace(original,'auth.uid()','private.effective_user_id()');


end $identity_dependencies$;

CREATE OR REPLACE FUNCTION private.can_change_user_password(p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT private.effective_user_id()=auth.uid() AND private.has_module_access('users','change_password','web') AND EXISTS(
 SELECT 1 FROM public.profiles p JOIN public.roles r ON r.id=p.role_id
 JOIN auth.users u ON u.id=p.id WHERE p.id=p_user_id
 AND (private.is_super_admin() OR (r.key<>'super_admin' AND lower(u.email)<>'annasabbas01@gmail.com'))
 )
$function$;


do $identity_policies$
declare r record; clause text;
begin


if not exists(select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_own_read' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='c57409d1aa8a28b37caa2a5a47c20554') then raise exception 'Inspected assignment policy changed: notifications.notifications_own_read';end if;
alter policy "notifications_own_read" on public.notifications using ((user_id = ( SELECT private.effective_user_id() AS uid)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_own_update' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='90630d7b5e9ed6bd33f8c96de4bb540f') then raise exception 'Inspected assignment policy changed: notifications.notifications_own_update';end if;
alter policy "notifications_own_update" on public.notifications using ((user_id = ( SELECT private.effective_user_id() AS uid))) with check ((user_id = ( SELECT private.effective_user_id() AS uid)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='job_assignments' and policyname='job_assignments_select' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='1a931c20f4c1b3ade9463c48621f46c7') then raise exception 'Inspected assignment policy changed: job_assignments.job_assignments_select';end if;
alter policy "job_assignments_select" on public.job_assignments using ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND (user_id = ( SELECT private.effective_user_id() AS uid)) AND (unassigned_at IS NULL))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='job_orders' and policyname='job_orders_select' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='8a71981b4fcac65a543fb664343aebe5') then raise exception 'Inspected assignment policy changed: job_orders.job_orders_select';end if;
alter policy "job_orders_select" on public.job_orders using ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND ( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access) AND (EXISTS ( SELECT 1
   FROM job_assignments ja
  WHERE ((ja.job_order_id = job_orders.id) AND (ja.user_id = ( SELECT private.effective_user_id() AS uid)) AND (ja.unassigned_at IS NULL)))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks_select' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='a4e1ed649248d2d51aae51a987f2a5cc') then raise exception 'Inspected assignment policy changed: tasks.tasks_select';end if;
alter policy "tasks_select" on public.tasks using ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('tasks'::text, 'view'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND (assigned_to = ( SELECT private.effective_user_id() AS uid)))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='tasks' and policyname='tasks_update' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='6eca1bf41a92576b56fd258bd4a972ba') then raise exception 'Inspected assignment policy changed: tasks.tasks_update';end if;
alter policy "tasks_update" on public.tasks using ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('tasks'::text, 'update'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND (assigned_to = ( SELECT private.effective_user_id() AS uid))))) with check ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('tasks'::text, 'update'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND (assigned_to = ( SELECT private.effective_user_id() AS uid)))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_conversations' and policyname='chat_conversations_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='6b28bf084872ce9878ea98869b0d66ae') then raise exception 'Inspected assignment policy changed: chat_conversations.chat_conversations_insert';end if;
alter policy "chat_conversations_insert" on public.chat_conversations with check (((created_by = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'send'::text, 'web'::platform_key) AS has_module_access) AND ((conversation_type = 'direct'::text) OR ( SELECT private.has_module_access('chat'::text, 'groups.create'::text, 'web'::platform_key) AS has_module_access))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_message_attachments' and policyname='chat_attachments_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='884fb22069cb37f2ae4b89a3184d7e89') then raise exception 'Inspected assignment policy changed: chat_message_attachments.chat_attachments_insert';end if;
alter policy "chat_attachments_insert" on public.chat_message_attachments with check ((( SELECT private.has_module_access('chat'::text, 'attach'::text, 'web'::platform_key) AS has_module_access) AND (storage_bucket = 'chat-files'::text) AND (EXISTS ( SELECT 1
   FROM chat_messages message
  WHERE ((message.id = chat_message_attachments.message_id) AND (message.sender_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.chat_is_active_member(message.conversation_id) AS chat_is_active_member))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_message_reactions' and policyname='chat_reactions_delete' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='faaf31068aee823b3853cfd08eeeafac') then raise exception 'Inspected assignment policy changed: chat_message_reactions.chat_reactions_delete';end if;
alter policy "chat_reactions_delete" on public.chat_message_reactions using (((user_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'react'::text, 'web'::platform_key) AS has_module_access) AND (EXISTS ( SELECT 1
   FROM chat_messages message
  WHERE ((message.id = chat_message_reactions.message_id) AND ( SELECT private.chat_is_active_member(message.conversation_id) AS chat_is_active_member))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_message_reactions' and policyname='chat_reactions_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='0bc5de1f66fd0445bdd43f8b2e81152f') then raise exception 'Inspected assignment policy changed: chat_message_reactions.chat_reactions_insert';end if;
alter policy "chat_reactions_insert" on public.chat_message_reactions with check (((user_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'react'::text, 'web'::platform_key) AS has_module_access) AND (EXISTS ( SELECT 1
   FROM chat_messages message
  WHERE ((message.id = chat_message_reactions.message_id) AND ( SELECT private.chat_is_active_member(message.conversation_id) AS chat_is_active_member))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='2409a352dc59434b78c69dff2af59bd0') then raise exception 'Inspected assignment policy changed: chat_messages.chat_messages_insert';end if;
alter policy "chat_messages_insert" on public.chat_messages with check (((sender_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'send'::text, 'web'::platform_key) AS has_module_access) AND ( SELECT private.chat_is_active_member(chat_messages.conversation_id) AS chat_is_active_member)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_messages' and policyname='chat_messages_update' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='f5be57277d24cef29e04c9d9d3768022') then raise exception 'Inspected assignment policy changed: chat_messages.chat_messages_update';end if;
alter policy "chat_messages_update" on public.chat_messages using (((sender_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'send'::text, 'web'::platform_key) AS has_module_access) AND ( SELECT private.chat_is_active_member(chat_messages.conversation_id) AS chat_is_active_member))) with check (((sender_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'send'::text, 'web'::platform_key) AS has_module_access) AND ( SELECT private.chat_is_active_member(chat_messages.conversation_id) AS chat_is_active_member)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_conversation_members' and policyname='chat_members_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='3f21ee6e3379e0931061eafb8e89f77a') then raise exception 'Inspected assignment policy changed: chat_conversation_members.chat_members_insert';end if;
alter policy "chat_members_insert" on public.chat_conversation_members with check ((( SELECT private.has_module_access('chat'::text, 'view'::text, 'web'::platform_key) AS has_module_access) AND (((user_id = ( SELECT private.effective_user_id() AS uid)) AND (member_role = 'owner'::text) AND (EXISTS ( SELECT 1
   FROM chat_conversations conversation
  WHERE ((conversation.id = chat_conversation_members.conversation_id) AND (conversation.created_by = ( SELECT private.effective_user_id() AS uid))))) AND (NOT (EXISTS ( SELECT 1
   FROM chat_conversation_members existing_member
  WHERE (existing_member.conversation_id = existing_member.conversation_id))))) OR (( SELECT private.chat_can_manage(chat_conversation_members.conversation_id) AS chat_can_manage) AND ((EXISTS ( SELECT 1
   FROM chat_conversations conversation
  WHERE ((conversation.id = chat_conversation_members.conversation_id) AND (conversation.conversation_type = 'direct'::text)))) OR ( SELECT private.has_module_access('chat'::text, 'groups.create'::text, 'web'::platform_key) AS has_module_access)))) AND (EXISTS ( SELECT 1
   FROM profiles profile
  WHERE ((profile.id = chat_conversation_members.user_id) AND (profile.status = 'active'::account_status))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_conversation_members' and policyname='chat_members_update_own' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='66b809c2bcf928e2cb8a8b786df4e129') then raise exception 'Inspected assignment policy changed: chat_conversation_members.chat_members_update_own';end if;
alter policy "chat_members_update_own" on public.chat_conversation_members using (((user_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'view'::text, 'web'::platform_key) AS has_module_access))) with check (((user_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'view'::text, 'web'::platform_key) AS has_module_access)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='chat_message_reads' and policyname='chat_reads_insert' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='a3cb1d361c5efcb48bf094ecf91bf3d9') then raise exception 'Inspected assignment policy changed: chat_message_reads.chat_reads_insert';end if;
alter policy "chat_reads_insert" on public.chat_message_reads with check (((user_id = ( SELECT private.effective_user_id() AS uid)) AND ( SELECT private.has_module_access('chat'::text, 'view'::text, 'web'::platform_key) AS has_module_access) AND (EXISTS ( SELECT 1
   FROM chat_messages message
  WHERE ((message.id = chat_message_reads.message_id) AND ( SELECT private.chat_is_active_member(message.conversation_id) AS chat_is_active_member))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_read' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='9bfbe3a843412b58c1a86908b3df2070') then raise exception 'Inspected assignment policy changed: profiles.profiles_read';end if;
alter policy "profiles_read" on public.profiles using (((id = ( SELECT private.effective_user_id() AS uid)) OR ( SELECT private.has_module_access('users'::text, 'view'::text, 'web'::platform_key) AS has_module_access) OR ((status = 'active'::account_status) AND ( SELECT private.has_module_access('chat'::text, 'view'::text, 'web'::platform_key) AS has_module_access))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='users can read their profile' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='5f56f788dd855d0fe7111cc233214768') then raise exception 'Inspected assignment policy changed: profiles.users can read their profile';end if;
alter policy "users can read their profile" on public.profiles using ((id = private.effective_user_id()));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='files' and policyname='files_read' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='eae13e6794b547b04cd99c96be14c7ab') then raise exception 'Inspected assignment policy changed: files.files_read';end if;
alter policy "files_read" on public.files using (((uploaded_by = ( SELECT private.effective_user_id() AS uid)) OR ( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access) OR ( SELECT private.has_module_access('leads'::text, 'view'::text, 'web'::platform_key) AS has_module_access)));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='job_order_items' and policyname='job_order_items_select' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='88c7590ff5ca7069afb8829057c73660') then raise exception 'Inspected assignment policy changed: job_order_items.job_order_items_select';end if;
alter policy "job_order_items_select" on public.job_order_items using ((((( SELECT private.current_role_key() AS current_role_key) <> 'installer'::text) AND ( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access)) OR ((( SELECT private.current_role_key() AS current_role_key) = 'installer'::text) AND (EXISTS ( SELECT 1
   FROM job_assignments ja
  WHERE ((ja.job_order_id = job_order_items.job_order_id) AND (ja.user_id = ( SELECT private.effective_user_id() AS uid)) AND (ja.unassigned_at IS NULL)))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='product_requests' and policyname='crm_upgrade_read' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='e45fcb4e8f46744886edf39ec3395e12') then raise exception 'Inspected assignment policy changed: product_requests.crm_upgrade_read';end if;
alter policy "crm_upgrade_read" on public.product_requests using ((( SELECT private.has_module_access('jobs'::text, 'view'::text, 'web'::platform_key) AS has_module_access) AND ((( SELECT private.current_role_key() AS current_role_key) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text])) OR (requested_by = ( SELECT private.effective_user_id() AS uid)) OR (collector_id = ( SELECT private.effective_user_id() AS uid)) OR (EXISTS ( SELECT 1
   FROM job_orders j
  WHERE (j.id = product_requests.job_order_id))))));

if not exists(select 1 from pg_policies where schemaname='public' and tablename='return_forms' and policyname='crm_upgrade_read' and md5(coalesce(qual,'')||chr(10)||coalesce(with_check,''))='76718befd61e6db4b6ecbb521765666f') then raise exception 'Inspected assignment policy changed: return_forms.crm_upgrade_read';end if;
alter policy "crm_upgrade_read" on public.return_forms using ((( SELECT private.has_module_access('warehouse'::text, 'view'::text, 'web'::platform_key) AS has_module_access) AND ((( SELECT private.current_role_key() AS current_role_key) = ANY (ARRAY['super_admin'::text, 'admin'::text, 'manager'::text])) OR (uploaded_by = ( SELECT private.effective_user_id() AS uid)))));

end $identity_policies$;

create function private.impersonated_record_access(p_collection text,p_data jsonb,p_action text) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare module_key text; uid text:=private.effective_user_id()::text; assigned boolean; role_key text:=private.current_role_key();
begin
 if role_key is null then return false; end if;
 if p_collection='logs' then return p_action in ('view','create');end if;
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

-- Restrict impersonated requests without changing ordinary business access.
create policy impersonated_records_read on public.crm_records as restrictive for select to authenticated
 using(private.effective_user_id()=auth.uid() or private.impersonated_record_access(collection,data,'view'));
create policy impersonated_records_insert on public.crm_records as restrictive for insert to authenticated
 with check(private.effective_user_id()=auth.uid() or private.impersonated_record_access(collection,data,'create'));
create policy impersonated_records_update on public.crm_records as restrictive for update to authenticated
 using(private.effective_user_id()=auth.uid() or private.impersonated_record_access(collection,data,'update'))
 with check(private.effective_user_id()=auth.uid() or private.impersonated_record_access(collection,data,'update'));
create policy impersonated_records_delete on public.crm_records as restrictive for delete to authenticated
 using(private.effective_user_id()=auth.uid() or private.impersonated_record_access(collection,data,'delete'));
-- The existing workflow receipt identity must follow the effective actor as well.
alter policy workflow_receipts_actor on private.crm_job_workflow_operations
 using(actor_id=(select private.effective_user_id()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
 and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager') and (select private.has_module_access('jobs','view','web')))
 with check(actor_id=(select private.effective_user_id()) and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
 and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager') and (select private.has_module_access('jobs','view','web')));
revoke all on function private.effective_user_id(),private.impersonation_context(),private.impersonated_record_access(text,jsonb,text) from public,anon;
grant execute on function private.effective_user_id(),private.impersonation_context(),private.impersonated_record_access(text,jsonb,text) to authenticated;
notify pgrst, 'reload schema';
commit;
