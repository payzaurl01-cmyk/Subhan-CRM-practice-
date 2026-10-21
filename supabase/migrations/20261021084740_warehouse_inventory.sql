-- Extension of the inspected, deployed normalized schema. Prepare/review only.
-- No seeds, account changes, stock backfills, guessed assignments, or ID rewrites.
begin;
alter table public.products add column if not exists image_paths text[] not null default '{}';
alter table public.product_variants add column if not exists image_paths text[] not null default '{}';
alter table public.warehouse_locations add column if not exists level text not null default 'bin'
  check (level in ('zone','aisle','rack','shelf','bin'));
alter table public.stock_movements add column if not exists variant_snapshot jsonb not null default '{}';
alter table public.stock_movements add column if not exists reference_text text;

-- Explicit bridge for the current CRM's JSON jobs. These immutable approvals,
-- rather than installer-editable JSON quantities, authorize stock consumption.
create table public.inventory_job_allocations(
 id uuid primary key default gen_random_uuid(),
 job_collection text not null default 'jobs' check(job_collection='jobs'),
 job_id text not null, item_id text not null,
 variant_id uuid not null references public.product_variants(id) on delete restrict,
 balance_id uuid not null references public.inventory_balances(id) on delete restrict,
 collector_id uuid not null references public.profiles(id) on delete restrict,
 quantity numeric(14,3) not null check(quantity>0),
 quantity_reserved numeric(14,3) not null check(quantity_reserved>=0),
 quantity_issued numeric(14,3) not null default 0 check(quantity_issued>=0),
 approved_by uuid not null references public.profiles(id) on delete restrict,
 approved_at timestamptz not null default now(),
 job_snapshot jsonb not null,
 unique(job_id,item_id),
 check(quantity_reserved+quantity_issued<=quantity),
 foreign key(job_collection,job_id) references public.crm_records(collection,id) on delete restrict
);
alter table public.inventory_job_allocations enable row level security;
revoke all on public.inventory_job_allocations from public,anon,authenticated;
grant select on public.inventory_job_allocations to authenticated;
create policy inventory_allocations_read on public.inventory_job_allocations for select to authenticated using(
 ((select private.has_module_access('inventory','view','web')) or (select private.has_module_access('warehouse','view','web')))
 and ((select private.current_role_key()) in ('super_admin','admin','manager') or collector_id=(select auth.uid())));
create index inventory_allocation_collector on public.inventory_job_allocations(collector_id);
create index inventory_allocation_balance on public.inventory_job_allocations(balance_id);
alter table public.stock_movements add column inventory_allocation_id uuid references public.inventory_job_allocations(id) on delete restrict;
alter table public.product_return_items add column inventory_allocation_id uuid references public.inventory_job_allocations(id) on delete restrict;
create index inventory_return_allocation on public.product_return_items(inventory_allocation_id) where inventory_allocation_id is not null;

-- A deferred floor check keeps old receipt/request RPCs from accidentally
-- freeing reservations approved by the new bridge. Unmapped legacy reservations
-- are retained; the check never invents or rewrites an allocation.
create or replace function private.inventory_reservation_floor() returns trigger
language plpgsql security definer set search_path='' as $$
declare bid uuid; held numeric; required numeric; begin
 if auth.uid() is null then raise exception 'Authenticated inventory session required'; end if;
 if tg_table_name='inventory_balances' then bid:=coalesce(new.id,old.id);
 elsif tg_table_name='stock_reservations' then bid:=coalesce(new.inventory_balance_id,old.inventory_balance_id);
 else bid:=coalesce(new.balance_id,old.balance_id); end if;
 if bid is null then return null; end if;
 select quantity_reserved into held from public.inventory_balances where id=bid for update;
 select coalesce(sum(quantity-quantity_released),0) into required from public.stock_reservations where inventory_balance_id=bid and status='active';
 required:=required+(select coalesce(sum(quantity_reserved),0) from public.inventory_job_allocations where balance_id=bid);
 if held<required then raise exception 'Reserved balance cannot drop below approved reservations'; end if;
 return null;
end $$;
revoke all on function private.inventory_reservation_floor() from public,anon,authenticated;
create constraint trigger inventory_balance_reservation_floor after insert or update on public.inventory_balances deferrable initially deferred for each row execute function private.inventory_reservation_floor();
create constraint trigger inventory_reservation_floor after insert or update or delete on public.stock_reservations deferrable initially deferred for each row execute function private.inventory_reservation_floor();
create constraint trigger inventory_allocation_floor after insert or update or delete on public.inventory_job_allocations deferrable initially deferred for each row execute function private.inventory_reservation_floor();

