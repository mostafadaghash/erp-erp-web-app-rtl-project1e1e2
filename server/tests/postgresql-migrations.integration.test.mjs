import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";

import {
  DEFAULT_MIGRATIONS_DIR,
  loadMigrationDefinitions,
  runMigrations,
} from "../../scripts/database/migrations.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const BUSINESS_TABLES = [
  "companies", "company_phones", "company_settings", "branches", "branch_settings",
  "warehouses", "users", "auth_sessions", "roles", "permissions", "role_permissions",
  "user_permission_overrides", "user_branch_access", "document_sequences", "idempotency_keys",
  "posting_batches", "audit_logs", "outbox_events", "document_tombstones",
  "counterparties", "counterparty_roles", "customer_profiles", "supplier_profiles",
  "customer_ledger_entries", "supplier_ledger_entries",
  "product_categories", "products", "product_variants", "units", "product_units",
  "variant_barcodes", "attributes", "attribute_values", "product_attributes",
  "variant_attribute_values", "price_lists", "price_list_items", "reorder_levels",
  "serial_numbers", "batches", "inventory_movements", "inventory_movement_lines",
  "inventory_line_serials", "inventory_line_batches", "inventory_stock_positions",
  "variant_warehouse_cost_projection", "batch_stock_positions", "stock_reservations",
  "stock_transfers", "stock_transfer_lines", "stocktake_sessions", "stocktake_lines",
  "stocktake_line_serials", "stocktake_line_batches", "inventory_adjustments",
  "inventory_adjustment_lines", "inventory_adjustment_line_serials",
  "inventory_adjustment_line_batches",
];

const MIGRATIONS = [
  { version: "0001", name: "postgresql_extensions", transactional: true },
  { version: "0002", name: "core_infrastructure_organization_security", transactional: true },
  { version: "0003", name: "counterparties", transactional: true },
  { version: "0004", name: "product_catalog", transactional: true },
  { version: "0005", name: "inventory", transactional: true },
];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    await client.query("DROP TABLE IF EXISTS public.migration_transaction_probe");
    for (const table of [...BUSINESS_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("migration definitions have deterministic versioned pairs", async () => {
  const definitions = await loadMigrationDefinitions(DEFAULT_MIGRATIONS_DIR);
  assert.equal(definitions.length, MIGRATIONS.length);
  assert.deepEqual(
    definitions.map(({ version, name, transactional }) => ({ version, name, transactional })),
    MIGRATIONS,
  );
  for (const definition of definitions) assert.match(definition.checksum, /^[0-9a-f]{64}$/);
});

test("fresh apply, idempotent rerun, verification, and checksum drift protection work on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const versions = MIGRATIONS.map((migration) => migration.version);
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, versions);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const history = await client.query(
        "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(
        history.rows.map((row) => [row.version, row.name]),
        MIGRATIONS.map(({ version, name }) => [version, name]),
      );
      for (const row of history.rows) assert.match(row.checksum, /^[0-9a-f]{64}$/);

      const extension = await client.query(
        "SELECT count(*)::int AS count FROM pg_extension WHERE extname = 'pg_trgm'",
      );
      assert.equal(extension.rows[0].count, 1);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, versions);

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, versions);

    await withClient(async (client) => {
      await client.query(
        "UPDATE schema_migrations SET checksum = $1 WHERE version = '0005'",
        ["0".repeat(64)],
      );
    });
    await assert.rejects(
      () => runMigrations({ databaseUrl, verifyOnly: true }),
      /checksum drift detected/,
    );
  } finally {
    await cleanup();
  }
});

test("failed transactional migration rolls back DDL and does not record success", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  const dir = await mkdtemp(join(tmpdir(), "erp-migration-failure-"));
  const meta = {
    version: "0001",
    name: "transaction_rollback_probe",
    transactional: true,
    preconditionSql: "SELECT true AS ok;",
    verificationSql:
      "SELECT to_regclass('public.migration_transaction_probe') IS NOT NULL AS ok;",
    recovery: "Transactional failure must roll back automatically.",
  };
  await writeFile(
    join(dir, "0001_transaction_rollback_probe.meta.json"),
    `${JSON.stringify(meta, null, 2)}\n`,
  );
  await writeFile(
    join(dir, "0001_transaction_rollback_probe.sql"),
    "CREATE TABLE migration_transaction_probe (id integer);\nSELECT 1 / 0;\n",
  );

  await cleanup();
  try {
    await assert.rejects(
      () => runMigrations({ databaseUrl, migrationsDir: dir }),
      /division by zero/,
    );
    await withClient(async (client) => {
      const probe = await client.query(
        "SELECT to_regclass('public.migration_transaction_probe') IS NULL AS rolled_back",
      );
      assert.equal(probe.rows[0].rolled_back, true);

      const history = await client.query(
        "SELECT count(*)::int AS count FROM schema_migrations",
      );
      assert.equal(history.rows[0].count, 0);
    });
  } finally {
    await cleanup();
    await rm(dir, { recursive: true, force: true });
  }
});
