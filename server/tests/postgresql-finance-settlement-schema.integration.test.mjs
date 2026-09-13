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
const MIGRATIONS = ["0001","0002","0003","0004","0005","0006","0007","0008"];

const EXPECTED_COLUMNS = {
  treasuries: [["id","uuid",true],["branch_id","uuid",true],["name","text",true],["is_active","boolean",true],["notes","text",false],["created_at","timestamp with time zone",true]],
  receipts: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["treasury_id","uuid",true],["counterparty_id","uuid",false],["amount","numeric(18,4)",true],["category_id","uuid",false],["reference","text",false],["notes","text",false],["occurred_at","timestamp with time zone",true],["posted_at","timestamp with time zone",true],["created_by","uuid",true]],
  disbursements: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["treasury_id","uuid",true],["counterparty_id","uuid",false],["amount","numeric(18,4)",true],["category_id","uuid",false],["reference","text",false],["notes","text",false],["occurred_at","timestamp with time zone",true],["posted_at","timestamp with time zone",true],["created_by","uuid",true]],
  finance_categories: [["id","uuid",true],["name","text",true],["category_type","text",true],["gl_account_id","uuid",true],["is_active","boolean",true]],
  treasury_transfers: [["id","uuid",true],["issuing_branch_id","uuid",true],["document_number","bigint",true],["from_treasury_id","uuid",true],["to_treasury_id","uuid",true],["amount","numeric(18,4)",true],["reference","text",false],["notes","text",false],["occurred_at","timestamp with time zone",true],["posted_at","timestamp with time zone",true],["created_by","uuid",true]],
  financial_movements: [["id","uuid",true],["treasury_id","uuid",true],["branch_id","uuid",true],["direction","text",true],["amount","numeric(18,4)",true],["source_type","text",true],["source_id","uuid",true],["posting_batch_id","uuid",true],["counterparty_id","uuid",false],["occurred_at","timestamp with time zone",true],["created_by","uuid",true]],
  treasury_balance_positions: [["treasury_id","uuid",true],["current_balance","numeric(18,4)",true],["version","integer",true],["updated_at","timestamp with time zone",true]],
  financial_allocations: [["id","uuid",true],["financial_source_type","text",true],["financial_source_id","uuid",true],["target_type","text",true],["target_id","uuid",true],["amount","numeric(18,4)",true],["created_at","timestamp with time zone",true]],
  customer_advances: [["id","uuid",true],["counterparty_id","uuid",true],["sales_order_id","uuid",true],["receipt_id","uuid",true],["original_amount","numeric(18,4)",true],["remaining_amount_projection","numeric(18,4)",true],["created_at","timestamp with time zone",true]],
  advance_applications: [["id","uuid",true],["advance_id","uuid",true],["sales_invoice_id","uuid",true],["amount","numeric(18,4)",true],["applied_at","timestamp with time zone",true]],
  cheques: [["id","uuid",true],["branch_id","uuid",true],["counterparty_id","uuid",true],["direction","text",true],["cheque_number","text",true],["bank_name","text",true],["amount","numeric(18,4)",true],["due_date","date",true],["status","text",true],["source_type","text",true],["source_id","uuid",true],["settlement_financial_movement_id","uuid",false],["notes","text",false],["created_at","timestamp with time zone",true]],
  installment_plans: [["id","uuid",true],["counterparty_id","uuid",true],["source_type","text",true],["source_id","uuid",true],["total_amount","numeric(18,4)",true],["created_at","timestamp with time zone",true]],
  installments: [["id","uuid",true],["plan_id","uuid",true],["due_date","date",true],["amount","numeric(18,4)",true],["paid_amount_projection","numeric(18,4)",true],["status","text",true]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
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

test("03.G creates the canonical Finance / Settlement schema", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedTables = [...CORE_TABLES,...COUNTERPARTY_TABLES,...PRODUCT_TABLES,...INVENTORY_TABLES,...SALES_TABLES,...PURCHASING_TABLES,...FINANCE_TABLES].sort();
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
         ORDER BY c.relname,a.attnum`, [FINANCE_TABLES]);
      const actual = Object.fromEntries(FINANCE_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [FINANCE_TABLES]);
      assert.equal(constraints.rows[0].count, 0, "03.06 constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [FINANCE_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 indexes must remain deferred");

      const treasuryShape = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasuries' AND column_name='balance') AS has_balance,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasuries' AND column_name='treasury_type') AS has_type`,
      );
      assert.equal(treasuryShape.rows[0].has_balance, false);
      assert.equal(treasuryShape.rows[0].has_type, false);

      const futureDomain = await client.query("SELECT to_regclass('public.gl_accounts') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.H Accounting must remain absent");

      const ids = {
        branch: "00000000-0000-4000-8000-000000000301",
        treasury: "00000000-0000-4000-8000-000000000302",
        source: "00000000-0000-4000-8000-000000000303",
        batch: "00000000-0000-4000-8000-000000000304",
        user: "00000000-0000-4000-8000-000000000305",
        receipt: "00000000-0000-4000-8000-000000000306",
        cheque: "00000000-0000-4000-8000-000000000307",
        counterparty: "00000000-0000-4000-8000-000000000308",
      };
      await client.query(
        `INSERT INTO receipts
         (id,branch_id,document_number,treasury_id,counterparty_id,amount,category_id,reference,notes,occurred_at,posted_at,created_by)
         VALUES ($1,$2,1,$3,NULL,12345678901234.5678,NULL,NULL,NULL,now(),now(),$4)`,
        [ids.receipt,ids.branch,ids.treasury,ids.user],
      );
      await client.query(
        `INSERT INTO financial_movements
         (id,treasury_id,branch_id,direction,amount,source_type,source_id,posting_batch_id,counterparty_id,occurred_at,created_by)
         VALUES ('00000000-0000-4000-8000-000000000309',$1,$2,'IN',12345678901234.5678,'RECEIPT',$3,$4,NULL,now(),$5)`,
        [ids.treasury,ids.branch,ids.source,ids.batch,ids.user],
      );
      await client.query(
        `INSERT INTO treasury_balance_positions (treasury_id,current_balance,version,updated_at)
         VALUES ($1,12345678901234.5678,7,now())`, [ids.treasury],
      );
      await client.query(
        `INSERT INTO cheques
         (id,branch_id,counterparty_id,direction,cheque_number,bank_name,amount,due_date,status,source_type,source_id,settlement_financial_movement_id,notes,created_at)
         VALUES ($1,$2,$3,'RECEIVABLE','CHK-1','Test Bank',1000.0000,CURRENT_DATE,'PENDING','SALES_INVOICE',$4,NULL,NULL,now())`,
        [ids.cheque,ids.branch,ids.counterparty,ids.source],
      );
      const exactValues = await client.query(
        `SELECT
           (SELECT amount::text FROM receipts WHERE id=$1) AS receipt_amount,
           (SELECT amount::text FROM financial_movements WHERE source_id=$2) AS movement_amount,
           (SELECT current_balance::text FROM treasury_balance_positions WHERE treasury_id=$3) AS projected_balance,
           (SELECT settlement_financial_movement_id IS NULL FROM cheques WHERE id=$4) AS pending_cheque_unsettled`,
        [ids.receipt,ids.source,ids.treasury,ids.cheque],
      );
      assert.deepEqual(exactValues.rows[0], {
        receipt_amount: "12345678901234.5678",
        movement_amount: "12345678901234.5678",
        projected_balance: "12345678901234.5678",
        pending_cheque_unsettled: true,
      });

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 8);
      assert.equal(history.rows[7].version, "0008");
      assert.equal(history.rows[7].name, "finance_settlement");
      assert.match(history.rows[7].checksum, /^[0-9a-f]{64}$/);
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
