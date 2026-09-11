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
    await client.query("DROP TABLE IF EXISTS public.migration_transaction_probe");
    for (const table of [...CORE_TABLES].reverse()) {
      await client.query(`DROP TABLE IF EXISTS public.${table}`);
    }
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("migration definitions have deterministic versioned pairs", async () => {
  const definitions = await loadMigrationDefinitions(DEFAULT_MIGRATIONS_DIR);
  assert.equal(definitions.length, 2);
  assert.deepEqual(
    definitions.map(({ version, name, transactional }) => ({ version, name, transactional })),
    [
      { version: "0001", name: "postgresql_extensions", transactional: true },
      { version: "0002", name: "core_infrastructure_organization_security", transactional: true },
    ],
  );
  for (const definition of definitions) {
    assert.match(definition.checksum, /^[0-9a-f]{64}$/);
  }
});

test("fresh apply, idempotent rerun, verification, and checksum drift protection work on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, ["0001", "0002"]);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const history = await client.query(
        "SELECT version, name, checksum FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, 2);
      assert.equal(history.rows[0].version, "0001");
      assert.equal(history.rows[0].name, "postgresql_extensions");
      assert.equal(history.rows[1].version, "0002");
      assert.equal(history.rows[1].name, "core_infrastructure_organization_security");
      for (const row of history.rows) {
        assert.match(row.checksum, /^[0-9a-f]{64}$/);
      }

      const extension = await client.query(
        "SELECT count(*)::int AS count FROM pg_extension WHERE extname = 'pg_trgm'",
      );
      assert.equal(extension.rows[0].count, 1);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, ["0001", "0002"]);

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, ["0001", "0002"]);

    await withClient(async (client) => {
      await client.query(
        "UPDATE schema_migrations SET checksum = $1 WHERE version = '0002'",
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
