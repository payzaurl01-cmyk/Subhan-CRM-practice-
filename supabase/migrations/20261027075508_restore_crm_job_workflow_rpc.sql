-- Focused repair for the deployed crm_records contract. Do not apply the older
-- conditional_job_workflow migration or its unrelated normalized-table patches.
-- All new functions use invoker rights and existing RLS/permission helpers.
begin;
create table private.crm_job_workflow_operations (
 id uuid primary key, actor_id uuid not null references public.profiles(id),
 job_id text not null, request_hash text not null, result jsonb,
 complete boolean not null default false, created_at timestamptz not null default now()
);
create index crm_job_workflow_operations_job on private.crm_job_workflow_operations(job_id,created_at);
alter table private.crm_job_workflow_operations enable row level security;
revoke all on private.crm_job_workflow_operations from public,anon,authenticated;
grant select,insert,update on private.crm_job_workflow_operations to authenticated;
create policy workflow_receipts_actor on private.crm_job_workflow_operations to authenticated
 using(actor_id=(select auth.uid()) and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager') and (select private.has_module_access('jobs','view','web')))
 with check(actor_id=(select auth.uid()) and coalesce((select private.current_role_key()),'') in ('super_admin','admin','manager') and (select private.has_module_access('jobs','view','web')));
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

create function private.crm_stage_type(j jsonb,stage text) returns text language sql immutable set search_path='' as $$
 select coalesce((select s->>'type' from jsonb_array_elements(coalesce(j->'stages','[]')) s where s->>'id'=stage limit 1),stage)
$$;

create function private.crm_workflow_shortage(j jsonb) returns boolean
language plpgsql stable security invoker set search_path='' as $$
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
 select coalesce(jsonb_agg(s order by case s->>'type' when 'Confirmed' then 0 when 'Stock Shortage' then 1 when 'Picking' then 2 when 'Ready for Collection' then 3 when 'Collected' then 4 when 'Installation Scheduled' then 5 when 'Repair Scheduled' then 5 when 'Installation in Progress' then 6 when 'Repair in Progress' then 6 when 'Return Pending' then 7 when 'Completed' then 9 else 8 end),'[]') into reordered from jsonb_array_elements(stages) s where coalesce(s->>'origin','legacy')<>'manual';
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

create function private.crm_workflow_release(j jsonb,old_line jsonb,target numeric) returns jsonb
language plpgsql security invoker set search_path='' as $$
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
language plpgsql security invoker set search_path='' as $$
#variable_conflict use_column
declare actor uuid:=auth.uid(); j jsonb; before_job jsonb; ts jsonb; result jsonb; plan jsonb; s jsonb; old_line jsonb; line jsonb; receipt private.crm_job_workflow_operations; hash text:=md5(jsonb_build_array(p_job_id,p_revision,p_operation,p_payload)::text); reason text:=trim(coalesce(p_payload->>'reason','')); qty numeric; required numeric; target numeric; typ text; stage_id text; stage_kind text; current_stage jsonb; quote jsonb; lead jsonb; ev jsonb; new_tasks jsonb; source_stage jsonb; row record; allowed text[]; manager_id text; billing_lines jsonb; tax_rate numeric; prices numeric[]; bill_line jsonb; next_number bigint;
begin
 if actor is null or coalesce((auth.jwt()->>'is_anonymous')::boolean,false) or coalesce(private.current_role_key(),'') not in ('super_admin','admin','manager') or not private.has_module_access('jobs','view','web') or not private.has_module_access('jobs',case when p_operation in ('create','from_quote') then 'create' else 'update' end,'web') then raise exception 'Current management job permission required' using errcode='42501';end if;
 if p_operation is null or p_operation not in ('create','from_quote','product','stage','reconcile','reopen') then raise exception 'Unknown workflow operation' using errcode='22023';end if;
 if p_operation_id is null or nullif(trim(p_job_id),'') is null or length(reason)<1 or p_revision is null or p_revision<0 or jsonb_typeof(p_payload) is distinct from 'object' then raise exception 'Operation id, job id, nonnegative revision and reason required' using errcode='22023';end if;
 allowed:=case p_operation
  when 'from_quote' then array['quoteId','reason','installerId','installationDate']
  when 'create' then array['customer','phone','address','postcode','workType','installerId','installationDate','reason']
  when 'product' then array['id','lineId','productId','name','sku','quantityRequired','unitGross','cancelled','priceConfirmed','fulfilmentSource','dependentTaskIds','reason']
  when 'stage' then array['id','stageId','name','description','type','after','applicable','taskTitle','assignedTo','requiredEvidence','requiresStock','reason']
  when 'reopen' then array['reason','target'] else array['reason'] end;
 if exists(select 1 from jsonb_object_keys(p_payload) k where not k=any(allowed)) then raise exception 'Unexpected field for workflow operation %',p_operation using errcode='22023';end if;
 if exists(select 1 from jsonb_each(p_payload) x where x.key in ('cancelled','applicable','requiresStock','priceConfirmed') and jsonb_typeof(x.value)<>'boolean') then raise exception 'Workflow flags must be booleans' using errcode='22023';end if;
 if p_payload ? 'dependentTaskIds' and (jsonb_typeof(p_payload->'dependentTaskIds')<>'array' or exists(select 1 from jsonb_array_elements(p_payload->'dependentTaskIds') x where jsonb_typeof(x)<>'string')) then raise exception 'Task dependencies must be an array of text ids' using errcode='22023';end if;
 if p_payload ? 'workType' and p_payload->>'workType' not in ('repair','installation','supply') then raise exception 'Invalid work type' using errcode='22023';end if;
 if p_payload ? 'fulfilmentSource' and p_payload->>'fulfilmentSource' not in ('company','customer') then raise exception 'Invalid fulfilment source' using errcode='22023';end if;
 if p_payload ? 'assignedTo' and nullif(p_payload->>'assignedTo','') is not null and not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id::text=p_payload->>'assignedTo' and p.status='active' and r.active) then raise exception 'Choose an active task assignee';end if;
 if p_payload ? 'requiredEvidence' and p_payload->>'requiredEvidence' not in ('none','before','after') then raise exception 'Invalid evidence requirement' using errcode='22023';end if;
 if nullif(p_payload->>'installationDate','') is not null and not isfinite((p_payload->>'installationDate')::timestamptz) then raise exception 'A valid scheduled date is required';end if;
 if p_operation in ('create','from_quote') and p_revision<>0 then raise exception 'New jobs require revision zero' using errcode='40001';end if;

 perform pg_advisory_xact_lock(hashtextextended('job-workflow-op/'||p_operation_id::text,0));
 select * into receipt from private.crm_job_workflow_operations where id=p_operation_id;
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
   if not private.has_module_access('quotations','view','web') or not private.has_module_access('quotations','update','web') or not private.has_module_access('leads','view','web') or not private.has_module_access('leads','update','web') then raise exception 'Quotation and lead access required' using errcode='42501';end if;
   select data into quote from public.crm_records where collection='quotes' and id=p_payload->>'quoteId' for update;
   if quote is null or quote->>'status' is distinct from 'Accepted' then raise exception 'Accepted quotation required';end if;
   if nullif(quote->>'linkedJobId','') is not null or exists(select 1 from public.crm_records where collection='jobs' and data->>'quoteId'=quote->>'id') then raise exception 'Quotation already has a job; reload its linked job';end if;
   select data into lead from public.crm_records where collection='leads' and id=quote->>'leadId' for update;
   if lead is null then raise exception 'Linked lead required';end if;
   p_payload:=p_payload||jsonb_build_object('customer',lead->>'customer','phone',lead->>'phone','address',lead->>'address','postcode',lead->>'postcode','service',lead->>'service','installationDate',coalesce(p_payload->>'installationDate',(now()+interval '7 days')::text));
  end if;
  if quote is not null then
   perform private.crm_qty(quote,'total');
   if quote->>'total' is null or jsonb_typeof(quote->'items') is distinct from 'array' then raise exception 'Quotation items and total required';end if;
   for s in select value from jsonb_array_elements(quote->'items') loop
    perform private.crm_qty(s,'quantity');perform private.crm_qty(s,'unitPrice');
    if private.crm_company_stock(s) and coalesce(s->>'active','true')<>'false' and coalesce(s->>'cancelled','false')<>'true' and coalesce(s->>'excluded','false')<>'true' and lower(coalesce(s->>'status','')) not in ('cancelled','canceled','excluded') and private.crm_qty(s,'quantity')>0 then
     if not exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id where v.id::text=s->>'productId' and v.active and p.active) then raise exception 'Active inventory variant required for quotation item';end if;
    end if;
   end loop;
  end if;
  if trim(coalesce(p_payload->>'customer',''))='' then raise exception 'Customer is required';end if;
  if coalesce(p_payload->>'installerId','')<>'' and not exists(select 1 from public.profiles p join public.roles r on r.id=p.role_id where p.id::text=p_payload->>'installerId' and p.status='active' and r.key='installer') then raise exception 'Choose an active installer';end if;
  -- Serialize number allocation without adding a new business table or sequence.
  perform pg_advisory_xact_lock(hashtextextended('crm-job-number',0));
  select greatest(118,coalesce(max(case when data->>'number' ~ '^JOB-[0-9]+$' then substring(data->>'number' from 5)::bigint end),118))+1 into next_number from public.crm_records where collection='jobs';
  j:=jsonb_build_object('id',p_job_id,'number','JOB-'||lpad(next_number::text,6,'0'),'customer',p_payload->>'customer','phone',coalesce(p_payload->>'phone',''),'address',coalesce(p_payload->>'address',''),'postcode',coalesce(p_payload->>'postcode',''),'service',coalesce(p_payload->>'service',p_payload->>'workType','Installation'),'workType',private.crm_work_type(p_payload),'status','Confirmed','installerId',coalesce(p_payload->>'installerId',''),'installationDate',coalesce(p_payload->>'installationDate',(now()+interval '7 days')::text),'items','[]'::jsonb,'stages','[]'::jsonb,'timeline','[]'::jsonb,'photos','[]'::jsonb,'installationProof','[]'::jsonb,'extraItems','[]'::jsonb,'value',coalesce((quote->>'total')::numeric,0),'outstanding',0,'workflowVersion',1,'workflowRevision',0,'collectionFlowVersion',2,'financialHold',false,'warehouse','Main Sydney Warehouse','suburb',concat_ws(' ',nullif(lead->>'suburb',''),nullif(lead->>'postcode','')),'notes','Confirm the site address, installer and proposed installation date before scheduling.');
  if p_operation='from_quote' then
   j:=j||jsonb_build_object('quoteId',quote->>'id','leadId',lead->>'id','items',coalesce((select jsonb_agg(jsonb_build_object('id','line-'||p_operation_id||'-'||ord,'productId',x->>'productId','variantId',x->>'productId','name',x->>'description','sku',coalesce(x->>'sku',''),'kind',x->>'kind','requiresInventory',coalesce(x->'requiresInventory','true'::jsonb),'fulfilmentSource',coalesce(x->>'fulfilmentSource','company'),'quantityRequired',private.crm_qty(x,'quantity'),'quantityReserved',0,'quantityMatched',0,'quantityPicked',0,'quantityIssued',0,'quantityUsed',0,'quantityReturned',0)) from jsonb_array_elements(coalesce(quote->'items','[]')) with ordinality as a(x,ord) where private.crm_company_stock(x) and exists(select 1 from public.product_variants v join public.products p on p.id=v.product_id where v.id::text=x->>'productId' and p.track_inventory) and coalesce(x->>'active','true')<>'false' and coalesce(x->>'cancelled','false')<>'true' and coalesce(x->>'excluded','false')<>'true' and lower(coalesce(x->>'status','')) not in ('cancelled','canceled','excluded') and private.crm_qty(x,'quantity')>0),'[]'::jsonb));
  end if;
  if lead is not null then j:=j||jsonb_build_object('leadId',lead->>'id');end if;
  billing_lines:='[]';
  select case when coalesce(sum(private.crm_qty(x,'lineTotal')) filter(where x->>'taxable' is distinct from 'false'),0)>0 then private.crm_qty(quote,'gst')/sum(private.crm_qty(x,'lineTotal')) filter(where x->>'taxable' is distinct from 'false') else 0 end into tax_rate from jsonb_array_elements(coalesce(quote->'items','[]')) x;
  for bill_line in select value from jsonb_array_elements(j->'items') loop
   select array_agg(distinct round(private.crm_qty(x,'unitPrice')*(1+case when x->>'taxable' is distinct from 'false' then tax_rate else 0 end),2)) into prices from jsonb_array_elements(coalesce(quote->'items','[]')) x where x->>'productId'=bill_line->>'productId';
   billing_lines:=billing_lines||jsonb_build_array(jsonb_build_object('itemId',bill_line->>'id','unitGross',case when cardinality(prices)=1 then prices[1] else null end));
  end loop;
  j:=j||jsonb_build_object('billingBasis',jsonb_build_object('baseTotal',j->'value','lines',billing_lines,'source',coalesce(quote->>'number','Legacy job — management confirmation needed'),'confirmed',not exists(select 1 from jsonb_array_elements(billing_lines) x where x->>'unitGross' is null),'capturedAt',now()));
 else
  if j is null then raise exception 'Job not found';end if;
  if coalesce((j->>'workflowRevision')::bigint,0)<>p_revision then raise exception 'Job changed in another session. Reload before saving' using errcode='40001';end if;
  if j->>'status'='Completed' and p_operation<>'reopen' then raise exception 'Explicitly reopen the completed job before adding or changing work';end if;
 end if;
 before_job:=j;
 insert into private.crm_job_workflow_operations(id,actor_id,job_id,request_hash) values(p_operation_id,actor,p_job_id,hash);
 perform 1 from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id order by id for update;
 select coalesce(jsonb_agg(data order by id),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id;
 if jsonb_array_length(ts)>0 and not private.has_module_access('tasks','view','web') then raise exception 'tasks.view permission required' using errcode='42501';end if;
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
  if p_payload ? 'id' and not exists(select 1 from jsonb_array_elements(coalesce(j->'items','[]')) x where x->>'id'=p_payload->>'id') then raise exception 'Job item not found';end if;
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
   if p_payload->>'productId' is distinct from old_line->>'productId' then line:=line||jsonb_build_object('productId',p_payload->>'productId','variantId',p_payload->>'productId','name',p_payload->>'name','sku',p_payload->>'sku','requiresInventory',(select p.track_inventory from public.product_variants v join public.products p on p.id=v.product_id where v.id::text=p_payload->>'productId'));end if;
   select jsonb_agg(case when x->>'id'=old_line->>'id' then line else x end) into s from jsonb_array_elements(j->'items') x;j:=j||jsonb_build_object('items',s);
  else
   if p_payload->>'priceConfirmed'<>'true' or p_payload->>'productId' is null then raise exception 'Product and explicit variation price confirmation required';end if;
   perform private.crm_qty(p_payload,'unitGross');
   if not exists(select 1 from public.product_variants where id=(p_payload->>'productId')::uuid and active) then raise exception 'Active inventory variant required';end if;
   line:=jsonb_build_object('id',p_operation_id::text,'productId',p_payload->>'productId','variantId',p_payload->>'productId','name',p_payload->>'name','sku',p_payload->>'sku','kind','Inventory','requiresInventory',(select p.track_inventory from public.product_variants v join public.products p on p.id=v.product_id where v.id::text=p_payload->>'productId'),'quantityRequired',qty,'quantityReserved',0,'quantityMatched',0,'quantityPicked',0,'quantityIssued',0,'quantityUsed',0,'quantityReturned',0,'fulfilmentSource',coalesce(p_payload->>'fulfilmentSource','company'),'approvedUnitGross',private.crm_qty(p_payload,'unitGross'));
   j:=j||jsonb_build_object('items',j->'items'||jsonb_build_array(line));
  end if;
  if (private.crm_stock_facts(j)->>'outstanding')::numeric>(private.crm_stock_facts(before_job)->>'outstanding')::numeric then j:=j||jsonb_build_object('evidenceRequiredAfter',now());end if;
  if p_payload ? 'dependentTaskIds' then
   if exists(select 1 from jsonb_array_elements_text(p_payload->'dependentTaskIds') id where not exists(select 1 from jsonb_array_elements(ts) t where t->>'id'=id and t->>'status' not in ('Completed','Not applicable'))) then raise exception 'Select only outstanding tasks of this job';end if;
   select coalesce(jsonb_agg(case when p_payload->'dependentTaskIds' ? (t->>'id') then t||jsonb_build_object('requiresStock',true,'dependsOnItemIds',coalesce(t->'dependsOnItemIds','[]')||jsonb_build_array(line->>'id')) else t end),'[]') into ts from jsonb_array_elements(ts) t;
  end if;
  j:=j||jsonb_build_object('variations',coalesce(j->'variations','[]')||jsonb_build_array(jsonb_build_object('id',p_operation_id,'at',now(),'actor',actor,'reason',reason,'lineId',line->>'id','before',(select x from jsonb_array_elements(coalesce(before_job->'items','[]')) x where x->>'id'=line->>'id'),'after',line,'unitGross',private.crm_qty(p_payload,'unitGross'),'priceConfirmed',p_payload->'priceConfirmed')),'finalBillingStatus','Provisional — product variation requires reconciliation');
 elsif p_operation='stage' then
  if coalesce(p_payload->>'type','Custom') in ('Stock Shortage','Picking','Ready for Collection','Collected') and not (private.crm_stock_facts(j)->>'requiresCompanyStock')::boolean then raise exception 'This job has no company inventory requiring fulfilment';end if;
  stage_id:=coalesce(nullif(p_payload->>'id',''),'stage-'||p_operation_id::text);
  if p_payload ? 'id' and not exists(select 1 from jsonb_array_elements(coalesce(j->'stages','[]')) x where x->>'id'=p_payload->>'id') then raise exception 'Job stage not found';end if;
  select x into source_stage from jsonb_array_elements(coalesce(j->'stages','[]')) x where x->>'id'=stage_id;
  if source_stage->>'status'='Completed' then raise exception 'Completed stages and their history are immutable';end if;
  if source_stage is not null and p_payload ? 'type' and p_payload->>'type' is distinct from source_stage->>'type' then raise exception 'Existing system validation type cannot change';end if;
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
 if p_operation in ('create','from_quote') then
  select p.id::text into manager_id from public.profiles p join public.roles r on r.id=p.role_id where p.status='active' and r.key in ('super_admin','admin','manager') order by (p.id::text=lead->>'assignedTo') desc nulls last,(p.id=actor) desc,p.id limit 1;
  select coalesce(jsonb_agg(t||jsonb_build_object('quoteId',j->>'quoteId','assignedTo',case when t->>'workflowAction' in ('schedule-work','confirm-location','resolve-shortage') then coalesce(manager_id,actor::text) else coalesce(j->>'installerId','') end)),'[]') into ts from jsonb_array_elements(ts) t;
  if (private.crm_stock_facts(j)->>'outstanding')::numeric>0 then insert into public.crm_records(collection,id,data) values('pickLists',p_job_id||':pick-list',jsonb_build_object('id',p_job_id||':pick-list','number','PICK-'||next_number,'jobId',p_job_id,'assignedTo',coalesce(manager_id,actor::text),'status','Pending','locationScanned',false,'workflowOrigin','generated'));end if;
 end if;
 j:=j||jsonb_build_object('workflowRevision',coalesce((j->>'workflowRevision')::bigint,0)+1,'timeline',jsonb_build_array(jsonb_build_object('id',p_operation_id,'title','Job '||p_operation||' changed','detail',reason,'at',now(),'userId',actor))||coalesce(j->'timeline','[]'));
 -- Job and dependent tasks, notifications, reservation releases and receipt commit
 -- together. A lost response can replay this identical operation id safely.
 if p_operation in ('create','from_quote') then insert into public.crm_records(collection,id,data) values('jobs',p_job_id,j);else update public.crm_records set data=j where collection='jobs' and id=p_job_id;end if;
 for s in select value from jsonb_array_elements(ts) loop
  if exists(select 1 from public.crm_records where collection='tasks' and id=s->>'id' and data->>'jobId' is distinct from p_job_id) then raise exception 'Task id belongs to another job';end if;
  if exists(select 1 from public.crm_records where collection='tasks' and id=s->>'id' and data is distinct from s) and not private.has_module_access('tasks','update','web') then raise exception 'tasks.update permission required' using errcode='42501';end if;
  if not exists(select 1 from public.crm_records where collection='tasks' and id=s->>'id') and not private.has_module_access('tasks','create','web') then raise exception 'tasks.create permission required' using errcode='42501';end if;
  if exists(select 1 from public.crm_records where collection='tasks' and id=s->>'id') then update public.crm_records set data=s where collection='tasks' and id=s->>'id' and data is distinct from s;else insert into public.crm_records(collection,id,data) values('tasks',s->>'id',s);end if;
 end loop;
 if p_operation='from_quote' then
  update public.crm_records set data=data||jsonb_build_object('linkedJobId',p_job_id) where collection='quotes' and id=quote->>'id';
  update public.crm_records set data=data||jsonb_build_object('stage','Won') where collection='leads' and id=lead->>'id';
 end if;
 insert into public.crm_records(collection,id,data) values('logs','workflow-log-'||p_operation_id,jsonb_build_object('id','workflow-log-'||p_operation_id,'action','Job '||p_operation||' changed','entity','Job','record',j->>'number','detail',reason,'userId',actor,'createdAt',now()));
 select data into j from public.crm_records where collection='jobs' and id=p_job_id;
 select coalesce(jsonb_agg(data order by id),'[]') into ts from public.crm_records where collection='tasks' and data->>'jobId'=p_job_id;
 result:=jsonb_build_object('job',j,'tasks',ts);
 update private.crm_job_workflow_operations set result=jsonb_build_object('job',j,'tasks',ts),complete=true where id=p_operation_id;
 return result;
end $$;
revoke all on function private.crm_work_type(jsonb) from public,anon;
grant execute on function private.crm_work_type(jsonb) to authenticated;
revoke all on function private.crm_company_stock(jsonb) from public,anon;
grant execute on function private.crm_company_stock(jsonb) to authenticated;
revoke all on function private.crm_qty(jsonb,text,numeric) from public,anon;
grant execute on function private.crm_qty(jsonb,text,numeric) to authenticated;
revoke all on function private.crm_stock_facts(jsonb) from public,anon;
grant execute on function private.crm_stock_facts(jsonb) to authenticated;
revoke all on function private.crm_stage_type(jsonb,text) from public,anon;
grant execute on function private.crm_stage_type(jsonb,text) to authenticated;
revoke all on function private.crm_workflow_shortage(jsonb) from public,anon;
grant execute on function private.crm_workflow_shortage(jsonb) to authenticated;
revoke all on function private.crm_workflow_plan(jsonb,jsonb,boolean,boolean) from public,anon;
grant execute on function private.crm_workflow_plan(jsonb,jsonb,boolean,boolean) to authenticated;
revoke all on function private.crm_workflow_release(jsonb,jsonb,numeric) from public,anon;
grant execute on function private.crm_workflow_release(jsonb,jsonb,numeric) to authenticated;
revoke all on function public.crm_job_workflow_command(text,bigint,text,jsonb,uuid) from public,anon;
grant execute on function public.crm_job_workflow_command(text,bigint,text,jsonb,uuid) to authenticated;
notify pgrst, 'reload schema';
commit;
