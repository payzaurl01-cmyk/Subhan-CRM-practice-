import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

let db,
  actor,
  warehouseA,
  warehouseB,
  locationA,
  locationB,
  productId,
  variantId;
const migration = new URL(
  "../supabase/migrations/20261021084740_warehouse_inventory.sql",
  import.meta.url,
);
const command = async (action, payload, key = randomUUID()) =>
  (
    await db.query(
      "select public.inventory_command($1,$2::jsonb,$3::uuid) result",
      [action, JSON.stringify(payload), key],
    )
  ).rows[0].result;
const count = async (table) =>
  Number((await db.query(`select count(*) n from public.${table}`)).rows[0].n);
const balance = async (location) =>
  (
    await db.query(
      "select quantity_on_hand::float8 hand,quantity_reserved::float8 reserved,quantity_damaged::float8 damaged from public.inventory_balances where variant_id=$1 and location_id=$2",
      [variantId, location],
    )
  ).rows[0];
const movement = (quantity, extra = {}) => ({
  variant_id: variantId,
  location_id: locationA,
  quantity,
  reason: "Verified count",
  reference: "TEST-REFERENCE",
  ...extra,
});

before(async () => {
  db = new PGlite();
  await db.exec(`create schema auth; create schema private; create schema storage;
 create role anon; create role authenticated;
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,owner_id text);
 alter table storage.objects enable row level security;
 create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;`);
  await db.exec(
    await readFile(
      new URL("./fixtures/inventory-baseline.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    "create table public.product_requests(id uuid primary key,job_order_id uuid,variant_id uuid);",
  );
  await db.exec(`create function private.current_role_key() returns text language sql stable security definer as $$ select nullif(current_setting('test.role',true),'') $$;
 create function private.has_module_access(m text,a text,p public.platform_key) returns boolean language sql stable security definer as $$ select auth.uid() is not null and private.current_role_key() is not null and not ((m||'.'||a)=any(string_to_array(current_setting('test.deny',true),','))) $$;
 create function private.crm_upgrade_require(m text,a text,management boolean default true) returns uuid language plpgsql as $$ begin if auth.uid() is null or private.current_role_key() is null or not private.has_module_access(m,a,'web') or (management and private.current_role_key() not in ('super_admin','admin','manager')) then raise exception 'Permission denied' using errcode='42501'; end if; return auth.uid(); end $$;
 create function public.crm_receive_po(p_po_id uuid,p_lines jsonb,p_key uuid) returns jsonb language sql as $$ select private.crm_upgrade_receive_po(p_po_id,p_lines,p_key) $$;
 grant usage on schema public,private,auth,storage to authenticated; grant execute on all functions in schema private,auth to authenticated;`);
  await db.exec(`insert into public.products(id,sku,name) values('10000000-0000-4000-8000-000000000001','PRESERVED','Existing stock');
  insert into public.product_variants(id,product_id,sku,name) values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','PRESERVED','Default');
  insert into public.warehouses(id,name,code,kind) values('10000000-0000-4000-8000-000000000003','Existing warehouse','PRESERVED','warehouse');
  insert into public.inventory_balances(id,variant_id,warehouse_id,quantity_on_hand,quantity_reserved) values('10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003',9,2);`);
  await db.exec(await readFile(migration, "utf8"));
  actor = randomUUID();
  await db.query("insert into public.roles(key,name) values('admin','Admin');");
  await db.query(
    "insert into public.profiles(id,email,full_name,role_id,status) values($1,'test@example.com','Test actor',(select id from public.roles where key='admin'),'active')",
    [actor],
  );
  await db.query(
    "select set_config('request.jwt.claim.sub',$1,false),set_config('test.role','admin',false),set_config('test.deny','',false)",
    [actor],
  );
  warehouseA = (
    await command("warehouse", {
      name: "Warehouse A",
      code: "WA",
      address: "A road",
      postcode: "2000",
      active: true,
    })
  ).id;
  warehouseB = (
    await command("warehouse", {
      name: "Warehouse B",
      code: "WB",
      address: "B road",
      postcode: "3000",
      active: true,
    })
  ).id;
  locationA = (
    await db.query(
      "select id from public.warehouse_locations where warehouse_id=$1",
      [warehouseA],
    )
  ).rows[0].id;
  locationB = (
    await db.query(
      "select id from public.warehouse_locations where warehouse_id=$1",
      [warehouseB],
    )
  ).rows[0].id;
  const created = await command("product", {
    name: "Shared blind",
    sku: "SHARED-01",
    description: "Test",
    unit: "each",
    cost_price: 10,
    sale_price: 20,
    active: true,
    attributes: { Colour: "White", Size: "120 cm" },
    image_paths: [],
    opening_quantity: 10,
    location_id: locationA,
    barcode: "0123456789",
  });
  productId = created.id;
  variantId = created.variant_id;
});
after(async () => {
  await db?.close();
});

test("migration retains existing identifiers and totals, flagging unassigned balances", async () => {
  const snapshot = (await db.query("select public.inventory_snapshot() result"))
    .rows[0].result;
  const old = snapshot.balances.find(
    (b) => b.id === "10000000-0000-4000-8000-000000000004",
  );
  assert.equal(Number(old.quantity_on_hand), 9);
  assert.equal(Number(old.quantity_reserved), 2);
  assert.equal(old.location_id, null);
  assert.equal(
    snapshot.unassigned_balances.find((b) => b.id === old.id).id,
    old.id,
  );
  assert.equal(
    snapshot.products.find((p) => p.sku === "PRESERVED").id,
    "10000000-0000-4000-8000-000000000001",
  );
});

test("normalized purchasing forms create snapshot lines without creating stock", async () => {
  const supplier = await command("supplier", {
    name: "New supplier",
    email: "supplier@example.com",
    code: "SUP-NEW",
  });
  const before = await balance(locationA);
  const po = await command("purchase_order", {
    warehouse_id: warehouseA,
    supplier_id: supplier.id,
    items: [{ variant_id: variantId, quantity: 3, unit_cost: 10 }],
  });
  const line = (
    await db.query(
      "select sku_snapshot,name_snapshot,quantity_ordered::float8 quantity from public.purchase_order_items where purchase_order_id=$1",
      [po.id],
    )
  ).rows[0];
  assert.deepEqual(line, {
    sku_snapshot: "SHARED-01",
    name_snapshot: "Shared blind",
    quantity: 3,
  });
  assert.deepEqual(await balance(locationA), before);
});

test("a failure after both transfer updates rolls back the entire operation", async () => {
  const beforeA = await balance(locationA),
    beforeB = await balance(locationB);
  await db.exec(`create function private.test_transfer_failure() returns trigger language plpgsql as $$ begin if new.reference_text='FORCED-FAILURE' then raise exception 'Simulated journal failure'; end if; return new; end $$;
 create trigger test_transfer_failure before insert on public.stock_movements for each row execute function private.test_transfer_failure();`);
  await assert.rejects(
    command(
      "transfer",
      movement(1, { destination_id: locationB, reference: "FORCED-FAILURE" }),
    ),
    /Simulated journal failure/,
  );
  assert.deepEqual(await balance(locationA), beforeA);
  assert.deepEqual(await balance(locationB), beforeB);
  await db.exec("drop trigger test_transfer_failure on public.stock_movements");
});

test("one variant has independent warehouse balances and atomic idempotent transfers", async () => {
  const key = randomUUID(),
    payload = movement(3, { destination_id: locationB });
  const first = await command("transfer", payload, key);
  assert.deepEqual(await balance(locationA), {
    hand: 7,
    reserved: 0,
    damaged: 0,
  });
  assert.deepEqual(await balance(locationB), {
    hand: 3,
    reserved: 0,
    damaged: 0,
  });
  const n = await count("stock_movements");
  assert.deepEqual(await command("transfer", payload, key), first);
  assert.equal(await count("stock_movements"), n);
  await assert.rejects(
    command("transfer", { ...payload, quantity: 4 }, key),
    /different payload/,
  );
  await assert.rejects(
    command("transfer", movement(100, { destination_id: locationB })),
    /Insufficient/,
  );
  assert.equal((await balance(locationA)).hand, 7);
  assert.equal((await balance(locationB)).hand, 3);
});

test("catalogue edits retain movement snapshots, duplicate variations and identifiers are rejected", async () => {
  await command("product", {
    id: productId,
    name: "Renamed blind",
    sku: "SHARED-01",
    unit: "each",
    cost_price: 11,
    sale_price: 22,
    active: true,
    image_paths: [],
  });
  const snapshot = (
    await db.query(
      "select variant_snapshot from public.stock_movements where variant_id=$1 order by created_at limit 1",
      [variantId],
    )
  ).rows[0].variant_snapshot;
  assert.equal(snapshot.sku, "SHARED-01");
  assert.equal(snapshot.name, "Shared blind");
  await assert.rejects(
    command("product", {
      id: productId,
      name: "Blind",
      sku: "SHARED-01",
      unit: "each",
      cost_price: 1,
      sale_price: 2,
      active: true,
      image_paths: [],
      quantity_on_hand: 50,
    }),
    /Add Stock/,
  );
  await assert.rejects(
    command("variant", {
      product_id: productId,
      name: "Duplicate",
      sku: "OTHER-SKU",
      attributes: { size: "120 CM", colour: "white" },
      cost_price: 1,
      sale_price: 2,
      active: true,
      image_paths: [],
    }),
    /unique constraint/,
  );
  const other = await command("variant", {
    product_id: productId,
    name: "Black variant",
    sku: "BLACK-01",
    attributes: { Colour: "Black", Size: "120 cm", Finish: "Matte" },
    cost_price: 12,
    sale_price: 25,
    active: true,
    image_paths: [],
  });
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) n from public.inventory_balances where variant_id=$1",
          [other.id],
        )
      ).rows[0].n,
    ),
    0,
  );
  await assert.rejects(
    command("variant", {
      product_id: productId,
      name: "Conflict",
      sku: "0123456789",
      attributes: { Colour: "Red" },
      cost_price: 1,
      sale_price: 2,
      active: true,
      image_paths: [],
    }),
    /conflicts/,
  );
  await assert.rejects(
    command("variant", {
      product_id: productId,
      name: "Conflict",
      sku: "NEW-RED",
      barcode: "0123456789",
      attributes: { Colour: "Red" },
      cost_price: 1,
      sale_price: 2,
      active: true,
      image_paths: [],
    }),
    /Barcode/,
  );
});

