-- Conditional stages extend the current crm_records job/task model. No production
-- data correction is executed by installation. Preview/apply corrections explicitly.
begin;
do $dependencies$ begin
 if to_regprocedure('private.effective_user_id()') is null then raise exception 'Release the reviewed Master Control effective-identity extension before the job workflow extension';end if;
end $dependencies$;
create table public.crm_job_workflow_operations (
 id uuid primary key, actor_id uuid not null references public.profiles(id),job_id text not null,
 request_hash text not null,result jsonb,complete boolean not null default false,transaction_id bigint not null default txid_current(),created_at timestamptz not null default now()
);
create index crm_job_workflow_operations_job on public.crm_job_workflow_operations(job_id,created_at);
alter table public.crm_job_workflow_operations enable row level security;
revoke all on public.crm_job_workflow_operations from public,anon,authenticated;
grant select on public.crm_job_workflow_operations to authenticated;
create policy workflow_receipts_read on public.crm_job_workflow_operations for select to authenticated
 using(actor_id=(select private.effective_user_id()) and (select private.has_module_access('jobs','view','web')));

create function private.crm_work_type(j jsonb) returns text language sql immutable set search_path='' as $$
 select case when j->>'workType' in ('repair','installation','supply') then j->>'workType'
 when coalesce(j->>'service','') ~* 'repair|maintenance' then 'repair'
 when coalesce(j->>'service','') ~* 'supply.?only|delivery.?only' then 'supply' else 'installation' end
$$;
create function private.crm_company_stock(x jsonb) returns boolean language sql immutable set search_path='' as $$
 select coalesce(x->>'requiresInventory','true')<>'false' and coalesce(x->>'requires_inventory','true')<>'false'
 and lower(coalesce(x->>'fulfilmentSource',x->>'fulfillmentSource','company')) not in ('customer','customer supplied','customer_supplied','none','service')
 and lower(coalesce(x->>'lineKind',x->>'line_kind',x->>'kind',x->>'itemType','')) not in ('service','labour','labor','fee','note','custom')
 and (coalesce(x->>'requiresInventory',x->>'requires_inventory')='true' or coalesce(x->>'productId',x->>'product_id',x->>'variantId',x->>'variant_id','')<>''
 or lower(coalesce(x->>'lineKind',x->>'line_kind',x->>'kind',x->>'itemType','')) in ('inventory','physical','product','stock'))
$$;
create function private.crm_qty(x jsonb,k text, fallback numeric default 0) returns numeric
language plpgsql immutable set search_path='' as $$
#variable_conflict use_column
declare v numeric;
begin
 if x->>k is null then return fallback; end if;
 begin v:=(x->>k)::numeric; exception when others then raise exception 'Invalid quantity: %',k; end;
 if v<0 or v::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid quantity: %',k; end if;
 return v;
end $$;
create function private.crm_stock_facts(j jsonb) returns jsonb language plpgsql immutable set search_path='' as $$
#variable_conflict use_column
declare x jsonb; req numeric; issued numeric; used numeric; returned numeric; outstanding numeric:=0; surplus numeric:=0; activity boolean:=false; required boolean:=false;
begin
 for x in select value from jsonb_array_elements(coalesce(j->'items','[]')) loop
  if not private.crm_company_stock(x) then continue; end if;
  req:=case when coalesce(x->>'active','true')='false' or coalesce(x->>'cancelled','false')='true' or coalesce(x->>'excluded','false')='true' or lower(coalesce(x->>'status','')) in ('cancelled','canceled','excluded') then 0 else private.crm_qty(x,'quantityRequired',private.crm_qty(x,'quantity')) end;
  issued:=private.crm_qty(x,'quantityIssued',private.crm_qty(x,'quantity_issued',case when j->>'collectionIssuedAt' is not null then private.crm_qty(x,'quantityPicked') else 0 end));
  used:=private.crm_qty(x,'quantityUsed',private.crm_qty(x,'quantity_used'));returned:=private.crm_qty(x,'quantityReturned',private.crm_qty(x,'quantity_returned'));
  required:=required or req>0; outstanding:=outstanding+greatest(0,req-issued);surplus:=surplus+greatest(0,issued-returned-used-req);
  activity:=activity or issued>0 or used>0 or returned>0 or private.crm_qty(x,'quantityReserved')>0 or private.crm_qty(x,'quantityPicked')>0 or private.crm_qty(x,'quantityMatched')>0;
 end loop;
 return jsonb_build_object('outstanding',outstanding,'surplus',surplus,'activity',activity,'requiresCompanyStock',required);
end $$;
create function private.crm_workflow_shortage(j jsonb) returns boolean
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare x jsonb; variant uuid; needed numeric; available numeric;
begin
 for x in select value from jsonb_array_elements(coalesce(j->'items','[]')) loop
  if not private.crm_company_stock(x) or x->>'active'='false' or x->>'cancelled'='true' or x->>'excluded'='true' or lower(coalesce(x->>'status','')) in ('cancelled','canceled','excluded') then continue;end if;
  needed:=greatest(0,private.crm_qty(x,'quantityRequired',private.crm_qty(x,'quantity'))-private.crm_qty(x,'quantityIssued',case when j->>'collectionIssuedAt' is not null then private.crm_qty(x,'quantityPicked') else 0 end));
  if needed=0 then continue;end if;
  begin variant:=coalesce(x->>'variantId',x->>'productId')::uuid;exception when invalid_text_representation then return true;end;
  select coalesce(sum(greatest(0,quantity_on_hand-quantity_reserved)),0) into available from public.inventory_balances where variant_id=variant;
  if needed>available+private.crm_qty(x,'quantityReserved') then return true;end if;
 end loop;return false;
end $$;
create function private.crm_stage_type(j jsonb,stage text) returns text language sql immutable set search_path='' as $$
 select coalesce((select s->>'type' from jsonb_array_elements(coalesce(j->'stages','[]')) s where s->>'id'=stage limit 1),stage)
