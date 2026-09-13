import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const CORE_TABLES = ["companies","company_phones","company_settings","branches","branch_settings","warehouses","users","auth_sessions","roles","permissions","role_permissions","user_permission_overrides","user_branch_access","document_sequences","idempotency_keys","posting_batches","audit_logs","outbox_events","document_tombstones"];
const COUNTERPARTY_TABLES = ["counterparties","counterparty_roles","customer_profiles","supplier_profiles","customer_ledger_entries","supplier_ledger_entries"];
const PRODUCT_TABLES = ["product_categories","products","product_variants","units","product_units","variant_barcodes","attributes","attribute_values","product_attributes","variant_attribute_values","price_lists","price_list_items","reorder_levels"];
const INVENTORY_TABLES = ["serial_numbers","batches","inventory_movements","inventory_movement_lines","inventory_line_serials","inventory_line_batches","inventory_stock_positions","variant_warehouse_cost_projection","batch_stock_positions","stock_reservations","stock_transfers","stock_transfer_lines","stocktake_sessions","stocktake_lines","stocktake_line_serials","stocktake_line_batches","inventory_adjustments","inventory_adjustment_lines","inventory_adjustment_line_serials","inventory_adjustment_line_batches"];
const SALES_TABLES = ["sales_quotes","sales_quote_lines","sales_orders","sales_order_lines","sales_order_status_history","sales_order_shipping_details","sales_order_deliveries","sales_order_delivery_lines","sales_invoices","sales_invoice_lines","sales_returns","sales_return_lines"];
const PURCHASING_TABLES = ["purchase_invoices","purchase_invoice_lines","purchase_returns","purchase_return_lines","tax_codes"];
const FINANCE_TABLES = ["treasuries","receipts","disbursements","finance_categories","treasury_transfers","financial_movements","treasury_balance_positions","financial_allocations","customer_advances","advance_applications","cheques","installment_plans","installments"];
const ACCOUNTING_TABLES = ["gl_accounts","journal_entries","journal_lines"];
const MIGRATIONS = ["0001","0002","0003","0004","0005","0006","0007","0008","0009"];

