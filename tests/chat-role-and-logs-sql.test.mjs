import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

const sql = await readFile(
  new URL("../supabase/migrations/20261106070000_chat_role_and_log_visibility.sql", import.meta.url),
  "utf8",
);
const ids = Object.fromEntries(
  ["owner", "admin", "manager", "installer"].map((name, index) => [
    name,
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);
const conv = {
  ordinary: "20000000-0000-4000-8000-000000000001",
  owner: "20000000-0000-4000-8000-000000000002",
};
const message = {
  ordinary: "30000000-0000-4000-8000-000000000001",
  owner: "30000000-0000-4000-8000-000000000002",
};
const db = new PGlite();

async function actor(name, effective = name) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('app.effective',$2,false)",
    [ids[name], ids[effective]],
  );
  await db.exec("set role authenticated");
}
const visibleIds = async (table) =>
  (await db.query(`select id from ${table} order by id`)).rows.map((row) => row.id);

test("database chat and log rules use the effective chat role and actual log actor", async () => {
  try {
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth; create schema private;
    create type public.permission_effect as enum ('allow','deny');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    create table public.roles(id uuid primary key,key text);
    create table public.permissions(id uuid primary key,key text);
    create table public.role_permissions(role_id uuid,permission_id uuid,
      effect public.permission_effect,updated_at timestamptz,
      unique(role_id,permission_id));
    create table public.profiles(id uuid primary key,role_id uuid references roles(id));
    create function private.effective_user_id() returns uuid language sql stable as $$
      select coalesce(nullif(current_setting('app.effective',true),''),auth.uid()::text)::uuid
    $$;
    create function private.current_role_key() returns text language sql stable security definer
    set search_path='' as $$
      select r.key from public.profiles p join public.roles r on r.id=p.role_id
      where p.id=private.effective_user_id()
    $$;
    create function private.has_module_access(text,text,text) returns boolean
    language sql stable as $$ select true $$;
    create table public.crm_records(collection text,id text,data jsonb,primary key(collection,id));
    create table public.chat_conversations(id uuid primary key,created_by uuid);
    create table public.chat_conversation_members(conversation_id uuid,user_id uuid,left_at timestamptz,
      primary key(conversation_id,user_id));
    create table public.chat_messages(id uuid primary key,conversation_id uuid,sender_id uuid);
    create table public.chat_message_attachments(id uuid primary key,message_id uuid);
    create table public.chat_message_reads(id uuid primary key,message_id uuid);
    create table public.chat_message_reactions(id uuid primary key,message_id uuid);
    create table public.audit_logs(id uuid primary key,actor_user_id uuid,effective_user_id uuid,metadata jsonb);
    create table public.privileged_security_events(id uuid primary key,event_type text,
      real_actor_user_id uuid,effective_actor_user_id uuid,metadata jsonb);
    grant usage on schema public,private,auth to authenticated;
    grant select on public.roles,public.profiles to authenticated;
    grant select,insert,update,delete on all tables in schema public to authenticated;
    grant execute on all functions in schema auth,private to authenticated;
  `);
  for (const table of [
    "crm_records", "chat_conversations", "chat_conversation_members",
    "chat_messages", "chat_message_attachments", "chat_message_reads",
    "chat_message_reactions", "audit_logs", "privileged_security_events",
  ]) {
    await db.exec(`alter table public.${table} enable row level security;
      create policy baseline on public.${table} for all to authenticated
      using (true) with check (true)`);
  }
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into roles(id,key) values($1,$2)", [id, name === "owner" ? "super_admin" : name]);
    await db.query("insert into profiles(id,role_id) values($1,$1)", [id]);
  }
  await db.query("insert into permissions(id,key) values($1,'settings.view')", [conv.ordinary]);
  for (const [name, id] of Object.entries(conv)) {
    await db.query("insert into chat_conversations(id,created_by) values($1,$2)", [id, ids.admin]);
    const members = name === "owner" ? ["admin", "owner"] : ["admin", "manager"];
    for (const member of members)
      await db.query("insert into chat_conversation_members(conversation_id,user_id) values($1,$2)", [id, ids[member]]);
    await db.query("insert into chat_messages(id,conversation_id,sender_id) values($1,$2,$3)",
      [message[name], id, ids.admin]);
    await db.query("insert into crm_records(collection,id,data) values('conversations',$1,$2)",
      [id, JSON.stringify({ id, memberIds: members.map((member) => ids[member]) })]);
    await db.query("insert into crm_records(collection,id,data) values('messages',$1,$2)",
      [message[name], JSON.stringify({ id: message[name], conversationId: id })]);
  }
  await db.exec(sql);
  assert.equal((await db.query("select effect from role_permissions where role_id=$1", [ids.manager])).rows[0].effect, "allow");

  await actor("admin");
  assert.deepEqual(await visibleIds("chat_conversations"), [conv.ordinary]);
  assert.deepEqual(await visibleIds("chat_messages"), [message.ordinary]);
  assert.deepEqual(
    (await db.query("select id from crm_records where collection='conversations'")).rows.map((x) => x.id),
    [conv.ordinary],
  );
  await assert.rejects(
    db.query("insert into chat_conversation_members(conversation_id,user_id) values($1,$2)", [conv.ordinary, ids.owner]),
    /Super Admin is unavailable for chat/,
  );
  await actor("owner");
  assert.deepEqual(await visibleIds("chat_conversations"), []);
  assert.deepEqual(await visibleIds("chat_messages"), []);
  await actor("owner", "manager");
  assert.deepEqual(await visibleIds("chat_conversations"), [conv.ordinary]);

  await db.exec("reset role");
  for (const name of ["owner", "admin", "manager", "installer"]) {
    await actor(name);
    await db.query("insert into crm_records(collection,id,data) values('logs',$1,$2)",
      [`log-${name}`, JSON.stringify({ id: `log-${name}`, userId: ids.owner, actorRole: "installer" })]);
  }
  await actor("owner", "manager");
  await db.query("insert into crm_records(collection,id,data) values('logs',$1,$2)",
    ["log-impersonated", JSON.stringify({ id: "log-impersonated", userId: ids.manager })]);
  await actor("manager");
  assert.deepEqual(
    (await db.query("select id from crm_records where collection='logs' order by id")).rows.map((x) => x.id),
    ["log-installer", "log-manager"],
  );
  await actor("admin");
  assert.deepEqual(
    (await db.query("select id from crm_records where collection='logs' order by id")).rows.map((x) => x.id),
    ["log-admin", "log-installer", "log-manager"],
  );
  await actor("owner");
  assert.equal((await db.query("select id from crm_records where collection='logs'")).rows.length, 5);
  const stamped = await db.query("select data->>'actorRole' role from crm_records where id='log-admin'");
  assert.equal(stamped.rows[0].role, "admin");
  for (const name of ["owner", "admin", "manager", "installer"]) {
    await actor(name);
    await db.query("insert into audit_logs(id,actor_user_id,metadata) values($1,$2,'{}')",
      [ids[name], ids.owner]);
    await db.query("insert into privileged_security_events(id,event_type,real_actor_user_id,metadata) values($1,'test',$2,'{}')",
      [ids[name], ids.owner]);
  }
  await actor("manager");
  assert.deepEqual(await visibleIds("audit_logs"), [ids.manager, ids.installer]);
  assert.deepEqual(await visibleIds("privileged_security_events"), [ids.manager, ids.installer]);
  assert.equal((await db.query("update crm_records set data='{}' where id='log-manager' returning id")).rows.length, 0);
  await actor("admin");
  assert.deepEqual(await visibleIds("audit_logs"), [ids.admin, ids.manager, ids.installer]);
  await actor("owner");
  assert.equal((await visibleIds("privileged_security_events")).length, 4);
  } finally {
    await db.close();
  }
});
