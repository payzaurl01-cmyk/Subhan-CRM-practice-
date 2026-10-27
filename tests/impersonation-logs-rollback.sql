-- Run against the installed migration. All fixture writes are rolled back.
begin;
do $claims$
declare actor uuid; login uuid;
begin
 select p.id,s.id into actor,login from public.profiles p join public.roles r on r.id=p.role_id join auth.sessions s on s.user_id=p.id
 join auth.users u on u.id=p.id where r.key='super_admin' and p.status='active' and r.active and u.email_confirmed_at is not null
 and (u.banned_until is null or u.banned_until<=now()) and (s.not_after is null or s.not_after>now()) limit 1;
 if actor is null then raise exception 'An existing active Super Admin login is required for rollback verification';end if;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',actor,'session_id',login,'role','authenticated','aal','aal1','is_anonymous',false)::text,true);
 perform set_config('request.headers','{}',true);
end $claims$;
set local role authenticated;
select set_config('test.manager',(select p.id::text from public.profiles p join public.roles r on r.id=p.role_id where r.key='manager' and p.status='active' and r.active limit 1),true),
 set_config('test.installer',(select p.id::text from public.profiles p join public.roles r on r.id=p.role_id where r.key='installer' and p.status='active' and r.active limit 1),true);
select set_config('test.impersonation',public.start_impersonation(current_setting('test.manager')::uuid,'Untrusted client reason',null)::text,true);
do $start_check$ begin
 if public.start_impersonation(current_setting('test.manager')::uuid,'Retry',null)::text<>current_setting('test.impersonation') then raise exception 'Duplicate session created';end if;
 if not exists(select 1 from public.impersonation_sessions where id=current_setting('test.impersonation')::uuid and reason='Super Admin initiated Login as user.' and auth_session_id::text=auth.jwt()->>'session_id') then raise exception 'Session metadata mismatch';end if;
end $start_check$;
select set_config('request.headers',jsonb_build_object('x-crm-impersonation',current_setting('test.impersonation'))::text,true);
do $context_check$ declare context jsonb:=public.get_access_context('web');begin
 if context#>>'{profile,id}'<>current_setting('test.manager') or context#>>'{profile,role}'<>'manager' or context#>>'{impersonation,real_actor_user_id}'<>auth.uid()::text then raise exception 'Effective context mismatch';end if;
 if private.is_super_admin() or public.owner_portal_access() then raise exception 'Owner authority leaked';end if;
 begin perform public.start_impersonation(current_setting('test.installer')::uuid,'nested',null);raise exception 'Nested session accepted';exception when insufficient_privilege then null;end;
end $context_check$;
insert into public.crm_records(collection,id,data) values('logs','__impersonation_rollback_event',jsonb_build_object('id','__impersonation_rollback_event','action','Rollback impersonation check','userId',current_setting('test.installer'),'actorRole','installer','createdAt',now()));
do $visibility_check$ begin
 if exists(select 1 from public.crm_records where collection='logs' and id='__impersonation_rollback_event') then raise exception 'Manager sees actual Super Admin event';end if;
end $visibility_check$;
select set_config('request.headers','{}',true);
do $snapshot_check$ declare event jsonb;begin
 select data into event from public.crm_records where collection='logs' and id='__impersonation_rollback_event';
 if event->>'actorRole'<>'super_admin' or event->>'userId'<>auth.uid()::text or event->>'actingAsUserId'<>current_setting('test.manager') or event->>'impersonationSessionId'<>current_setting('test.impersonation') then raise exception 'Actor snapshot mismatch';end if;
 if not public.end_impersonation(current_setting('test.impersonation')::uuid) then raise exception 'End was not confirmed';end if;
 if public.end_impersonation(current_setting('test.impersonation')::uuid) then raise exception 'Already ended session reported active';end if;
end $snapshot_check$;
select set_config('test.impersonation',public.start_impersonation(current_setting('test.installer')::uuid,'Installer scope',null)::text,true);
insert into public.crm_records(collection,id,data) values
 ('jobs','__impersonation_rollback_assigned',jsonb_build_object('id','__impersonation_rollback_assigned','installerId',current_setting('test.installer'),'items','[]'::jsonb)),
 ('jobs','__impersonation_rollback_unassigned',jsonb_build_object('id','__impersonation_rollback_unassigned','installerId',current_setting('test.manager'),'items','[]'::jsonb));
select set_config('request.headers',jsonb_build_object('x-crm-impersonation',current_setting('test.impersonation'))::text,true);
do $assignment_check$ begin
 if not exists(select 1 from public.crm_records where collection='jobs' and id='__impersonation_rollback_assigned') or exists(select 1 from public.crm_records where collection='jobs' and id='__impersonation_rollback_unassigned') then raise exception 'Installer assignment boundary failed';end if;
end $assignment_check$;
select set_config('request.headers','{}',true);
update public.impersonation_sessions set started_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' where id=current_setting('test.impersonation')::uuid;
select set_config('request.headers',jsonb_build_object('x-crm-impersonation',current_setting('test.impersonation'))::text,true);
do $expiry_check$ begin
 begin perform public.get_access_context('web');raise exception 'Expired selection accepted';exception when insufficient_privilege then null;end;
end $expiry_check$;
select set_config('request.headers','{}',true);
do $cleanup_check$ begin
 if not public.end_impersonation(current_setting('test.impersonation')::uuid) then raise exception 'Expired session cleanup failed';end if;
 if (public.get_access_context('web')#>>'{profile,role}')<>'super_admin' then raise exception 'Owner context not restored';end if;
end $cleanup_check$;
reset role;
rollback;
select 'Impersonation, actor snapshots, assignment visibility, expiry and return checks passed; all fixtures rolled back' verification;