const EXPECTED_COLUMNS = {
  gl_accounts: [["id","uuid",true],["company_id","uuid",true],["code","text",true],["name","text",true],["account_type","text",true],["parent_id","uuid",false],["is_system","boolean",true],["is_active","boolean",true]],
  journal_entries: [["id","uuid",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["reversal_of_entry_id","uuid",false],["posted_at","timestamp with time zone",true],["created_by","uuid",true],["description","text",false]],
  journal_lines: [["id","uuid",true],["journal_entry_id","uuid",true],["gl_account_id","uuid",true],["debit","numeric(18,4)",true],["credit","numeric(18,4)",true],["counterparty_id","uuid",false]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    for (const table of [...ACCOUNTING_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP FUNCTION IF EXISTS public.fn_journal_entries_balanced_at_commit()");
    for (const table of [...FINANCE_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP VIEW IF EXISTS public.purchase_returnable_quantities_v");
    await client.query("DROP VIEW IF EXISTS public.sales_returnable_quantities_v");
    for (const table of [...PURCHASING_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...SALES_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...INVENTORY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...PRODUCT_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...COUNTERPARTY_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    for (const table of [...CORE_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
    await client.query("DROP TABLE IF EXISTS public.schema_migrations");
    await client.query("DROP EXTENSION IF EXISTS pg_trgm");
  });
}

test("03.H creates canonical Accounting schema and enforces deferred journal balance at COMMIT", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedTables = [...CORE_TABLES,...COUNTERPARTY_TABLES,...PRODUCT_TABLES,...INVENTORY_TABLES,...SALES_TABLES,...PURCHASING_TABLES,...FINANCE_TABLES,...ACCOUNTING_TABLES].sort();
      const allTables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname='public' AND tablename <> 'schema_migrations' ORDER BY tablename`,
      );
      assert.deepEqual(allTables.rows.map((row) => row.tablename), expectedTables);

      const columns = await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
         WHERE n.nspname='public' AND c.relkind='r'
           AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname,a.attnum`, [ACCOUNTING_TABLES]);
      const actual = Object.fromEntries(ACCOUNTING_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const constraints = await client.query(
        `SELECT con.conname, c.relname AS table_name, con.contype
         FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])
         ORDER BY con.conname`, [ACCOUNTING_TABLES]);
      assert.deepEqual(constraints.rows, [{
        conname: "ct_journal_entries__balanced_at_commit",
        table_name: "journal_lines",
        contype: "t",
      }], "only the explicitly authorized 03.H deferred balance constraint trigger may exist before 03.06");

      const trigger = await client.query(
        `SELECT t.tgname, t.tgdeferrable, t.tginitdeferred, p.proname
         FROM pg_catalog.pg_trigger t
         JOIN pg_catalog.pg_class c ON c.oid=t.tgrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_proc p ON p.oid=t.tgfoid
         WHERE n.nspname='public' AND c.relname='journal_lines'
           AND t.tgname='ct_journal_entries__balanced_at_commit' AND NOT t.tgisinternal`,
      );
      assert.deepEqual(trigger.rows, [{
        tgname: "ct_journal_entries__balanced_at_commit",
        tgdeferrable: true,
        tginitdeferred: true,
        proname: "fn_journal_entries_balanced_at_commit",
      }]);

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [ACCOUNTING_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const futureDomain = await client.query("SELECT to_regclass('public.repair_orders') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.I Repairs must remain absent");

      const ids = {
        branch: "00000000-0000-4000-8000-000000000401",
        user: "00000000-0000-4000-8000-000000000402",
        source: "00000000-0000-4000-8000-000000000403",
        batch: "00000000-0000-4000-8000-000000000404",
        entry: "00000000-0000-4000-8000-000000000405",
        debitLine: "00000000-0000-4000-8000-000000000406",
        creditLine: "00000000-0000-4000-8000-000000000407",
        debitAccount: "00000000-0000-4000-8000-000000000408",
        creditAccount: "00000000-0000-4000-8000-000000000409",
        unbalancedEntry: "00000000-0000-4000-8000-000000000410",
        unbalancedLine: "00000000-0000-4000-8000-000000000411",
      };

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO journal_entries
         (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
         VALUES ($1,$2,'TEST',$3,$4,NULL,now(),$5,'balanced journal test')`,
        [ids.entry,ids.branch,ids.source,ids.batch,ids.user],
      );
      await client.query(
        `INSERT INTO journal_lines (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
         VALUES ($1,$2,$3,12345678901234.5678,0.0000,NULL),
                ($4,$2,$5,0.0000,12345678901234.5678,NULL)`,
        [ids.debitLine,ids.entry,ids.debitAccount,ids.creditLine,ids.creditAccount],
      );
      await client.query("COMMIT");

      const exactBalance = await client.query(
        `SELECT SUM(debit)::text AS debit, SUM(credit)::text AS credit
         FROM journal_lines WHERE journal_entry_id=$1`, [ids.entry]);
      assert.deepEqual(exactBalance.rows[0], {
        debit: "12345678901234.5678",
        credit: "12345678901234.5678",
      });

      await client.query("BEGIN");
      await client.query(
        `INSERT INTO journal_entries
         (id,branch_id,source_type,source_id,posting_batch_id,reversal_of_entry_id,posted_at,created_by,description)
         VALUES ($1,$2,'TEST',$3,$4,NULL,now(),$5,'must fail at commit')`,
        [ids.unbalancedEntry,ids.branch,ids.source,ids.batch,ids.user],
      );
      await client.query(
        `INSERT INTO journal_lines (id,journal_entry_id,gl_account_id,debit,credit,counterparty_id)
         VALUES ($1,$2,$3,10.0000,0.0000,NULL)`,
        [ids.unbalancedLine,ids.unbalancedEntry,ids.debitAccount],
      );
      const visibleBeforeCommit = await client.query(
        "SELECT count(*)::int AS count FROM journal_lines WHERE journal_entry_id=$1", [ids.unbalancedEntry]);
      assert.equal(visibleBeforeCommit.rows[0].count, 1, "balance enforcement must remain deferred until commit");
      await assert.rejects(
        client.query("COMMIT"),
        (error) => error?.code === "23514" && error?.constraint === "ct_journal_entries__balanced_at_commit",
      );
      await client.query("ROLLBACK");
      const rolledBack = await client.query(
        "SELECT count(*)::int AS count FROM journal_entries WHERE id=$1", [ids.unbalancedEntry]);
      assert.equal(rolledBack.rows[0].count, 0);

      await client.query("BEGIN");
      await client.query("UPDATE journal_lines SET debit=12345678901235.5678 WHERE id=$1", [ids.debitLine]);
      await assert.rejects(
        client.query("COMMIT"),
        (error) => error?.code === "23514" && error?.constraint === "ct_journal_entries__balanced_at_commit",
      );
      await client.query("ROLLBACK");
      const afterFailedUpdate = await client.query(
        "SELECT debit::text AS debit FROM journal_lines WHERE id=$1", [ids.debitLine]);
      assert.equal(afterFailedUpdate.rows[0].debit, "12345678901234.5678");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 9);
      assert.equal(history.rows[8].version, "0009");
      assert.equal(history.rows[8].name, "accounting");
      assert.match(history.rows[8].checksum, /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verification.applied, []);
    assert.deepEqual(verification.skipped, MIGRATIONS);
  } finally {
    await cleanup();
  }
});
