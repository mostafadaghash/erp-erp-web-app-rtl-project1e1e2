import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const ACCOUNTING_TABLES = ["gl_accounts", "journal_entries", "journal_lines"];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) => error?.code === code && error?.constraint === constraint);
}

async function expectDeferredConstraint(client, work, constraint) {
  await client.query("BEGIN");
  try {
    await work();
    await assert.rejects(
      client.query("COMMIT"),
      (error) => error?.code === "23514" && error?.constraint === constraint,
    );
  } finally {
    await client.query("ROLLBACK").catch(() => {});
  }
}

async function seedFixture(client) {
  const ids = {
    company1: "70000000-0000-4000-8000-000000000001",
    company2: "70000000-0000-4000-8000-000000000002",
    branch: "70000000-0000-4000-8000-000000000003",
    role: "70000000-0000-4000-8000-000000000004",
    user: "70000000-0000-4000-8000-000000000005",
    counterparty: "70000000-0000-4000-8000-000000000006",
    postingBatch: "70000000-0000-4000-8000-000000000007",
    source: "70000000-0000-4000-8000-000000000008",
    asset: "70000000-0000-4000-8000-000000000009",
    revenue: "70000000-0000-4000-8000-000000000010",
    child: "70000000-0000-4000-8000-000000000011",
    category: "70000000-0000-4000-8000-000000000012",
  };

  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Accounting Test Co','EGP','ar-EG','Africa/Cairo',true,now(),now()),
           ($2,'Accounting Other Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [ids.company1, ids.company2]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main','MAIN',true,now(),now())`, [ids.branch, ids.company1]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'ACCOUNTING_TEST','roles.accountingTest',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Accounting User','accounting-test',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Accounting Counterparty',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  await client.query(`INSERT INTO posting_batches
    (id,branch_id,source_type,source_id,operation_type,document_version,reverses_posting_batch_id,posted_at,created_by)
    VALUES ($1,$2,'ACCOUNTING_TEST',$3,'POST',1,NULL,now(),$4)`,
    [ids.postingBatch, ids.branch, ids.source, ids.user]);

  await client.query(`INSERT INTO gl_accounts
    (id,company_id,code,name,account_type,parent_id,is_system,is_active)
    VALUES ($1,$4,'1000','Cash','ASSET',NULL,true,true),
           ($2,$4,'4000','Revenue','INCOME',NULL,true,true),
           ($3,$4,'1100','Petty Cash','ASSET',$1,false,true)`,
    [ids.asset, ids.revenue, ids.child, ids.company1]);

  await client.query(`INSERT INTO finance_categories (id,name,category_type,gl_account_id,is_active)
    VALUES ($1,'Accounting Income','INCOME',$2,true)`, [ids.category, ids.revenue]);

  return ids;
}

test("03.06 Accounting constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedConstraints = [
        "pk_gl_accounts","uq_gl_accounts__company_code","pk_journal_entries","pk_journal_lines",
        "fk_gl_accounts__company","fk_gl_accounts__parent","fk_journal_entries__branch",
        "fk_journal_entries__posting_batch","fk_journal_entries__reversal_entry","fk_journal_entries__created_by",
        "fk_journal_lines__journal_entry","fk_journal_lines__gl_account","fk_journal_lines__counterparty",
        "fk_finance_categories__gl_account","ck_journal_lines__debit_nonnegative",
        "ck_journal_lines__credit_nonnegative","ck_journal_lines__single_side",
        "ct_journal_entries__balanced_at_commit",
      ];
      const constraints = await client.query(`SELECT conname,contype FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[]) ORDER BY conname`, [expectedConstraints]);
      assert.equal(constraints.rowCount, expectedConstraints.length);

      const trigger = await client.query(`SELECT t.tgname,t.tgdeferrable,t.tginitdeferred,p.proname
        FROM pg_catalog.pg_trigger t
        JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
        WHERE n.nspname='public' AND c.relname='journal_lines'
          AND t.tgname='ct_journal_entries__balanced_at_commit' AND NOT t.tgisinternal`);
      assert.deepEqual(trigger.rows, [{
        tgname: "ct_journal_entries__balanced_at_commit",
        tgdeferrable: true,
        tginitdeferred: true,
        proname: "fn_journal_entries_balanced_at_commit",
      }]);

      const independentIndexes = await client.query(`
        SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [ACCOUNTING_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 Accounting indexes must remain deferred");

      const sourceFks = await client.query(`SELECT count(*)::int AS count
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname='journal_entries' AND con.contype='f'
          AND (con.conname ILIKE '%source%' OR pg_get_constraintdef(con.oid) ILIKE '%source_id%')`);
      assert.equal(sourceFks.rows[0].count, 0, "journal source_type/source_id must remain polymorphic without a fake FK");

      const ids = await seedFixture(client);

      await expectConstraint(client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ('70000000-0000-4000-8000-000000000020',$1,'1000','Duplicate','ASSET',NULL,false,true)`,
        [ids.company1]), "23505", "uq_gl_accounts__company_code");

      await client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ('70000000-0000-4000-8000-000000000021',$1,'1000','Other Company Custom','CUSTOM_TECHNICAL_VALUE',NULL,false,true)`,
        [ids.company2]);

      await expectConstraint(client.query(`INSERT INTO gl_accounts
        (id,company_id,code,name,account_type,parent_id,is_system,is_active)
        VALUES ('70000000-0000-4000-8000-000000000022',$1,'1200','Bad Parent','ASSET','ffffffff-ffff-4fff-8fff-ffffffffffff',false,true)`,
        [ids.company1]), "23503", "fk_gl_accounts__parent");

      await expectConstraint(client.query(`INSERT INTO finance_categories
        (id,name,category_type,gl_account_id,is_active)
        VALUES ('70000000-0000-4000-8000-000000000023','Bad Mapping','EXPENSE','ffffffff-ffff-4fff-8fff-ffffffffffff',true)`),
        "23503", "fk_finance_categories__gl_account");

      await expectConstraint(client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ('70000000-0000-4000-8000-000000000024','ffffffff-ffff-4fff-8fff-ffffffffffff','ACCOUNTING_TEST',$1,$2,NULL,now(),$3,NULL)`,
        [ids.source, ids.postingBatch, ids.user]), "23503", "fk_journal_entries__branch");

      await expectConstraint(client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ('70000000-0000-4000-8000-000000000025',$1,'ACCOUNTING_TEST',$2,'ffffffff-ffff-4fff-8fff-ffffffffffff',NULL,now(),$3,NULL)`,
        [ids.branch, ids.source, ids.user]), "23503", "fk_journal_entries__posting_batch");

      const entry1 = "70000000-0000-4000-8000-000000000030";
      const entry2 = "70000000-0000-4000-8000-000000000031";
      await client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ($1,$3,'CUSTOM_SOURCE','70000000-0000-4000-8000-000000000099',$4,NULL,now(),$5,'balanced'),
               ($2,$3,'CUSTOM_SOURCE','70000000-0000-4000-8000-000000000098',$4,NULL,now(),$5,'same posting batch allowed')`,
        [entry1, entry2, ids.branch, ids.postingBatch, ids.user]);

      await expectConstraint(client.query(`INSERT INTO journal_entries
        (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
        VALUES ('70000000-0000-4000-8000-000000000032',$1,'ACCOUNTING_TEST',$2,$3,'ffffffff-ffff-4fff-8fff-ffffffffffff',now(),$4,NULL)`,
        [ids.branch, ids.source, ids.postingBatch, ids.user]), "23503", "fk_journal_entries__reversal_entry");

      await expectConstraint(client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000040',$1,$2,-1,0,NULL)`,
        [entry1, ids.asset]), "23514", "ck_journal_lines__debit_nonnegative");
      await expectConstraint(client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000041',$1,$2,0,-1,NULL)`,
        [entry1, ids.asset]), "23514", "ck_journal_lines__credit_nonnegative");
      await expectConstraint(client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000042',$1,$2,10,10,NULL)`,
        [entry1, ids.asset]), "23514", "ck_journal_lines__single_side");
      await expectConstraint(client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000043',$1,'ffffffff-ffff-4fff-8fff-ffffffffffff',10,0,NULL)`,
        [entry1]), "23503", "fk_journal_lines__gl_account");
      await expectConstraint(client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000044',$1,$2,10,0,'ffffffff-ffff-4fff-8fff-ffffffffffff')`,
        [entry1, ids.asset]), "23503", "fk_journal_lines__counterparty");

      await client.query("BEGIN");
      await client.query(`INSERT INTO journal_lines
        (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
        VALUES ('70000000-0000-4000-8000-000000000045',$1,$2,125.5000,0,$4),
               ('70000000-0000-4000-8000-000000000046',$1,$3,0,125.5000,NULL),
               ('70000000-0000-4000-8000-000000000047',$1,$2,0,0,NULL)`,
        [entry1, ids.asset, ids.revenue, ids.counterparty]);
      await client.query("COMMIT");

      const totals = await client.query(`SELECT SUM(debit)::text AS debit,SUM(credit)::text AS credit
        FROM journal_lines WHERE journal_entry_id=$1`, [entry1]);
      assert.deepEqual(totals.rows[0], { debit: "125.5000", credit: "125.5000" });

      await expectDeferredConstraint(client, async () => {
        const badEntry = "70000000-0000-4000-8000-000000000050";
        await client.query(`INSERT INTO journal_entries
          (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
          VALUES ($1,$2,'ACCOUNTING_TEST',$3,$4,NULL,now(),$5,'unbalanced')`,
          [badEntry, ids.branch, ids.source, ids.postingBatch, ids.user]);
        await client.query(`INSERT INTO journal_lines
          (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
          VALUES ('70000000-0000-4000-8000-000000000051',$1,$2,10,0,NULL)`, [badEntry, ids.asset]);
      }, "ct_journal_entries__balanced_at_commit");

      await expectConstraint(client.query(`DELETE FROM gl_accounts WHERE id=$1`, [ids.asset]),
        "23503", "fk_gl_accounts__parent");
      await expectConstraint(client.query(`DELETE FROM posting_batches WHERE id=$1`, [ids.postingBatch]),
        "23503", "fk_journal_entries__posting_batch");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      const accountingSlice = history.rows.find((row) => row.version === "0019");
      assert.equal(accountingSlice?.name, "accounting_constraints");
      assert.match(accountingSlice?.checksum ?? "", /^[0-9a-f]{64}$/);
      const latest = history.rows.at(-1);
      assert.equal(latest?.version, "0021");
      assert.equal(latest?.name, "printing_export_reporting_read_models_constraints");
      assert.match(latest?.checksum ?? "", /^[0-9a-f]{64}$/);
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
