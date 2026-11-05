-- Restore the original Picking & Scan quantity control: each scan may issue
-- part of an approved reservation, while stock and job progress remain atomic.
-- No tables or other workflow permissions are changed.
create or replace function public.inventory_command(
  p_action text, p_payload jsonb, p_key uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare actor uuid := private.effective_user_id(); manager_role boolean;
        job_row public.crm_records; allocation public.crm_records;
        balance public.inventory_balances; item jsonb; job jsonb;
        job_id text; item_id text; allocation_id text;
        qty numeric; movement_id uuid; result jsonb; prior jsonb;
        payload_hash text := md5(jsonb_build_array(p_action, p_payload)::text);
begin
  if actor is null or p_key is null or jsonb_typeof(p_payload) is distinct from 'object'
     or p_action is null
     or p_action not in ('allocate_job','allocation_issue','complete_collection')
     or not private.has_module_access('picking','view','web')
     or not private.has_module_access('picking','update','web') then
    raise exception 'Picking permission required' using errcode = '42501';
  end if;
  manager_role := private.current_role_key() in ('super_admin','admin','manager');
  perform pg_advisory_xact_lock(hashtextextended('inventory-command:' || p_key, 0));
  select data into prior from public.crm_records
  where collection = 'inventoryOperations' and id = p_key::text;
  if prior is not null then
    if prior->>'actor' <> actor::text or prior->>'payloadHash' <> payload_hash then
      raise exception 'Operation id was reused with different inputs';
    end if;
    return prior->'result';
  end if;

  if p_action = 'allocation_issue' then
    allocation_id := p_payload->>'allocation_id';
    select * into allocation from public.crm_records
    where collection = 'inventoryAllocations' and id = allocation_id for update;
    job_id := allocation.data->>'job_id';
  else
    job_id := p_payload->>'job_id';
  end if;
  if nullif(job_id, '') is null then raise exception 'Job required'; end if;
  perform pg_advisory_xact_lock(hashtextextended('job-inventory:' || job_id, 0));
  select * into job_row from public.crm_records
  where collection = 'jobs' and id = job_id for update;
  if not found then raise exception 'Job not found'; end if;
  job := job_row.data;
  if not manager_role and job->>'installerId' is distinct from actor::text then
    raise exception 'Only the assigned installer may collect this job'
      using errcode = '42501';
  end if;

  if p_action = 'allocate_job' then
    item_id := p_payload->>'item_id';
    allocation_id := job_id || ':' || item_id;
    select value into item from jsonb_array_elements(coalesce(job->'items','[]'))
    where value->>'id' = item_id;
    if item is null or job->>'status' not in
        ('Confirmed','Picking','Ready for Collection')
       or job->>'collectionIssuedAt' is not null
       or p_payload->>'mapping_confirmed' <> 'true' then
      raise exception 'Confirm an outstanding job item and exact inventory mapping';
    end if;
    if not manager_role and coalesce(nullif(item->>'variantId',''),
         item->>'productId') is distinct from p_payload->>'variant_id' then
      raise exception 'The installer must reserve the assigned variant'
        using errcode = '42501';
    end if;
    qty := (p_payload->>'quantity')::numeric;
    if qty is null or qty <= 0 or qty <> (item->>'quantityRequired')::numeric
       or qty::text in ('NaN','Infinity','-Infinity')
       or p_payload->>'collector_id' is distinct from job->>'installerId' then
      raise exception 'Quantity and assigned collector must match the job';
    end if;
    select * into balance from public.inventory_balances
    where id = (p_payload->>'balance_id')::uuid for update;
    if not found or balance.variant_id::text is distinct from p_payload->>'variant_id'
       or balance.quantity_on_hand - balance.quantity_reserved < qty
       or not exists (
         select 1 from public.product_variants v
         join public.products p on p.id = v.product_id
         where v.id = balance.variant_id and v.active and p.active
           and p.track_inventory
       ) then
      raise exception 'Exact stocked location has insufficient available quantity';
    end if;
    if exists (select 1 from public.crm_records
               where collection = 'inventoryAllocations' and id = allocation_id) then
      raise exception 'This job item is already reserved';
    end if;
    update public.inventory_balances
    set quantity_reserved = quantity_reserved + qty
    where id = balance.id;
    result := jsonb_build_object('id', allocation_id, 'job_id', job_id,
      'item_id', item_id, 'variant_id', balance.variant_id,
      'warehouse_id', balance.warehouse_id, 'location_id', balance.location_id,
      'balance_id', balance.id, 'collector_id', job->>'installerId',
      'quantity', qty, 'quantity_reserved', qty, 'quantity_issued', 0,
      'created_at', now());
    insert into public.crm_records(collection, id, data)
    values ('inventoryAllocations', allocation_id, result);
    select jsonb_agg(case when value->>'id' = item_id
      then value || jsonb_build_object('quantityReserved', qty)
      else value end order by ord) into item
    from jsonb_array_elements(job->'items') with ordinality as a(value, ord);
    update public.crm_records set data = jsonb_set(job, '{items}', item)
    where collection = 'jobs' and id = job_id;

  elsif p_action = 'allocation_issue' then
    if allocation.data is null or job->>'status' <> 'Ready for Collection'
       or (not manager_role and allocation.data->>'collector_id' <> actor::text) then
      raise exception 'Pickup is not ready for the assigned installer';
    end if;
    qty := (p_payload->>'quantity')::numeric;
    if qty is null or qty <= 0 or qty > (allocation.data->>'quantity_reserved')::numeric
       or qty::text in ('NaN','Infinity','-Infinity') then
      raise exception 'Collect the exact reserved quantity';
    end if;
    if nullif(trim(p_payload->>'scan_code'), '') is null
       or not exists (
         select 1 from public.product_variants v
         where v.id::text = allocation.data->>'variant_id'
           and (lower(v.sku) = lower(trim(p_payload->>'scan_code'))
             or exists (select 1 from public.product_barcodes b
                        where b.variant_id = v.id
                          and lower(b.barcode) = lower(trim(p_payload->>'scan_code'))))
       ) then
      raise exception 'Scan the reserved variant barcode or SKU';
    end if;
    select * into balance from public.inventory_balances
    where id = (allocation.data->>'balance_id')::uuid for update;
    if not found or balance.quantity_reserved < qty or balance.quantity_on_hand < qty
       or balance.variant_id::text <> allocation.data->>'variant_id' then
      raise exception 'Reserved stock is no longer available';
    end if;
    update public.inventory_balances
    set quantity_reserved = quantity_reserved - qty,
        quantity_on_hand = quantity_on_hand - qty
    where id = balance.id;
    insert into public.stock_movements(client_event_id, movement_type,
      variant_id, from_warehouse_id, from_location_id, quantity,
      reference_type, notes, created_by)
    values ('job-collection:' || p_key, 'job_collection', balance.variant_id,
      balance.warehouse_id, balance.location_id, qty, 'crm_job',
      coalesce(p_payload->>'reason','Collected for job ' || job_id), actor)
    returning id into movement_id;
    result := allocation.data || jsonb_build_object(
      'quantity_reserved', (allocation.data->>'quantity_reserved')::numeric - qty,
      'quantity_issued', (allocation.data->>'quantity_issued')::numeric + qty,
      'movement_id', movement_id, 'issued_at', now());
    update public.crm_records set data = result
    where collection = 'inventoryAllocations' and id = allocation_id;
    select jsonb_agg(case when value->>'id' = allocation.data->>'item_id'
      then value || jsonb_build_object('quantityReserved', (allocation.data->>'quantity_reserved')::numeric - qty,
        'quantityMatched', (allocation.data->>'quantity_issued')::numeric + qty,
        'quantityPicked', (allocation.data->>'quantity_issued')::numeric + qty,
        'quantityIssued', (allocation.data->>'quantity_issued')::numeric + qty)
      else value end order by ord) into item
    from jsonb_array_elements(job->'items') with ordinality as a(value, ord);
    update public.crm_records set data = jsonb_set(job, '{items}', item)
    where collection = 'jobs' and id = job_id;

  else
    if job->>'status' <> 'Ready for Collection'
       or not exists (select 1 from public.crm_records p
          where p.collection = 'pickLists' and p.data->>'jobId' = job_id
            and p.data->>'pickupConfirmedAt' is not null)
       or exists (
         select 1 from jsonb_array_elements(coalesce(job->'items','[]')) line
         where coalesce((line->>'quantityRequired')::numeric, 0) >
               coalesce((line->>'quantityIssued')::numeric, 0)
       ) then
      raise exception 'Confirm pickup location and collect every required item';
    end if;
    job := job || jsonb_build_object('status', 'Collected',
      'collectionIssuedAt', now(), 'collectedBy', actor,
      'timeline', jsonb_build_array(jsonb_build_object(
        'id', p_key, 'title', 'Collection completed',
        'detail', 'Reserved stock scanned and issued to the installer.',
        'at', now(), 'userId', actor)) || coalesce(job->'timeline', '[]'));
    if jsonb_typeof(job->'stages') = 'array' then
      select jsonb_agg(case when value->>'id' = 'Ready for Collection'
        then value || jsonb_build_object('status', 'Completed',
          'completedAt', now(), 'completedBy', actor)
        else value end order by ord) into item
      from jsonb_array_elements(job->'stages') with ordinality as a(value, ord);
      job := jsonb_set(job, '{stages}', item);
    end if;
    update public.crm_records set data = job
    where collection = 'jobs' and id = job_id;
    result := jsonb_build_object('job', job);
  end if;
  insert into public.crm_records(collection, id, data)
  values ('inventoryOperations', p_key::text, jsonb_build_object(
    'actor', actor, 'payloadHash', payload_hash, 'result', result));
  return result;
end $$;
