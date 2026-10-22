import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
const fixture = JSON.parse(
  await readFile(
    new URL("./fixtures/master-deployed-contract.json", import.meta.url),
    "utf8",
  ),
);
let db;
const ids = {
  owner: "10000000-0000-4000-8000-000000000001",
  admin: "10000000-0000-4000-8000-000000000002",
  manager: "10000000-0000-4000-8000-000000000003",
  installer: "10000000-0000-4000-8000-000000000004",
  other: "10000000-0000-4000-8000-000000000005",
};
const sessions = Object.fromEntries(
  Object.entries(ids).map(([key, id]) => [
    key,
    id.replace("10000000", "20000000"),
  ]),
);
async function actor(key, headers = {}) {
  await db.exec("reset role");
  await db.query(
    "select set_config('request.jwt.claims',$1,false),set_config('request.headers',$2,false)",
    [
      JSON.stringify({ sub: ids[key], session_id: sessions[key], aal: "aal2" }),
      JSON.stringify(headers),
    ],
  );
  await db.exec("set role authenticated");
}
async function allowed(key, module, action = "view") {
  await actor(key);
  return (
    await db.query("select private.has_module_access($1,$2) as allowed", [
      module,
      action,
    ])
  ).rows[0].allowed;
}
async function rule(scope, target, module, action, effect, kind = "override") {
  await actor("owner");
  await db.query("select public.admin_set_access_rule($1,$2,$3,$4,$5,$6)", [
    kind,
    scope,
    target,
    module,
    action,
    effect,
  ]);
}
const rid = (key) => fixture.registry.roles.find((r) => r.key === key).id;
before(async () => {
  db = new PGlite();
  let schema = await readFile(
    new URL("./fixtures/master-baseline.sql", import.meta.url),
    "utf8",
  );
  // The deployed RLS policy is created after its existing helper, as in production.
  const policy = schema.slice(schema.indexOf("create policy profiles_read"));
  schema = schema.slice(0, schema.indexOf("create policy profiles_read"));
  await db.exec(schema);
  const names = new Set([
    "current_role_key",
    "is_super_admin",
    "get_effective_system_lock",
    "resolve_module_state",
    "has_module_access",
    "admin_set_role_permission",
    "admin_set_user_permission",
    "admin_set_module_access",
    "admin_update_user_access",
    "admin_set_user_blocked",
    "admin_delete_user",
    "can_change_user_password",
    "owner_portal_access",
    "crm_page_key",
    "start_impersonation",
    "end_impersonation",
    "get_access_context",
  ]);
  const functions = [
    ...new Map(
      fixture.functions
        .filter((f) => names.has(f.proname))
        .map((f) => [`${f.nspname}.${f.proname}`, f]),
    ).values(),
  ];
  // Function bodies have mutual references in the deployed schema.
  await db.exec("set check_function_bodies = off");
  for (const f of functions) await db.exec(f.definition);
  const wrappers = JSON.parse(
    await readFile(
      new URL("./fixtures/master-public-wrappers.json", import.meta.url),
      "utf8",
    ),
  );
  for (const f of wrappers) await db.exec(f.definition);
  await db.exec(policy);
  for (const r of fixture.registry.roles)
    await db.query(
      "insert into roles(id,key,name,rank,active) values($1,$2,$3,$4,$5)",
      [r.id, r.key, r.name, r.rank, r.active],
    );
  for (const m of fixture.registry.modules)
    await db.query(
      "insert into system_modules(id,key,name,route_key,is_active,platform_scope) values($1,$2,$3,$4,$5,$6)",
      [m.id, m.key, m.name, m.route_key, m.is_active, m.platform_scope],
    );
  for (const p of fixture.registry.permissions)
    await db.query(
      "insert into permissions(id,key,module_id,action,description) values($1,$2,$3,$4,$5)",
      [p.id, p.key, p.module_id, p.action, p.description],
    );
  for (const [key, id] of Object.entries(ids)) {
    const role =
      key === "owner" ? "super_admin" : key === "other" ? "installer" : key;
    const email =
      key === "owner" ? "annasabbas01@gmail.com" : `${key}@test.invalid`;
    await db.query(
      "insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())",
      [id, email],
    );
    await db.query("insert into auth.sessions(id,user_id) values($1,$2)", [
      sessions[key],
      id,
    ]);
    await db.query(
      "insert into profiles(id,email,full_name,role_id) values($1,$2,$3,$4)",
      [id, email, key, rid(role)],
    );
  }
  await db.exec(
    "insert into role_permissions(role_id,permission_id,effect) select r.id,p.id,'allow' from roles r cross join permissions p where r.key in ('admin','manager','installer') and p.key not like 'master_control.%';",
  );
  await db.exec(
    "grant usage on schema public,private,auth to authenticated; grant execute on all functions in schema auth,public,private to authenticated; grant select on all tables in schema public to authenticated; grant insert,update on impersonation_sessions,privileged_security_events to authenticated;",
  );
  await db.exec("set check_function_bodies = on");
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/20261022070731_restore_master_control_overrides.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec("set check_function_bodies = on");
});
after(async () => {
  await db?.close();
});
test("ordinary grants remain restricted, explicit profile overrides bypass role denials and restore on revoke", async () => {
  await actor("owner");
  await db.query(
    "select public.admin_set_role_permission('manager','users.change_password','deny')",
  );
  await db.query(
    "select public.admin_set_user_permission($1,'users.change_password','allow')",
    [ids.manager],
  );
  assert.equal(await allowed("manager", "users", "change_password"), false);
  await rule("user", ids.manager, "users", "change_password", "allow");
  assert.equal(await allowed("manager", "users", "change_password"), true);
  await rule("user", ids.manager, "users", "change_password", "default");
  assert.equal(await allowed("manager", "users", "change_password"), false);
});
test("global locks and readonly are bypassed only by explicit scoped actions, including necessary view", async () => {
  await actor("owner");
  await db.query(
    "select public.admin_set_module_access('inventory','global',null,'locked')",
  );
  assert.equal(await allowed("manager", "inventory"), false);
  await rule("role", rid("manager"), "inventory", "update", "allow");
  assert.equal(await allowed("manager", "inventory"), true);
  assert.equal(await allowed("manager", "inventory", "update"), true);
  assert.equal(await allowed("manager", "inventory", "delete"), false);
  await rule("user", ids.manager, "inventory", "update", "deny");
  assert.equal(await allowed("manager", "inventory", "update"), false);
  await rule("user", ids.manager, "inventory", "update", "default");
  assert.equal(await allowed("manager", "inventory", "update"), true);
  await rule("user", ids.manager, "inventory", "view", "deny");
  assert.equal(await allowed("manager", "inventory", "update"), false);
  await rule("user", ids.manager, "inventory", "view", "default");
  await rule("role", rid("manager"), "inventory", "update", "default");
  assert.equal(await allowed("manager", "inventory"), false);
  await actor("owner");
  await db.query(
    "select public.admin_set_module_access('inventory','global',null,'readonly')",
  );
  assert.equal(await allowed("manager", "inventory"), true);
  assert.equal(await allowed("manager", "inventory", "update"), false);
});
test("individual view deny wins equal-scope action allow; profile action allow bypasses weaker role view deny", async () => {
  await rule("role", rid("admin"), "jobs", "view", "deny");
  await rule("user", ids.admin, "jobs", "update", "allow");
  assert.equal(await allowed("admin", "jobs"), true);
  assert.equal(await allowed("admin", "jobs", "update"), true);
  await rule("user", ids.admin, "jobs", "view", "deny");
  assert.equal(await allowed("admin", "jobs", "update"), false);
  await rule("user", ids.admin, "jobs", "view", "default");
  await rule("role", rid("admin"), "jobs", "view", "default");
  await rule("user", ids.admin, "jobs", "update", "default");
});
test("tab visibility is distinct from route authorization and system locks keep owner recovery", async () => {
  await rule("user", ids.admin, "reports", "view", "deny", "tab");
  assert.equal(await allowed("admin", "reports"), true);
  await actor("admin");
  const ctx = (await db.query("select get_access_context('web') c")).rows[0].c;
  assert.equal(ctx.modules.find((m) => m.key === "reports").tab_visible, false);
  await actor("owner");
  await db.query("select admin_set_system_lock(true,'Maintenance','Test')");
  assert.equal(await allowed("admin", "reports"), false);
  assert.equal(await allowed("owner", "master_control"), true);
  await rule("role", rid("admin"), "reports", "view", "allow");
  await actor("admin");
  const allowedContext = (await db.query("select get_access_context('web') c"))
    .rows[0].c;
  assert.equal(allowedContext.system_lock.locked, true);
  assert.equal(allowedContext.system_lock.access_blocked, false);
  await actor("owner");
  await db.query("select admin_set_system_lock(false)");
  await rule("role", rid("admin"), "reports", "view", "default");
});
test("only the real owner may delegate; installer and protected-owner safeguards survive overrides", async () => {
  await actor("admin");
  await assert.rejects(
    db.query(
      "select admin_set_access_rule('override','user',$1,'users','delete','allow')",
      [ids.admin],
    ),
    /Super Admin/,
  );
  await actor("owner");
  await assert.rejects(
    db.query(
      "select admin_set_access_rule('override','user',$1,'users','change_password','allow')",
      [ids.installer],
    ),
    /Installers/,
  );
  await rule("role", rid("manager"), "users", "change_password", "allow");
  await actor("manager");
  assert.equal(
    (await db.query("select can_change_user_password($1) allowed", [ids.owner]))
      .rows[0].allowed,
    false,
  );
  await assert.rejects(
    db.query("select admin_delete_user($1)", [ids.owner]),
    /protected/,
  );
  await assert.rejects(
    db.query("select admin_update_user_access($1,'admin','active')", [
      ids.manager,
    ]),
    /own role/,
  );
});
test("impersonation is session-bound, uses target permissions and RLS data, audits both actors and exits", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into tasks(id,assigned_to,title) values('30000000-0000-4000-8000-000000000001',$1,'Target only'),('30000000-0000-4000-8000-000000000002',$2,'Other only')",
    [ids.installer, ids.other],
  );
  await actor("owner");
  const sid = (
    await db.query(
      "select start_impersonation($1,'Support verification',null) id",
      [ids.installer],
    )
  ).rows[0].id;
  await actor("owner", { "x-crm-impersonation": sid });
  const ctx = (await db.query("select get_access_context('web') c")).rows[0].c;
  assert.equal(ctx.profile.id, ids.installer);
  assert.equal(ctx.profile.role, "installer");
  assert.equal(
    ctx.modules.find((m) => m.key === "master_control").can_view,
    false,
  );
  assert.equal(ctx.impersonation.real_actor_user_id, ids.owner);
  assert.deepEqual((await db.query("select title from tasks")).rows, [
    { title: "Target only" },
  ]);
  await assert.rejects(
    db.query(
      "select admin_set_role_permission('manager','users.delete','allow')",
    ),
    /Super Admin/,
  );
  await db.query(
    "insert into privileged_security_events(event_type,real_actor_user_id) values('test.impersonated',$1)",
    [ids.installer],
  );
  await actor("owner");
  const log = (
    await db.query(
      "select real_actor_user_id,effective_actor_user_id,impersonation_session_id from privileged_security_events where event_type='test.impersonated'",
    )
  ).rows[0];
  assert.deepEqual(log, {
    real_actor_user_id: ids.owner,
    effective_actor_user_id: ids.installer,
    impersonation_session_id: sid,
  });
  await actor("admin", { "x-crm-impersonation": sid });
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired, revoked or inaccessible|Active authenticated session required/,
  );
  await actor("owner");
  await db.query("select end_impersonation($1)", [sid]);
  await actor("owner", { "x-crm-impersonation": sid });
  await assert.rejects(
    db.query("select private.current_role_key()"),
    /expired, revoked or inaccessible|Active authenticated session required/,
  );
  await actor("owner");
  assert.equal(
    (await db.query("select get_access_context('web') c")).rows[0].c.profile
      .role,
    "super_admin",
  );
});