$$;
create function private.crm_workflow_plan(j jsonb,ts jsonb default '[]',p_shortage boolean default false,p_returns boolean default false) returns jsonb
language plpgsql stable set search_path='' as $$
#variable_conflict use_column
declare kinds text[]:=array['Confirmed']; typ text:=private.crm_work_type(j); f jsonb:=private.crm_stock_facts(j); stages jsonb:='[]'; s jsonb; t jsonb; tasks jsonb:=ts; k text; chosen jsonb; after_id text; reordered jsonb; inserted boolean; title text; action text; category text; stage_id text; suffix integer;
begin
 if j->>'status'='Completed' then return jsonb_build_object('job',j,'tasks',ts); end if;
 if (f->>'outstanding')::numeric>0 then
  if p_shortage then kinds:=kinds||array['Stock Shortage']; end if;
  kinds:=kinds||array['Picking','Ready for Collection','Collected'];
 end if;
 if typ<>'supply' then kinds:=kinds||case when typ='repair' then array['Repair Scheduled','Repair in Progress'] else array['Installation Scheduled','Installation in Progress'] end; end if;
 if p_returns or (f->>'surplus')::numeric>0 then kinds:=kinds||array['Return Pending'];end if;
 kinds:=kinds||array['Completed'];
 -- Retain all historical and manually managed stages. Generated outstanding
 -- stages alone can become not applicable.
 for s in select value from jsonb_array_elements(coalesce(j->'stages','[]')) loop
  if s->>'origin'='generated' and not (s->>'type'=any(kinds)) and s->>'status'<>'Completed' then s:=s||jsonb_build_object('applicable',false,'status','Not applicable','notApplicableReason','No outstanding requirement');end if;
  stages:=stages||jsonb_build_array(s);
 end loop;
 foreach k in array kinds loop
  select value into chosen from jsonb_array_elements(stages) where value->>'origin'='generated' and value->>'type'=k and value->>'status'<>'Completed' limit 1;
  if chosen is null and exists(select 1 from jsonb_array_elements(stages) s where s->>'type'=k and s->>'status'='Completed') and not (k=any(array['Stock Shortage','Picking','Ready for Collection','Collected']) and (f->>'outstanding')::numeric>0) then continue; end if;
  if chosen is null then
   stage_id:=k;suffix:=1;while exists(select 1 from jsonb_array_elements(stages) s where s->>'id'=stage_id) loop suffix:=suffix+1;stage_id:=k||':'||suffix;end loop;
   stages:=stages||jsonb_build_array(jsonb_build_object('id',stage_id,'type',k,'name',k,'description','','origin','generated','status','Pending','applicable',true));
  else
   select coalesce(jsonb_agg(case when s->>'id'=chosen->>'id' then s||jsonb_build_object('applicable',true,'status',case when s->>'status'='Not applicable' then 'Pending' else s->>'status' end) else s end),'[]') into stages from jsonb_array_elements(stages) s;
  end if;
 end loop;
 select coalesce(jsonb_agg(s order by case s->>'type' when 'Confirmed' then 0 when 'Stock Shortage' then 1 when 'Picking' then 2 when 'Ready for Collection' then 3 when 'Collected' then 4 when 'Installation Scheduled' then 5 when 'Repair Scheduled' then 5 when 'Installation in Progress' then 6 when 'Repair in Progress' then 6 when 'Return Pending' then 7 when 'Completed' then 9 else 8 end),'[]') into reordered from jsonb_array_elements(stages) s where s->>'origin'<>'manual';
 for s in select value from jsonb_array_elements(stages) where value->>'origin'='manual' loop
  after_id:=s->>'after';inserted:=false;stages:='[]';
  for chosen in select value from jsonb_array_elements(reordered) loop
   if not inserted and chosen->>'type'='Completed' then stages:=stages||jsonb_build_array(s);inserted:=true;end if;
   stages:=stages||jsonb_build_array(chosen);
   if not inserted and chosen->>'id'=after_id then stages:=stages||jsonb_build_array(s);inserted:=true;end if;
  end loop;
  if not inserted then stages:=stages||jsonb_build_array(s);end if;reordered:=stages;
 end loop;
 stages:=reordered;
 select coalesce(jsonb_agg(case when t->>'status'<>'Completed' and exists(select 1 from jsonb_array_elements(stages) s where s->>'id'=t->>'jobStage' and s->>'applicable'='false') then t||jsonb_build_object('status','Not applicable','applicable',false) else t end),'[]') into tasks from jsonb_array_elements(ts) t;
 for s in select value from jsonb_array_elements(stages) where value->>'origin'='generated' and value->>'applicable'<>'false' and value->>'status'<>'Completed' loop
  k:=s->>'type';stage_id:=s->>'id';action:=null;
  case k when 'Stock Shortage' then title:='Resolve stock shortage';category:='Warehouse';action:='resolve-shortage';
  when 'Picking' then title:='Confirm pickup warehouse location';category:='Picking';action:='confirm-location';
  when 'Ready for Collection' then title:='Scan and match collection products';category:='Collection';action:='scan-collection';
  when 'Installation Scheduled','Repair Scheduled' then title:=case when typ='repair' then 'Schedule repair' else 'Schedule installation' end;category:=case when typ='repair' then 'Repair' else 'Installation' end;action:='schedule-work';
  when 'Installation in Progress','Repair in Progress' then title:=case when typ='repair' then 'Complete repair' else 'Complete installation' end;category:=case when typ='repair' then 'Repair' else 'Installation' end;action:='perform-work';
  else null;end case;
  if action is null then continue; end if;
  if j->>'quoteId' is not null and exists(select 1 from jsonb_array_elements(tasks) t where t->>'status'='Completed' and t->>'quoteId'=j->>'quoteId' and t->>'leadId'=j->>'leadId' and t->>'category' in ('Installation','Repair') and ((action='schedule-work' and t->>'jobStage'='Collected') or (action='perform-work' and t->>'jobStage' in ('Installation in Progress','Repair in Progress')))) then continue;end if;
  if exists(select 1 from jsonb_array_elements(tasks) t where t->>'jobStage'=stage_id and t->>'workflowAction'=action and t->>'status'<>'Not applicable') then continue;end if;
  t:=jsonb_build_object('id',(j->>'id')||':workflow:'||stage_id||':'||action,'jobId',j->>'id','leadId',coalesce(j->>'leadId',''),'jobStage',stage_id,'title',title||' for '||coalesce(j->>'number',j->>'id'),'category',category,'workflowAction',action,'workflowOrigin','generated','assignedTo',coalesce(j->>'installerId',''),'status','Pending','priority','High','dueAt',coalesce(j->>'installationDate',now()::text),'notes','Generated for the applicable job workflow.','required',true);
  tasks:=tasks||jsonb_build_array(t);
 end loop;
 if typ<>'supply' and not exists(select 1 from jsonb_array_elements(tasks) t where t->>'workflowAction'='installation-proof' and (j->>'evidenceRequiredAfter' is null or t->>'status'<>'Completed' or (t->>'completedAt')::timestamptz>=(j->>'evidenceRequiredAfter')::timestamptz)) then
  select x->>'id' into stage_id from jsonb_array_elements(stages) x where x->>'type'=case when typ='repair' then 'Repair in Progress' else 'Installation in Progress' end and x->>'status'<>'Completed' and x->>'applicable'<>'false' limit 1;
  tasks:=tasks||jsonb_build_array(jsonb_build_object('id',(j->>'id')||':proof:'||coalesce(j->>'evidenceRequiredAfter','initial'),'title','Upload '||typ||' photos/videos for '||coalesce(j->>'number',j->>'id'),'jobId',j->>'id','jobStage',coalesce(stage_id,case when typ='repair' then 'Repair in Progress' else 'Installation in Progress' end),'category',case when typ='repair' then 'Repair' else 'Installation' end,'workflowAction','installation-proof','workflowOrigin','generated','assignedTo',coalesce(j->>'installerId',''),'status','Pending','priority','High','requiredEvidence','after','evidenceRequiredAfter',j->'evidenceRequiredAfter'));
 end if;
 j:=j||jsonb_build_object('workflowVersion',1,'workType',typ,'stages',stages);
 if exists(select 1 from jsonb_array_elements(stages) s where s->>'id'=j->>'status' and s->>'applicable'='false') then
  select s->>'id' into k from jsonb_array_elements(stages) s where s->>'applicable'<>'false' and s->>'status'<>'Completed' and s->>'type'<>'Completed' limit 1;j:=j||jsonb_build_object('status',coalesce(k,'Confirmed'));
 end if;
 return jsonb_build_object('job',j,'tasks',tasks);
end $$;

