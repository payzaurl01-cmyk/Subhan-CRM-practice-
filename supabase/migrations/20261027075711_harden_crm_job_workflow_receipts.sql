-- Only objects introduced by restore_crm_job_workflow_rpc are changed here.
begin;
alter policy workflow_receipts_actor on private.crm_job_workflow_operations
 using(actor_id=(select auth.uid())
  and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager')
  and (select private.has_module_access('jobs','view','web')))
 with check(actor_id=(select auth.uid())
  and not coalesce(((select auth.jwt())->>'is_anonymous')::boolean,false)
  and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager')
  and (select private.has_module_access('jobs','view','web')));
-- Match log(action, entity, reference, summary) in the current runtime exactly.
do $audit_contract$
declare definition text; patched text;
begin
 definition:=pg_get_functiondef('public.crm_job_workflow_command(text,bigint,text,jsonb,uuid)'::regprocedure);
 patched:=replace(definition,'''record'',j->>''number'',''detail'',reason',
  '''reference'',j->>''number'',''summary'',reason,''result'',''Success'',''actingAsUserId'',null');
 if patched=definition then raise exception 'Unexpected workflow audit baseline';end if;
 execute patched;
end $audit_contract$;
notify pgrst, 'reload schema';
commit;
