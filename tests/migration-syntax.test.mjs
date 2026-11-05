import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

test("pending migration function bodies compile in PostgreSQL", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create schema private;
      create table public.crm_records(collection text, id text, data jsonb);
      create table public.inventory_balances(
        id uuid, variant_id uuid, warehouse_id uuid, location_id uuid,
        quantity_on_hand numeric, quantity_reserved numeric
      );
    `);
    for (const file of [
      "20261104090318_assign_generated_pickups_to_installer.sql",
      "20261104091410_installer_job_tasks_and_role_notices.sql",
      "20261104091429_installer_inventory_collection.sql",
      "20261104135503_restore_partial_collection_scans.sql",
    ]) {
      const source = readFileSync(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8");
      const functions = [...source.matchAll(/create or replace function[\s\S]*?\$\$;/gi)];
      assert.ok(functions.length, `${file} has no functions`);
      for (const functionSql of functions)
        await db.exec(functionSql[0]);
    }
  } finally {
    await db.close();
  }
});
