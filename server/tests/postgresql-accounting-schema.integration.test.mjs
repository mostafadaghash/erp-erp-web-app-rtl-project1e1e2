import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const ACCOUNTING = ["gl_accounts","journal_entries","journal_lines"];
const EXPECTED = {
  gl_accounts:[["id","uuid",true],["company_id","uuid",true],["code","text",true],["name","text",true],["account_type","text",true],["parent_id","uuid",false],["is_system","boolean",true],["is_active","boolean",true]],
  journal_entries:[["id","uuid",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["reversal_of_entry_id","uuid",false],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["description","text",false]],
  journal_lines:[["id","uuid",true],["journal_entry_id","uuid",true],["gl_account_id","uuid",true],["debit","numeric(18,4)",true],["credit","numeric(18,4)",true],["counterparty_id","uuid",false]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function seedAccountingParents(client) {
  const ids = {
    company: "71000000-0000-4000-8000-000000000001",
    branch: "71000000-0000-4000-8000-000000000002",
    role: "71000000-0000-4000-8000-000000000003",
    user: "71000000-0000-4000-8000-000000000004",
    source: "71000000-0000-4000-8000-000000000005",
    batch: "71000000-0000-4000-8000-000000000006",
    debitAccount: "71000000-0000-4000-8000-000000000007",
    creditAccount: "71000000-0000-4000-8000-000000000008",
  };
  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Accounting Schema Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main','MAIN',true,now(),now())`, [ids.branch, ids.company]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'ACCOUNTING_SCHEMA','roles.accountingSchema',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Accounting Schema User','accounting-schema',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch]);
  await client.query(`INSERT INTO posting_batches
    (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$2,'ACCOUNTING_SCHEMA',$3,'POST',1,NULL,now(),$4)`, [ids.batch, ids.branch, ids.source, ids.user]);
  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$3,'1000','Cash','ASSET',NULL,true,true),($2,$3,'4000','Revenue','INCOME',NULL,true,true)`,
    [ids.debitAccount, ids.creditAccount, ids.company]);
  return ids;
}

test("03.H Accounting physical shape remains canonical and deferred balance survives the 03.06 constraint layer", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const cols = await client.query(`SELECT c.relname table_name,a.attname column_name,
        pg_catalog.format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])
          AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`, [ACCOUNTING]);
      const actual = Object.fromEntries(ACCOUNTING.map((table) => [table, []]));
      for (const row of cols.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED);

      const expectedConstraints = [
        "pk_gl_accounts","uq_gl_accounts__company_code","pk_journal_entries","pk_journal_lines",
        "fk_gl_accounts__company","fk_gl_accounts__parent","fk_journal_entries__branch",
        "fk_journal_entries__posting_batch","fk_journal_entries__reversal_entry","fk_journal_entries__created_by",
        "fk_journal_lines__journal_entry","fk_journal_lines__gl_account","fk_journal_lines__counterparty",
        "ck_journal_lines__debit_nonnegative","ck_journal_lines__credit_nonnegative","ck_journal_lines__single_side",
        "ct_journal_entries__balanced_at_commit",
      ];
      const constraints = await client.query(`SELECT con.conname
        FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY con.conname`, [ACCOUNTING]);
      assert.deepEqual(constraints.rows.map((row) => row.conname), [...expectedConstraints].sort());

      const trigger = await client.query(`SELECT t.tgname,t.tgdeferrable,t.tginitdeferred,p.proname
        FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
        WHERE n.nspname='public' AND c.relname='journal_lines'
          AND t.tgname='ct_journal_entries__balanced_at_commit' AND NOT t.tgisinternal`);
      assert.deepEqual(trigger.rows,[{
        tgname:"ct_journal_entries__balanced_at_commit",tgdeferrable:true,tginitdeferred:true,
        proname:"fn_journal_entries_balanced_at_commit",
      }]);

      const independentIndexes = await client.query(`SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.oid IS NULL ORDER BY idx.relname`, [ACCOUNTING]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 independent Accounting indexes remain deferred");

      const ids = await seedAccountingParents(client);
      const entry = "71000000-0000-4000-8000-000000000020";
      const debitLine = "71000000-0000-4000-8000-000000000021";
      const creditLine = "71000000-0000-4000-8000-000000000022";
      await client.query("BEGIN");
      await client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ($1,$2,'ACCOUNTING_SCHEMA',$3,$4,NULL,now(),$5,'balanced')`,
        [entry, ids.branch, ids.source, ids.batch, ids.user]);
      await client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ($1,$2,$3,12345678901234.5678,0.0000,NULL),($4,$2,$5,0.0000,12345678901234.5678,NULL)`,
        [debitLine, entry, ids.debitAccount, creditLine, ids.creditAccount]);
      await client.query("COMMIT");
      const exact = await client.query("SELECT SUM(debit)::text debit,SUM(credit)::text credit FROM journal_lines WHERE journal_entry_id=$1", [entry]);
      assert.deepEqual(exact.rows[0], { debit:"12345678901234.5678", credit:"12345678901234.5678" });

      const badEntry = "71000000-0000-4000-8000-000000000030";
      await client.query("BEGIN");
      await client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ($1,$2,'ACCOUNTING_SCHEMA',$3,$4,NULL,now(),$5,'bad')`,
        [badEntry, ids.branch, ids.source, ids.batch, ids.user]);
      await client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('71000000-0000-4000-8000-000000000031',$1,$2,10.0000,0.0000,NULL)`, [badEntry, ids.debitAccount]);
      await assert.rejects(client.query("COMMIT"), (error) =>
        error?.code === "23514" && error?.constraint === "ct_journal_entries__balanced_at_commit");
      await client.query("ROLLBACK").catch(() => {});
      const rolled = await client.query("SELECT count(*)::int count FROM journal_entries WHERE id=$1", [badEntry]);
      assert.equal(rolled.rows[0].count, 0);

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.equal(history.rows.find((row) => row.version === "0009")?.name, "accounting");
      const accountingSlice = history.rows.find((row) => row.version === "0019");
      assert.equal(accountingSlice?.name, "accounting_constraints");
      assert.match(accountingSlice?.checksum ?? "", /^[0-9a-f]{64}$/);
      assert.equal(history.rows.at(-1)?.version, "0020");
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly:true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