test("warehouse hierarchy and referenced deletion safeguards preserve locations and totals", async () => {
  const zone = (
    await command("location", {
      warehouse_id: warehouseA,
      name: "Zone A",
      code: "ZONE-A",
      level: "zone",
      active: true,
    })
  ).id;
  const rack = (
    await command("location", {
      warehouse_id: warehouseA,
      parent_id: zone,
      name: "Rack 1",
      code: "R1",
      level: "rack",
      active: true,
    })
  ).id;
  await assert.rejects(
    command("location", {
      id: zone,
      warehouse_id: warehouseA,
      parent_id: rack,
      name: "Zone A",
      code: "ZONE-A",
      level: "zone",
      active: true,
    }),
    /cycles/,
  );
  await assert.rejects(
    command("location", {
      warehouse_id: warehouseB,
      parent_id: zone,
      name: "Wrong parent",
      code: "BAD",
      level: "bin",
      active: true,
    }),
    /same warehouse/,
  );
  await assert.rejects(
    command("delete_location", { id: locationA }),
    /deactivate/,
  );
  await assert.rejects(
    command("delete_warehouse", { id: warehouseA }),
    /deactivate/,
  );
  await command("location", {
    id: rack,
    warehouse_id: warehouseA,
    parent_id: zone,
    name: "Rack 1",
    code: "R1",
    level: "rack",
    active: false,
  });
  await assert.rejects(
    command("receive", movement(1, { location_id: rack })),
    /Active warehouse/,
  );
});

