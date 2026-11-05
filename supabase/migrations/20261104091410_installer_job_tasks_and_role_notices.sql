-- Role-specific notices are stored with all other CRM activity in crm_records.
create or replace function private.notify_job_participant(
  p_user text, p_job text, p_event text, p_title text,
  p_body text, p_page text, p_fingerprint text
) returns void language plpgsql security definer set search_path = '' as $$
declare notice_id text;
begin
  if p_user is null
     or p_user !~* '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$'
     or not exists (select 1 from public.profiles
                    where id = p_user::uuid and status = 'active') then
    return;
  end if;
  notice_id := 'job-notice:' || md5(concat_ws(':', p_user, p_job,
                 p_event, p_fingerprint, txid_current()::text));
  insert into public.crm_records(collection, id, data)
  values ('notifications', notice_id, jsonb_build_object(
    'id', notice_id, 'userId', p_user, 'jobId', p_job,
    'title', p_title, 'body', p_body, 'page', p_page,
    'read', false, 'createdAt', now()
  )) on conflict (collection, id) do nothing;
end $$;

create or replace function private.notify_job_action()
returns trigger language plpgsql security definer set search_path = '' as $$
declare job_id text; job_data jsonb; title text; body text;
        page_key text; event_key text; recipient record; assignee text;
begin
  if new.collection = 'jobs' then
    job_id := new.id;
    job_data := new.data;
    if tg_op = 'INSERT' then
      title := 'Job assigned';
      body := coalesce(job_data->>'number', job_id) || ' was created.';
      event_key := 'created';
    elsif new.data->>'installerId' is distinct from old.data->>'installerId' then
      title := 'Job reassigned';
      body := coalesce(job_data->>'number', job_id) || ' has a new installer.';
      event_key := 'reassigned';
    elsif new.data->>'status' is distinct from old.data->>'status' then
      title := 'Job stage changed';
      body := coalesce(job_data->>'number', job_id) || ': '
        || coalesce(old.data->>'status', 'New') || ' to '
        || coalesce(new.data->>'status', 'Unknown') || '.';
      event_key := 'stage';
    else
      return null;
    end if;
    page_key := 'jobs';
  elsif new.collection = 'tasks' then
    job_id := new.data->>'jobId';
    if job_id is null then return null; end if;
    if tg_op = 'INSERT'
       or new.data->>'assignedTo' is distinct from old.data->>'assignedTo' then
      title := 'Job task assigned';
      body := coalesce(new.data->>'title', 'A task') || ' is assigned.';
      event_key := 'assigned:' || new.id;
    elsif new.data->>'status' is distinct from old.data->>'status' then
      title := 'Job task updated';
      body := coalesce(new.data->>'title', 'A task') || ': '
        || coalesce(new.data->>'status', 'Updated') || '.';
      event_key := 'task-status:' || new.id;
    else
      return null;
    end if;
    page_key := 'tasks';
  elsif new.collection = 'pickLists' and tg_op = 'UPDATE'
        and new.data->>'pickupConfirmedAt' is distinct from old.data->>'pickupConfirmedAt'
        and new.data->>'pickupConfirmedAt' is not null then
    job_id := new.data->>'jobId';
    title := 'Pickup location confirmed';
    body := coalesce(new.data->>'number', 'Pick List') || ' location confirmed.';
    event_key := 'pickup-location:' || new.id;
    page_key := 'picking';
  elsif new.collection = 'returns' and tg_op = 'UPDATE'
        and new.data->>'status' is distinct from old.data->>'status' then
    job_id := new.data->>'jobId';
    title := 'Return updated';
    body := 'Return status: ' || coalesce(new.data->>'status', 'Updated') || '.';
    event_key := 'return:' || new.id;
    page_key := 'returns';
  elsif new.collection = 'inventoryAllocations' then
    job_id := new.data->>'job_id';
    if tg_op = 'INSERT' then
      title := 'Job stock reserved';
      body := 'Stock is reserved for your job collection.';
      event_key := 'stock-reserved:' || new.id;
    elsif (new.data->>'quantity_issued')::numeric >
          coalesce((old.data->>'quantity_issued')::numeric, 0) then
      title := 'Job stock collected';
      body := 'Reserved stock was scanned and collected.';
      event_key := 'stock-collected:' || new.id;
    else
      return null;
    end if;
    page_key := 'picking';
  else
    return null;
  end if;
  if job_id is null then return null; end if;
  if job_data is null then
    select data into job_data from public.crm_records
    where collection = 'jobs' and id = job_id;
  end if;
  if job_data is null then return null; end if;
  if new.collection = 'tasks' then
    assignee := new.data->>'assignedTo';
  elsif new.collection = 'inventoryAllocations' then
    assignee := new.data->>'collector_id';
  else
    assignee := job_data->>'installerId';
  end if;
  perform private.notify_job_participant(assignee, job_id, event_key,
    title, body, page_key, md5(new.data::text));
  for recipient in
    select p.id::text as id from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.status = 'active' and r.key in ('super_admin', 'admin', 'manager')
  loop
    if recipient.id is distinct from assignee then
      perform private.notify_job_participant(recipient.id, job_id, event_key,
        title, body, page_key, md5(new.data::text));
    end if;
  end loop;
  return null;
end $$;

create trigger zzz_notify_job_action
after insert or update on public.crm_records
for each row execute function private.notify_job_action();

revoke all on function private.notify_job_participant(
  text, text, text, text, text, text, text),
  private.notify_job_action() from public, anon, authenticated;

-- Recipient-specific notices should not appear in another user's record feed.
create policy targeted_crm_notices_read on public.crm_records
as restrictive for select to authenticated
using (collection <> 'notifications'
  or (not (data ? 'userId') and not (data ? 'userIds'))
  or data->>'userId' = private.effective_user_id()::text
  or data->'userIds' ? private.effective_user_id()::text);