test("generic CRM requests enforce module restrictions and installer assignments on direct APIs", async () => {
  await db.exec("reset role");
  await db.query(
    "insert into crm_records(collection,id,data) values('jobs','own',$1),('jobs','other',$2)",
    [
      JSON.stringify({ installerId: ids.installer, items: [] }),
      JSON.stringify({ installerId: ids.other, items: [] }),
    ],
  );
  await db.exec(
    "grant select,update,insert,delete on crm_records to authenticated",
  );
  await actor("installer");
  assert.deepEqual(
    (
      await db.query(
        "select id from crm_records where collection='jobs' order by id",
      )
    ).rows,
    [{ id: "own" }],
  );
  await actor("owner");
  await db.query(
    "select admin_set_module_access('jobs','global',null,'readonly')",
  );
  await actor("admin");
  assert.equal(
    (
      await db.query(
        "update crm_records set data=data||'{\"test\":true}' where collection='jobs' returning id",
      )
    ).rows.length,
    0,
  );
  await rule("user", ids.admin, "jobs", "update", "allow");
  await actor("admin");
  assert.equal(
    (
      await db.query(
        "update crm_records set data=data||'{\"test\":true}' where collection='jobs' returning id",
      )
    ).rows.length,
    2,
  );
  await rule("user", ids.admin, "jobs", "update", "default");
  await actor("owner");
  await db.query(
    "select admin_set_module_access('jobs','global',null,'default')",
  );
});
test("operational logs and notifications preserve ordinary workflows without exposing protected settings", async () => {
  await actor("owner");
  await db.query(
    "select admin_set_module_access('settings','role',$1,'disabled')",
    [rid("installer")],
  );
  await actor("installer");
  await db.query(
    "insert into crm_records(collection,id,data) values('logs','installer-log',$1)",
    [JSON.stringify({ userId: ids.installer, summary: "Task updated" })],
  );
  await db.query(
    "insert into crm_records(collection,id,data) values('notifications','broadcast',$1)",
    [JSON.stringify({ page: "tasks", read: false })],
  );
  assert.equal(
    (await db.query("select id from crm_records where collection='logs'")).rows
      .length,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select id from crm_records where collection='notifications'",
      )
    ).rows.length,
    1,
  );
  await assert.rejects(
    db.query(
      "insert into crm_records(collection,id,data) values('logs','forged',$1)",
      [JSON.stringify({ userId: ids.owner })],
    ),
    /row-level security/,
  );
});
test("impersonation rejects malformed, low-assurance, expired and wrong-session selectors, and rechecks target overrides", async () => {
  await actor("owner", { "x-crm-impersonation": "invalid" });
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /Invalid impersonation/,
  );
  await actor("owner");
  const sid = (
    await db.query(
      "select start_impersonation($1,'Disposable negative tests',null) id",
      [ids.installer],
    )
  ).rows[0].id;
  await actor("owner", { "x-crm-impersonation": sid });
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: ids.owner, session_id: sessions.owner, aal: "aal1" }),
  ]);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired, revoked or inaccessible|Active authenticated session required/,
  );
  await actor("owner", { "x-crm-impersonation": sid });
  await db.query("select set_config('request.jwt.claims',$1,false)", [
    JSON.stringify({ sub: ids.owner, session_id: sessions.admin, aal: "aal2" }),
  ]);
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired, revoked or inaccessible|Active authenticated session required/,
  );
  await rule("user", ids.installer, "tasks", "update", "deny");
  await actor("owner", { "x-crm-impersonation": sid });
  assert.equal(
    (
      await db.query(
        "select private.has_module_access('tasks','update') allowed",
      )
    ).rows[0].allowed,
    false,
  );
  await rule("user", ids.installer, "tasks", "update", "allow");
  await actor("owner", { "x-crm-impersonation": sid });
  assert.equal(
    (
      await db.query(
        "select private.has_module_access('tasks','update') allowed",
      )
    ).rows[0].allowed,
    true,
  );
  await db.query(
    "insert into crm_records(collection,id,data) values('logs','imp-log',$1)",
    [JSON.stringify({ userId: ids.owner, actingAsUserId: ids.installer })],
  );
  await actor("owner");
  const audit = (
    await db.query(
      "select real_actor_user_id,effective_actor_user_id from privileged_security_events where event_type='impersonation.data_write' and target_id='imp-log'",
    )
  ).rows[0];
  assert.deepEqual(audit, {
    real_actor_user_id: ids.owner,
    effective_actor_user_id: ids.installer,
  });
  await db.exec("reset role");
  await db.query(
    "update impersonation_sessions set expires_at=now()-interval '1 minute' where id=$1",
    [sid],
  );
  await actor("owner", { "x-crm-impersonation": sid });
  await assert.rejects(
    db.query("select get_access_context('web')"),
    /expired, revoked or inaccessible|Active authenticated session required/,
  );
  await actor("owner");
  await db.query("select end_impersonation($1)", [sid]);
  await rule("user", ids.installer, "tasks", "update", "default");
});
test("bulk operations are scoped and restoring defaults removes overrides without resetting ordinary grants", async () => {
  await actor("owner");
  await db.query("select admin_bulk_access('role',$1,'grant')", [rid("admin")]);
  await db.query("select admin_set_system_lock(true)");
  assert.equal(await allowed("admin", "billing", "update"), true);
  await actor("owner");
  await db.query("select admin_bulk_access('role',$1,'default')", [
    rid("admin"),
  ]);
  assert.equal(await allowed("admin", "billing", "update"), false);
  await actor("owner");
  await db.query("select admin_set_system_lock(false)");
  assert.equal(await allowed("admin", "billing", "update"), true);
});
test("password finalization uses explicit precedence and revokes sessions only for the disposable target", async () => {
  await rule("user", ids.manager, "users", "change_password", "allow");
  await db.exec("reset role");
  assert.equal(
    (
      await db.query(
        "select private.finalize_owner_password_change($1,$2) result",
        [ids.manager, ids.other],
      )
    ).rows[0].result,
    true,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from auth.sessions where user_id=$1",
        [ids.other],
      )
    ).rows[0].n,
    0,
  );
  assert.equal(
    (
      await db.query(
        "select count(*)::int n from auth.sessions where user_id=$1",
        [ids.owner],
      )
    ).rows[0].n,
    1,
  );
  await actor("manager");
  await assert.rejects(
    db.query("select private.finalize_owner_password_change($1,$2)", [
      ids.manager,
      ids.other,
    ]),
    /permission denied/,
  );
});
