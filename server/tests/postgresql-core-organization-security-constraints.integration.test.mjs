import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const CORE_TABLES = [
  "companies", "company_phones", "company_settings", "branches", "branch_settings",
  "warehouses", "users", "auth_sessions", "roles", "permissions", "role_permissions",
  "user_permission_overrides", "user_branch_access", "document_sequences", "idempotency_keys",
  "posting_batches", "audit_logs", "outbox_events", "document_tombstones",
];

const EXPECTED_TABLE_CONSTRAINTS = [
  "pk_companies",
  "pk_company_phones",
  "pk_company_settings",
  "pk_branches",
  "uq_branches__company_code",
  "pk_branch_settings",
  "pk_warehouses",
  "uq_warehouses__branch_code",
  "pk_users",
  "pk_auth_sessions",
  "uq_auth_sessions__refresh_token_hash",
  "pk_roles",
  "uq_roles__role_key",
  "pk_permissions",
  "uq_permissions__permission_key",
  "pk_role_permissions",
  "pk_user_permission_overrides",
  "pk_user_branch_access",
  "pk_document_sequences",
  "uq_document_sequences__branch_document_type",
  "pk_idempotency_keys",
  "uq_idempotency_keys__key",
  "pk_posting_batches",
  "pk_audit_logs",
  "pk_outbox_events",
  "pk_document_tombstones",
  "uq_document_tombstones__branch_type_number",
  "uq_document_tombstones__original_type",
  "ck_company_phones__sort_order_nonnegative",
  "ck_users__branch_scope_mode",
  "ck_user_permission_overrides__effect",
  "ck_document_sequences__last_number_nonnegative",
  "ck_posting_batches__operation_type",
  "ck_posting_batches__document_version_nonnegative",
  "ck_outbox_events__retry_count_nonnegative",
  "ck_document_tombstones__document_number_nonnegative",
  "fk_company_phones__company",
  "fk_company_settings__company",
  "fk_company_settings__updated_by",
  "fk_branches__company",
  "fk_branch_settings__branch",
  "fk_branch_settings__default_warehouse",
  "fk_warehouses__branch",
  "fk_users__role",
  "fk_users__default_branch",
  "fk_auth_sessions__user",
  "fk_role_permissions__role",
  "fk_role_permissions__permission",
  "fk_user_permission_overrides__user",
  "fk_user_permission_overrides__permission",
  "fk_user_permission_overrides__changed_by",
  "fk_user_branch_access__user",
  "fk_user_branch_access__branch",
  "fk_document_sequences__branch",
  "fk_idempotency_keys__user",
  "fk_posting_batches__branch",
  "fk_posting_batches__reverses",
  "fk_posting_batches__created_by",
  "fk_audit_logs__company",
  "fk_audit_logs__branch",
  "fk_audit_logs__user",
  "fk_document_tombstones__branch",
  "fk_document_tombstones__deleted_by",
];