create or replace function private.inventory_job_command(p_action text,body jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare u uuid; result jsonb; job jsonb; item jsonb; allocation public.inventory_job_allocations;
 b public.inventory_balances; v public.product_variants; q numeric; loc public.warehouse_locations;
 mid uuid; aid uuid; rid uuid; ret public.product_returns; ri public.product_return_items;
begin
 if p_action in ('allocate_job','reserve_allocation','release_allocation','return_delivered') then
  u:=private.crm_upgrade_require('inventory','update',true);
 else
  u:=private.crm_upgrade_require('warehouse','view',false);
  perform private.crm_upgrade_require('jobs','update',false);
 end if;
 result:=private.crm_upgrade_begin(u,'inventory.'||p_action,p_key,body);
 if result is not null then return result; end if;
 if p_action='allocate_job' then
  perform private.crm_upgrade_require('jobs','view',true);
  select data into job from public.crm_records where collection='jobs' and id=body->>'job_id' for update;
  select value into item from jsonb_array_elements(job->'items') where value->>'id'=body->>'item_id';
  if job is null or item is null or job->>'collectionIssuedAt' is not null or job->>'status' in ('Completed','Cancelled') then raise exception 'Uncollected job item required'; end if;
  q:=(item->>'quantityRequired')::numeric;
  if q is null or q<=0 or q*1000<>trunc(q*1000) or nullif(body->>'quantity','') is null or q<>(body->>'quantity')::numeric then raise exception 'Review the job required quantity; it changed or was not confirmed'; end if;
  select * into v from public.product_variants where id=(body->>'variant_id')::uuid and active;
  if v.id is null then raise exception 'Select an active variant explicitly'; end if;
  if not coalesce((body->>'mapping_confirmed')::boolean,false) then raise exception 'Confirm the job snapshot and variant mapping'; end if;
  if not exists(select 1 from public.profiles where id=(body->>'collector_id')::uuid and status='active') then raise exception 'Active collector required'; end if;
  select * into loc from public.warehouse_locations where id=(body->>'location_id')::uuid and active for share;
  if loc.id is null or not exists(select 1 from public.warehouses where id=loc.warehouse_id and active) then raise exception 'Active storage location required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('crm-stock/'||v.id||'/'||loc.warehouse_id||'/'||loc.id,0));
  select * into b from public.inventory_balances where variant_id=v.id and location_id=loc.id for update;
  if b.id is null or b.quantity_on_hand-b.quantity_reserved<q then raise exception 'Insufficient available stock for this job item'; end if;
  insert into public.inventory_job_allocations(job_id,item_id,variant_id,balance_id,collector_id,quantity,quantity_reserved,approved_by,job_snapshot)
  values(body->>'job_id',body->>'item_id',v.id,b.id,(body->>'collector_id')::uuid,q,q,u,item) returning id into aid;
  update public.inventory_balances set quantity_reserved=quantity_reserved+q,version=version+1 where id=b.id;
  insert into public.stock_movements(client_event_id,movement_type,variant_id,quantity,from_warehouse_id,from_location_id,notes,reference_text,created_by,inventory_allocation_id)
  values('inventory/'||u||'/'||p_key,'reserve',v.id,q,b.warehouse_id,b.location_id,'Manager-approved CRM job allocation',coalesce(job->>'number',body->>'job_id'),u,aid) returning id into mid;
  result:=jsonb_build_object('id',aid,'movement_id',mid);
 elsif p_action='complete_collection' then
  select data into job from public.crm_records where collection='jobs' and id=body->>'job_id' for update;
  if job is null then raise exception 'Job not found'; end if;
  if private.current_role_key()='installer' and not exists(select 1 from public.inventory_job_allocations where job_id=body->>'job_id' and collector_id=u) then raise exception 'Job is not assigned to you'; end if;
  if coalesce((job->>'financialHold')::boolean,false) then raise exception 'Job is on financial hold'; end if;
  if jsonb_typeof(job->'items') is distinct from 'array' or jsonb_array_length(job->'items')=0 then raise exception 'Inventory job items required'; end if;
  for item in select value from jsonb_array_elements(job->'items') loop
   select * into allocation from public.inventory_job_allocations where job_id=body->>'job_id' and item_id=item->>'id';
   if allocation.id is null or allocation.quantity_issued<allocation.quantity or allocation.quantity<>(item->>'quantityRequired')::numeric then raise exception 'Every job item requires an approved, fully issued allocation'; end if;
  end loop;
  job:=jsonb_set(job,'{items}',(select jsonb_agg(value||jsonb_build_object('quantityIssued',a.quantity_issued,'quantityPicked',a.quantity_issued,'quantityMatched',a.quantity_issued,'quantityReserved',0)) from jsonb_array_elements(job->'items') join public.inventory_job_allocations a on a.job_id=body->>'job_id' and a.item_id=value->>'id'));
  job:=job||jsonb_build_object('status','Collected','collectionIssuedAt',coalesce(job->>'collectionIssuedAt',now()::text),'collectedBy',u);
  update public.crm_records set data=job where collection='jobs' and id=body->>'job_id';
  result:=jsonb_build_object('job',job);
 elsif p_action in ('return_pickup','return_delivered') then
  select * into ri from public.product_return_items where id=(body->>'return_item_id')::uuid for update;
  select * into ret from public.product_returns where id=ri.product_return_id for update;
  select * into allocation from public.inventory_job_allocations where id=ri.inventory_allocation_id;
  if allocation.id is null or ret.inventory_posted_at is not null then raise exception 'Pending return linked to a CRM allocation required'; end if;
  if private.current_role_key()='installer' and allocation.collector_id<>u then raise exception 'Return is not assigned to you'; end if;
  if p_action='return_pickup' then
   if ri.variant_id is distinct from (body->>'variant_id')::uuid or nullif(body->>'quantity','') is null or (body->>'quantity')::numeric<>ri.quantity or ri.pickup_matched>=ri.quantity then raise exception 'Match the exact variant and full return quantity once'; end if;
   update public.product_return_items set pickup_matched=quantity where id=ri.id;
   update public.product_returns set collected_at=now(),workflow_status='collected_for_return' where id=ret.id;
  else
   if ri.pickup_matched<ri.quantity or ret.delivered_at is not null then raise exception 'Match the return pickup first; duplicate delivery rejected'; end if;
   update public.product_returns set delivered_at=now(),workflow_status='delivered' where id=ret.id;
  end if;
  result:=jsonb_build_object('id',ri.id);
 else
  if p_action='allocation_issue' then
   select * into allocation from public.inventory_job_allocations where id=(body->>'allocation_id')::uuid;
   select data into job from public.crm_records where collection='jobs' and id=allocation.job_id for update;
  end if;
  select * into allocation from public.inventory_job_allocations where id=(body->>'allocation_id')::uuid for update;
  if allocation.id is null then raise exception 'Allocation not found'; end if;
  if private.current_role_key()='installer' and allocation.collector_id<>u then raise exception 'Allocation is not assigned to you'; end if;
  q:=(body->>'quantity')::numeric;
  if q is null or q<=0 or q*1000<>trunc(q*1000) or q::text in ('NaN','Infinity') then raise exception 'Positive quantity with up to three decimal places required'; end if;
  if p_action='request_return' then
   if q>allocation.quantity_issued-(select coalesce(sum(quantity),0) from public.product_return_items where inventory_allocation_id=allocation.id) then raise exception 'Return exceeds issued quantity'; end if;
   select * into loc from public.warehouse_locations where id=(body->>'location_id')::uuid and active;
   if loc.id is null or not exists(select 1 from public.warehouses where id=loc.warehouse_id and active) then raise exception 'Select an active return warehouse location'; end if;
   insert into public.product_returns(installer_user_id,warehouse_id,reason,workflow_status,requested_by,billing_credit) values(allocation.collector_id,loc.warehouse_id,body->>'reason','draft',u,false) returning id into rid;
   insert into public.product_return_items(product_return_id,variant_id,quantity,condition,inventory_allocation_id) values(rid,allocation.variant_id,q,'opened',allocation.id) returning id into aid;
   result:=jsonb_build_object('id',aid);
  else
   if btrim(coalesce(body->>'reason',''))='' or btrim(coalesce(body->>'reference',''))='' then raise exception 'Reason and reference required'; end if;
   select * into b from public.inventory_balances where id=allocation.balance_id;
   perform pg_advisory_xact_lock(hashtextextended('crm-stock/'||b.variant_id||'/'||b.warehouse_id||'/'||b.location_id,0));
   select * into b from public.inventory_balances where id=allocation.balance_id for update;
   if p_action='reserve_allocation' then
    if q>allocation.quantity-allocation.quantity_reserved-allocation.quantity_issued or q>b.quantity_on_hand-b.quantity_reserved then raise exception 'Insufficient stock or approval quantity exceeded'; end if;
    update public.inventory_balances set quantity_reserved=quantity_reserved+q,version=version+1 where id=b.id;
    update public.inventory_job_allocations set quantity_reserved=quantity_reserved+q where id=allocation.id;
   elsif p_action='allocation_issue' then
    if q>allocation.quantity_reserved then raise exception 'Quantity exceeds remaining approved reservation'; end if;
    if coalesce((job->>'financialHold')::boolean,false) or coalesce(job->>'status','') not in ('Ready for Collection','Collected') then raise exception 'Job must be ready for collection without financial holds'; end if;
    if not exists(select 1 from public.warehouse_locations l join public.warehouses w on w.id=l.warehouse_id where l.id=b.location_id and l.active and w.active) then raise exception 'Warehouse or location is inactive'; end if;
    if b.quantity_on_hand<q or b.quantity_reserved<q then raise exception 'Insufficient reserved stock'; end if;
    update public.inventory_balances set quantity_on_hand=quantity_on_hand-q,quantity_reserved=quantity_reserved-q,version=version+1 where id=b.id;
    update public.inventory_job_allocations set quantity_reserved=quantity_reserved-q,quantity_issued=quantity_issued+q where id=allocation.id;
   elsif p_action='release_allocation' then
    if q>allocation.quantity_reserved then raise exception 'Quantity exceeds remaining approved reservation'; end if;
    update public.inventory_balances set quantity_reserved=quantity_reserved-q,version=version+1 where id=b.id;
    update public.inventory_job_allocations set quantity_reserved=quantity_reserved-q where id=allocation.id;
   else raise exception 'Unknown allocation operation'; end if;
   insert into public.stock_movements(client_event_id,movement_type,variant_id,quantity,from_warehouse_id,from_location_id,notes,reference_text,created_by,inventory_allocation_id)
   values('inventory/'||u||'/'||p_key,case when p_action='allocation_issue' then 'issue' when p_action='reserve_allocation' then 'reserve' else 'release' end,allocation.variant_id,q,b.warehouse_id,b.location_id,body->>'reason',body->>'reference',u,allocation.id) returning id into mid;
   result:=jsonb_build_object('id',allocation.id,'movement_id',mid);
  end if;
 end if;
 return private.crm_upgrade_finish(u,'inventory.'||p_action,p_key,body,result);
end $$;
revoke all on function private.inventory_job_command(text,jsonb,uuid) from public,anon;
grant execute on function private.inventory_job_command(text,jsonb,uuid) to authenticated;

create or replace function private.inventory_attributes(p_attributes jsonb) returns jsonb
language sql immutable set search_path='' as $$
 select coalesce(jsonb_object_agg(lower(btrim(key)),lower(btrim(value))), '{}'::jsonb)
 from jsonb_each_text(p_attributes)
$$;
-- Fail rather than merge conflicting existing identifiers/combinations.
create unique index inventory_variant_combination on public.product_variants(product_id,private.inventory_attributes(attributes));
create unique index inventory_variant_sku on public.product_variants(lower(btrim(sku)));
create unique index inventory_product_sku on public.products(lower(btrim(sku)));
create unique index inventory_barcode on public.product_barcodes(lower(btrim(barcode)));
create unique index inventory_warehouse_code on public.warehouses(lower(btrim(code)));
create unique index inventory_location_code on public.warehouse_locations(warehouse_id,lower(btrim(code)));
create unique index inventory_return_once on public.stock_movements(product_return_item_id) where movement_type='inspected_return';
create unique index inventory_manual_receipt_once on public.stock_movements(variant_id,to_warehouse_id,to_location_id,lower(btrim(reference_text))) where movement_type='receive';
create index inventory_movements_variant_time on public.stock_movements(variant_id,created_at desc);
create index inventory_reservations_line on public.stock_reservations(job_order_item_id) where status='active';

create or replace function private.inventory_validate() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_table_name in ('products','product_variants','product_barcodes') then
  perform pg_advisory_xact_lock(hashtextextended('inventory-catalogue',0));
  if tg_table_name in ('products','product_variants') then
   if new.cost_price::text in ('NaN','Infinity','-Infinity') or new.sale_price::text in ('NaN','Infinity','-Infinity') then raise exception 'Prices must be finite numbers'; end if;
  end if;
  if tg_table_name='product_variants' then
   if btrim(new.sku)='' or btrim(new.name)='' or jsonb_typeof(new.attributes)<>'object' or exists(select 1 from jsonb_each(new.attributes) where jsonb_typeof(value)<>'string' or btrim(value#>>'{}')='' or btrim(key)='')
    or (select count(*) from jsonb_each(new.attributes))<>(select count(distinct lower(btrim(key))) from jsonb_each(new.attributes))
   then raise exception 'SKU and nonempty, uniquely named variation attributes required'; end if;
   if exists(select 1 from public.product_barcodes where lower(btrim(barcode))=lower(btrim(new.sku)) and variant_id<>new.id)
    or exists(select 1 from public.products where lower(btrim(sku))=lower(btrim(new.sku)) and id<>new.product_id)
   then raise exception 'SKU conflicts with another product or barcode'; end if;
  elsif tg_table_name='product_barcodes' then
   if btrim(new.barcode)='' or exists(select 1 from public.product_variants where lower(btrim(sku))=lower(btrim(new.barcode)) and id<>new.variant_id)
   then raise exception 'Barcode conflicts with another SKU'; end if;
  else
   if btrim(new.sku)='' or btrim(new.name)='' or btrim(new.unit)='' then raise exception 'Product name, SKU and unit required'; end if;
   if exists(select 1 from public.product_barcodes b join public.product_variants v on v.id=b.variant_id where lower(btrim(b.barcode))=lower(btrim(new.sku)) and v.product_id<>new.id)
    or exists(select 1 from public.product_variants where lower(btrim(sku))=lower(btrim(new.sku)) and product_id<>new.id)
   then raise exception 'Product SKU conflicts with another variant'; end if;
  end if;
 elsif tg_table_name='warehouse_locations' then
  if tg_op='DELETE' then
   if exists(select 1 from public.inventory_balances where location_id=old.id)
    or exists(select 1 from public.stock_movements where from_location_id=old.id or to_location_id=old.id)
    or exists(select 1 from public.warehouse_locations where parent_id=old.id)
    or exists(select 1 from public.goods_receipt_items where location_id=old.id)
    or exists(select 1 from public.product_return_items where received_location_id=old.id)
    or exists(select 1 from public.pick_list_items where location_id=old.id)
    or exists(select 1 from public.pick_lists where pickup_location_id=old.id)
   then raise exception 'Location has stock or history; deactivate it instead'; end if;
   return old;
  end if;
  if tg_op='UPDATE' and new.warehouse_id<>old.warehouse_id then raise exception 'Locations cannot be moved to another warehouse'; end if;
  if new.parent_id is not null then
   if not exists(select 1 from public.warehouse_locations where id=new.parent_id and warehouse_id=new.warehouse_id and active) then raise exception 'Parent must be an active location in the same warehouse'; end if;
   if exists(with recursive parents as (select id,parent_id from public.warehouse_locations where id=new.parent_id union select l.id,l.parent_id from public.warehouse_locations l join parents p on l.id=p.parent_id) select 1 from parents where id=new.id)
   then raise exception 'Storage hierarchy cannot contain cycles'; end if;
  end if;
 elsif tg_table_name='warehouses' and tg_op='DELETE' then
  if exists(select 1 from public.warehouse_locations where warehouse_id=old.id)
   or exists(select 1 from public.inventory_balances where warehouse_id=old.id)
   or exists(select 1 from public.stock_movements where from_warehouse_id=old.id or to_warehouse_id=old.id)
  then raise exception 'Warehouse has locations, stock or history; deactivate it instead'; end if;
  return old;
 end if;
 return new;
end $$;
create trigger inventory_catalogue_guard before insert or update on public.products for each row execute function private.inventory_validate();
create trigger inventory_variant_guard before insert or update on public.product_variants for each row execute function private.inventory_validate();
create trigger inventory_barcode_guard before insert or update on public.product_barcodes for each row execute function private.inventory_validate();
create trigger inventory_location_guard before insert or update or delete on public.warehouse_locations for each row execute function private.inventory_validate();
create trigger inventory_warehouse_guard before delete on public.warehouses for each row execute function private.inventory_validate();

-- Capture new PO receipts and commands at posting time, without rewriting any
-- existing quotation/invoice/movement snapshots.
create or replace function private.inventory_movement_snapshot() returns trigger
language plpgsql set search_path='' as $$
declare v public.product_variants; p public.products; begin
 select * into v from public.product_variants where id=new.variant_id;
 select * into p from public.products where id=v.product_id;
 new.variant_snapshot:=jsonb_build_object('product_id',p.id,'product_name',p.name,'sku',v.sku,'name',v.name,'attributes',v.attributes,'cost_price',coalesce(v.cost_price,p.cost_price),'sale_price',coalesce(v.sale_price,p.sale_price),'image_paths',case when cardinality(v.image_paths)>0 then v.image_paths else p.image_paths end)||coalesce(new.variant_snapshot,'{}');
 new.notes:=coalesce(nullif(btrim(new.notes),''),replace(new.movement_type,'_',' ')||' · '||coalesce(new.reference_type,'inventory'));
 new.reference_text:=coalesce(nullif(btrim(new.reference_text),''),new.reference_type||':'||new.reference_id::text,new.client_event_id);
 new.created_by:=coalesce(new.created_by,auth.uid());
 if new.created_by is null or new.reference_text is null then raise exception 'Movement actor and reference required'; end if;
 return new;
end $$;
create trigger inventory_movement_snapshot before insert on public.stock_movements for each row execute function private.inventory_movement_snapshot();

-- Commands are the only client write path. Existing PO receipts already run in
-- a private, authorized transaction and continue to work after these revokes.
do $$ declare t text; p record; begin
 foreach t in array array['products','product_variants','product_barcodes','warehouses','warehouse_locations','inventory_balances','stock_movements','stock_reservations'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t); end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('create policy inventory_authorized_read on public.%I for select to authenticated using ((select private.has_module_access(''inventory'',''view'',''web'')) or (select private.has_module_access(''warehouse'',''view'',''web'')))',t);
 end loop;
end $$;

create or replace function private.inventory_images(paths text[]) returns void language plpgsql set search_path='' as $$
begin
 if cardinality(paths)>8 then raise exception 'Maximum eight images'; end if;
 if exists(select 1 from unnest(paths) p where not exists(select 1 from storage.objects o where o.bucket_id='inventory-images' and o.name=p))
 then raise exception 'Image upload has not completed'; end if;
end $$;

create or replace function private.inventory_job_access(p_job_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and private.current_role_key() is not null
 and private.has_module_access('jobs','view','web')
 and exists(select 1 from public.job_orders j where j.id=p_job_id and
  (private.current_role_key() in ('admin','manager','super_admin') or
   j.primary_installer_id=auth.uid() or exists(select 1 from public.job_assignments a where a.job_order_id=j.id and a.user_id=auth.uid() and a.unassigned_at is null)))
$$;
revoke all on function private.inventory_job_access(uuid) from public,anon;
grant execute on function private.inventory_job_access(uuid) to authenticated;

create or replace function private.inventory_command(p_action text,p_payload jsonb,p_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 u uuid; old_result jsonb; result jsonb; body jsonb:=coalesce(p_payload,'{}');
 pid uuid; vid uuid; wid uuid; lid uuid; dest uuid; dwid uuid; aid uuid; mid uuid;
 q numeric; damaged numeric:=0; available numeric; reserved numeric:=0; kind text;
 b public.inventory_balances; v public.product_variants; j public.job_orders;
 ji public.job_order_items; ri public.product_return_items; ret public.product_returns;
 images text[]; attrs jsonb; existing public.products; entry jsonb; lock_key text;
 before_state jsonb; after_state jsonb; catalogue_table text;
begin
 if p_action in ('allocate_job','allocation_issue','reserve_allocation','release_allocation','request_return','return_pickup','return_delivered','complete_collection') then
  return private.inventory_job_command(p_action,body,p_key);
 end if;
 if p_action in ('purchase_order','supplier') then
  u:=private.crm_upgrade_require('purchasing','create',true);
 elsif p_action in ('warehouse','location','delete_warehouse','delete_location') then
  u:=private.crm_upgrade_require('warehouse',case when p_action like 'delete_%' then 'delete' when nullif(body->>'id','') is null then 'create' else 'update' end,true);
 elsif p_action='issue' then
  u:=private.crm_upgrade_require('warehouse','view',false);
  perform private.crm_upgrade_require('jobs','update',false);
 else
  u:=private.crm_upgrade_require('inventory',case when p_action in ('product','variant') and nullif(body->>'id','') is null then 'create' else 'update' end,true);
 end if;
 old_result:=private.crm_upgrade_begin(u,'inventory.'||p_action,p_key,body);
 if old_result is not null then return old_result; end if;
 if p_action='supplier' then
  if btrim(coalesce(body->>'name',''))='' then raise exception 'Supplier name required'; end if;
  insert into public.suppliers(name,code,email,phone) values(btrim(body->>'name'),nullif(btrim(body->>'code'),''),nullif(body->>'email',''),nullif(body->>'phone','')) returning id into pid;
  result:=jsonb_build_object('id',pid);
 elsif p_action='purchase_order' then
  wid:=(body->>'warehouse_id')::uuid;
  if not exists(select 1 from public.warehouses where id=wid and active) or not exists(select 1 from public.suppliers where id=(body->>'supplier_id')::uuid and active) then raise exception 'Active warehouse and supplier required'; end if;
  if jsonb_typeof(body->'items') is distinct from 'array' or jsonb_array_length(body->'items')=0 then raise exception 'Purchase-order items required'; end if;
  insert into public.purchase_orders(supplier_id,warehouse_id,status,notes,created_by) values((body->>'supplier_id')::uuid,wid,'ordered',body->>'notes',u) returning id into pid;
  for entry in select value from jsonb_array_elements(body->'items') loop
   select * into v from public.product_variants where id=(entry->>'variant_id')::uuid and active;
   q:=(entry->>'quantity')::numeric;
   if v.id is null or q is null or q<=0 or q<>trunc(q) or q::text in ('NaN','Infinity') then raise exception 'Active variant and positive integer ordered quantity required'; end if;
   insert into public.purchase_order_items(purchase_order_id,variant_id,quantity_ordered,unit_cost,sku_snapshot,name_snapshot)
   values(pid,v.id,q,(entry->>'unit_cost')::numeric,v.sku,v.name);
  end loop;
  update public.purchase_orders set subtotal=(select sum(quantity_ordered*unit_cost) from public.purchase_order_items where purchase_order_id=pid),total=(select sum(quantity_ordered*unit_cost) from public.purchase_order_items where purchase_order_id=pid) where id=pid;
  result:=jsonb_build_object('id',pid);
 elsif p_action in ('warehouse','location','product','variant') then
  perform pg_advisory_xact_lock(hashtextextended('inventory-catalogue',0));
  pid:=nullif(body->>'id','')::uuid;
  catalogue_table:=case p_action when 'warehouse' then 'warehouses' when 'location' then 'warehouse_locations' when 'product' then 'products' else 'product_variants' end;
  if pid is not null then execute format('select to_jsonb(t) from public.%I t where id=$1',catalogue_table) into before_state using pid; end if;
  if p_action='warehouse' then
   if btrim(coalesce(body->>'name',''))='' or btrim(coalesce(body->>'code',''))='' or btrim(coalesce(body->>'postcode',''))='' then raise exception 'Warehouse name, code and postcode required'; end if;
   if nullif(body->>'latitude','')::numeric not between -90 and 90 or nullif(body->>'longitude','')::numeric not between -180 and 180 then raise exception 'Invalid coordinates'; end if;
   insert into public.addresses(line1,postcode,latitude,longitude,country_code) values(body->>'address',body->>'postcode',nullif(body->>'latitude','')::numeric,nullif(body->>'longitude','')::numeric,'AU') returning id into aid;
   if pid is null then
    insert into public.warehouses(name,code,address_id,active,kind) values(btrim(body->>'name'),btrim(body->>'code'),aid,coalesce((body->>'active')::boolean,true),'warehouse') returning id into pid;
    insert into public.warehouse_locations(warehouse_id,code,name,level) values(pid,'DEFAULT','Default storage','bin');
   else
    update public.warehouses set name=btrim(body->>'name'),code=btrim(body->>'code'),address_id=aid,active=(body->>'active')::boolean where id=pid;
    if not found then raise exception 'Warehouse not found'; end if;
   end if;
  elsif p_action='location' then
   wid:=(body->>'warehouse_id')::uuid;
   if not exists(select 1 from public.warehouses where id=wid and active) then raise exception 'Active warehouse required'; end if;
   if btrim(coalesce(body->>'name',''))='' or btrim(coalesce(body->>'code',''))='' then raise exception 'Location name and code required'; end if;
   if pid is null then
    insert into public.warehouse_locations(warehouse_id,parent_id,code,name,level,active) values(wid,nullif(body->>'parent_id','')::uuid,btrim(body->>'code'),btrim(body->>'name'),body->>'level',coalesce((body->>'active')::boolean,true)) returning id into pid;
   else
    update public.warehouse_locations set parent_id=nullif(body->>'parent_id','')::uuid,code=btrim(body->>'code'),name=btrim(body->>'name'),level=body->>'level',active=(body->>'active')::boolean where id=pid and warehouse_id=wid;
    if not found then raise exception 'Location not found'; end if;
   end if;
  elsif p_action='product' then
   images:=array(select jsonb_array_elements_text(coalesce(body->'image_paths','[]')));
   perform private.inventory_images(images);
   if nullif(btrim(body->>'category_name'),'') is not null then
    select id into aid from public.product_categories where active and lower(btrim(name))=lower(btrim(body->>'category_name')) order by id limit 1;
    if aid is null then
     insert into public.product_categories(name,slug) values(btrim(body->>'category_name'),'inventory-'||md5(lower(btrim(body->>'category_name')))) returning id into aid;
    end if;
   else aid:=nullif(body->>'category_id','')::uuid;
   end if;
   if coalesce((body->>'opening_quantity')::numeric,0)<0 then raise exception 'Opening stock cannot be negative'; end if;
   if pid is null then
    insert into public.products(name,sku,description,category_id,unit,cost_price,sale_price,active,metadata,image_paths)
    values(btrim(body->>'name'),btrim(body->>'sku'),body->>'description',aid,coalesce(nullif(body->>'unit',''),'each'),(body->>'cost_price')::numeric,(body->>'sale_price')::numeric,coalesce((body->>'active')::boolean,true),jsonb_build_object('brand',body->>'brand','supplier_id',body->>'supplier_id'),images) returning id into pid;
    insert into public.product_variants(product_id,sku,name,attributes,cost_price,sale_price,brand,default_supplier_id)
    values(pid,btrim(body->>'sku'),body->>'name',coalesce(body->'attributes','{}'),(body->>'cost_price')::numeric,(body->>'sale_price')::numeric,body->>'brand',nullif(body->>'supplier_id','')::uuid) returning id into vid;
    if nullif(btrim(body->>'barcode'),'') is not null then insert into public.product_barcodes(variant_id,barcode,is_primary) values(vid,btrim(body->>'barcode'),true); end if;
    if coalesce((body->>'opening_quantity')::numeric,0)>0 then
     result:=private.inventory_command('opening',jsonb_build_object('variant_id',vid,'location_id',body->>'location_id','quantity',body->>'opening_quantity','reason','Opening stock','reference','Product creation'),p_key);
    end if;
   else
    select * into existing from public.products where id=pid for update;
    if existing.id is null then raise exception 'Product not found'; end if;
    if body ? 'opening_quantity' or body ? 'quantity_on_hand' then raise exception 'Use Add Stock or Adjust Stock to change quantities'; end if;
    update public.products set name=btrim(body->>'name'),sku=btrim(body->>'sku'),description=body->>'description',category_id=aid,unit=body->>'unit',cost_price=(body->>'cost_price')::numeric,sale_price=(body->>'sale_price')::numeric,active=(body->>'active')::boolean,metadata=metadata||jsonb_build_object('brand',body->>'brand','supplier_id',body->>'supplier_id'),image_paths=images where id=pid;
    if (select count(*) from public.product_variants where product_id=pid)=1 then
     update public.product_variants set sku=btrim(body->>'sku'),name=btrim(body->>'name'),cost_price=(body->>'cost_price')::numeric,sale_price=(body->>'sale_price')::numeric where product_id=pid and attributes='{}'::jsonb;
    end if;
   end if;
  else
   images:=array(select jsonb_array_elements_text(coalesce(body->'image_paths','[]')));
   perform private.inventory_images(images); attrs:=coalesce(body->'attributes','{}');
   if pid is null then
    insert into public.product_variants(product_id,sku,name,attributes,cost_price,sale_price,active,brand,default_supplier_id,image_paths)
    values((body->>'product_id')::uuid,btrim(body->>'sku'),body->>'name',attrs,(body->>'cost_price')::numeric,(body->>'sale_price')::numeric,coalesce((body->>'active')::boolean,true),body->>'brand',nullif(body->>'supplier_id','')::uuid,images) returning id into pid;
   else
    update public.product_variants set sku=btrim(body->>'sku'),name=body->>'name',attributes=attrs,cost_price=(body->>'cost_price')::numeric,sale_price=(body->>'sale_price')::numeric,active=(body->>'active')::boolean,brand=body->>'brand',default_supplier_id=nullif(body->>'supplier_id','')::uuid,image_paths=images where id=pid and product_id=(body->>'product_id')::uuid;
    if not found then raise exception 'Variant not found'; end if;
   end if;
   if body ? 'opening_quantity' or body ? 'quantity_on_hand' then raise exception 'Adding/editing a variant does not create stock'; end if;
   -- Retain historical barcode aliases; an additional primary barcode must be unique.
   if nullif(btrim(body->>'barcode'),'') is not null then
    update public.product_barcodes set is_primary=false where variant_id=pid;
    insert into public.product_barcodes(variant_id,barcode,is_primary) values(pid,btrim(body->>'barcode'),true)
    on conflict(barcode) do update set is_primary=true where public.product_barcodes.variant_id=pid;
    if not found then raise exception 'Barcode already belongs to another variant'; end if;
   end if;
  end if;
  result:=jsonb_build_object('id',pid,'variant_id',vid);
  execute format('select to_jsonb(t) from public.%I t where id=$1',catalogue_table) into after_state using pid;
  insert into public.audit_logs(actor_user_id,effective_user_id,action,entity_type,entity_id,old_data,new_data)
  values(u,u,'inventory.'||p_action||case when before_state is null then '.created' else '.updated' end,catalogue_table,pid,before_state,after_state);
 elsif p_action in ('delete_warehouse','delete_location') then
  pid:=(body->>'id')::uuid;
  if p_action='delete_warehouse' then delete from public.warehouses where id=pid; else delete from public.warehouse_locations where id=pid; end if;
  if not found then raise exception 'Record not found'; end if;
  result:=jsonb_build_object('id',pid);
 elsif p_action in ('opening','receive','adjust','transfer','reserve','release','issue','inspect_return','threshold') then
  vid:=(body->>'variant_id')::uuid; lid:=(body->>'location_id')::uuid; dest:=nullif(body->>'destination_id','')::uuid;
  q:=nullif(body->>'quantity','')::numeric;
  if p_action<>'threshold' and (q*1000<>trunc(q*1000) or q is null or (q=0 and p_action<>'inspect_return') or q::text in ('NaN','Infinity','-Infinity') or (q<0 and p_action<>'adjust')) then raise exception 'Valid nonzero quantity required'; end if;
  if btrim(coalesce(body->>'reason',''))='' or btrim(coalesce(body->>'reference',''))='' then raise exception 'Reason and reference required'; end if;
  if p_action='receive' and (body ? 'purchase_order_id' or body ? 'goods_receipt_id' or body ? 'goods_receipt_item_id' or body->>'reference_type' in ('goods_receipt','purchase_order') or coalesce((body->>'po_linked')::boolean,false)) then raise exception 'Use purchasing goods receipts for PO deliveries'; end if;
  select * into v from public.product_variants where id=vid and active;
  if v.id is null or not exists(select 1 from public.products where id=v.product_id and active) then raise exception 'Active product variant required'; end if;
  select l.warehouse_id into wid from public.warehouse_locations l join public.warehouses w on w.id=l.warehouse_id where l.id=lid and l.active and w.active for share of l,w;
  if wid is null then raise exception 'Active warehouse and storage location required'; end if;
  if p_action in ('reserve','release','issue') then
   select * into ji from public.job_order_items where id=(body->>'job_item_id')::uuid for update;
   select * into j from public.job_orders where id=ji.job_order_id for update;
   if ji.id is null or ji.variant_id<>vid then raise exception 'Matching job item required; legacy jobs need an explicit mapping'; end if;
   if not private.inventory_job_access(j.id) then raise exception 'Job is not assigned or authorized for you' using errcode='42501'; end if;
   if p_action='issue' and (j.financial_hold or j.workflow_stage is distinct from 'ready_for_collection') then raise exception 'Job must be ready for collection and free of financial holds'; end if;
  end if;
  -- Same lock namespace as deployed PO receipts. Sorted keys avoid A->B/B->A transfer deadlocks.
  if p_action='transfer' then
   select l.warehouse_id into dwid from public.warehouse_locations l join public.warehouses w on w.id=l.warehouse_id where l.id=dest and l.active and w.active for share of l,w;
   if dwid is null or lid=dest then raise exception 'Choose a different active destination'; end if;
  end if;
  for lock_key in select distinct k from unnest(array['crm-stock/'||vid||'/'||wid||'/'||lid,case when dest is not null then 'crm-stock/'||vid||'/'||dwid||'/'||dest end]) k where k is not null order by k loop perform pg_advisory_xact_lock(hashtextextended(lock_key,0)); end loop;
  insert into public.inventory_balances(variant_id,warehouse_id,location_id) values(vid,wid,lid) on conflict(variant_id,warehouse_id,location_id) do nothing;
  select * into b from public.inventory_balances where variant_id=vid and warehouse_id=wid and location_id=lid for update;
  available:=b.quantity_on_hand-b.quantity_reserved;
  if p_action='threshold' then
   if nullif(body->>'threshold','') is null or (body->>'threshold')::numeric<0 or (body->>'threshold')::numeric::text in ('NaN','Infinity','-Infinity') then raise exception 'Threshold must be a finite nonnegative number'; end if;
   update public.inventory_balances set reorder_level=(body->>'threshold')::numeric where id=b.id;
  elsif p_action in ('reserve','release','issue') then
   select coalesce(sum(quantity-quantity_released),0) into reserved from public.stock_reservations where job_order_item_id=ji.id and inventory_balance_id=b.id and status='active';
   if p_action='reserve' then
    if q>available or q+ji.quantity_issued+(select coalesce(sum(quantity-quantity_released),0) from public.stock_reservations where job_order_item_id=ji.id and status='active')>ji.quantity then raise exception 'Insufficient available stock or job requirement exceeded'; end if;
    insert into public.stock_reservations(job_order_id,job_order_item_id,variant_id,warehouse_id,quantity,inventory_balance_id) values(j.id,ji.id,vid,wid,q,b.id);
    update public.inventory_balances set quantity_reserved=quantity_reserved+q,version=version+1 where id=b.id;
   else
    if p_action='release' and q>reserved then raise exception 'Release exceeds reserved quantity'; end if;
    if p_action='issue' and (q>ji.quantity-ji.quantity_issued or q>available+reserved or (private.current_role_key()='installer' and q>reserved)) then raise exception 'Insufficient stock or reserved quantity; duplicate issue rejected'; end if;
    damaged:=least(q,reserved);
    for entry in select jsonb_build_object('id',id,'left',quantity-quantity_released) from public.stock_reservations where job_order_item_id=ji.id and inventory_balance_id=b.id and status='active' order by id for update loop
     exit when damaged<=0;
     update public.stock_reservations set quantity_released=quantity_released+least(damaged,(entry->>'left')::numeric),status=case when quantity_released+least(damaged,(entry->>'left')::numeric)=quantity then case when p_action='issue' then 'fulfilled' else 'released' end else 'active' end where id=(entry->>'id')::uuid;
     damaged:=damaged-least(damaged,(entry->>'left')::numeric);
    end loop;
    update public.inventory_balances set quantity_reserved=quantity_reserved-least(q,reserved),quantity_on_hand=quantity_on_hand-case when p_action='issue' then q else 0 end,version=version+1 where id=b.id;
    if p_action='issue' then
     update public.job_order_items set quantity_issued=quantity_issued+q,quantity_matched=greatest(quantity_matched,quantity_issued+q) where id=ji.id;
     if not exists(select 1 from public.job_order_items where job_order_id=j.id and requires_inventory and quantity_issued<quantity) then update public.job_orders set collection_issued_at=now(),workflow_stage='collected' where id=j.id; end if;
    end if;
   end if;
  elsif p_action='inspect_return' then
   select * into ri from public.product_return_items where id=(body->>'return_item_id')::uuid for update;
   select * into ret from public.product_returns where id=ri.product_return_id for update;
   damaged:=coalesce((body->>'damaged_quantity')::numeric,0);
   if ri.id is null or ri.variant_id<>vid or ret.warehouse_id<>wid or ret.delivered_at is null or ri.pickup_matched<ri.quantity or q+damaged<>ri.quantity or damaged<0 then raise exception 'Delivered, matched return and complete inspection required'; end if;
   if exists(select 1 from public.stock_movements where product_return_item_id=ri.id and movement_type='inspected_return') then raise exception 'Return already restored to stock'; end if;
   update public.inventory_balances set quantity_on_hand=quantity_on_hand+q,quantity_damaged=quantity_damaged+damaged,version=version+1 where id=b.id;
   update public.product_return_items set usable_quantity=q,damaged_quantity=damaged,received_location_id=lid where id=ri.id;
  else
   if p_action='opening' and (b.quantity_on_hand<>0 or b.quantity_reserved<>0 or exists(select 1 from public.stock_movements where variant_id=vid and (from_location_id=lid or to_location_id=lid))) then raise exception 'Opening stock already exists; use Add Stock'; end if;
   if (p_action='transfer' and q>available) or (p_action='adjust' and q<0 and -q>available) then raise exception 'Insufficient available stock; reserved stock cannot be removed'; end if;
   update public.inventory_balances set quantity_on_hand=quantity_on_hand+case when p_action='transfer' then -q else q end,version=version+1 where id=b.id;
   if p_action='transfer' then
    insert into public.inventory_balances(variant_id,warehouse_id,location_id,quantity_on_hand) values(vid,dwid,dest,q) on conflict(variant_id,warehouse_id,location_id) do update set quantity_on_hand=public.inventory_balances.quantity_on_hand+excluded.quantity_on_hand,version=public.inventory_balances.version+1;
   end if;
  end if;
  if p_action<>'threshold' then
   insert into public.stock_movements(client_event_id,movement_type,variant_id,quantity,from_warehouse_id,from_location_id,to_warehouse_id,to_location_id,job_order_item_id,product_return_item_id,notes,reference_text,created_by,variant_snapshot,damaged_quantity_delta)
   values('inventory/'||u||'/'||p_key,case when p_action='inspect_return' then 'inspected_return' else p_action end,vid,case when p_action='inspect_return' then q+damaged else abs(q) end,
    case when p_action in ('transfer','issue','reserve','release') or q<0 then wid end,case when p_action in ('transfer','issue','reserve','release') or q<0 then lid end,
    case when p_action='transfer' then dwid when p_action in ('opening','receive','inspect_return') or (p_action='adjust' and q>0) then wid end,
    case when p_action='transfer' then dest when p_action in ('opening','receive','inspect_return') or (p_action='adjust' and q>0) then lid end,
    ji.id,ri.id,body->>'reason',body->>'reference',u,jsonb_build_object('sku',v.sku,'name',v.name,'attributes',v.attributes,'usable_quantity',case when p_action='inspect_return' then q end),case when p_action='inspect_return' then damaged else 0 end) returning id into mid;
   if p_action='inspect_return' and not exists(select 1 from public.product_return_items i where i.product_return_id=ret.id and not exists(select 1 from public.stock_movements m where m.product_return_item_id=i.id and m.movement_type='inspected_return')) then update public.product_returns set inventory_posted_at=now(),processed_by=u where id=ret.id; end if;
  end if;
  result:=jsonb_build_object('movement_id',mid,'balance_id',b.id);
 else raise exception 'Unknown inventory command';
 end if;
 return private.crm_upgrade_finish(u,'inventory.'||p_action,p_key,body,result);
end $$;

create or replace function public.inventory_command(p_action text,p_payload jsonb,p_key uuid) returns jsonb language sql set search_path='' as $$ select private.inventory_command(p_action,p_payload,p_key) $$;
revoke all on function private.inventory_command(text,jsonb,uuid) from public,anon,authenticated;
grant execute on function private.inventory_command(text,jsonb,uuid) to authenticated;
revoke all on function public.inventory_command(text,jsonb,uuid) from public,anon;
grant execute on function public.inventory_command(text,jsonb,uuid) to authenticated;

create or replace function private.inventory_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); begin
 if u is null or private.current_role_key() is null or not (private.has_module_access('inventory','view','web') or private.has_module_access('warehouse','view','web')) then raise exception 'Inventory viewing permission required' using errcode='42501'; end if;
 return jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p)) from public.products p),'[]'),
 'variants',coalesce((select jsonb_agg(to_jsonb(v)) from public.product_variants v),'[]'),
 'barcodes',coalesce((select jsonb_agg(to_jsonb(b)) from public.product_barcodes b),'[]'),
 'warehouses',coalesce((select jsonb_agg(to_jsonb(w)||jsonb_build_object('address',a.line1,'postcode',a.postcode,'latitude',a.latitude,'longitude',a.longitude)) from public.warehouses w left join public.addresses a on a.id=w.address_id),'[]'),
 'locations',coalesce((select jsonb_agg(to_jsonb(l)) from public.warehouse_locations l),'[]'),
 'balances',coalesce((select jsonb_agg(to_jsonb(b)) from public.inventory_balances b),'[]'),
 'movements',coalesce((select jsonb_agg(to_jsonb(m)) from (select * from public.stock_movements order by created_at desc limit 200) m),'[]'),
 'categories',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.product_categories where active),'[]'),
 'suppliers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from public.suppliers where active),'[]'),
 'job_items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('job_number',j.job_number)) from public.job_order_items i join public.job_orders j on j.id=i.job_order_id where private.inventory_job_access(j.id)),'[]'),
 'allocations',coalesce((select jsonb_agg(to_jsonb(a)||jsonb_build_object('location_id',b.location_id)) from public.inventory_job_allocations a join public.inventory_balances b on b.id=a.balance_id where private.current_role_key() in ('admin','manager','super_admin') or a.collector_id=u),'[]'),
 'collectors',case when private.current_role_key() in ('admin','manager','super_admin') then coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',coalesce(full_name,email))) from public.profiles where status='active'),'[]') else '[]'::jsonb end,
 'legacy_job_items',case when private.current_role_key() in ('admin','manager','super_admin') and private.has_module_access('jobs','view','web') then coalesce((select jsonb_agg(jsonb_build_object('id',c.id||'/'||(i->>'id'),'job_id',c.id,'item_id',i->>'id','job_number',c.data->>'number','name',i->>'name','sku',i->>'sku','variant_id',i->>'productId','quantity',i->>'quantityRequired')) from public.crm_records c cross join lateral jsonb_array_elements(case when jsonb_typeof(c.data->'items')='array' then c.data->'items' else '[]'::jsonb end) i where c.collection='jobs' and c.data->>'collectionIssuedAt' is null and not exists(select 1 from public.inventory_job_allocations a where a.job_id=c.id and a.item_id=i->>'id')),'[]') else '[]'::jsonb end,
 'return_items',coalesce((select jsonb_agg(to_jsonb(i)||jsonb_build_object('delivered_at',r.delivered_at,'warehouse_id',r.warehouse_id,'collected_at',r.collected_at)) from public.product_return_items i join public.product_returns r on r.id=i.product_return_id where r.inventory_posted_at is null and (private.current_role_key() in ('admin','manager','super_admin') or r.installer_user_id=u)),'[]'),
 'purchase_orders',case when private.has_module_access('purchasing','view','web') then coalesce((select jsonb_agg(to_jsonb(p)) from public.purchase_orders p where status in ('ordered','part_received')),'[]') else '[]'::jsonb end,
 'purchase_items',case when private.has_module_access('purchasing','view','web') then coalesce((select jsonb_agg(to_jsonb(i)) from public.purchase_order_items i where quantity_received<quantity_ordered),'[]') else '[]'::jsonb end,
 'review',coalesce((select jsonb_agg(jsonb_build_object('collection',collection,'id',id,'reason','Legacy inventory/job reference requires explicit normalized mapping')) from public.crm_records where collection in ('products','stockMovements','purchaseOrders','jobs') and private.current_role_key()<>'installer'),'[]'),
 'unassigned_balances',coalesce((select jsonb_agg(to_jsonb(b)) from public.inventory_balances b where location_id is null),'[]')
 ); end $$;
