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
const REPAIR_TABLES = ["repair_orders","repair_status_history","repair_assignments","repair_issue_reports","repair_customer_decisions","repair_tracking_tokens","customer_followups","followup_actions","followup_status_history","message_templates","notifications","notification_recipients"];
const MIGRATIONS = ["0001","0002","0003","0004","0005","0006","0007","0008","0009","0010"];

const EXPECTED_COLUMNS = {
  repair_orders: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["counterparty_id","uuid",true],["device_description","text",true],["device_serial","text",false],["reported_problem","text",true],["status","text",true],["current_technician_id","uuid",false],["received_at","timestamp with time zone",true],["completed_at","timestamp with time zone",false],["delivered_at","timestamp with time zone",false],["version","integer",true],["customer_notes","text",false],["internal_notes","text",false],["created_by","uuid",true],["created_at","timestamp with time zone",true],["updated_at","timestamp with time zone",true]],
  repair_status_history: [["id","uuid",true],["repair_order_id","uuid",true],["from_status","text",false],["to_status","text",true],["changed_by","uuid",true],["reason","text",false],["changed_at","timestamp with time zone",true]],
  repair_assignments: [["id","uuid",true],["repair_order_id","uuid",true],["technician_id","uuid",true],["assigned_at","timestamp with time zone",true],["received_by_technician_at","timestamp with time zone",false],["ended_at","timestamp with time zone",false],["assigned_by","uuid",true]],
  repair_issue_reports: [["id","uuid",true],["repair_order_id","uuid",true],["technician_id","uuid",true],["problem_report","text",true],["created_at","timestamp with time zone",true]],
  repair_customer_decisions: [["id","uuid",true],["repair_issue_report_id","uuid",true],["decision","text",true],["notes","text",false],["recorded_by","uuid",true],["recorded_at","timestamp with time zone",true]],
  repair_tracking_tokens: [["id","uuid",true],["repair_order_id","uuid",true],["token_hash","text",true],["expires_at","timestamp with time zone",true],["revoked_at","timestamp with time zone",false],["created_at","timestamp with time zone",true]],
  customer_followups: [["id","uuid",true],["counterparty_id","uuid",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",false],["source_event_id","uuid",false],["followup_type","text",true],["required_action","text",true],["priority","text",true],["assigned_user_id","uuid",true],["status","text",true],["due_at","timestamp with time zone",true],["created_at","timestamp with time zone",true],["completed_at","timestamp with time zone",false]],
  followup_actions: [["id","uuid",true],["followup_id","uuid",true],["action_type","text",true],["result","text",false],["notes","text",false],["user_id","uuid",true],["created_at","timestamp with time zone",true]],
  followup_status_history: [["id","uuid",true],["followup_id","uuid",true],["from_status","text",false],["to_status","text",true],["changed_by","uuid",true],["changed_at","timestamp with time zone",true]],
  message_templates: [["id","uuid",true],["event_key","text",true],["language","text",true],["template_text","text",true],["is_active","boolean",true],["updated_at","timestamp with time zone",true]],
  notifications: [["id","uuid",true],["event_type","text",true],["notification_type","text",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",true],["outbox_event_id","uuid",false],["title_key","text",true],["message_key","text",true],["message_params_json","jsonb",true],["created_at","timestamp with time zone",true]],
  notification_recipients: [["notification_id","uuid",true],["user_id","uuid",true],["seen_at","timestamp with time zone",false],["read_at","timestamp with time zone",false]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function cleanup() {
  await withClient(async (client) => {
    for (const table of [...REPAIR_TABLES].reverse()) await client.query(`DROP TABLE IF EXISTS public.${table}`);
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

test("03.I creates canonical Repairs / Follow-Up / Notifications schema", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanup();
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const tables = await client.query(
        `SELECT tablename FROM pg_catalog.pg_tables
         WHERE schemaname='public' AND tablename = ANY($1::text[]) ORDER BY tablename`,
        [REPAIR_TABLES],
      );
      assert.deepEqual(tables.rows.map((row) => row.tablename), [...REPAIR_TABLES].sort());

      const columns = await client.query(
        `SELECT c.relname AS table_name, a.attname AS column_name,
                pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,
                a.attnotnull AS not_null
         FROM pg_catalog.pg_class c
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
         WHERE n.nspname='public' AND c.relkind='r'
           AND c.relname = ANY($1::text[]) AND a.attnum > 0 AND NOT a.attisdropped
         ORDER BY c.relname,a.attnum`, [REPAIR_TABLES]);
      const actual = Object.fromEntries(REPAIR_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const constraints = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_constraint con
         JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [REPAIR_TABLES]);
      assert.equal(constraints.rows[0].count, 0, "03.06 Repairs/Follow-Up/Notifications constraints must remain deferred");

      const indexes = await client.query(
        `SELECT count(*)::int AS count FROM pg_catalog.pg_index i
         JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
         JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
         WHERE n.nspname='public' AND c.relname = ANY($1::text[])`, [REPAIR_TABLES]);
      assert.equal(indexes.rows[0].count, 0, "03.07 Repairs/Follow-Up/Notifications indexes must remain deferred");

      const tokenShape = await client.query(
        `SELECT
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='repair_tracking_tokens' AND column_name='token_hash') AS has_hash,
           EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='repair_tracking_tokens' AND column_name='token') AS has_plaintext_token`,
      );
      assert.equal(tokenShape.rows[0].has_hash, true);
      assert.equal(tokenShape.rows[0].has_plaintext_token, false);

      const futureDomain = await client.query("SELECT to_regclass('public.print_templates') IS NULL AS absent");
      assert.equal(futureDomain.rows[0].absent, true, "03.J Printing / Reporting must remain absent during 03.I");

      const ids = {
        counterparty: "00000000-0000-4000-8000-000000000501",
        branch: "00000000-0000-4000-8000-000000000502",
        user: "00000000-0000-4000-8000-000000000503",
        followup: "00000000-0000-4000-8000-000000000504",
        notification: "00000000-0000-4000-8000-000000000505",
      };
      await client.query(
        `INSERT INTO customer_followups
         (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
         VALUES ($1,$2,$3,'MANUAL',NULL,NULL,'CUSTOMER_CONTACT','Call customer','TODAY',$4,'OPEN',now(),now(),NULL)`,
        [ids.followup,ids.counterparty,ids.branch,ids.user],
      );
      await client.query(
        `INSERT INTO notifications
         (id,event_type,notification_type,branch_id,source_type,source_id,outbox_event_id,title_key,message_key,message_params_json,created_at)
         VALUES ($1,'RepairCompleted','REPAIR_READY',$2,'REPAIR_ORDER',$3,NULL,'notifications.repairReady.title','notifications.repairReady.message',$4::jsonb,now())`,
        [ids.notification,ids.branch,ids.followup,JSON.stringify({ documentNumber: 7 })],
      );
      await client.query(
        `INSERT INTO notification_recipients (notification_id,user_id,seen_at,read_at)
         VALUES ($1,$2,NULL,NULL)`, [ids.notification,ids.user],
      );
      const persisted = await client.query(
        `SELECT
           (SELECT source_id IS NULL FROM customer_followups WHERE id=$1) AS manual_source_is_nullable,
           (SELECT message_params_json FROM notifications WHERE id=$2) AS params,
           (SELECT seen_at IS NULL AND read_at IS NULL FROM notification_recipients WHERE notification_id=$2 AND user_id=$3) AS unseen_unread`,
        [ids.followup,ids.notification,ids.user],
      );
      assert.equal(persisted.rows[0].manual_source_is_nullable, true);
      assert.deepEqual(persisted.rows[0].params, { documentNumber: 7 });
      assert.equal(persisted.rows[0].unseen_unread, true);

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, 10);
      assert.equal(history.rows[9].version, "0010");
      assert.equal(history.rows[9].name, "repairs_followup_notifications");
      assert.match(history.rows[9].checksum, /^[0-9a-f]{64}$/);
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
