import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = await readFile(
  new URL(
    "../supabase/migrations/20261109202740_hide_master_identity_from_staff.sql",
    import.meta.url,
  ),
  "utf8",
);
const ids = Object.fromEntries(
  ["super_admin", "admin", "manager", "installer"].map((role, index) => [
    role,
    `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  ]),
);

test("staff cannot read master identity or activity through permissive data policies", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema private;
      create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
      create table public.roles(id uuid primary key, key text, name text);
      create table public.profiles(
        id uuid primary key, email text, full_name text, role_id uuid,
        status text
      );
      create function private.current_role_key() returns text
      language sql stable security definer set search_path to '' as $$
        select r.key from public.profiles p join public.roles r on r.id=p.role_id
        where p.id=auth.uid()
      $$;
      create function private.can_view_actor_log(text) returns boolean
      language sql stable as $$ select true $$;
      create function public.crm_role() returns text
      language sql stable as $$ select private.current_role_key() $$;
      create table public.crm_records(collection text, id text, data jsonb);
      create table public.audit_logs(id text, actor_user_id uuid);
      create table public.privileged_security_events(id text, real_actor_user_id uuid);
      grant usage on schema public, private, auth to authenticated;
      grant select, update on public.profiles to authenticated;
      grant select on public.roles, public.crm_records, public.audit_logs,
        public.privileged_security_events to authenticated;
      grant execute on all functions in schema public, private, auth to authenticated;
    `);
    for (const table of [
      "profiles",
      "crm_records",
      "audit_logs",
      "privileged_security_events",
    ])
      await db.exec(`
        alter table public.${table} enable row level security;
        create policy broad_read on public.${table} for select to authenticated using (true);
        ${table === "profiles" ? `create policy broad_update on public.profiles for update to authenticated using (true) with check (true);` : ""}
      `);
    for (const [role, id] of Object.entries(ids)) {
      await db.query("insert into public.roles values($1,$2,$2)", [id, role]);
      await db.query(
        "insert into public.profiles values($1,$2,$3,$1,'active')",
        [id, `${role}@example.test`, role],
      );
      await db.query("insert into public.crm_records values('logs',$1,$2)", [
        role,
        JSON.stringify({ userId: id, actorRole: role }),
      ]);
      await db.query("insert into public.audit_logs values($1,$2)", [role, id]);
      await db.query(
        "insert into public.privileged_security_events values($1,$2)",
        [role, id],
      );
    }
    await db.exec(migration);

    for (const role of ["admin", "manager", "installer", "super_admin"]) {
      await db.exec("reset role");
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids[role],
      ]);
      await db.exec("set role authenticated");
      const expected = role === "super_admin" ? 4 : 3;
      for (const query of [
        "select id from public.profiles",
        "select id from public.crm_staff()",
        "select id from public.crm_records where collection='logs'",
        "select id from public.audit_logs",
        "select id from public.privileged_security_events",
      ]) {
        const { rows } = await db.query(query);
        assert.equal(rows.length, expected, `${role}: ${query}`);
        if (role !== "super_admin")
          assert.ok(
            rows.every(
              (row) => row.id !== ids.super_admin && row.id !== "super_admin",
            ),
          );
      }
    }
  } finally {
    await db.close();
  }
});