test("reservations, assigned issues and competing withdrawals cannot overdraw available stock", async () => {
  const job = randomUUID(),
    line = randomUUID();
  await db.query(
    "insert into public.job_orders(id,quotation_id,lead_id,contact_id,workflow_stage,primary_installer_id) values($1,gen_random_uuid(),gen_random_uuid(),gen_random_uuid(),'ready_for_collection',$2)",
    [job, actor],
  );
  await db.query(
    "insert into public.job_order_items(id,job_order_id,variant_id,description,quantity) values($1,$2,$3,'Blind snapshot',4)",
    [line, job, variantId],
  );
  await command("reserve", movement(4, { job_item_id: line }));
  assert.equal((await balance(locationA)).reserved, 4);
  await assert.rejects(command("adjust", movement(-4)), /reserved stock/);
  await assert.rejects(
    command("transfer", movement(4, { destination_id: locationB })),
    /reserved stock/,
  );
  await db.exec("select set_config('test.role','installer',false)");
  await assert.rejects(command("adjust", movement(1)), /Permission denied/);
  await command("issue", movement(4, { job_item_id: line }));
  await assert.rejects(
    command("issue", movement(1, { job_item_id: line })),
    /ready for collection|duplicate issue/i,
  );
  await db.exec("select set_config('test.role','admin',false)");
  assert.deepEqual(await balance(locationA), {
    hand: 3,
    reserved: 0,
    damaged: 0,
  });
  const results = await Promise.allSettled([
    command("adjust", movement(-2)),
    command("adjust", movement(-2)),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await balance(locationA)).hand, 1);
});