create function private.crm_workflow_has_evidence(j jsonb,phase text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from jsonb_array_elements(coalesce(j->'installationProof','[]')) p join storage.objects o on o.bucket_id='crm-media' and o.name=p->>'blobId'
 where o.archived_at is null and not coalesce(o.is_delete_marker,false) and p->>'userId'=j->>'installerId' and p->>'kind' in ('photo','video') and coalesce(p->>'phase','after')=phase
 and (j->>'evidenceRequiredAfter' is null or (p->>'createdAt')::timestamptz>=(j->>'evidenceRequiredAfter')::timestamptz)
 and (phase='before' or (p#>>'{location,source}'='Device geolocation' and jsonb_typeof(p#>'{location,latitude}')='number' and jsonb_typeof(p#>'{location,longitude}')='number' and jsonb_typeof(p#>'{location,accuracy}')='number' and (p#>>'{location,latitude}')::numeric between -90 and 90 and (p#>>'{location,longitude}')::numeric between -180 and 180 and (p#>>'{location,accuracy}')::numeric>=0)))
$$;
create function private.crm_workflow_completion_error(j jsonb,ts jsonb) returns text
language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
declare f jsonb:=private.crm_stock_facts(j); s jsonb; evidence text; p jsonb;
begin
 if coalesce(j->>'financialHold','false')='true' then return 'Resolve the job financial hold before completion';end if;
 if (f->>'outstanding')::numeric>0 then return 'Outstanding company stock must be picked and issued';end if;
 if (f->>'surplus')::numeric>0 then return 'Issued surplus must be returned or reconciled';end if;
 if exists(select 1 from public.crm_records where collection='returns' and data->>'jobId'=j->>'id' and coalesce(data->>'status','') not in ('Processed','Cancelled')) then return 'Unresolved returns remain';end if;
 if exists(select 1 from jsonb_array_elements(ts) t where coalesce(t->>'applicable','true')<>'false' and t->>'status' not in ('Completed','Not applicable') and coalesce(t->>'required','true')<>'false' and not exists(select 1 from jsonb_array_elements(coalesce(j->'stages','[]')) s where s->>'id'=t->>'jobStage' and s->>'applicable'='false')) then return 'Complete required applicable tasks';end if;
 for s in select value from jsonb_array_elements(coalesce(j->'stages','[]')) where value->>'applicable'<>'false' and value->>'origin'='manual' loop
  if s->>'status'<>'Completed' and s->>'id'<>j->>'status' then return 'Complete required manual stages';end if;
 end loop;
 if (private.crm_work_type(j)<>'supply' or exists(select 1 from jsonb_array_elements(coalesce(j->'stages','[]')) s where s->>'requiredEvidence'='after' and s->>'applicable'<>'false')) and not private.crm_workflow_has_evidence(j,'after') then return 'Saved after evidence and installer device location are required';end if;
 return null;
end $$;

-- Reconcile only the affected reserved/unissued quantity. No ledger/issue/return
-- records are deleted or rewritten, and on-hand inventory is never changed here.
create function private.crm_workflow_release(j jsonb,old_line jsonb,target numeric) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare job_uuid uuid; line_uuid uuid; r record; b record; delta numeric; remaining numeric; active_reserved numeric; normalized boolean:=false;
begin
 if not private.has_module_access('warehouse','update','web') or not private.has_module_access('inventory','update','web') then raise exception 'Inventory and warehouse update permission required for stock reconciliation' using errcode='42501';end if;
 begin job_uuid:=coalesce(j->>'normalizedJobId',j->>'id')::uuid;line_uuid:=coalesce(old_line->>'normalizedItemId',old_line->>'id')::uuid;exception when invalid_text_representation then raise exception 'Map the legacy job/item to its stock records before reconciliation';end;
 if not exists(select 1 from public.job_order_items where id=line_uuid and job_order_id=job_uuid) then raise exception 'Verified normalized stock mapping required';end if;
 perform 1 from public.job_order_items where id=line_uuid for update;
 if exists(select 1 from public.job_order_items where id=line_uuid and (quantity_used>target or quantity_issued>target+coalesce((old_line->>'quantityReturned')::numeric,0))) then raise exception 'Issued/consumed quantity requires a verified return or correction';end if;
 select coalesce(sum(quantity-quantity_released),0) into active_reserved from public.stock_reservations where job_order_item_id=line_uuid and status='active' and consumed_at is null and released_at is null;
 remaining:=greatest(0,active_reserved-target);
 perform b.id from public.inventory_balances b where b.id in (select inventory_balance_id from public.stock_reservations where job_order_item_id=line_uuid and status='active' and consumed_at is null and released_at is null) order by b.id for update;
 for r in select * from public.stock_reservations where job_order_item_id=line_uuid and status='active' and consumed_at is null and released_at is null order by id for update loop
  exit when remaining<=0;delta:=least(remaining,r.quantity-r.quantity_released);
  if r.inventory_balance_id is null then raise exception 'Reservation has no exact balance mapping; reconcile through warehouse review';end if;
  select * into b from public.inventory_balances where id=r.inventory_balance_id for update;
  if b.id is null or b.quantity_reserved<delta then raise exception 'Reservation/balance mismatch requires reconciliation';end if;
  update public.inventory_balances set quantity_reserved=quantity_reserved-delta,version=version+1,updated_at=now() where id=b.id;
  update public.stock_reservations set quantity_released=quantity_released+delta,status=case when quantity_released+delta>=quantity then 'released' else status end,released_at=case when quantity_released+delta>=quantity then now() else released_at end,updated_at=now() where id=r.id;
  update public.pick_list_items set quantity_required=greatest(0,quantity_required-delta),quantity_picked=least(quantity_picked,greatest(0,quantity_required-delta)),updated_at=now() where reservation_id=r.id;
  remaining:=remaining-delta;
 end loop;
 if remaining>0 then raise exception 'Unmapped reservation quantity remains';end if;
 update public.job_order_items set quantity=case when target>0 then target else quantity end,requires_inventory=target>0,quantity_matched=least(quantity_matched,target) where id=line_uuid;
 return old_line||jsonb_build_object('quantityReserved',least(private.crm_qty(old_line,'quantityReserved'),target),'quantityMatched',least(private.crm_qty(old_line,'quantityMatched'),target),'quantityPicked',case when j->>'collectionIssuedAt' is null then least(private.crm_qty(old_line,'quantityPicked'),target) else private.crm_qty(old_line,'quantityPicked') end);
end $$;

create function public.crm_job_workflow_command(p_job_id text,p_revision bigint,p_operation text,p_payload jsonb,p_operation_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=private.effective_user_id(); j jsonb; before_job jsonb; ts jsonb; result jsonb; plan jsonb; s jsonb; old_line jsonb; line jsonb; receipt public.crm_job_workflow_operations; hash text:=md5(p_job_id||'/'||p_operation||'/'||p_payload::text); reason text:=trim(coalesce(p_payload->>'reason','')); qty numeric; required numeric; target numeric; typ text; stage_id text; stage_kind text; current_stage jsonb; quote jsonb; lead jsonb; ev jsonb; new_tasks jsonb; source_stage jsonb; row record;
begin
 if actor is null or private.current_role_key() not in ('super_admin','admin','manager') or not private.has_module_access('jobs','view','web') or not private.has_module_access('jobs',case when p_operation in ('create','from_quote') then 'create' else 'update' end,'web') then raise exception 'Current management job permission required' using errcode='42501';end if;
 if p_operation_id is null or p_job_id is null or length(reason)<1 then raise exception 'Operation id, job id and reason required';end if;
 perform pg_advisory_xact_lock(hashtextextended('job-workflow-op/'||p_operation_id::text,0));
 select * into receipt from public.crm_job_workflow_operations where id=p_operation_id;
 if found then
  if receipt.actor_id<>actor or receipt.request_hash<>hash or not receipt.complete then raise exception 'Operation id was already used with different inputs';end if;
  perform pg_advisory_xact_lock(hashtextextended('job-workflow/'||p_job_id,0));
  select data into j from public.crm_records where collection='jobs' and id=p_job_id for update;
  select coalesce(jsonb_agg(data order by id),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id;
  return jsonb_build_object('job',j,'tasks',ts);
 end if;
 perform pg_advisory_xact_lock(hashtextextended('job-workflow/'||p_job_id,0));
 select data into j from public.crm_records where collection='jobs' and id=p_job_id for update;
 if p_operation in ('create','from_quote') then
  if j is not null then raise exception 'Job already exists';end if;
  if p_operation='from_quote' then
   if not private.has_module_access('quotations','view','web') then raise exception 'Quotation access required';end if;
   select data into quote from public.crm_records where collection='quotes' and id=p_payload->>'quoteId' for update;
   if quote is null or quote->>'status'<>'Accepted' then raise exception 'Accepted quotation required';end if;
   if exists(select 1 from public.crm_records where collection='jobs' and data->>'quoteId'=quote->>'id') then raise exception 'Quotation already has a job; reload its linked job';end if;
   select data into lead from public.crm_records where collection='leads' and id=quote->>'leadId';
   if lead is null then raise exception 'Linked lead required';end if;
   p_payload:=p_payload||jsonb_build_object('customer',lead->>'customer','phone',lead->>'phone','address',lead->>'address','postcode',lead->>'postcode','service',lead->>'service','installationDate',coalesce(p_payload->>'installationDate',(now()+interval '7 days')::text));
  end if;
  if trim(coalesce(p_payload->>'customer',''))='' then raise exception 'Customer is required';end if;
  if coalesce(p_payload->>'installerId','')<>'' and not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id::text=p_payload->>'installerId' and p.status='active' and r.key='installer') then raise exception 'Choose an active installer';end if;
  j:=jsonb_build_object('id',p_job_id,'number','JOB-'||substr(p_operation_id::text,1,8),'customer',p_payload->>'customer','phone',coalesce(p_payload->>'phone',''),'address',coalesce(p_payload->>'address',''),'postcode',coalesce(p_payload->>'postcode',''),'service',coalesce(p_payload->>'service',p_payload->>'workType','Installation'),'workType',private.crm_work_type(p_payload),'status','Confirmed','installerId',coalesce(p_payload->>'installerId',''),'installationDate',coalesce(p_payload->>'installationDate',(now()+interval '7 days')::text),'items','[]'::jsonb,'stages','[]'::jsonb,'timeline','[]'::jsonb,'photos','[]'::jsonb,'installationProof','[]'::jsonb,'extraItems','[]'::jsonb,'value',coalesce((quote->>'total')::numeric,0),'outstanding',0,'workflowVersion',1,'workflowRevision',0);
  if p_operation='from_quote' then
   j:=j||jsonb_build_object('quoteId',quote->>'id','leadId',lead->>'id','items',coalesce((select jsonb_agg(jsonb_build_object('id','line-'||p_operation_id||'-'||ord,'productId',x->>'productId','variantId',x->>'productId','name',x->>'description','sku',coalesce(x->>'sku',''),'kind',x->>'kind','requiresInventory',coalesce(x->'requiresInventory','true'::jsonb),'fulfilmentSource',coalesce(x->>'fulfilmentSource','company'),'quantityRequired',private.crm_qty(x,'quantity'),'quantityReserved',0,'quantityMatched',0,'quantityPicked',0,'quantityIssued',0,'quantityUsed',0,'quantityReturned',0)) from jsonb_array_elements(coalesce(quote->'items','[]')) with ordinality as a(x,ord) where private.crm_company_stock(x) and private.crm_qty(x,'quantity')>0),'[]'::jsonb));
  end if;
 else
  if j is null then raise exception 'Job not found';end if;
  if coalesce((j->>'workflowRevision')::bigint,0)<>p_revision then raise exception 'Job changed in another session. Reload before saving' using errcode='40001';end if;
  if j->>'status'='Completed' and p_operation<>'reopen' then raise exception 'Explicitly reopen the completed job before adding or changing work';end if;
 end if;
 before_job:=j;
 insert into public.crm_job_workflow_operations(id,actor_id,job_id,request_hash) values(p_operation_id,actor,p_job_id,hash);
 select coalesce(jsonb_agg(data order by id),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id;
 if p_operation in ('reconcile','product','stage') then
  -- Provenance uses the original quote/lead links and generator fields, never a
  -- task title. Completed task rows are retained byte for byte.
  select coalesce(jsonb_agg(case when t->>'status'='Pending' and j->>'quoteId' is not null and t->>'quoteId'=j->>'quoteId' and t->>'leadId'=j->>'leadId' and t->>'category'='Installation' and t->>'jobStage' in ('Collected','Installation in Progress') and coalesce(t->>'workflowAction','')='' then
    t||jsonb_build_object('workflowOrigin','generated','workflowGenerator','legacy-quote-v1','workflowAction',case when t->>'jobStage'='Collected' then 'schedule-work' else 'perform-work' end,'jobStage',case when t->>'jobStage'='Collected' then case when private.crm_work_type(j)='repair' then 'Repair Scheduled' else 'Installation Scheduled' end else case when private.crm_work_type(j)='repair' then 'Repair in Progress' else 'Installation in Progress' end end)
   else t end order by ord),'[]') into ts from jsonb_array_elements(ts) with ordinality a(t,ord);
 end if;

 if p_operation='product' then
  if p_payload->>'priceConfirmed' is distinct from 'true' then raise exception 'Confirm the variation price before changing a product';end if;
  qty:=private.crm_qty(p_payload,'quantityRequired');target:=case when p_payload->>'cancelled'='true' or p_payload->>'fulfilmentSource'='customer' then 0 else qty end;
  select x into old_line from jsonb_array_elements(j->'items') x where x->>'id'=p_payload->>'id';
  if old_line is not null then
   required:=private.crm_qty(old_line,'quantityRequired');
   if target<required or p_payload->>'productId' is distinct from old_line->>'productId' then
    if private.crm_qty(old_line,'quantityUsed')>target then raise exception 'Consumed stock requires a correction/variation';end if;
    if private.crm_qty(old_line,'quantityIssued',case when j->>'collectionIssuedAt' is not null then private.crm_qty(old_line,'quantityPicked') else 0 end)-private.crm_qty(old_line,'quantityReturned')>target then raise exception 'Return/reconcile issued stock before reducing this line';end if;
    if greatest(private.crm_qty(old_line,'quantityReserved'),private.crm_qty(old_line,'quantityPicked'),private.crm_qty(old_line,'quantityMatched'))>target then old_line:=private.crm_workflow_release(j,old_line,target);end if;
    if p_payload->>'productId' is distinct from old_line->>'productId' and (private.crm_stock_facts(jsonb_build_object('items',jsonb_build_array(old_line)))->>'activity')::boolean then raise exception 'Create a new variation line instead of replacing a variant with stock history';end if;
   end if;
   line:=old_line||jsonb_build_object('approvedUnitGross',private.crm_qty(p_payload,'unitGross'),'quantityRequired',qty,'cancelled',coalesce(p_payload->'cancelled','false'::jsonb),'fulfilmentSource',coalesce(p_payload->>'fulfilmentSource','company'));
   if p_payload->>'productId' is distinct from old_line->>'productId' and not exists(select 1 from public.product_variants where id=(p_payload->>'productId')::uuid and active) then raise exception 'Choose an active inventory variant';end if;
   if p_payload->>'productId' is distinct from old_line->>'productId' then line:=line||jsonb_build_object('productId',p_payload->>'productId','variantId',p_payload->>'productId','name',p_payload->>'name','sku',p_payload->>'sku');end if;
   select jsonb_agg(case when x->>'id'=old_line->>'id' then line else x end) into s from jsonb_array_elements(j->'items') x;j:=j||jsonb_build_object('items',s);
  else
   if p_payload->>'priceConfirmed'<>'true' or p_payload->>'productId' is null then raise exception 'Product and explicit variation price confirmation required';end if;
   perform private.crm_qty(p_payload,'unitGross');
   if not exists(select 1 from public.product_variants where id=(p_payload->>'productId')::uuid and active) then raise exception 'Active inventory variant required';end if;
   line:=jsonb_build_object('id',p_operation_id::text,'productId',p_payload->>'productId','variantId',p_payload->>'productId','name',p_payload->>'name','sku',p_payload->>'sku','kind','Inventory','requiresInventory',true,'quantityRequired',qty,'quantityReserved',0,'quantityMatched',0,'quantityPicked',0,'quantityIssued',0,'quantityUsed',0,'quantityReturned',0,'fulfilmentSource',coalesce(p_payload->>'fulfilmentSource','company'),'approvedUnitGross',private.crm_qty(p_payload,'unitGross'));
   j:=j||jsonb_build_object('items',j->'items'||jsonb_build_array(line));
  end if;
  if (private.crm_stock_facts(j)->>'outstanding')::numeric>(private.crm_stock_facts(before_job)->>'outstanding')::numeric then j:=j||jsonb_build_object('evidenceRequiredAfter',now());end if;
  if p_payload ? 'dependentTaskIds' then
   if exists(select 1 from jsonb_array_elements_text(p_payload->'dependentTaskIds') id where not exists(select 1 from jsonb_array_elements(ts) t where t->>'id'=id and t->>'status' not in ('Completed','Not applicable'))) then raise exception 'Select only outstanding tasks of this job';end if;
   select coalesce(jsonb_agg(case when p_payload->'dependentTaskIds' ? (t->>'id') then t||jsonb_build_object('requiresStock',true,'dependsOnItemIds',coalesce(t->'dependsOnItemIds','[]')||jsonb_build_array(line->>'id')) else t end),'[]') into ts from jsonb_array_elements(ts) t;
  end if;
  j:=j||jsonb_build_object('variations',coalesce(j->'variations','[]')||jsonb_build_array(jsonb_build_object('id',p_operation_id,'at',now(),'actor',actor,'reason',reason,'lineId',line->>'id','before',(select x from jsonb_array_elements(coalesce(before_job->'items','[]')) x where x->>'id'=line->>'id'),'after',line,'unitGross',private.crm_qty(p_payload,'unitGross'),'priceConfirmed',p_payload->'priceConfirmed')),'finalBillingStatus','Provisional — product variation requires reconciliation');
 elsif p_operation='stage' then
  stage_id:=coalesce(nullif(p_payload->>'id',''),'stage-'||p_operation_id::text);
  select x into source_stage from jsonb_array_elements(coalesce(j->'stages','[]')) x where x->>'id'=stage_id;
  if source_stage->>'status'='Completed' then raise exception 'Completed stages and their history are immutable';end if;
  stage_kind:=coalesce(source_stage->>'type',p_payload->>'type','Custom');
  if stage_kind not in ('Custom','Confirmed','Stock Shortage','Picking','Ready for Collection','Collected','Installation Scheduled','Installation in Progress','Repair Scheduled','Repair in Progress','Return Pending') then raise exception 'Unknown system stage type';end if;
  if trim(coalesce(p_payload->>'name',''))='' then raise exception 'Stage name required';end if;
  if p_payload->>'applicable'='false' and (stage_kind='Return Pending' or stage_kind in ('Stock Shortage','Picking','Ready for Collection','Collected') and ((private.crm_stock_facts(j)->>'outstanding')::numeric>0 or (private.crm_stock_facts(j)->>'surplus')::numeric>0)) then raise exception 'System stock/return safeguards cannot be skipped';end if;
  if p_payload->>'after'=stage_id or exists(select 1 from jsonb_array_elements(coalesce(j->'stages','[]')) s where s->>'id'=p_payload->>'after' and s->>'status'='Completed') then raise exception 'Place the stage among outstanding work';end if;
  s:=coalesce(source_stage,'{}')||jsonb_build_object('id',stage_id,'type',stage_kind,'origin','manual','name',p_payload->>'name','description',coalesce(p_payload->>'description',''),'after',coalesce(p_payload->>'after',j->>'status'),'status',case when p_payload->>'applicable'='false' then 'Not applicable' else 'Pending' end,'applicable',coalesce(p_payload->'applicable','true'::jsonb),'requiredEvidence',coalesce(p_payload->>'requiredEvidence','none'),'requiresStock',coalesce(p_payload->'requiresStock','false'::jsonb),'changeReason',reason,'updatedAt',now(),'updatedBy',actor);
  select coalesce(jsonb_agg(x),'[]') into ev from jsonb_array_elements(coalesce(j->'stages','[]')) x where x->>'id'<>stage_id;j:=j||jsonb_build_object('stages',ev||jsonb_build_array(s));
  if trim(coalesce(p_payload->>'taskTitle',''))<>'' then
   if not private.has_module_access('tasks','create','web') then raise exception 'tasks.create permission required';end if;
   ts:=ts||jsonb_build_array(jsonb_build_object('id','stage-task-'||p_operation_id::text,'jobId',p_job_id,'jobStage',stage_id,'title',p_payload->>'taskTitle','assignedTo',coalesce(p_payload->>'assignedTo',''),'status','Pending','priority','Normal','category','Operations','workflowOrigin','manual','required',true,'requiredEvidence',s->>'requiredEvidence','requiresStock',s->'requiresStock'));
  end if;
 elsif p_operation='reopen' then
  if j->>'status'<>'Completed' then raise exception 'Only completed jobs can be reopened';end if;
  typ:=private.crm_work_type(j);stage_id:=case when typ='repair' then 'Repair in Progress' when typ='supply' then 'Confirmed' else 'Installation in Progress' end;
  s:=jsonb_build_object('id',stage_id||':reopen:'||p_operation_id::text,'type',stage_id,'name',stage_id,'origin','generated','status','Pending','applicable',true);
  j:=j||jsonb_build_object('stages',coalesce(j->'stages','[]')||jsonb_build_array(s),'status',case when p_payload->>'target'='On Hold' then 'On Hold' else s->>'id' end,'resumeStage',s->>'id','reopenedAt',now(),'reopenReason',reason,'evidenceRequiredAfter',now(),'reopenHistory',coalesce(j->'reopenHistory','[]')||jsonb_build_array(jsonb_build_object('at',now(),'by',actor,'reason',reason,'previousCompletion',j->'completedAt')));
 elsif p_operation not in ('create','from_quote','reconcile') then raise exception 'Unknown workflow operation';end if;
 if p_operation='reconcile' and (j->>'collectionIssuedAt' is not null or exists(select 1 from public.crm_records where collection='stockMovements' and data->>'jobId'=p_job_id)) then raise exception 'Review recorded stock/collection history before correcting this job';end if;
 if p_operation='reconcile' and (private.crm_stock_facts(j)->>'outstanding')::numeric=0 and not (private.crm_stock_facts(j)->>'activity')::boolean then
  if exists(select 1 from jsonb_array_elements(ts) t where t->>'jobStage' in ('Stock Shortage','Picking','Ready for Collection','Collected') and t->>'status' not in ('Completed','Not applicable') and coalesce(t->>'workflowOrigin','')<>'generated') then raise exception 'Review legacy stock task origin explicitly; no task is skipped by its name';end if;
  if private.crm_stage_type(j,j->>'status') in ('Stock Shortage','Picking','Ready for Collection','Collected') then j:=j||jsonb_build_object('status',case when private.crm_work_type(j)='repair' then 'Repair Scheduled' when private.crm_work_type(j)='supply' then 'Confirmed' else 'Installation Scheduled' end);end if;
 end if;
 plan:=private.crm_workflow_plan(j,ts,private.crm_workflow_shortage(j),exists(select 1 from public.crm_records where collection='returns' and data->>'jobId'=p_job_id and data->>'status' not in ('Processed','Cancelled')));j:=plan->'job';ts:=plan->'tasks';
 j:=j||jsonb_build_object('workflowRevision',coalesce((j->>'workflowRevision')::bigint,0)+1,'timeline',jsonb_build_array(jsonb_build_object('id',p_operation_id,'title','Job '||p_operation||' changed','detail',reason,'at',now(),'userId',actor))||coalesce(j->'timeline','[]'));
 -- Job and dependent tasks, notifications, reservation releases and receipt commit
 -- together. A lost response can replay this identical operation id safely.
 if p_operation in ('create','from_quote') then insert into public.crm_records(collection,id,data) values('jobs',p_job_id,j);else update public.crm_records set data=j where collection='jobs' and id=p_job_id;end if;
 for s in select value from jsonb_array_elements(ts) loop
  if exists(select 1 from public.crm_records where collection='tasks' and id=s->>'id') then update public.crm_records set data=s where collection='tasks' and id=s->>'id' and data is distinct from s;else insert into public.crm_records(collection,id,data) values('tasks',s->>'id',s);end if;
 end loop;
 if p_operation='from_quote' then
  update public.crm_records set data=data||jsonb_build_object('linkedJobId',p_job_id) where collection='quotes' and id=quote->>'id';
  update public.crm_records set data=data||jsonb_build_object('stage','Won') where collection='leads' and id=lead->>'id';
 end if;
 insert into public.privileged_security_events(event_type,real_actor_user_id,effective_actor_user_id,target_type,target_id,reason,metadata) values('job.workflow_changed',auth.uid(),actor,'job',p_job_id,reason,jsonb_build_object('operation',p_operation,'operation_id',p_operation_id,'revision',j->'workflowRevision','before_stages',before_job->'stages','after_stages',j->'stages','before_items',before_job->'items','after_items',j->'items','before_installer',before_job->>'installerId','after_installer',j->>'installerId'));
 select data into j from public.crm_records where collection='jobs' and id=p_job_id;
 select coalesce(jsonb_agg(data order by id),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id;
 result:=jsonb_build_object('job',j,'tasks',ts);
 update public.crm_job_workflow_operations set result=jsonb_build_object('job',j,'tasks',ts),complete=true where id=p_operation_id;
 return result;
end $$;
revoke all on function public.crm_job_workflow_command(text,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.crm_job_workflow_command(text,bigint,text,jsonb,uuid) to authenticated;

-- Direct REST writes cannot bypass the same management and completion guards.
create function private.crm_job_workflow_guard() returns trigger
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare j jsonb; ts jsonb; error text; target_kind text; management boolean:=private.current_role_key() in ('super_admin','admin','manager'); actor text:=private.effective_user_id()::text; old_stage jsonb; new_stage jsonb; old_line jsonb; new_line jsonb; target numeric; trusted boolean;
begin
 if new.collection not in ('jobs','tasks') then return new;end if;
 if private.current_role_key() is null then raise exception 'Active session required' using errcode='42501';end if;
 trusted:=exists(select 1 from public.crm_job_workflow_operations o where o.job_id=case when new.collection='jobs' then new.id else new.data->>'jobId' end and o.actor_id=private.effective_user_id() and o.transaction_id=txid_current() and not o.complete);
 if new.collection='jobs' then
  if not private.has_module_access('jobs',case when tg_op='INSERT' then 'create' else 'update' end,'web') then raise exception 'Job action permission required' using errcode='42501';end if;
  if tg_op='INSERT' and not management then raise exception 'Management job creation required' using errcode='42501';end if;
  if tg_op='UPDATE' then
   if not trusted and (
    exists(select 1 from jsonb_array_elements(coalesce(new.data->'items','[]')) x where not exists(select 1 from jsonb_array_elements(coalesce(old.data->'items','[]')) y where y->>'id'=x->>'id' and (x-array['room','measurements','quantityUsed'])=(y-array['room','measurements','quantityUsed'])))
    or exists(select 1 from jsonb_array_elements(coalesce(new.data->'stages','[]')) x where not exists(select 1 from jsonb_array_elements(coalesce(old.data->'stages','[]')) y where y->>'id'=x->>'id' and (x-array['status','completedAt','completedBy'])=(y-array['status','completedAt','completedBy'])))
   ) then raise exception 'Use the transactional job workflow operation for stage/product changes';end if;
   if new.data->>'installerId' is distinct from old.data->>'installerId' then
    if not management or new.data#>>'{assignmentChange,from}' is distinct from coalesce(old.data->>'installerId','') or new.data#>>'{assignmentChange,to}' is distinct from new.data->>'installerId' or new.data#>>'{assignmentChange,transferOutstanding}' is distinct from 'true' or trim(coalesce(new.data#>>'{assignmentChange,reason}',''))='' then raise exception 'Confirm the transfer of outstanding tasks and record a reassignment reason';end if;
    if coalesce(new.data->>'installerId','')<>'' and not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id::text=new.data->>'installerId' and p.status='active' and r.key='installer') then raise exception 'Choose an active installer';end if;
   end if;
   if (new.data->>'latitude' is not null and ((new.data->>'latitude')::numeric not between -90 and 90)) or (new.data->>'longitude' is not null and ((new.data->>'longitude')::numeric not between -180 and 180)) then raise exception 'Invalid job site coordinates';end if;
   if coalesce((new.data->>'workflowRevision')::bigint,0)<coalesce((old.data->>'workflowRevision')::bigint,0) then raise exception 'Job changed in another session. Reload before saving' using errcode='40001';end if;
   for old_line in select value from jsonb_array_elements(coalesce(old.data->'items','[]')) loop
    select x into new_line from jsonb_array_elements(coalesce(new.data->'items','[]')) x where x->>'id'=old_line->>'id';
    if new_line is null then raise exception 'Preserve product history; cancel a line explicitly instead of deleting it';end if;
    target:=case when new_line->>'cancelled'='true' or not private.crm_company_stock(new_line) then 0 else private.crm_qty(new_line,'quantityRequired',private.crm_qty(new_line,'quantity')) end;
    if private.crm_company_stock(old_line) and (private.crm_qty(old_line,'quantityIssued',case when old.data->>'collectionIssuedAt' is not null then private.crm_qty(old_line,'quantityPicked') else 0 end)-private.crm_qty(old_line,'quantityReturned')>target or private.crm_qty(old_line,'quantityUsed')>target) and target<private.crm_qty(old_line,'quantityRequired') then raise exception 'Issued/consumed stock requires an actual return or correction';end if;
    if not trusted and (old_line->'quantityReserved' is distinct from new_line->'quantityReserved' or old_line->'quantityMatched' is distinct from new_line->'quantityMatched' or old_line->'quantityPicked' is distinct from new_line->'quantityPicked' or old_line->'quantityIssued' is distinct from new_line->'quantityIssued' or old_line->'quantityReturned' is distinct from new_line->'quantityReturned') then raise exception 'Stock counters require a transactional stock operation';end if;
    if not trusted and target<private.crm_qty(old_line,'quantityRequired') and greatest(private.crm_qty(old_line,'quantityReserved'),private.crm_qty(old_line,'quantityMatched'),case when old.data->>'collectionIssuedAt' is null then private.crm_qty(old_line,'quantityPicked') else 0 end)>target then raise exception 'Release reservations and reverse unissued picking transactionally';end if;
    if private.crm_qty(new_line,'quantityUsed')>private.crm_qty(new_line,'quantityIssued',case when new.data->>'collectionIssuedAt' is not null then private.crm_qty(new_line,'quantityPicked') else 0 end) then raise exception 'Consumed quantity cannot exceed issued stock';end if;
   end loop;
   for new_stage in select value from jsonb_array_elements(coalesce(new.data->'stages','[]')) loop
    select x into old_stage from jsonb_array_elements(coalesce(old.data->'stages','[]')) x where x->>'id'=new_stage->>'id';
    if old_stage is not null and new_stage->>'type' is distinct from old_stage->>'type' then raise exception 'A custom label cannot change system validation type';end if;
    if new_stage->>'status'='Completed' and old_stage->>'status' is distinct from 'Completed' then
     if new_stage->>'requiredEvidence' in ('before','after') and not private.crm_workflow_has_evidence(new.data,new_stage->>'requiredEvidence') then raise exception 'Required stage evidence is not saved';end if;
     if exists(select 1 from public.crm_records where collection='tasks' and data->>'jobId'=new.id and data->>'jobStage'=new_stage->>'id' and data->>'status' not in ('Completed','Not applicable') and coalesce(data->>'required','true')<>'false' and coalesce(data->>'applicable','true')<>'false') then raise exception 'Required stage tasks are incomplete';end if;
     if new_stage->>'type' in ('Collected','Installation in Progress','Repair in Progress') and (private.crm_stock_facts(new.data)->>'outstanding')::numeric>0 then raise exception 'Outstanding company stock cannot be skipped';end if;
    end if;
   end loop;
   if (new.data-array['status','timeline','installationProof','photos','collectionIssuedAt','collectedBy','items','stages','completedAt','completionHistory']) is distinct from (old.data-array['status','timeline','installationProof','photos','collectionIssuedAt','collectedBy','items','stages','completedAt','completionHistory']) and not management then raise exception 'Management is required to edit job details' using errcode='42501';end if;
   if not management then
    if exists(select 1 from jsonb_array_elements(coalesce(new.data->'stages','[]')) x where not exists(select 1 from jsonb_array_elements(coalesce(old.data->'stages','[]')) y where x->>'id'=y->>'id' and (x-array['status','completedAt','completedBy'])=(y-array['status','completedAt','completedBy']) and (x=y or (x->>'id'=old.data->>'status' and x->>'status'='Completed' and x->>'completedBy'=actor)))) then raise exception 'Management is required for stage editing' using errcode='42501';end if;
    if new.data->'items' is distinct from old.data->'items' and exists(select 1 from jsonb_array_elements(coalesce(new.data->'items','[]')) x where not exists(select 1 from jsonb_array_elements(coalesce(old.data->'items','[]')) y where y->>'id'=x->>'id' and (x-array['quantityUsed'])=(y-array['quantityUsed']))) then raise exception 'Management is required for product editing' using errcode='42501';end if;
   end if;
   if old.data->>'status'='Completed' and new.data is distinct from old.data then
    if new.data->>'status'='Completed' and (new.data->'items' is distinct from old.data->'items' or new.data->'stages' is distinct from old.data->'stages' or new.data->>'installerId' is distinct from old.data->>'installerId') then raise exception 'Reopen completed work before changing requirements';end if;
    if new.data->>'status'<>'Completed' and (not management or trim(coalesce(new.data->>'reopenReason',''))='' or new.data->>'reopenedAt' is not distinct from old.data->>'reopenedAt') then raise exception 'Explicit management reopening and reason required';end if;
   end if;
   for old_stage in select value from jsonb_array_elements(coalesce(old.data->'stages','[]')) where value->>'status'='Completed' loop
    select s into new_stage from jsonb_array_elements(coalesce(new.data->'stages','[]')) s where s->>'id'=old_stage->>'id';
    if new_stage is null or (new_stage-array['status','previousCompletions']) is distinct from (old_stage-array['status','previousCompletions']) then raise exception 'Completed stage history must be preserved';end if;
   end loop;
  end if;
  if tg_op='UPDATE' and new.data->>'status' is distinct from old.data->>'status' then
   target_kind:=private.crm_stage_type(new.data,new.data->>'status');
   if target_kind='Collected' and (private.crm_stock_facts(new.data)->>'requiresCompanyStock')::boolean and ((private.crm_stock_facts(new.data)->>'outstanding')::numeric>0 or new.data->>'collectionIssuedAt' is null) then raise exception 'Verified collection and stock issue are required';end if;
   if private.crm_stage_type(old.data,old.data->>'status')='Stock Shortage' and target_kind='Picking' and private.crm_workflow_shortage(new.data) then raise exception 'Required company stock is still unavailable';end if;
  end if;
  if new.data->>'status'='Completed' and (tg_op='INSERT' or old.data->>'status' is distinct from 'Completed') then
   select coalesce(jsonb_agg(data),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=new.id;
   error:=private.crm_workflow_completion_error(new.data,ts);if error is not null then raise exception '%',error;end if;
  end if;
 else
  select data into j from public.crm_records where collection='jobs' and id=new.data->>'jobId' for update;
  if j is null then return new;end if;
  if j->>'status'='Completed' and tg_op='INSERT' and coalesce(new.data->>'required','true')<>'false' then raise exception 'Reopen completed work before adding required tasks';end if;
  if tg_op='UPDATE' and old.data->>'status'='Completed' and new.data is distinct from old.data then raise exception 'Completed task history is immutable';end if;
  if not management and (new.data->>'assignedTo' is distinct from actor or (tg_op='UPDATE' and (new.data-array['status','completedAt','completedBy','completionSource']) is distinct from (old.data-array['status','completedAt','completedBy','completionSource']))) then raise exception 'Assigned installer may only update their task status' using errcode='42501';end if;
  if new.data->>'status'='Completed' then
   if coalesce(new.data->>'requiresStock','false')='true' and (private.crm_stock_facts(case when jsonb_array_length(coalesce(new.data->'dependsOnItemIds','[]'))>0 then j||jsonb_build_object('items',coalesce((select jsonb_agg(x) from jsonb_array_elements(coalesce(j->'items','[]')) x where new.data->'dependsOnItemIds' ? (x->>'id')),'[]')) else j end)->>'outstanding')::numeric>0 then raise exception 'Required company stock has not been issued';end if;
   if new.data->>'workflowAction'='installation-proof' or new.data->>'requiredEvidence'='after' then
    if not private.crm_workflow_has_evidence(j,'after') then raise exception 'Saved after evidence and installer device location are required';end if;
   end if;
   if new.data->>'requiredEvidence'='before' and not private.crm_workflow_has_evidence(j,'before') then raise exception 'Saved before evidence required';end if;
  end if;
 end if;
 return new;
end $$;
create trigger zz_job_workflow_guard before insert or update on public.crm_records for each row execute function private.crm_job_workflow_guard();

-- Existing task/approval notification storage remains in use. Stable notification
-- IDs make retries and unrelated repeated saves silent.
create function private.crm_job_workflow_notify() returns trigger
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare recipient uuid; nid text; event text; jobid text; title text;
begin
 if new.collection='jobs' and tg_op='UPDATE' and new.data->>'installerId' is distinct from old.data->>'installerId' then
  update public.crm_records set data=data||jsonb_build_object('assignedTo',new.data->>'installerId','assignmentHistory',coalesce(data->'assignmentHistory','[]')||jsonb_build_array(new.data->'assignmentChange')) where collection='tasks' and data->>'jobId'=new.id and data->>'status' not in ('Completed','Not applicable') and data->>'requestId' is null and data->>'returnId' is null and (data->>'assignedTo'=old.data->>'installerId' or coalesce(data->>'assignedTo','')='' and data->>'category' in ('Collection','Installation','Repair'));
 end if;
 if new.collection='tasks' then
  jobid:=new.data->>'jobId';if jobid is null then return null;end if;
  if tg_op='INSERT' or new.data->>'assignedTo' is distinct from old.data->>'assignedTo' or jsonb_build_array(new.data->'title',new.data->'notes',new.data->'jobStage',new.data->'dueAt',new.data->'requiresStock',new.data->'dependsOnItemIds') is distinct from jsonb_build_array(old.data->'title',old.data->'notes',old.data->'jobStage',old.data->'dueAt',old.data->'requiresStock',old.data->'dependsOnItemIds') then
   if coalesce(new.data->>'assignedTo','')<>'' and exists(select 1 from public.profiles where id::text=new.data->>'assignedTo' and status='active') then
    nid:='assignment:'||new.id||':'||md5(jsonb_build_array(new.data->'assignedTo',new.data->'title',new.data->'notes',new.data->'jobStage',new.data->'dueAt',new.data->'requiresStock',new.data->'dependsOnItemIds')::text);
    insert into public.crm_records(collection,id,data) values('notifications',nid,jsonb_build_object('id',nid,'userId',new.data->>'assignedTo','title','Task assigned or updated','body',new.data->>'title','page','tasks','jobId',jobid,'read',false,'createdAt',now())) on conflict do nothing;
   end if;
  end if;
  if tg_op='UPDATE' and old.data->>'assignedTo' is distinct from new.data->>'assignedTo' and coalesce(old.data->>'assignedTo','')<>'' then
   nid:='reassigned:'||new.id||':'||md5(coalesce(old.data->>'assignedTo','')||coalesce(new.data->>'assignedTo',''));
   insert into public.crm_records(collection,id,data) select 'notifications',nid,jsonb_build_object('id',nid,'userId',old.data->>'assignedTo','title','Your outstanding task was reassigned','body',old.data->>'title','page','dashboard','read',false,'createdAt',now()) where exists(select 1 from public.profiles where id::text=old.data->>'assignedTo' and status='active') on conflict do nothing;
  end if;
  if new.data->>'status'='Completed' and (tg_op='INSERT' or old.data->>'status' is distinct from 'Completed') then
   for recipient in select p.id from public.profiles p join public.roles r on r.id=p.role_id where p.status='active' and r.key in ('super_admin','admin','manager') and (private.access_decision(p.id,'jobs','view','web')->>'allowed')::boolean loop
    nid:='task-completed:'||new.id||':'||recipient::text;
    insert into public.crm_records(collection,id,data) values('notifications',nid,jsonb_build_object('id',nid,'userId',recipient,'title','Task completed','body',new.data->>'title','page','jobs','jobId',jobid,'read',false,'createdAt',now())) on conflict do nothing;
   end loop;
  end if;
 end if;
 return null;
end $$;
create trigger zz_job_workflow_notify after insert or update on public.crm_records for each row execute function private.crm_job_workflow_notify();

create function public.crm_job_workflow_correction_preview() returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if private.current_role_key() not in ('super_admin','admin','manager') or not private.has_module_access('jobs','update','web') then raise exception 'Management job permission required' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('job_id',id,'number',data->>'number','current_stage',data->>'status','unknown_stock_tasks',(select count(*) from public.crm_records t where t.collection='tasks' and t.data->>'jobId'=j.id and t.data->>'jobStage' in ('Stock Shortage','Picking','Ready for Collection','Collected') and t.data->>'status'<>'Completed' and coalesce(t.data->>'workflowOrigin','')<>'generated'),'correction','Review origin metadata, then recalculate this job explicitly')) from public.crm_records j where collection='jobs' and data->>'status'<>'Completed' and (private.crm_stock_facts(data)->>'outstanding')::numeric=0 and not (private.crm_stock_facts(data)->>'activity')::boolean),'[]');
end $$;
revoke all on function public.crm_job_workflow_correction_preview() from public,anon;
grant execute on function public.crm_job_workflow_correction_preview() to authenticated;

-- Update compatible, already-installed approval validation if present; never
-- deploy the older inventory/approval proposals as an implicit prerequisite.
do $approval$ declare body text;begin
 if to_regprocedure('private.job_review_guard()') is not null then
  body:=pg_get_functiondef('private.job_review_guard()'::regprocedure);
  body:=replace(body,'not private.has_module_access(''jobs'',''update'',''web'')','not private.has_module_access(''jobs'',case when tg_op=''INSERT'' then ''create'' else ''update'' end,''web'')');execute body;
 end if;
 if to_regprocedure('private.job_review_material(jsonb)') is not null then
  body:=pg_get_functiondef('private.job_review_material(jsonb)'::regprocedure);
  body:=replace(body,'jsonb_build_object(''installer''','jsonb_build_object(''stages'',j->''stages'',''workType'',j->''workType'',''reopenedAt'',j->''reopenedAt'',''installer''');execute body;
 end if;
 if to_regprocedure('private.job_review_completion_error(text)') is not null then
  body:=pg_get_functiondef('private.job_review_completion_error(text)'::regprocedure);
  body:=replace(body,$needle$data->>'status' is distinct from 'Completed'$needle$,$replacement$data->>'status' not in ('Completed','Not applicable') and coalesce(data->>'applicable','true')<>'false'$replacement$);
  body:=replace(body,' if not exists(select 1 from jsonb_array_elements(coalesce(j->''installationProof'',''[]''))',' if private.crm_work_type(j)<>''supply'' and not exists(select 1 from jsonb_array_elements(coalesce(j->''installationProof'',''[]''))');
  execute body;
 end if;
end $approval$;

revoke all on function private.crm_work_type(jsonb),private.crm_company_stock(jsonb),private.crm_qty(jsonb,text,numeric),private.crm_stock_facts(jsonb),private.crm_stage_type(jsonb,text),private.crm_workflow_shortage(jsonb),private.crm_workflow_plan(jsonb,jsonb,boolean,boolean),private.crm_workflow_completion_error(jsonb,jsonb),private.crm_workflow_has_evidence(jsonb,text),private.crm_workflow_release(jsonb,jsonb,numeric),private.crm_job_workflow_guard(),private.crm_job_workflow_notify() from public,anon,authenticated;

-- Preserve the deployed normalized quotation entry point and its signatures.
-- Work type is an additive property because the inspected normalized schema has
-- no existing repair/supply discriminator; the visible CRM already uses service.
alter table public.job_orders add column work_type text not null default 'installation' check(work_type in ('installation','repair','supply'));
alter table public.job_orders add column applicable_stages jsonb not null default '[]';
create function private.crm_refresh_normalized_workflow(p_job uuid) returns void
language plpgsql security definer set search_path='' as $$
#variable_conflict use_column
declare j jsonb; lines jsonb; result jsonb; typ text; progress text; scheduled text;
begin
 if private.current_role_key() not in ('super_admin','admin','manager') or not (private.has_module_access('jobs','create','web') or private.has_module_access('jobs','update','web')) then raise exception 'Management job permission required' using errcode='42501';end if;
 perform 1 from public.job_orders where id=p_job for update;
 select jsonb_build_object('id',id,'number',job_number::text,'status',coalesce(workflow_stage,'Confirmed'),'workType',work_type,'items','[]'::jsonb,'stages',applicable_stages) into j from public.job_orders where id=p_job;
 if j is null or j->>'status'='Completed' then return;end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'variantId',variant_id,'requiresInventory',requires_inventory,'kind',line_kind,'quantityRequired',quantity,'quantityIssued',quantity_issued,'quantityUsed',quantity_used)),'[]') into lines from public.job_order_items where job_order_id=p_job;
 j:=j||jsonb_build_object('items',lines);result:=private.crm_workflow_plan(j,'[]',private.crm_workflow_shortage(j));typ:=private.crm_work_type(j);
 update public.job_orders set applicable_stages=result#>'{job,stages}' where id=p_job;
 scheduled:=case when typ='repair' then 'Repair Scheduled' else 'Installation Scheduled' end;progress:=case when typ='repair' then 'Repair in Progress' else 'Installation in Progress' end;
 if typ='supply' then
  update public.tasks set status='not_applicable' where job_order_id=p_job and workflow_action='schedule-work' and status='open';
 else
  update public.tasks set title=case when typ='repair' then 'Schedule repair' else 'Schedule installation' end,job_stage=scheduled where job_order_id=p_job and workflow_action='schedule-work' and status='open';
 end if;
end $$;
revoke all on function private.crm_refresh_normalized_workflow(uuid) from public,anon;
grant execute on function private.crm_refresh_normalized_workflow(uuid) to authenticated;
do $baseline$ declare source text;begin
 if to_regprocedure('public.accept_quotation_and_create_job(uuid)') is null then raise exception 'Inspected quotation conversion baseline is required';end if;
 source:=pg_get_functiondef('public.accept_quotation_and_create_job(uuid)'::regprocedure);
 if md5(source) not in ('f8bc022297001df29f1c68f940a1e48d','c4553ad9f92f41086a009e9ca3294fc6') then raise exception 'Quotation converter changed; review the migration baseline before deployment';end if;
end $baseline$;
CREATE OR REPLACE FUNCTION public.accept_quotation_and_create_job(p_quotation_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare q public.quotations; v_job uuid; v_warehouse uuid;
begin
  if not private.has_module_access('quotations','approve','web') or not private.has_module_access('jobs','create','web') then
    raise exception 'Quotation approval and job creation permissions required' using errcode='42501';
  end if;
  select * into q from public.quotations where id=p_quotation_id for update;
  if q.id is null then raise exception 'Quotation not found'; end if;
  select id into v_job from public.job_orders where quotation_id=q.id;
  if v_job is not null then return v_job; end if;
  if q.status not in ('sent','viewed','accepted') then raise exception 'Quotation is not ready for acceptance'; end if;
  update public.quotations set status='accepted',accepted_at=coalesce(accepted_at,now()) where id=q.id;
  update public.leads set stage='won',won_at=coalesce(won_at,now()) where id=q.lead_id;
  insert into public.quotation_status_history(quotation_id,from_status,to_status,changed_by)
  values(q.id,q.status,'accepted',(select private.effective_user_id()));
  insert into public.job_orders(quotation_id,lead_id,contact_id,status,created_by)
  values(q.id,q.lead_id,q.contact_id,'new',(select private.effective_user_id())) returning id into v_job;
  insert into public.job_order_items(job_order_id,quotation_item_id,product_id,variant_id,sku_snapshot,description,quantity,unit_price_snapshot,tax_rate_snapshot,requires_inventory)
  select v_job,qi.id,qi.product_id,qi.variant_id,qi.sku_snapshot,qi.description,qi.quantity,qi.unit_price,qi.tax_rate,
    coalesce(p.track_inventory,false) and qi.variant_id is not null
  from public.quotation_items qi left join public.products p on p.id=qi.product_id where qi.quotation_id=q.id;
  insert into public.tasks(title,description,task_type,job_order_id,status,priority,created_by,job_stage,workflow_action)
  select 'Prepare materials','Prepare and pick required products','warehouse',v_job,'open','high',(select private.effective_user_id()),'Picking','confirm-location'
  where exists(select 1 from public.job_order_items where job_order_id=v_job and requires_inventory and quantity>quantity_issued);
  insert into public.tasks(title,description,task_type,job_order_id,status,priority,created_by,job_stage,workflow_action)
  values('Schedule installation','Confirm appointment and assign installer','installation',v_job,'open','high',(select private.effective_user_id()),'Installation Scheduled','schedule-work');
  select id into v_warehouse from public.warehouses where active=true order by created_at limit 1;
  if v_warehouse is not null and exists(select 1 from public.job_order_items where job_order_id=v_job and requires_inventory and quantity>quantity_issued) then
    insert into public.stock_reservations(job_order_id,job_order_item_id,variant_id,warehouse_id,quantity)
    select v_job,ji.id,ji.variant_id,v_warehouse,ji.quantity from public.job_order_items ji
    where ji.job_order_id=v_job and ji.requires_inventory=true and ji.quantity>ji.quantity_issued;
    insert into public.pick_lists(job_order_id,warehouse_id,created_by) values(v_job,v_warehouse,(select private.effective_user_id()));
    insert into public.pick_list_items(pick_list_id,reservation_id,variant_id,quantity_required)
    select pl.id,sr.id,sr.variant_id,sr.quantity from public.pick_lists pl join public.stock_reservations sr on sr.job_order_id=pl.job_order_id
    where pl.job_order_id=v_job;
  end if;
  perform private.crm_refresh_normalized_workflow(v_job);
  return v_job;
end $function$
;
create function public.accept_quotation_and_create_job(p_quotation_id uuid,p_work_type text) returns uuid
language plpgsql set search_path='' as $$
declare job_id uuid;
begin
 if p_work_type not in ('installation','repair','supply') or p_work_type is null then raise exception 'Choose a work type';end if;
 job_id:=public.accept_quotation_and_create_job(p_quotation_id);
 if exists(select 1 from public.job_orders where id=job_id and (workflow_stage='Completed' or status='completed') and work_type<>p_work_type) then raise exception 'Reopen the completed job before changing work type';end if;
 update public.job_orders set work_type=p_work_type where id=job_id;
 perform private.crm_refresh_normalized_workflow(job_id);
 return job_id;
end $$;
revoke all on function public.accept_quotation_and_create_job(uuid,text) from public,anon;
grant execute on function public.accept_quotation_and_create_job(uuid,text) to authenticated;

notify pgrst,'reload schema';
commit;