create or replace function public.inventory_snapshot() returns jsonb language sql set search_path='' as $$ select private.inventory_snapshot() $$;
revoke all on function private.inventory_snapshot() from public,anon;
grant execute on function private.inventory_snapshot() to authenticated;
revoke all on function public.inventory_snapshot() from public,anon;
grant execute on function public.inventory_snapshot() to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('inventory-images','inventory-images',false,5242880,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy inventory_images_read on storage.objects for select to authenticated using(bucket_id='inventory-images' and ((select private.has_module_access('inventory','view','web')) or (select private.has_module_access('warehouse','view','web'))));
create policy inventory_images_insert on storage.objects for insert to authenticated with check(bucket_id='inventory-images' and (storage.foldername(name))[1]=(select auth.uid())::text and (select private.current_role_key()) in ('admin','manager','super_admin') and ((select private.has_module_access('inventory','update','web')) or (select private.has_module_access('inventory','create','web'))));
-- Unique paths, no overwrite/delete grant: failed replacements retain old images.

-- Prevent the compatibility JSON store from being an alternative stock ledger.
create or replace function private.inventory_legacy_guard() returns trigger language plpgsql set search_path='' as $$ begin
 if coalesce(new.collection,old.collection) in ('products','stockMovements','inventoryBalances','warehouses','warehouseLocations') then raise exception 'Use normalized inventory commands; legacy records are preserved read-only'; end if;
 return coalesce(new,old); end $$;
create trigger inventory_legacy_readonly before insert or update or delete on public.crm_records for each row execute function private.inventory_legacy_guard();
do $$ declare t text; begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
  foreach t in array array['products','product_variants','product_barcodes','warehouses','warehouse_locations','inventory_balances','stock_movements','inventory_job_allocations','product_returns','product_return_items'] loop
   if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=t) then execute format('alter publication supabase_realtime add table public.%I',t); end if;
  end loop;
 end if;
end $$;
commit;