test("PO receipts use deployed receipt function, prevent duplicate receipt and manual PO restocking", async () => {
  const supplier = randomUUID(),
    po = randomUUID(),
    line = randomUUID();
  await db.query(
    "insert into public.suppliers(id,name) values($1,'Test supplier')",
    [supplier],
  );
  await db.query(
    "insert into public.purchase_orders(id,supplier_id,warehouse_id,status) values($1,$2,$3,'ordered')",
    [po, supplier, warehouseA],
  );
  await db.query(
    "insert into public.purchase_order_items(id,purchase_order_id,variant_id,quantity_ordered,unit_cost) values($1,$2,$3,5,10)",
    [line, po, variantId],
  );
  const key = randomUUID(),
    lines = [
      { purchase_order_item_id: line, quantity: 5, location_id: locationA },
    ];
  const invoke = () =>
    db.query("select public.crm_receive_po($1,$2::jsonb,$3) result", [
      po,
      JSON.stringify(lines),
      key,
    ]);
  const first = (await invoke()).rows[0].result;
  assert.deepEqual((await invoke()).rows[0].result, first);
  assert.equal((await balance(locationA)).hand, 6);
  await assert.rejects(
    db.query("select public.crm_receive_po($1,$2::jsonb,$3)", [
      po,
      JSON.stringify(lines),
      randomUUID(),
    ]),
    /partially received|active PO/,
  );
  await assert.rejects(
    command("receive", movement(5, { purchase_order_id: po })),
    /purchasing goods receipts/,
  );
});

test("inspected returns restore only usable units once and leave credits untouched", async () => {
  const ret = randomUUID(),
    item = randomUUID();
  await db.query(
    "insert into public.product_returns(id,warehouse_id,delivered_at) values($1,$2,now())",
    [ret, warehouseA],
  );
  await db.query(
    "insert into public.product_return_items(id,product_return_id,variant_id,quantity,condition,pickup_matched) values($1,$2,$3,3,'opened',3)",
    [item, ret, variantId],
  );
  await command(
    "inspect_return",
    movement(2, { return_item_id: item, damaged_quantity: 1 }),
  );
  assert.deepEqual(await balance(locationA), {
    hand: 8,
    reserved: 0,
    damaged: 1,
  });
  await assert.rejects(
    command(
      "inspect_return",
      movement(2, { return_item_id: item, damaged_quantity: 1 }),
    ),
    /already restored/,
  );
  assert.equal(
    (
      await db.query(
        "select billing_credit from public.product_returns where id=$1",
        [ret],
      )
    ).rows[0].billing_credit,
    true,
  );
});

