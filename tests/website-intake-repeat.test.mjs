import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("repeat website enquiries create separate leads without duplicate contacts", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create sequence private.crm_website_intake_number_seq;
      create table public.crm_records (
        collection text not null, id text not null, data jsonb not null,
        primary key (collection, id)
      );
      create table public.website_enquiries (
        id uuid primary key, name text, email text, phone text,
        postcode text, required_service text, message text,
        landing_page text, referrer text, utm_source text, utm_medium text,
        utm_campaign text, utm_term text, utm_content text,
        raw_payload jsonb default '{}'::jsonb, contact_message_id bigint,
        intake_source text, status text, lead_id uuid, contact_id uuid,
        crm_lead_id text, crm_contact_id text, crm_client_id text,
        crm_intake_version integer, crm_intake_error text,
        submitted_at timestamptz default now(), processed_at timestamptz
      );
      create function private.crm_intake_phone(value text) returns text
      language sql immutable as $$
        select nullif(regexp_replace(coalesce(value,''),'[^0-9]','','g'),'')
      $$;
    `);
    const migration = readFileSync(
      new URL("../supabase/migrations/20261105170000_allow_repeat_website_leads.sql", import.meta.url),
      "utf8",
    );
    const definition = migration.match(/CREATE OR REPLACE FUNCTION private\.crm_process_website_intake[\s\S]*?\$function\$;/i)?.[0];
    assert.ok(definition, "migration contains the intake function");
    await db.exec(definition);
    await db.exec(`
      insert into public.crm_records(collection,id,data) values
      ('contacts','contact-1','{"id":"contact-1","clientId":"client-1","email":"old@example.com","phone":"0412345678"}'::jsonb),
      ('clients','client-1','{"id":"client-1","contactId":"contact-1","email":"old@example.com","phone":"0412345678"}'::jsonb);
      insert into public.website_enquiries(id,name,email,phone,required_service,status,intake_source) values
      ('00000000-0000-0000-0000-000000000001','Example','new@example.com','0412345678','Curtains','failed','contact_message'),
      ('00000000-0000-0000-0000-000000000002','Example','another@example.com','0412345678','Blinds','pending','contact_message');
      update public.website_enquiries set crm_intake_error='conflicting_contact_details' where id='00000000-0000-0000-0000-000000000001';
    `);
    for (const id of [
      "00000000-0000-0000-0000-000000000001",
      "00000000-0000-0000-0000-000000000002",
    ]) {
      const { rows } = await db.query("select private.crm_process_website_intake($1::uuid) as result", [id]);
      assert.equal(rows[0].result.status, "processed");
    }
    const { rows } = await db.query(`
      select collection, count(*)::int as total
      from public.crm_records
      where collection in ('contacts','clients','leads')
      group by collection order by collection
    `);
    assert.deepEqual(rows, [
      { collection: "clients", total: 1 },
      { collection: "contacts", total: 1 },
      { collection: "leads", total: 2 },
    ]);
    const replay = await db.query(
      "select private.crm_process_website_intake($1::uuid) as result",
      ["00000000-0000-0000-0000-000000000001"],
    );
    assert.equal(replay.rows[0].result.replayed, true);
  } finally {
    await db.close();
  }
});
