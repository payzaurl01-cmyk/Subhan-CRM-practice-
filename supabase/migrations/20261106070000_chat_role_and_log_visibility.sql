-- Keep the Super Admin outside ordinary chat. A scoped impersonation uses the
-- target's effective role and identity, so the target retains its chat access.
create function private.chat_conversation_without_super_admin(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_role_key() in ('admin', 'manager', 'installer')
    and not exists (
      select 1
      from public.chat_conversation_members m
      join public.profiles p on p.id = m.user_id
      join public.roles r on r.id = p.role_id
      where m.conversation_id = p_conversation_id
        and m.left_at is null and r.key = 'super_admin'
    )
$$;

create function private.chat_message_without_super_admin(p_message_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.chat_messages m
    where m.id = p_message_id
      and private.chat_conversation_without_super_admin(m.conversation_id)
  )
$$;

create function private.crm_chat_record_allowed(p_collection text, p_data jsonb)
returns boolean language plpgsql stable security definer set search_path = '' as $$
declare v_conversation jsonb; v_user text := private.effective_user_id()::text;
begin
  if private.current_role_key() not in ('admin', 'manager', 'installer')
     or v_user is null then return false; end if;
  if p_collection = 'conversations' then
    v_conversation := p_data;
  elsif p_collection = 'messages' then
    select r.data into v_conversation from public.crm_records r
    where r.collection = 'conversations'
      and r.id = p_data->>'conversationId';
  else
    return true;
  end if;
  if jsonb_typeof(v_conversation->'memberIds') <> 'array'
     or not (v_conversation->'memberIds' ? v_user) then return false; end if;
  return not exists (
    select 1
    from jsonb_array_elements_text(v_conversation->'memberIds') as member(user_id)
    join public.profiles p on p.id::text = member.user_id
    join public.roles role on role.id = p.role_id
    where role.key = 'super_admin'
  );
end $$;

-- These are restrictive overlays on the existing membership/module policies.
create policy crm_chat_role_read on public.crm_records as restrictive
for select to authenticated using (
  collection not in ('conversations', 'messages')
  or private.crm_chat_record_allowed(collection, data)
);
create policy crm_chat_role_insert on public.crm_records as restrictive
for insert to authenticated with check (
  collection not in ('conversations', 'messages')
  or private.crm_chat_record_allowed(collection, data)
);
create policy crm_chat_role_update on public.crm_records as restrictive
for update to authenticated using (
  collection not in ('conversations', 'messages')
  or private.crm_chat_record_allowed(collection, data)
) with check (
  collection not in ('conversations', 'messages')
  or private.crm_chat_record_allowed(collection, data)
);
create policy crm_chat_role_delete on public.crm_records as restrictive
for delete to authenticated using (
  collection not in ('conversations', 'messages')
  or private.crm_chat_record_allowed(collection, data)
);

create policy chat_conversations_role_guard on public.chat_conversations as restrictive
for all to authenticated
using (private.chat_conversation_without_super_admin(id))
with check (
  private.current_role_key() in ('admin', 'manager', 'installer')
  and private.chat_conversation_without_super_admin(id)
);
create policy chat_members_role_guard on public.chat_conversation_members as restrictive
for all to authenticated
using (private.chat_conversation_without_super_admin(conversation_id))
with check (
  private.chat_conversation_without_super_admin(conversation_id)
  and not exists (
    select 1 from public.profiles p join public.roles r on r.id = p.role_id
    where p.id = user_id and r.key = 'super_admin'
  )
);
create policy chat_messages_role_guard on public.chat_messages as restrictive
for all to authenticated
using (private.chat_conversation_without_super_admin(conversation_id))
with check (private.chat_conversation_without_super_admin(conversation_id));
create policy chat_attachments_role_guard on public.chat_message_attachments as restrictive
for all to authenticated
using (private.chat_message_without_super_admin(message_id))
with check (private.chat_message_without_super_admin(message_id));
create policy chat_reads_role_guard on public.chat_message_reads as restrictive
for all to authenticated
using (private.chat_message_without_super_admin(message_id))
with check (private.chat_message_without_super_admin(message_id));
create policy chat_reactions_role_guard on public.chat_message_reactions as restrictive
for all to authenticated
using (private.chat_message_without_super_admin(message_id))
with check (private.chat_message_without_super_admin(message_id));

-- update_chat_members is SECURITY DEFINER and bypasses RLS; a trigger closes
-- that path as well as direct table writes.
create function private.enforce_chat_member_role() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if private.current_role_key() not in ('admin', 'manager', 'installer')
     or exists (
       select 1 from public.profiles p join public.roles r on r.id = p.role_id
       where p.id = new.user_id and r.key = 'super_admin'
     )
     or not private.chat_conversation_without_super_admin(new.conversation_id)
  then raise exception 'Super Admin is unavailable for chat'
    using errcode = '42501'; end if;
  return new;
end $$;
create trigger chat_member_role_guard before insert or update
on public.chat_conversation_members for each row
execute function private.enforce_chat_member_role();

-- Stamp the actual signed-in actor. Impersonated writes remain Super Admin
-- events even though ordinary access uses the target's effective role.
create function private.stamp_crm_actor_role() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := auth.uid(); v_effective uuid;
        v_role text; v_source uuid;
begin
  if tg_table_name = 'crm_records' then
    if new.collection <> 'logs' then return new; end if;
  end if;
  if v_actor is null then
    if tg_table_name = 'crm_records' then
      v_source := case when new.data->>'userId' ~*
        '^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$'
        then (new.data->>'userId')::uuid end;
    elsif tg_table_name = 'audit_logs' then v_source := new.actor_user_id;
    else v_source := new.real_actor_user_id; end if;
  else
    v_source := v_actor;
    if tg_table_name <> 'privileged_security_events' then
      v_effective := private.effective_user_id();
    elsif new.event_type not in ('impersonation.started', 'impersonation.ended') then
      v_effective := private.effective_user_id();
    end if;
  end if;
  select r.key into v_role from public.profiles p
  join public.roles r on r.id = p.role_id where p.id = v_source;
  if tg_table_name = 'crm_records' then
    new.data := new.data || jsonb_build_object(
      'actorRole', v_role,
      'userId', coalesce(v_source::text, new.data->>'userId'),
      'actingAsUserId', case when v_effective is distinct from v_actor
        then v_effective::text end
    );
  elsif tg_table_name = 'audit_logs' then
    if v_actor is not null then new.actor_user_id := v_actor; end if;
    if v_effective is distinct from v_actor then
      new.effective_user_id := v_effective; end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('actorRole', v_role);
  else
    if v_actor is not null then new.real_actor_user_id := v_actor; end if;
    if v_effective is distinct from v_actor then
      new.effective_actor_user_id := v_effective; end if;
    if new.event_type in ('impersonation.started', 'impersonation.ended') then
      v_role := 'super_admin'; end if;
    new.metadata := coalesce(new.metadata, '{}'::jsonb)
      || jsonb_build_object('actorRole', v_role);
  end if;
  return new;
end $$;
create trigger crm_log_actor_role before insert on public.crm_records
for each row execute function private.stamp_crm_actor_role();
create trigger audit_log_actor_role before insert on public.audit_logs
for each row execute function private.stamp_crm_actor_role();
create trigger security_event_actor_role before insert on public.privileged_security_events
for each row execute function private.stamp_crm_actor_role();

-- Audit Logs is the only workspace page backed by settings.view. Managers need
-- its view grant to open the page; no settings mutation grant is added.
insert into public.role_permissions(role_id, permission_id, effect)
select r.id, p.id, 'allow'::public.permission_effect
from public.roles r cross join public.permissions p
where r.key = 'manager' and p.key = 'settings.view'
on conflict (role_id, permission_id) do update
set effect = 'allow'::public.permission_effect, updated_at = now();

create function private.can_view_actor_log(p_actor_role text)
returns boolean language sql stable security invoker set search_path = '' as $$
  select private.has_module_access('settings', 'view', 'web')
    and case private.current_role_key()
      when 'super_admin' then true
      when 'admin' then p_actor_role in ('admin', 'manager', 'installer')
      when 'manager' then p_actor_role in ('manager', 'installer')
      when 'installer' then p_actor_role = 'installer'
      else false end
$$;
create policy crm_logs_role_read on public.crm_records as restrictive
for select to authenticated using (
  collection <> 'logs' or private.can_view_actor_log(data->>'actorRole')
);
create policy crm_logs_immutable_update on public.crm_records as restrictive
for update to authenticated using (collection <> 'logs')
with check (collection <> 'logs');
create policy crm_logs_immutable_delete on public.crm_records as restrictive
for delete to authenticated using (collection <> 'logs');
create policy audit_logs_role_read on public.audit_logs as restrictive
for select to authenticated
using (private.can_view_actor_log(metadata->>'actorRole'));
create policy security_events_role_read on public.privileged_security_events as restrictive
for select to authenticated
using (private.can_view_actor_log(metadata->>'actorRole'));
create policy security_events_staff_read on public.privileged_security_events
for select to authenticated using (
  private.current_role_key() in ('admin', 'manager')
  and private.can_view_actor_log(metadata->>'actorRole')
);

revoke all on function private.chat_conversation_without_super_admin(uuid),
  private.chat_message_without_super_admin(uuid),
  private.crm_chat_record_allowed(text,jsonb),
  private.enforce_chat_member_role(),
  private.stamp_crm_actor_role(),
  private.can_view_actor_log(text) from public, anon;
grant execute on function private.chat_conversation_without_super_admin(uuid),
  private.chat_message_without_super_admin(uuid),
  private.crm_chat_record_allowed(text,jsonb),
  private.can_view_actor_log(text) to authenticated;
notify pgrst, 'reload schema';
