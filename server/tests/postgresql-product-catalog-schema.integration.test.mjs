import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const CORE_TABLES = [
  "companies", "company_phones", "company_settings", "branches", "branch_settings",
  "warehouses", "users", "auth_sessions", "roles", "permissions", "role_permissions",
  "user_permission_overrides", "user_branch_access", "document_sequences", "idempotency_keys",
  "posting_batches", "audit_logs", "outbox_events", "document_tombstones",
];

const COUNTERPARTY_TABLES = [
  "counterparties", "counterparty_roles", "customer_profiles", "supplier_profiles",
  "customer_ledger_entries", "supplier_ledger_entries",
];

const PRODUCT_TABLES = [
  "product_categories",
  "products",
  "product_variants",
  "units",
  "product_units",
  "variant_barcodes",
  "attributes",
  "attribute_values",
  "product_attributes",
  "variant_attribute_values",
  "price_lists",
  "price_list_items",
  "reorder_levels",
];

const EXPECTED_COLUMNS = {
  product_categories: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["parent_id", "uuid", false],
    ["is_active", "boolean", true],
  ],
  products: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["category_id", "uuid", true],
    ["product_type", "text", true],
    ["base_unit_id", "uuid", true],
    ["tracking_serial", "boolean", true],
    ["tracking_batch", "boolean", true],
    ["tracking_expiry", "boolean", true],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  product_variants: [
    ["id", "uuid", true],
    ["product_id", "uuid", true],
    ["name", "text", true],
    ["sku", "text", false],
    ["is_default", "boolean", true],
    ["combination_signature", "text", true],
    ["minimum_selling_price", "numeric(18,4)", false],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  units: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["symbol", "text", true],
    ["allows_fraction", "boolean", true],
    ["is_active", "boolean", true],
  ],
  product_units: [
    ["id", "uuid", true],
    ["product_id", "uuid", true],
    ["unit_id", "uuid", true],
    ["conversion_to_base", "numeric(18,6)", true],
    ["is_sellable", "boolean", true],
    ["is_purchasable", "boolean", true],
  ],
  variant_barcodes: [
    ["id", "uuid", true],
    ["variant_id", "uuid", true],
    ["product_unit_id", "uuid", true],
    ["barcode", "text", true],
    ["is_primary", "boolean", true],
  ],
  attributes: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["attribute_type", "text", true],
    ["usage_type", "text", true],
    ["is_active", "boolean", true],
  ],
  attribute_values: [
    ["id", "uuid", true],
    ["attribute_id", "uuid", true],
    ["value", "text", true],
    ["sort_order", "integer", true],
  ],
  product_attributes: [
    ["product_id", "uuid", true],
    ["attribute_id", "uuid", true],
  ],
  variant_attribute_values: [
    ["variant_id", "uuid", true],
    ["attribute_value_id", "uuid", true],
  ],
  price_lists: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  price_list_items: [
    ["price_list_id", "uuid", true],
    ["variant_id", "uuid", true],
    ["product_unit_id", "uuid", true],
    ["price", "numeric(18,4)", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  reorder_levels: [
    ["variant_id", "uuid", true],
    ["warehouse_id", "uuid", true],
    ["minimum_quantity", "numeric(18,6)", true],
  ],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function cleanup() {
  await withClient(async (client) => {
    for (const table of [...PRODUCT_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    for (const table of [...COUNTERPARTY_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    for (const table of [...CORE_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.C creates only the canonical Product Catalog schema shape", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, ["0001", "0002", "0003", "0004"]);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedBusinessTables = [...CORE_TABLES, ...COUNTERPARTY_TABLES, ...PRODUCT_TABLES].sort();
      const allTables = await client.query(
        `SELECT tablename
         FROM pg_catalog.pg_tables
         WHERE schemaname = 'public'
           AND tablename <> 'schema_migrations'
         ORDER BY tablename`,
      );
      assert.deepEqual(
        allTables.rows.map((row) => row.tablename),
        expectedBusinessTables,
        "03.C must not create duplicate aliases or later-domain relations",
      );

      const columnResult = await client.query(
        `SELECT c.relname AS table_name,
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relname = ANY($1::text[])
           AND a.attnum > 0
           AND NOT a.attisdropped
         ORDER BY c.relname, a.attnum`,
        [PRODUCT_TABLES],
      );

      const actualByTable = Object.fromEntries(PRODUCT_TABLES.map((table) => [table, []]));
      for (const row of columnResult.rows) {
        actualByTable[row.table_name].push([
          row.column_name,
          row.data_type,
          row.not_null,
        ]);
      }
      assert.deepEqual(actualByTable, EXPECTED_COLUMNS);

      const baseUnitAlias = await client.query(
        `SELECT EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'product_units'
             AND column_name = 'is_base'
         ) AS has_is_base,
         EXISTS (
           SELECT 1
           FROM information_schema.columns
           WHERE table_schema = 'public'
             AND table_name = 'products'
             AND column_name = 'base_unit_id'
         ) AS has_base_unit_id`,
      );
      assert.equal(baseUnitAlias.rows[0].has_is_base, false, "product_units.is_base must not exist");
      assert.equal(baseUnitAlias.rows[0].has_base_unit_id, true, "products.base_unit_id is the base-unit source of truth");

      const constraints = await client.query(
        `SELECT count(*)::int AS count
         FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = ANY($1::text[])`,
        [PRODUCT_TABLES],
      );
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = ANY($1::text[])`,
        [PRODUCT_TABLES],
      );
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query(
        "SELECT to_regclass('public.serial_numbers') IS NULL AS absent",
      );
      assert.equal(futureDomain.rows[0].absent, true, "03.D Inventory must not start during 03.C");

      const history = await client.query(
        "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, 4);
      assert.equal(history.rows[3].version, "0004");
      assert.equal(history.rows[3].name, "product_catalog");
      assert.match(history.rows[3].checksum, /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ["0001", "0002", "0003", "0004"]);

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, ["0001", "0002", "0003", "0004"]);
  } finally {
    await cleanup();
  }
});