test("RLS and grants deny direct stock edits and revoked permissions deny commands", async () => {
  await db.exec("set role authenticated");
  await assert.rejects(
    db.exec("update public.inventory_balances set quantity_on_hand=1000"),
    /permission denied/,
  );
  await assert.rejects(
    db.exec("delete from public.stock_movements"),
    /permission denied/,
  );
  await db.exec(
    "reset role; select set_config('test.deny','inventory.update',false)",
  );
  await assert.rejects(command("receive", movement(1)), /Permission denied/);
  await db.exec(
    "select set_config('test.deny','inventory.view,warehouse.view',false)",
  );
  await assert.rejects(
    db.query("select public.inventory_snapshot()"),
    /viewing permission/,
  );
  await db.exec("select set_config('test.deny','',false)");
});

test("image references require completed storage objects and replacements do not mutate history", async () => {
  await assert.rejects(
    command("product", {
      id: productId,
      name: "Blind",
      sku: "SHARED-01",
      unit: "each",
      cost_price: 10,
      sale_price: 20,
      active: true,
      image_paths: ["missing.png"],
    }),
    /upload has not completed/,
  );
  await db.query(
    "insert into storage.objects(bucket_id,name,owner_id) values('inventory-images',$1,$2)",
    [actor + "/image.png", actor],
  );
  await command("product", {
    id: productId,
    name: "Blind",
    sku: "SHARED-01",
    unit: "each",
    cost_price: 10,
    sale_price: 20,
    active: true,
    image_paths: [actor + "/image.png"],
  });
  assert.deepEqual(
    (
      await db.query("select image_paths from public.products where id=$1", [
        productId,
      ])
    ).rows[0].image_paths,
    [actor + "/image.png"],
  );
});

test("current CRM jobs use explicit allocations, assigned issues and inspected returns without guessing IDs", async () => {
  const job = "crm-job-kept",
    item = "crm-item-kept";
  const jobData = {
    id: job,
    number: "JOB-KEPT",
    status: "Ready for Collection",
    financialHold: false,
    items: [
      {
        id: item,
        productId: "unmapped-old-product",
        name: "Original quoted product",
        sku: "OLD-SNAPSHOT",
        quantityRequired: 2,
      },
    ],
  };
  await db.query(
    "insert into public.crm_records(collection,id,data) values('jobs',$1,$2)",
    [job, JSON.stringify(jobData)],
  );
  const payload = {
    job_id: job,
    item_id: item,
    variant_id: variantId,
    location_id: locationA,
    collector_id: actor,
    quantity: 2,
    mapping_confirmed: true,
  };
  const before = await balance(locationA);
  await assert.rejects(
    command("allocate_job", { ...payload, mapping_confirmed: false }),
    /Confirm.*mapping/,
  );
  const approved = await command("allocate_job", payload);
  assert.equal((await balance(locationA)).reserved, before.reserved + 2);
  await assert.rejects(
    db.query(
      "update public.inventory_balances set quantity_reserved=0 where variant_id=$1 and location_id=$2",
      [variantId, locationA],
    ),
    /approved reservations/,
  );
  await assert.rejects(command("allocate_job", payload), /unique constraint/);
  await db.exec("select set_config('test.role','installer',false)");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    randomUUID(),
  ]);
  await assert.rejects(
    command("allocation_issue", {
      allocation_id: approved.id,
      quantity: 1,
      reason: "Unauthorized",
      reference: "DENIED",
    }),
    /not assigned/,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    actor,
  ]);
  const key = randomUUID(),
    issue = {
      allocation_id: approved.id,
      quantity: 2,
      reason: "Confirmed collection",
      reference: "JOB-KEPT",
    };
  await command("allocation_issue", issue, key);
  await command("allocation_issue", issue, key);
  await assert.rejects(
    command("allocation_issue", issue),
    /remaining approved reservation/,
  );
  const collected = await command("complete_collection", { job_id: job });
  assert.equal(collected.job.id, job);
  assert.equal(collected.job.status, "Collected");
  assert.equal(collected.job.items[0].sku, "OLD-SNAPSHOT");
  assert.equal(collected.job.items[0].quantityIssued, 2);
  const returned = await command("request_return", {
    allocation_id: approved.id,
    quantity: 1,
    location_id: locationA,
    reason: "Unused",
  });
  await assert.rejects(
    command("request_return", {
      allocation_id: approved.id,
      quantity: 2,
      location_id: locationA,
      reason: "Too many",
    }),
    /exceeds issued/,
  );
  await command("return_pickup", {
    return_item_id: returned.id,
    variant_id: variantId,
    quantity: 1,
  });
  await assert.rejects(
    command("return_delivered", { return_item_id: returned.id }),
    /Permission denied/,
  );
  await db.exec("select set_config('test.role','admin',false)");
  await command("return_delivered", { return_item_id: returned.id });
  const afterIssue = await balance(locationA);
  await command(
    "inspect_return",
    movement(1, { return_item_id: returned.id, damaged_quantity: 0 }),
  );
  assert.equal((await balance(locationA)).hand, afterIssue.hand + 1);
  assert.equal((await balance(locationA)).hand, before.hand - 1);
});

