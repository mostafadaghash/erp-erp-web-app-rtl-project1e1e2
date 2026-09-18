import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS } from "./postgresql-schema-test-support.mjs";
import "./postgresql-finance-settlement-constraints.integration.test.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const TARGET = [
  "treasuries","receipts","disbursements","finance_categories","treasury_transfers",
  "financial_movements","treasury_balance_positions","financial_allocations","customer_advances",
  "advance_applications","cheques","installment_plans","installments",
];

const EXPECTED = {
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

test("03.G Finance / Settlement physical shape remains canonical after later 03.06 constraints", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const cols = await client.query(`
        SELECT c.relname table_name,a.attname column_name,
               pg_catalog.format_type(a.atttypid,a.atttypmod) data_type,a.attnotnull not_null
        FROM pg_catalog.pg_class c
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])
          AND a.attnum>0 AND NOT a.attisdropped
        ORDER BY c.relname,a.attnum`, [TARGET]);
      const actual = Object.fromEntries(TARGET.map((name) => [name, []]));
      for (const row of cols.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED);

      const shape = await client.query(`SELECT
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasuries' AND column_name='balance') has_balance,
        EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='treasuries' AND column_name='treasury_type') has_type`);
      assert.deepEqual(shape.rows[0], { has_balance: false, has_type: false });

      const constraints = await client.query(`SELECT count(*)::int AS count
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [TARGET]);
      assert.ok(constraints.rows[0].count > 0, "Finance tables must retain the additive 03.06 constraint layer");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.equal(history.rows.find((row) => row.version === "0008")?.name, "finance_settlement");
      const financeSlice = history.rows.find((row) => row.version === "0018");
      assert.equal(financeSlice?.name, "finance_settlement_constraints");
      assert.match(financeSlice?.checksum ?? "", /^[0-9a-f]{64}$/);
      const latest = history.rows.at(-1);
      assert.equal(latest.version, "0022");
      assert.equal(latest.name, "index_catalog");
      assert.match(latest.checksum ?? "", /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.deepEqual(second.applied, []);
    assert.deepEqual(second.skipped, MIGRATIONS);
    const verify = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.deepEqual(verify.applied, []);
    assert.deepEqual(verify.skipped, MIGRATIONS);
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
