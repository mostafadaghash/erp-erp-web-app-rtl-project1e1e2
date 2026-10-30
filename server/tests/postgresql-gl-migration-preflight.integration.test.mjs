import assert from "node:assert/strict";
import { mkdtemp, cp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import pg from "pg";

import { DEFAULT_MIGRATIONS_DIR, runMigrations } from "../../scripts/database/migrations.mjs";
import { runGlMigrationPreflight } from "../../scripts/database/phase-09-08-preflight.mjs";
import { cleanupDatabase } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

// The pre-0034 readiness test must model an already-deployed 0033 database,
// while repository files now include a pending forward-only 0034 migration.
async function applyLegacy33Baseline() {
  const dir = await mkdtemp(join(tmpdir(), "erp-pre-0034-"));
  try {
    for (let i = 1; i <= 33; i += 1) {
      const version = String(i).padStart(4, "0");
      const { readdir } = await import("node:fs/promises");
      const names = (await readdir(DEFAULT_MIGRATIONS_DIR)).filter((f) => f.startsWith(version + "_"));
      for (const name of names) await cp(join(DEFAULT_MIGRATIONS_DIR,name), join(dir,name));
    }
    return await runMigrations({ databaseUrl, migrationsDir: dir });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

test("09.08 preflight proves the clean 0033 PostgreSQL 17 baseline without applying 0034", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const migrated = await applyLegacy33Baseline();
    assert.equal(migrated.applied.at(-1), "0033");
    const result = await runGlMigrationPreflight({ databaseUrl });
    assert.equal(result.mode, "READ_ONLY_BASELINE_PREFLIGHT");
    assert.equal(result.expected_next_migration, "0034_gl_system_account_mapping_integrity");
    assert.equal(result.ready, true, JSON.stringify(result.checks.filter((x) => !x.passed)));
    assert.ok(result.checks.length >= 12);
    assert.ok(result.checks.every((x) => x.passed));

    await withClient(async (client) => {
      const version = await client.query(
        "SELECT COUNT(*)::int AS count FROM public.schema_migrations",
      );
      assert.equal(version.rows[0].count, 33);
      const proposedTable = await client.query(
        "SELECT to_regclass('public.system_account_mappings') IS NULL AS absent",
      );
      assert.equal(proposedTable.rows[0].absent, true);
    });
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});

test("09.08 preflight rejects historical cross-company and cross-branch accounting rows", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    await applyLegacy33Baseline();
    await withClient(async (client) => {
      const ids = {
        companyA: "76000000-0000-4000-8000-000000000001",
        companyB: "76000000-0000-4000-8000-000000000002",
        branchA: "76000000-0000-4000-8000-000000000003",
        branchB: "76000000-0000-4000-8000-000000000004",
        role: "76000000-0000-4000-8000-000000000005",
        user: "76000000-0000-4000-8000-000000000006",
        accountA: "76000000-0000-4000-8000-000000000007",
        accountB: "76000000-0000-4000-8000-000000000008",
        batch: "76000000-0000-4000-8000-000000000009",
        source: "76000000-0000-4000-8000-000000000010",
        entry: "76000000-0000-4000-8000-000000000011",
        lineA: "76000000-0000-4000-8000-000000000012",
        lineB: "76000000-0000-4000-8000-000000000013",
      };

      await client.query(`INSERT INTO companies
        (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
        VALUES ($1,'GL Preflight A','EGP','ar-EG','Africa/Cairo',true,now(),now()),
               ($2,'GL Preflight B','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [ids.companyA, ids.companyB]);
      await client.query(`INSERT INTO branches
        (id,company_id,name,code,is_active,created_at,updated_at)
        VALUES ($1,$3,'Branch A','A',true,now(),now()),
               ($2,$3,'Branch B','B',true,now(),now())`,
        [ids.branchA, ids.branchB, ids.companyA]);
      await client.query(`INSERT INTO roles
        (id,role_key,display_name_key,is_system)
        VALUES ($1,'GL_PREFLIGHT','roles.glPreflight',true)`, [ids.role]);
      await client.query(`INSERT INTO users
        (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,
         preferred_language,is_active,created_at,updated_at)
        VALUES ($1,'GL Preflight User','gl-preflight',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
        [ids.user, ids.role, ids.branchA]);
      await client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ($1,$3,'1000','Cross-company child','ASSET',$2,true,true),
               ($2,$4,'2000','Foreign parent','ASSET',NULL,true,true)`,
        [ids.accountA, ids.accountB, ids.companyA, ids.companyB]);
      await client.query(`INSERT INTO posting_batches
        (id,branch_id,source_type,source_id,operation_type,document_version,
         reverses_posting_batch_id,posted_at,created_by)
        VALUES ($1,$2,'GL_PREFLIGHT',$3,'POST',1,NULL,now(),$4)`,
        [ids.batch, ids.branchB, ids.source, ids.user]);
      await client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,
         posted_at,created_by,description)
        VALUES ($1,$2,'GL_PREFLIGHT',$3,$4,NULL,now(),$5,'invalid context fixture')`,
        [ids.entry, ids.branchA, ids.source, ids.batch, ids.user]);
      await client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ($1,$3,$4,10.0000,0,NULL),($2,$3,$5,0,10.0000,NULL)`,
        [ids.lineA, ids.lineB, ids.entry, ids.accountA, ids.accountB]);
    });

    const result = await runGlMigrationPreflight({ databaseUrl });
    assert.equal(result.ready, false);
    const byId = new Map(result.checks.map((x) => [x.id, x]));
    for (const id of [
      "cross_company_gl_parent",
      "journal_posting_batch_context",
      "journal_line_cross_company",
    ]) {
      assert.equal(byId.get(id)?.passed, false, id);
      assert.equal(byId.get(id)?.detail?.violations, 1, id);
    }
    assert.equal(byId.get("deferred_commit_balance")?.passed, true);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