const EXPECTED_CONSTRAINT_TRIGGERS = [
  "ct_branch_settings__default_warehouse_valid_at_commit",
  "ct_warehouses__preserve_default_reference_at_commit",
  "ct_users__default_branch_access_at_commit",
  "ct_user_branch_access__preserves_default_at_commit",
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

async function rollbackQuietly(client) {
  try { await client.query("ROLLBACK"); } catch {}
}

async function seedCoreFixture(client) {
  const ids = {
    company: "10000000-0000-4000-8000-000000000001",
    branch1: "10000000-0000-4000-8000-000000000002",
    branch2: "10000000-0000-4000-8000-000000000003",
    warehouse1: "10000000-0000-4000-8000-000000000004",
    warehouse2: "10000000-0000-4000-8000-000000000005",
    inactiveWarehouse: "10000000-0000-4000-8000-000000000006",
    roleAdmin: "10000000-0000-4000-8000-000000000007",
    roleSales: "10000000-0000-4000-8000-000000000008",
    permission: "10000000-0000-4000-8000-000000000009",
    userAll: "10000000-0000-4000-8000-000000000010",
    userSelected: "10000000-0000-4000-8000-000000000011",
    updaterUser: "10000000-0000-4000-8000-000000000012",
  };

  await client.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Business Tech','EGP','ar','Africa/Cairo',true,now(),now())`,
    [ids.company],
  );
  await client.query(
    `INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Second','SECOND',true,now(),now())`,
    [ids.branch1, ids.branch2, ids.company],
  );
  await client.query(
    `INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at)
     VALUES
       ($1,$4,'Main Warehouse','MAIN-WH',true,now(),now()),
       ($2,$5,'Second Warehouse','SECOND-WH',true,now(),now()),
       ($3,$4,'Inactive Warehouse','INACTIVE-WH',false,now(),now())`,
    [ids.warehouse1, ids.warehouse2, ids.inactiveWarehouse, ids.branch1, ids.branch2],
  );
  await client.query(
    `INSERT INTO roles (id,role_key,display_name_key,is_system)
     VALUES ($1,'ADMIN_SYSTEM','roles.admin',true),($2,'SALES','roles.sales',true)`,
    [ids.roleAdmin, ids.roleSales],
  );
  await client.query(
    `INSERT INTO permissions (id,permission_key,module,description_key)
     VALUES ($1,'sales.invoice.view','sales','permissions.sales.invoice.view')`,
    [ids.permission],
  );
  await client.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Admin','admin','admin@example.test','hash',$2,$3,'ALL','ar',true,now(),now())`,
    [ids.userAll, ids.roleAdmin, ids.branch1],
  );

  await client.query("BEGIN");
  await client.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Selected User','selected','selected@example.test','hash',$2,$3,'SELECTED','ar',true,now(),now())`,
    [ids.userSelected, ids.roleSales, ids.branch1],
  );
  await client.query(
    "INSERT INTO user_branch_access (user_id,branch_id) VALUES ($1,$2)",
    [ids.userSelected, ids.branch1],
  );
  await client.query("COMMIT");

  return ids;
}

