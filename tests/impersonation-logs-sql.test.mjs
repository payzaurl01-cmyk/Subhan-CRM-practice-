import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const read = (name) => readFile(new URL(name, import.meta.url), "utf8");
const contract = JSON.parse(
  await read("./fixtures/impersonation-deployed-contract.json"),
);
const schema = JSON.parse(await read("./fixtures/impersonation-schema.json"));
const registry = JSON.parse(
  await read("./fixtures/master-deployed-contract.json"),
).registry;
let db, sid;
const ids = Object.fromEntries(
  ["owner", "admin", "manager", "installer", "peer"].map((k, i) => [
    k,
    `10000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  ]),
);
const session = (key) => ids[key].replace("10000000", "20000000");
async function actor(
  key,
  selected = "",
  aal = "aal1",
  sessionId = session(key),
) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
    [
      JSON.stringify({
        sub: ids[key],
        session_id: sessionId,
        aal,
        is_anonymous: false,
      }),
      JSON.stringify(selected ? { "x-crm-impersonation": selected } : {}),
    ],
  );
  await db.exec("set role authenticated");
}
async function log(id) {
  await db.query(
    "insert into crm_records(collection,id,data) values('logs',$1,$2)",
    [
      id,
      JSON.stringify({
        id,
        userId: ids.owner,
        actorRole: "installer",
        action: "Test",
        createdAt: new Date().toISOString(),
      }),
    ],
  );
}
const visible = async () =>
  (
    await db.query(
      "select id from crm_records where collection='logs' order by id",
    )
  ).rows.map((x) => x.id);
before(async () => {
  db = new PGlite();
  let base = await read("./fixtures/master-baseline.sql");
  const index = base.indexOf("create policy profiles_read");
  base = base.slice(0, index) + base.slice(base.indexOf("\n", index) + 1);
  await db.exec(base);
  // Add only the inspected columns needed to compile the existing dependencies.
  for (const table of schema) {
    await db.exec(`create table if not exists public.${table.table_name} ()`);
    for (const col of table.columns) {
      let type =
        col.type === "USER-DEFINED"
          ? [
              "account_status",
              "permission_effect",
              "platform_key",
              "rule_scope",
              "access_state",
            ].includes(col.udt)
            ? `public.${col.udt}`
            : "text"
          : col.type === "ARRAY"
            ? "text[]"
            : col.type;
      const def =
        col.default &&
        /^(now\(\)|gen_random_uuid\(\)|true|false|'\{\}'::jsonb)$/.test(
          col.default,
        )
          ? ` default ${col.default}`
          : "";
      await db.exec(
        `alter table public.${table.table_name} add column if not exists ${col.name} ${type}${def}`,
      );
    }
  }
  await db.exec(
    "create table private.crm_job_workflow_operations(id uuid primary key,actor_id uuid,job_id text,request_hash text,result jsonb,complete boolean default false); alter table private.crm_job_workflow_operations enable row level security; create policy workflow_receipts_actor on private.crm_job_workflow_operations to authenticated using(actor_id=auth.uid()) with check(actor_id=auth.uid()); grant select,insert,update on private.crm_job_workflow_operations to authenticated;",
  );
  await db.exec(
    "create table if not exists public.quotations(id uuid);create table if not exists public.invoices(id uuid);create table if not exists public.payments(id uuid);",
  );
  await db.exec("set check_function_bodies=off");
  for (const f of contract.functions) await db.exec(f.definition + ";");
  for (const p of contract.policies) {
    await db.exec(
      `alter table public.${p.tablename} enable row level security; drop policy if exists "${p.policyname}" on public.${p.tablename}; create policy "${p.policyname}" on public.${p.tablename} as ${p.permissive} for ${p.cmd} to ${p.roles.join(",")}${p.qual ? ` using (${p.qual})` : ""}${p.with_check ? ` with check (${p.with_check})` : ""};`,
    );
  }
  for (const r of registry.roles)
    await db.query(
      "insert into roles(id,key,name,rank,active) values($1,$2,$3,$4,$5)",
      [r.id, r.key, r.name, r.rank, r.active],
    );
  for (const m of registry.modules)
    await db.query(
      "insert into system_modules(id,key,name,route_key,is_active,platform_scope) values($1,$2,$3,$4,$5,$6)",
      [m.id, m.key, m.name, m.route_key, m.is_active, m.platform_scope],
    );
  for (const p of registry.permissions)
    await db.query(
      "insert into permissions(id,key,module_id,action) values($1,$2,$3,$4)",
      [p.id, p.key, p.module_id, p.action],
    );
  for (const [key, id] of Object.entries(ids)) {
    const role =
      key === "owner" ? "super_admin" : key === "peer" ? "manager" : key;
    const email =
      key === "owner" ? "annasabbas01@gmail.com" : `${key}@test.invalid`;
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, email],
    );
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      session(key),
      id,
    ]);
    await db.query(
      "insert into profiles(id,email,full_name,role_id) values($1,$2,$3,(select id from roles where key=$4))",
      [id, email, key, role],
    );
  }
  await db.exec(
    "insert into role_permissions(role_id,permission_id,effect) select r.id,p.id,'allow' from roles r cross join permissions p where r.key in ('admin','manager','installer') and p.key not like 'master_control.%'; grant usage on schema public,private,auth to authenticated; grant execute on all functions in schema auth,private,public to authenticated; grant select on all tables in schema public to authenticated; grant insert,update,delete on crm_records to authenticated; grant insert,update on impersonation_sessions,privileged_security_events to authenticated;",
  );
  await db.query(
    "insert into crm_records(collection,id,data) values('logs','historical',$1)",
    [JSON.stringify({ id: "historical", userId: ids.manager })],
  );
  await db.exec(
    await read(
      "../supabase/migrations/20261027083107_one_click_impersonation_and_log_visibility.sql",
    ),
  );
  await db.exec("set check_function_bodies=on");
});
after(async () => db?.close());
test("one-click start accepts the existing AAL1 session, uses system metadata, binds the login, and is idempotent", async () => {
  await actor("owner");
  sid = (
    await db.query("select start_impersonation($1,$2,null) id", [
      ids.manager,
      "Untrusted manual reason",
    ])
  ).rows[0].id;
  const again = (
    await db.query("select start_impersonation($1,$2,null) id", [
      ids.manager,
      "Retry",
    ])
  ).rows[0].id;
  assert.equal(again, sid);
  const i = (
    await db.query("select * from impersonation_sessions where id=$1", [sid])
  ).rows[0];
  assert.equal(i.reason, "Super Admin initiated Login as user.");
  assert.equal(i.auth_session_id, session("owner"));
  await actor("owner", sid);
  const context = (await db.query("select get_access_context('web') context"))
    .rows[0].context;
  assert.equal(context.profile.id, ids.manager);
  assert.equal(context.profile.role, "manager");
  assert.equal(context.impersonation.real_actor_user_id, ids.owner);
  assert.equal(
    context.modules.find((m) => m.key === "master_control").can_view,
    false,
  );
  await assert.rejects(
    db.query("select start_impersonation($1,$2,null)", [
      ids.installer,
      "Nested",
    ]),
    /Super Admin/,
  );
});
test("server snapshots preserve the actual owner during impersonation, and effective permissions are enforced", async () => {
  await actor("owner", sid);
  await log("impersonated");
  await actor("owner");
  const event = (
    await db.query("select data from crm_records where id='impersonated'")
  ).rows[0].data;
  assert.equal(event.userId, ids.owner);
  assert.equal(event.actorRole, "super_admin");
  assert.equal(event.actingAsUserId, ids.manager);
  assert.equal(event.impersonationSessionId, sid);
  await db.exec("reset role");
  await db.query(
    "insert into user_permissions(user_id,permission_id,effect) select $1,id,'deny' from permissions where key='jobs.create'",
    [ids.manager],
  );
  await actor("owner", sid);
  assert.equal(
    (
      await db.query(
        "select private.has_module_access('jobs','create','web') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  assert.equal(
    (
      await db.query("select private.can_change_user_password($1) allowed", [
        ids.installer,
      ])
    ).rows[0].allowed,
    false,
  );
});
test("role hierarchy includes peers, hides higher roles and unknown history, and blocks direct count/detail requests", async () => {
  for (const key of ["owner", "admin", "manager", "installer", "peer"]) {
    await actor(key);
    await log(key);
  }

  await actor("owner");
  assert.deepEqual(await visible(), [
    "admin",
    "historical",
    "impersonated",
    "installer",
    "manager",
    "owner",
    "peer",
  ]);
  await actor("admin");
  assert.deepEqual(await visible(), ["admin", "installer", "manager", "peer"]);
  await actor("manager");
  assert.deepEqual(await visible(), ["installer", "manager", "peer"]);
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from crm_records where collection='logs' and id='impersonated'",
      )
    ).rows[0].n,
    0,
  );
  await actor("owner", sid);
  assert.deepEqual(await visible(), ["installer", "manager", "peer"]);
  // A later role change must not relabel the old event snapshot.
  await db.exec("reset role");
  await db.query(
    "update profiles set role_id=(select id from roles where key='installer') where id=$1",
    [ids.admin],
  );
  await actor("manager");
  assert.equal((await visible()).includes("admin"), false);
});
test("module restrictions remain authoritative; logs cannot be edited or deleted", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into user_permissions(user_id,permission_id,effect) select $1,id,'deny' from permissions where key='settings.view'",
    [ids.manager],
  );
  await actor("manager");
  assert.deepEqual(await visible(), []);
  await actor("owner");
  assert.equal(
    (
      await db.query(
        "update crm_records set data=data||'{\"actorRole\":\"installer\"}' where collection='logs' and id='owner' returning id",
      )
    ).rows.length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "delete from crm_records where collection='logs' and id='owner' returning id",
      )
    ).rows.length,
    0,
  );
});
test("unauthorized roles and other login sessions cannot select or end an owner session; expiry fails closed", async () => {
  await actor("manager");
  await assert.rejects(
    db.query("select start_impersonation($1,$2,null)", [
      ids.installer,
      "Denied",
    ]),
    /Super Admin/,
  );
  await actor("admin", sid);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired|revoked|inaccessible/,
  );
  await actor("admin");
  await assert.rejects(
    db.query("select end_impersonation($1)", [sid]),
    /another login/,
  );
  await actor("owner", sid, "aal1", session("manager"));
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired|revoked|inaccessible/,
  );
  await db.exec("reset role");
  await db.query(
    "update impersonation_sessions set expires_at=now()-interval '1 minute' where id=$1",
    [sid],
  );
  await actor("owner", sid);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired|revoked|inaccessible/,
  );
  await actor("owner");
  assert.equal(
    (await db.query("select end_impersonation($1) ended", [sid])).rows[0].ended,
    true,
  );
  assert.equal(
    (await db.query("select end_impersonation($1) ended", [sid])).rows[0].ended,
    false,
  );
  assert.equal(
    (await db.query("select get_access_context('web') c")).rows[0].c.profile
      .role,
    "super_admin",
  );
});

test("target blocking and owner authority revocation stop scoped actions while permitting bound-session cleanup", async () => {
  await actor("owner");
  let active = (
    await db.query("select start_impersonation($1,'fixture',null) id", [
      ids.installer,
    ])
  ).rows[0].id;
  await db.exec("reset role");
  await db.query("update profiles set status='blocked' where id=$1", [
    ids.installer,
  ]);
  await actor("owner", active);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired|revoked|inaccessible/,
  );
  await actor("owner");
  assert.equal(
    (await db.query("select end_impersonation($1) ended", [active])).rows[0]
      .ended,
    true,
  );
  await db.exec("reset role");
  await db.query("update profiles set status='active' where id=$1", [
    ids.installer,
  ]);
  await actor("owner");
  active = (
    await db.query("select start_impersonation($1,'fixture',null) id", [
      ids.installer,
    ])
  ).rows[0].id;
  await db.exec("reset role");
  await db.query(
    "update profiles set role_id=(select id from roles where key='manager') where id=$1",
    [ids.owner],
  );
  await actor("owner", active);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired|revoked|inaccessible/,
  );
  await actor("owner");
  assert.equal(
    (await db.query("select end_impersonation($1) ended", [active])).rows[0]
      .ended,
    true,
  );
  await db.exec("reset role");
  await db.query(
    "update profiles set role_id=(select id from roles where key='super_admin') where id=$1",
    [ids.owner],
  );
});

test("normalized impersonation writes retain both identities in the existing audit trail", async () => {
  await actor("owner");
  const active = (
    await db.query("select start_impersonation($1,'fixture',null) id", [
      ids.installer,
    ])
  ).rows[0].id;
  await actor("owner", active);
  await db.exec("reset role");
  const message = crypto.randomUUID();
  await db.query(
    "insert into chat_messages(id,sender_id,body) values($1,$2,'Fixture message')",
    [message, ids.installer],
  );
  const audit = (
    await db.query(
      "select real_actor_user_id,effective_actor_user_id,impersonation_session_id,metadata from privileged_security_events where target_type='chat_messages' and target_id=$1",
      [message],
    )
  ).rows[0];
  assert.equal(audit.real_actor_user_id, ids.owner);
  assert.equal(audit.effective_actor_user_id, ids.installer);
  assert.equal(audit.impersonation_session_id, active);
  assert.equal(audit.metadata.actorRole, "super_admin");
  await actor("owner");
  await db.query("select end_impersonation($1)", [active]);
});

test("audit-table reads use the same actual-actor hierarchy and new private helpers deny anonymous execution", async () => {
  const actions = [];
  for (const key of ["owner", "peer", "installer"]) {
    await actor(key);
    await db.exec("reset role");
    const action = `snapshot-${key}`;
    actions.push(action);
    await db.query(
      "insert into audit_logs(action,actor_user_id) values($1,$2)",
      [action, ids[key]],
    );
  }
  await actor("peer");
  assert.deepEqual(
    (
      await db.query(
        "select action from audit_logs where action like 'snapshot-%' order by action",
      )
    ).rows.map((r) => r.action),
    ["snapshot-installer", "snapshot-peer"],
  );
  await actor("owner");
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from audit_logs where action like 'snapshot-%'",
      )
    ).rows[0].n,
    3,
  );
  await db.exec("reset role");
  const helpers = (
    await db.query(
      "select p.proname,p.proconfig,has_function_privilege('anon',p.oid,'execute') anon from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('real_role_key','effective_user_id','impersonation_context','impersonation_target_eligible','finish_impersonation','impersonated_record_access','can_view_actor_log','stamp_actor_log','audit_impersonated_write')",
    )
  ).rows;
  assert.equal(helpers.length, 9);
  for (const helper of helpers) {
    assert.equal(helper.anon, false, helper.proname);
    assert.ok(
      helper.proconfig.some((c) => c.startsWith("search_path=")),
      helper.proname,
    );
  }
});
