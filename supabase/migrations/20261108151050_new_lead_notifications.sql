-- Notify active management accounts when either the CRM or website creates a lead.
create or replace function private.notify_new_crm_lead()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  recipient record;
  notice_id text;
  lead_number text;
  customer_name text;
begin
  if new.collection <> 'leads' then
    return null;
  end if;

  lead_number := coalesce(nullif(new.data->>'number', ''), new.id);
  customer_name := coalesce(nullif(new.data->>'customer', ''), 'A customer');
  for recipient in
    select p.id::text as id
    from public.profiles p
    join public.roles r on r.id = p.role_id
    where p.status = 'active' and r.key in ('super_admin', 'admin', 'manager')
  loop
    notice_id := 'lead-notice:' || md5(new.id || ':' || recipient.id);
    insert into public.crm_records(collection, id, data)
    values ('notifications', notice_id, jsonb_build_object(
      'id', notice_id, 'userId', recipient.id, 'leadId', new.id,
      'title', 'New lead',
      'body', lead_number || ' · ' || customer_name || ' is ready to review.',
      'page', 'leads', 'read', false, 'createdAt', now()
    )) on conflict (collection, id) do nothing;
  end loop;
  return null;
end $$;

create trigger zzz_notify_new_crm_lead
after insert on public.crm_records
for each row execute function private.notify_new_crm_lead();

revoke all on function private.notify_new_crm_lead() from public, anon, authenticated;
