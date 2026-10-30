import { pathToFileURL } from "node:url";
import pg from "pg";

import { runMigrations } from "./migrations.mjs";

const { Client } = pg;

// Read-only preflight for the baseline *before* the proposed 0034 migration.
// This script never creates, updates, deletes, or migrates database data.
const REQUIRED_TABLES = [
  "companies", "branches", "users", "treasuries", "gl_accounts",
  "posting_batches", "journal_entries", "journal_lines", "finance_categories",
];

const REQUIRED_CONSTRAINTS = [
  "pk_gl_accounts",
  "uq_gl_accounts__company_code",
  "fk_gl_accounts__company",
  "fk_gl_accounts__parent",
  "fk_journal_entries__branch",
  "fk_journal_entries__posting_batch",
  "fk_journal_entries__reversal_entry",
  "fk_journal_lines__journal_entry",
  "fk_journal_lines__gl_account",
  "ck_journal_lines__debit_nonnegative",
  "ck_journal_lines__credit_nonnegative",
  "ck_journal_lines__single_side",
];

const HISTORICAL_AUDITS = [
  {
    id: "cross_company_gl_parent",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.gl_accounts child
      JOIN public.gl_accounts parent ON parent.id = child.parent_id
      WHERE child.company_id IS DISTINCT FROM parent.company_id`,
  },
  {
    id: "self_parent_gl_account",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.gl_accounts WHERE parent_id = id`,
  },
  {
    id: "gl_parent_cycle",
    sql: `WITH RECURSIVE parent_path AS (
      SELECT a.id AS root, a.parent_id, ARRAY[a.id] AS visited, false AS cycle_found
      FROM public.gl_accounts a
      UNION ALL
      SELECT p.root, a.parent_id, p.visited || a.id,
             a.id = ANY(p.visited) AS cycle_found
      FROM parent_path p
      JOIN public.gl_accounts a ON a.id = p.parent_id
      WHERE NOT p.cycle_found
    )
    SELECT COUNT(DISTINCT root)::int AS violations
    FROM parent_path WHERE cycle_found`,
  },
  {
    id: "journal_posting_batch_context",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.journal_entries je
      JOIN public.posting_batches pb ON pb.id = je.posting_batch_id
      WHERE je.branch_id IS DISTINCT FROM pb.branch_id
         OR je.source_type IS DISTINCT FROM pb.source_type
         OR je.source_id IS DISTINCT FROM pb.source_id
         OR je.created_by IS DISTINCT FROM pb.created_by
         OR je.posted_at IS DISTINCT FROM pb.posted_at`,
  },
  {
    id: "journal_line_cross_company",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.journal_lines jl
      JOIN public.journal_entries je ON je.id = jl.journal_entry_id
      JOIN public.branches b ON b.id = je.branch_id
      JOIN public.gl_accounts a ON a.id = jl.gl_account_id
      WHERE b.company_id IS DISTINCT FROM a.company_id`,
  },
  {
    id: "reversal_journal_lineage",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.journal_entries reversal
      JOIN public.journal_entries original ON original.id = reversal.reversal_of_entry_id
      JOIN public.posting_batches reversal_pb ON reversal_pb.id = reversal.posting_batch_id
      WHERE reversal.branch_id IS DISTINCT FROM original.branch_id
         OR reversal.source_type IS DISTINCT FROM original.source_type
         OR reversal.source_id IS DISTINCT FROM original.source_id
         OR reversal_pb.reverses_posting_batch_id IS DISTINCT FROM original.posting_batch_id
         OR reversal_pb.operation_type NOT IN ('REVERSAL', 'DELETE_REVERSAL')`,
  },
  {
    id: "empty_journal_entries",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.journal_entries je
      WHERE NOT EXISTS (
        SELECT 1 FROM public.journal_lines jl WHERE jl.journal_entry_id = je.id
      )`,
  },
  {
    id: "historical_posting_to_parent_account",
    sql: `SELECT COUNT(*)::int AS violations
      FROM public.journal_lines jl
      WHERE EXISTS (
        SELECT 1 FROM public.gl_accounts child WHERE child.parent_id = jl.gl_account_id
      )`,
  },
];

function check(id, passed, detail) {
  return { id, passed: Boolean(passed), detail };
}

