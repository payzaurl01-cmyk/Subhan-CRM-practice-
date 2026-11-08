import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("new CRM and website leads notify active management once", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create role anon;
      create role authenticated;
      create table public.crm_records (
        collection text not null, id text not null, data jsonb not null,
        primary key (collection, id)
      );
      create table public.roles (id integer primary key, key text not null);
      create table public.profiles (id uuid primary key, role_id integer not null, status text not null);
      insert into public.roles values
        (1,'super_admin'),(2,'admin'),(3,'manager'),(4,'installer');
      insert into public.profiles values
        ('00000000-0000-0000-0000-000000000001',1,'active'),
        ('00000000-0000-0000-0000-000000000002',2,'active'),
        ('00000000-0000-0000-0000-000000000003',3,'active'),
        ('00000000-0000-0000-0000-000000000004',4,'active'),
        ('00000000-0000-0000-0000-000000000005',2,'blocked');
    `);
    const migration = readFileSync(
      new URL("../supabase/migrations/20261108151050_new_lead_notifications.sql", import.meta.url),
      "utf8",
    );
    await db.exec(migration);
    await db.query(
      "insert into public.crm_records values ('leads',$1,$2::jsonb)",
      ["lead-web-1", JSON.stringify({ number: "LEAD-WEB-000001", customer: "Web customer" })],
    );
    await db.query(
      "insert into public.crm_records values ('leads',$1,$2::jsonb)",
      ["lead-local-1", JSON.stringify({ number: "LEAD-000231", customer: "CRM customer" })],
    );
    await db.exec("update public.crm_records set data=data || '{\"stage\":\"Contacted\"}'::jsonb where collection='leads';");
    await db.exec("insert into public.crm_records values ('tasks','task-1','{}'::jsonb);");
    const { rows } = await db.query(`
      select data->>'leadId' lead_id, count(*)::int total,
        bool_and(data->>'page'='leads' and data->>'read'='false') valid
      from public.crm_records where collection='notifications'
      group by data->>'leadId' order by lead_id
    `);
    assert.deepEqual(rows, [
      { lead_id: "lead-local-1", total: 3, valid: true },
      { lead_id: "lead-web-1", total: 3, valid: true },
    ]);
  } finally {
    await db.close();
  }
});
