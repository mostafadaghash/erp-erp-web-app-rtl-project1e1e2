import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const CORE_TABLES = [
  "companies",
  "company_phones",
  "company_settings",
  "branches",
  "branch_settings",
  "warehouses",
  "users",
  "auth_sessions",
  "roles",
  "permissions",
  "role_permissions",
  "user_permission_overrides",
  "user_branch_access",
  "document_sequences",
  "idempotency_keys",
  "posting_batches",
  "audit_logs",
  "outbox_events",
  "document_tombstones",
];

const EXPECTED_COLUMNS = {
  companies: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["short_name", "text", false],
    ["legal_name", "text", false],
    ["commercial_registration", "text", false],
    ["tax_number", "text", false],
    ["address", "text", false],
    ["logo_path", "text", false],
    ["base_currency_code", "text", true],
    ["default_language", "text", true],
    ["timezone", "text", true],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  company_phones: [
    ["id", "uuid", true],
    ["company_id", "uuid", true],
    ["phone", "text", true],
    ["sort_order", "integer", true],
  ],
  company_settings: [
    ["company_id", "uuid", true],
    ["settings_json", "jsonb", true],
    ["updated_by", "uuid", false],
    ["updated_at", "timestamp with time zone", true],
  ],
  branches: [
    ["id", "uuid", true],
    ["company_id", "uuid", true],
    ["name", "text", true],
    ["code", "text", true],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  branch_settings: [
    ["branch_id", "uuid", true],
    ["default_warehouse_id", "uuid", false],
    ["default_price_list_id", "uuid", false],
    ["default_sales_print_template_id", "uuid", false],
    ["default_purchase_print_template_id", "uuid", false],
    ["settings_json", "jsonb", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  warehouses: [
    ["id", "uuid", true],
    ["branch_id", "uuid", true],
    ["name", "text", true],
    ["code", "text", true],
    ["is_active", "boolean", true],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  users: [
    ["id", "uuid", true],
    ["name", "text", true],
    ["username", "text", true],
    ["email", "text", false],
    ["password_hash", "text", true],
    ["role_id", "uuid", true],
    ["default_branch_id", "uuid", true],
    ["branch_scope_mode", "text", true],
    ["preferred_language", "text", true],
    ["is_active", "boolean", true],
    ["last_login_at", "timestamp with time zone", false],
    ["created_at", "timestamp with time zone", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  auth_sessions: [
    ["id", "uuid", true],
    ["user_id", "uuid", true],
    ["refresh_token_hash", "text", true],
    ["device_name", "text", false],
    ["ip_address", "inet", false],
    ["expires_at", "timestamp with time zone", true],
    ["revoked_at", "timestamp with time zone", false],
    ["created_at", "timestamp with time zone", true],
  ],
  roles: [
    ["id", "uuid", true],
    ["role_key", "text", true],
    ["display_name_key", "text", true],
    ["is_system", "boolean", true],
  ],
  permissions: [
    ["id", "uuid", true],
    ["permission_key", "text", true],
    ["module", "text", true],
    ["description_key", "text", true],
  ],
  role_permissions: [
    ["role_id", "uuid", true],
    ["permission_id", "uuid", true],
    ["is_allowed", "boolean", true],
  ],
  user_permission_overrides: [
    ["user_id", "uuid", true],
    ["permission_id", "uuid", true],
    ["effect", "text", true],
    ["changed_by", "uuid", true],
    ["changed_at", "timestamp with time zone", true],
  ],
  user_branch_access: [
    ["user_id", "uuid", true],
    ["branch_id", "uuid", true],
  ],
  document_sequences: [
    ["id", "uuid", true],
    ["branch_id", "uuid", true],
    ["document_type", "text", true],
    ["last_number", "bigint", true],
    ["updated_at", "timestamp with time zone", true],
  ],
  idempotency_keys: [
    ["id", "uuid", true],
    ["key", "text", true],
    ["user_id", "uuid", true],
    ["operation_type", "text", true],
    ["request_hash", "text", true],
    ["result_reference", "text", false],
    ["created_at", "timestamp with time zone", true],
    ["completed_at", "timestamp with time zone", false],
    ["expires_at", "timestamp with time zone", true],
  ],
  posting_batches: [
    ["id", "uuid", true],
    ["branch_id", "uuid", true],
    ["source_type", "text", true],
    ["source_id", "uuid", true],
    ["operation_type", "text", true],
    ["document_version", "integer", true],
    ["reverses_posting_batch_id", "uuid", false],
    ["posted_at", "timestamp with time zone", true],
    ["created_by", "uuid", true],
  ],
  audit_logs: [
    ["id", "uuid", true],
    ["company_id", "uuid", true],
    ["branch_id", "uuid", false],
    ["user_id", "uuid", false],
    ["action", "text", true],
    ["entity_type", "text", true],
    ["entity_id", "uuid", true],
    ["reason", "text", false],
    ["before_json", "jsonb", false],
    ["after_json", "jsonb", false],
    ["created_at", "timestamp with time zone", true],
  ],
  outbox_events: [
    ["id", "uuid", true],
    ["event_type", "text", true],
    ["aggregate_type", "text", true],
    ["aggregate_id", "uuid", true],
    ["payload_json", "jsonb", true],
    ["created_at", "timestamp with time zone", true],
    ["processed_at", "timestamp with time zone", false],
    ["retry_count", "integer", true],
  ],
  document_tombstones: [
    ["id", "uuid", true],
    ["document_type", "text", true],
    ["original_id", "uuid", true],
    ["branch_id", "uuid", true],
    ["document_number", "bigint", true],
    ["deleted_by", "uuid", true],
    ["delete_reason", "text", true],
    ["deleted_at", "timestamp with time zone", true],
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
    for (const table of [...CORE_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.A creates only the canonical Infrastructure / Organization / Security schema shape", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, ["0001", "0002"]);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const tableResult = await client.query(
        `SELECT tablename
         FROM pg_catalog.pg_tables
         WHERE schemaname = 'public'
           AND tablename = ANY($1::text[])
         ORDER BY tablename`,
        [CORE_TABLES],
      );
      assert.equal(tableResult.rowCount, CORE_TABLES.length);
      assert.deepEqual(
        tableResult.rows.map((row) => row.tablename),
        [...CORE_TABLES].sort(),
      );

      const columnResult = await client.query(
        `SELECT c.relname AS table_name,
                a.attname AS column_name,
                pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type,
                a.attnotnull AS not_null,
                a.attnum AS ordinal
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid = c.oid
         WHERE n.nspname = 'public'
           AND c.relkind = 'r'
           AND c.relname = ANY($1::text[])
           AND a.attnum > 0
           AND NOT a.attisdropped
         ORDER BY c.relname, a.attnum`,
        [CORE_TABLES],
      );

      const actualByTable = Object.fromEntries(CORE_TABLES.map((table) => [table, []]));
      for (const row of columnResult.rows) {
        actualByTable[row.table_name].push([row.column_name, row.data_type, row.not_null]);
      }
      assert.deepEqual(actualByTable, EXPECTED_COLUMNS);

      const constraints = await client.query(
        `SELECT count(*)::int AS count
         FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = ANY($1::text[])`,
        [CORE_TABLES],
      );
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count
         FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid = i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = 'public'
           AND c.relname = ANY($1::text[])`,
        [CORE_TABLES],
      );
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query(
        "SELECT to_regclass('public.counterparties') IS NULL AS absent",
      );
      assert.equal(futureDomain.rows[0].absent, true, "03.B must not start during 03.A");

      const history = await client.query(
        "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, 2);
      assert.equal(history.rows[1].version, "0002");
      assert.equal(history.rows[1].name, "core_infrastructure_organization_security");
      assert.match(history.rows[1].checksum, /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ["0001", "0002"]);

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, ["0001", "0002"]);
  } finally {
    await cleanup();
  }
});