export async function runGlMigrationPreflight({ databaseUrl } = {}) {
  if (!databaseUrl || typeof databaseUrl !== "string") {
    throw new Error("ERP_DATABASE_URL must be explicitly provided for the 09.08 preflight");
  }

  // verifyOnly validates every applied definition/checksum without applying pending DDL.
  const verified = await runMigrations({ databaseUrl, verifyOnly: true });
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "business-tech-erp-gl-preflight",
  });

  await client.connect();
  try {
    // PostgreSQL enforces read-only transactions at the server level.
    await client.query("BEGIN READ ONLY");
    try {
      const checks = [];
      const version = await client.query("SHOW server_version_num");
      const serverVersion = Number(version.rows[0]?.server_version_num);
      checks.push(check(
        "postgresql_17",
        serverVersion >= 170000 && serverVersion < 180000,
        { server_version_num: serverVersion },
      ));

      const history = await client.query(
        "SELECT version,name FROM public.schema_migrations ORDER BY version",
      );
      const latest = history.rows.at(-1);
      checks.push(check(
        "baseline_0033",
        latest?.version === "0033" &&
          latest?.name === "installment_settlement_integrity" &&
          history.rowCount === 33 &&
          verified.total === 33 &&
          verified.applied.length === 0 &&
          verified.skipped.length === 33,
        { migration_count: history.rowCount, last_version: latest?.version ?? null },
      ));

      const found = await client.query(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' AND tablename = ANY($1::text[])",
        [REQUIRED_TABLES],
      );
      const present = new Set(found.rows.map((row) => row.tablename));
      const missingTables = REQUIRED_TABLES.filter((table) => !present.has(table));
      checks.push(check("canonical_tables", missingTables.length === 0, {
        missing_tables: missingTables,
      }));

      const mapping = await client.query(
        "SELECT to_regclass('public.system_account_mappings') IS NULL AS absent",
      );
      checks.push(check("mapping_not_yet_created", mapping.rows[0]?.absent === true, {
        absent: mapping.rows[0]?.absent === true,
      }));

      const constraints = await client.query(
        "SELECT conname FROM pg_catalog.pg_constraint WHERE conname = ANY($1::text[])",
        [REQUIRED_CONSTRAINTS],
      );
      const constraintNames = new Set(constraints.rows.map((row) => row.conname));
      const missingConstraints = REQUIRED_CONSTRAINTS.filter((name) => !constraintNames.has(name));
      checks.push(check("canonical_constraints", missingConstraints.length === 0, {
        missing_constraints: missingConstraints,
      }));

      const balanceTrigger = await client.query(
        `SELECT t.tgdeferrable, t.tginitdeferred
         FROM pg_catalog.pg_trigger t
         WHERE t.tgrelid = 'public.journal_lines'::regclass
           AND t.tgname = 'ct_journal_entries__balanced_at_commit'
           AND NOT t.tgisinternal`,
      );
      checks.push(check(
        "deferred_commit_balance",
        balanceTrigger.rowCount === 1 &&
          balanceTrigger.rows[0].tgdeferrable === true &&
          balanceTrigger.rows[0].tginitdeferred === true,
        { exists_and_deferred: balanceTrigger.rowCount === 1 &&
          balanceTrigger.rows[0].tgdeferrable === true &&
          balanceTrigger.rows[0].tginitdeferred === true },
      ));

      if (missingTables.length === 0) {
        for (const audit of HISTORICAL_AUDITS) {
          const result = await client.query(audit.sql);
          const violations = result.rows[0]?.violations;
          checks.push(check(audit.id, violations === 0, { violations }));
        }
      } else {
        checks.push(check("historical_audits_executable", false, {
          reason: "Required baseline tables are missing",
        }));
      }

      return {
        ready: checks.every((result) => result.passed),
        mode: "READ_ONLY_BASELINE_PREFLIGHT",
        expected_next_migration: "0034_gl_system_account_mapping_integrity",
        checks,
      };
    } finally {
      await client.query("ROLLBACK");
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runGlMigrationPreflight({ databaseUrl: process.env.ERP_DATABASE_URL })
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
      if (!result.ready) process.exitCode = 1;
    })
    .catch((error) => {
      process.stderr.write("09.08 read-only preflight failed: " + error.message + "\n");
      process.exitCode = 1;
    });
}