test("03.06 Core / Organization / Security constraints enforce the approved PostgreSQL contract", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");

  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const constraints = await client.query(
        `SELECT con.conname
           FROM pg_catalog.pg_constraint con
           JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
           JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public'
            AND c.relname = ANY($1::text[])
            AND con.conname = ANY($2::text[])
          ORDER BY con.conname`,
        [CORE_TABLES, EXPECTED_TABLE_CONSTRAINTS],
      );
      assert.deepEqual(
        constraints.rows.map((row) => row.conname),
        [...EXPECTED_TABLE_CONSTRAINTS].sort(),
        "every 0012 table constraint must exist",
      );

      const triggers = await client.query(
        `SELECT tgname,tgdeferrable,tginitdeferred
           FROM pg_catalog.pg_trigger
          WHERE tgname = ANY($1::text[]) AND NOT tgisinternal
          ORDER BY tgname`,
        [EXPECTED_CONSTRAINT_TRIGGERS],
      );
      assert.deepEqual(triggers.rows.map((row) => row.tgname), [...EXPECTED_CONSTRAINT_TRIGGERS].sort());
      for (const row of triggers.rows) {
        assert.equal(row.tgdeferrable, true, `${row.tgname} must be DEFERRABLE`);
        assert.equal(row.tginitdeferred, true, `${row.tgname} must be INITIALLY DEFERRED`);
      }

      const nonConstraintIndexes = await client.query(
        `SELECT idx.relname AS index_name
           FROM pg_catalog.pg_index i
           JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
           JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
           JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
           LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
          WHERE n.nspname='public'
            AND tbl.relname = ANY($1::text[])
            AND con.oid IS NULL
          ORDER BY idx.relname`,
        [CORE_TABLES],
      );
      assert.deepEqual(nonConstraintIndexes.rows, [], "03.07 independent indexes must remain deferred");

      const ids = await seedCoreFixture(client);

      await assert.rejects(
        client.query(
          `INSERT INTO branches (id,company_id,name,code,is_active,created_at,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000101',$1,'Duplicate','MAIN',true,now(),now())`,
          [ids.company],
        ),
        /uq_branches__company_code/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO warehouses (id,branch_id,name,code,is_active,created_at,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000102',$1,'Duplicate','MAIN-WH',true,now(),now())`,
          [ids.branch1],
        ),
        /uq_warehouses__branch_code/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO users
            (id,name,username,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000103','Bad Scope','bad-scope','hash',$1,$2,'INVALID','ar',true,now(),now())`,
          [ids.roleSales, ids.branch1],
        ),
        /ck_users__branch_scope_mode/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO users
            (id,name,username,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000104','Missing Role','missing-role','hash','ffffffff-ffff-4fff-8fff-ffffffffffff',$1,'ALL','ar',true,now(),now())`,
          [ids.branch1],
        ),
        /fk_users__role/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO user_permission_overrides (user_id,permission_id,effect,changed_by,changed_at)
           VALUES ($1,$2,'INVALID',$1,now())`,
          [ids.userAll, ids.permission],
        ),
        /ck_user_permission_overrides__effect/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO company_phones (id,company_id,phone,sort_order)
           VALUES ('10000000-0000-4000-8000-000000000105',$1,'01000000000',-1)`,
          [ids.company],
        ),
        /ck_company_phones__sort_order_nonnegative/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO document_sequences (id,branch_id,document_type,last_number,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000106',$1,'SALES_INVOICE',-1,now())`,
          [ids.branch1],
        ),
        /ck_document_sequences__last_number_nonnegative/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO posting_batches
            (id,branch_id,source_type,source_id,operation_type,document_version,posted_at,created_by)
           VALUES ('10000000-0000-4000-8000-000000000107',$1,'TEST','10000000-0000-4000-8000-000000000108','INVALID',1,now(),$2)`,
          [ids.branch1, ids.userAll],
        ),
        /ck_posting_batches__operation_type/,
      );
      await assert.rejects(
        client.query(
          `INSERT INTO outbox_events
            (id,event_type,aggregate_type,aggregate_id,payload_json,created_at,retry_count)
           VALUES ('10000000-0000-4000-8000-000000000109','TEST','TEST','10000000-0000-4000-8000-000000000110','{}'::jsonb,now(),-1)`,
        ),
        /ck_outbox_events__retry_count_nonnegative/,
      );

      await client.query(
        "INSERT INTO branch_settings (branch_id,default_warehouse_id,settings_json,updated_at) VALUES ($1,$2,'{}'::jsonb,now())",
        [ids.branch1, ids.warehouse1],
      );
      await assert.rejects(
        client.query(
          "INSERT INTO branch_settings (branch_id,default_warehouse_id,settings_json,updated_at) VALUES ($1,$2,'{}'::jsonb,now())",
          [ids.branch2, ids.warehouse1],
        ),
        /ct_branch_settings__default_warehouse_valid_at_commit/,
      );
      await assert.rejects(
        client.query(
          "UPDATE branch_settings SET default_warehouse_id=$1 WHERE branch_id=$2",
          [ids.inactiveWarehouse, ids.branch1],
        ),
        /ct_branch_settings__default_warehouse_valid_at_commit/,
      );
      await assert.rejects(
        client.query("UPDATE warehouses SET is_active=false WHERE id=$1", [ids.warehouse1]),
        /ct_warehouses__preserve_default_reference_at_commit/,
      );

      await client.query("BEGIN");
      try {
        await client.query(
          `INSERT INTO users
            (id,name,username,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000111','No Access','no-access','hash',$1,$2,'SELECTED','ar',true,now(),now())`,
          [ids.roleSales, ids.branch2],
        );
        await assert.rejects(
          client.query("COMMIT"),
          /ct_users__default_branch_access_at_commit/,
        );
      } finally {
        await rollbackQuietly(client);
      }

      await client.query("BEGIN");
      try {
        await client.query(
          "DELETE FROM user_branch_access WHERE user_id=$1 AND branch_id=$2",
          [ids.userSelected, ids.branch1],
        );
        await assert.rejects(
          client.query("COMMIT"),
          /ct_user_branch_access__preserves_default_at_commit/,
        );
      } finally {
        await rollbackQuietly(client);
      }

      const preservedAccess = await client.query(
        "SELECT count(*)::int AS count FROM user_branch_access WHERE user_id=$1 AND branch_id=$2",
        [ids.userSelected, ids.branch1],
      );
      assert.equal(preservedAccess.rows[0].count, 1);

      await client.query(
        `INSERT INTO company_settings (company_id,settings_json,updated_by,updated_at)
         VALUES ($1,'{}'::jsonb,$2,now())`,
        [ids.company, ids.userAll],
      );
      await client.query(
        `INSERT INTO users
          (id,name,username,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
         VALUES ($1,'Updater','updater','hash',$2,$3,'ALL','ar',true,now(),now())`,
        [ids.updaterUser, ids.roleSales, ids.branch1],
      );
      await client.query("UPDATE company_settings SET updated_by=$1 WHERE company_id=$2", [ids.updaterUser, ids.company]);
      await client.query("DELETE FROM users WHERE id=$1", [ids.updaterUser]);
      const updatedBy = await client.query("SELECT updated_by FROM company_settings WHERE company_id=$1", [ids.company]);
      assert.equal(updatedBy.rows[0].updated_by, null, "optional descriptive updated_by must use SET NULL");

      await assert.rejects(
        client.query("DELETE FROM roles WHERE id=$1", [ids.roleAdmin]),
        /fk_users__role/,
      );
      await assert.rejects(
        client.query("DELETE FROM companies WHERE id=$1", [ids.company]),
        /fk_branches__company/,
      );

      await client.query(
        `INSERT INTO document_sequences (id,branch_id,document_type,last_number,updated_at)
         VALUES ('10000000-0000-4000-8000-000000000112',$1,'SALES_INVOICE',0,now())`,
        [ids.branch1],
      );
      await assert.rejects(
        client.query(
          `INSERT INTO document_sequences (id,branch_id,document_type,last_number,updated_at)
           VALUES ('10000000-0000-4000-8000-000000000113',$1,'SALES_INVOICE',1,now())`,
          [ids.branch1],
        ),
        /uq_document_sequences__branch_document_type/,
      );

      await client.query(
        `INSERT INTO idempotency_keys
          (id,key,user_id,operation_type,request_hash,created_at,expires_at)
         VALUES ('10000000-0000-4000-8000-000000000114','core-test-key',$1,'TEST','hash',now(),now()+interval '1 hour')`,
        [ids.userAll],
      );
      await assert.rejects(
        client.query(
          `INSERT INTO idempotency_keys
            (id,key,user_id,operation_type,request_hash,created_at,expires_at)
           VALUES ('10000000-0000-4000-8000-000000000115','core-test-key',$1,'TEST','hash2',now(),now()+interval '1 hour')`,
          [ids.userAll],
        ),
        /uq_idempotency_keys__key/,
      );

      await client.query(
        `INSERT INTO document_tombstones
          (id,document_type,original_id,branch_id,document_number,deleted_by,delete_reason,deleted_at)
         VALUES ('10000000-0000-4000-8000-000000000116','SALES_INVOICE','10000000-0000-4000-8000-000000000117',$1,10,$2,'test',now())`,
        [ids.branch1, ids.userAll],
      );
      await assert.rejects(
        client.query(
          `INSERT INTO document_tombstones
            (id,document_type,original_id,branch_id,document_number,deleted_by,delete_reason,deleted_at)
           VALUES ('10000000-0000-4000-8000-000000000118','SALES_INVOICE','10000000-0000-4000-8000-000000000119',$1,10,$2,'test',now())`,
          [ids.branch1, ids.userAll],
        ),
        /uq_document_tombstones__branch_type_number/,
      );

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const target = history.rows.find((row) => row.version === "0012");
      assert.equal(target?.name, "core_organization_security_constraints");
      assert.match(target?.checksum ?? "", /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
