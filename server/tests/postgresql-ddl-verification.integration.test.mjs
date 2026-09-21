import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function expectUniqueViolation(promise, indexName) {
  await assert.rejects(
    promise,
    (error) => error?.code === "23505" && error?.constraint === indexName,
  );
}

test("03.08 final DDL verification covers case-insensitive user identity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  await cleanupDatabase(databaseUrl);
  try {
    const apply = await runMigrations({ databaseUrl });
    assert.deepEqual(apply.applied, MIGRATIONS);
    assert.deepEqual(apply.skipped, []);

    await withClient(async (client) => {
      const version = await client.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `03.08 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const companyId = "93000000-0000-4000-8000-000000000001";
      const branchId = "93000000-0000-4000-8000-000000000002";
      const roleId = "93000000-0000-4000-8000-000000000003";

      await client.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'DDL Verification Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [companyId],
      );
      await client.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Main','MAIN',true,now(),now())`,
        [branchId, companyId],
      );
      await client.query(
        `INSERT INTO roles (id,role_key,display_name_key,is_system)
         VALUES ($1,'DDL_VERIFY','roles.ddlVerify',true)`,
        [roleId],
      );
      await client.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
         VALUES
          ('93000000-0000-4000-8000-000000000010','Case User','CaseUser','CaseUser@Example.Test','hash',$1,$2,'ALL','ar-EG',true,now(),now())`,
        [roleId, branchId],
      );

      await expectUniqueViolation(
        client.query(
          `INSERT INTO users
            (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
           VALUES
            ('93000000-0000-4000-8000-000000000011','Username Collision','caseuser','other@example.test','hash',$1,$2,'ALL','ar-EG',true,now(),now())`,
          [roleId, branchId],
        ),
        "ux_users__lower_username",
      );

      await expectUniqueViolation(
        client.query(
          `INSERT INTO users
            (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
           VALUES
            ('93000000-0000-4000-8000-000000000012','Email Collision','email-collision','caseuser@example.test','hash',$1,$2,'ALL','ar-EG',true,now(),now())`,
          [roleId, branchId],
        ),
        "ux_users__lower_email__where_email_is_not_null",
      );

      await client.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
         VALUES
          ('93000000-0000-4000-8000-000000000013','Null Email A','null-email-a',NULL,'hash',$1,$2,'ALL','ar-EG',true,now(),now()),
          ('93000000-0000-4000-8000-000000000014','Null Email B','null-email-b',NULL,'hash',$1,$2,'ALL','ar-EG',true,now(),now())`,
        [roleId, branchId],
      );

      const history = await client.query(
        "SELECT version,name FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(history.rows.at(-1), {
        version: "0024",
        name: "inventory_ledger_integrity",
      });
      assert.deepEqual(
        history.rows.find((row) => row.version === "0022"),
        {
          version: "0022",
          name: "index_catalog",
        },
      );
    });

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});

test("03.08 deployment contract keeps PostgreSQL off the client network", async () => {
  const composeUrl = new URL("../../infra/local/docker-compose.yml", import.meta.url);
  const compose = await readFile(composeUrl, "utf8");

  const postgresStart = compose.indexOf("\n  postgres:\n");
  const backendStart = compose.indexOf("\n  backend:\n", postgresStart + 1);
  assert.ok(postgresStart >= 0 && backendStart > postgresStart, "postgres/backend service blocks must exist");

  const postgresBlock = compose.slice(postgresStart, backendStart);
  assert.doesNotMatch(
    postgresBlock,
    /\n\s{4}ports:\s*(?:\n|$)/,
    "PostgreSQL must not publish a host/client port",
  );
  assert.match(
    compose,
    /POSTGRES_URL:\s*postgresql:\/\/\$\{POSTGRES_USER\}:\$\{POSTGRES_PASSWORD\}@postgres:5432/,
    "backend must reach PostgreSQL only through the internal service network",
  );
});