test("authenticated RPC callers can post stock while direct table writes remain denied", async () => {
  const before = await balance(locationA);
  await db.exec("set role authenticated");
  try {
    await command("receive", movement(1, { reference: "AUTHENTICATED-RPC" }));
    await assert.rejects(
      db.exec("update public.inventory_balances set quantity_on_hand=999"),
      /permission denied/,
    );
  } finally {
    await db.exec("reset role");
  }
  assert.equal((await balance(locationA)).hand, before.hand + 1);
});

test("a manual delivery reference cannot restock the same variant and bin twice", async () => {
  const before = await balance(locationA);
  const payload = movement(2, { reference: "MANUAL-DELIVERY-UNIQUE" });
  await command("receive", payload);
  await assert.rejects(
    command("receive", payload),
    /inventory_manual_receipt_once/,
  );
  assert.equal((await balance(locationA)).hand, before.hand + 2);
});

test("new categories and single default-variant edits persist, invalid prices and thresholds are rejected", async () => {
  const created = await command("product", {
    name: "Plain blind",
    sku: "PLAIN-01",
    unit: "each",
    cost_price: 3,
    sale_price: 6,
    category_name: "Plain products",
    active: true,
    image_paths: [],
  });
  await command("product", {
    id: created.id,
    name: "Updated plain blind",
    sku: "PLAIN-02",
    unit: "each",
    cost_price: 4,
    sale_price: 8,
    category_name: "Plain products",
    active: true,
    image_paths: [],
  });
  const row = (
    await db.query(
      "select sku,name,cost_price::float8 cost from public.product_variants where id=$1",
      [created.variant_id],
    )
  ).rows[0];
  assert.deepEqual(row, {
    sku: "PLAIN-02",
    name: "Updated plain blind",
    cost: 4,
  });
  assert.equal(
    Number(
      (
        await db.query(
          "select count(*) n from public.product_categories where name='Plain products'",
        )
      ).rows[0].n,
    ),
    1,
  );
  await assert.rejects(
    command("product", {
      name: "Invalid",
      sku: "INVALID",
      unit: "each",
      cost_price: "NaN",
      sale_price: 2,
      image_paths: [],
    }),
    /finite numbers/,
  );
  await assert.rejects(
    command("threshold", movement(1, { threshold: "NaN" })),
    /finite nonnegative/,
  );
});
