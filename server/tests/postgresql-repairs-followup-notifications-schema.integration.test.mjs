import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS, REPAIR_TABLES } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const EXPECTED_COLUMNS = {
  repair_orders: [["id","uuid",true],["branch_id","uuid",true],["document_number","bigint",true],["counterparty_id","uuid",true],["device_description","text",true],["device_serial","text",false],["reported_problem","text",true],["status","text",true],["current_technician_id","uuid",false],["received_at","timestamp with time zone",true],["completed_at","timestamp with time zone",false],["delivered_at","timestamp with time zone",false],["version","integer",true],["customer_notes","text",false],["internal_notes","text",false],["created_by","uuid",true],["created_at","timestamp with time zone",true],["updated_at","timestamp with time zone",true]],
  repair_status_history: [["id","uuid",true],["repair_order_id","uuid",true],["from_status","text",false],["to_status","text",true],["changed_by","uuid",true],["reason","text",false],["changed_at","timestamp with time zone",true]],
  repair_assignments: [["id","uuid",true],["repair_order_id","uuid",true],["technician_id","uuid",true],["assigned_at","timestamp with time zone",true],["received_by_technician_at","timestamp with time zone",false],["ended_at","timestamp with time zone",false],["assigned_by","uuid",true]],
  repair_issue_reports: [["id","uuid",true],["repair_order_id","uuid",true],["technician_id","uuid",true],["problem_report","text",true],["created_at","timestamp with time zone",true]],
  repair_customer_decisions: [["id","uuid",true],["repair_issue_report_id","uuid",true],["decision","text",true],["notes","text",false],["recorded_by","uuid",true],["recorded_at","timestamp with time zone",true]],
  repair_tracking_tokens: [["id","uuid",true],["repair_order_id","uuid",true],["token_hash","text",true],["expires_at","timestamp with time zone",true],["revoked_at","timestamp with time zone",false],["created_at","timestamp with time zone",true]],
  customer_followups: [["id","uuid",true],["counterparty_id","uuid",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",false],["source_event_id","uuid",false],["followup_type","text",true],["required_action","text",true],["priority","text",true],["assigned_user_id","uuid",true],["status","text",true],["due_at","timestamp with time zone",true],["created_at","timestamp with time zone",true],["completed_at","timestamp with time zone",false]],
  followup_actions: [["id","uuid",true],["followup_id","uuid",true],["action_type","text",true],["result","text",false],["notes","text",false],["user_id","uuid",true],["created_at","timestamp with time zone",true]],
  followup_status_history: [["followup_id","uuid",true],["from_status","text",false],["to_status","text",true],["changed_by","uuid",true],["changed_at","timestamp with time zone",true]],
  message_templates: [["id","uuid",true],["event_key","text",true],["language","text",true],["template_text","text",true],["is_active","boolean",true],["updated_at","timestamp with time zone",true]],
  notifications: [["id","uuid",true],["event_type","text",true],["notification_type","text",true],["branch_id","uuid",true],["source_type","text",true],["source_id","uuid",true],["outbox_event_id","uuid",false],["title_key","text",true],["message_key","text",true],["message_params_json","jsonb",true],["created_at","timestamp with time zone",true]],
  notification_recipients: [["notification_id","uuid",true],["user_id","uuid",true],["seen_at","timestamp with time zone",false],["read_at","timestamp with time zone",false]],
};

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function seedParents(client) {
  const ids = {
    company: "83000000-0000-4000-8000-000000000001",
    branch: "83000000-0000-4000-8000-000000000002",
    role: "83000000-0000-4000-8000-000000000003",
    user: "83000000-0000-4000-8000-000000000004",
    counterparty: "83000000-0000-4000-8000-000000000005",
  };
  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Repairs Schema Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$2,'Main','MAIN',true,now(),now())`, [ids.branch, ids.company]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'REPAIRS_SCHEMA','roles.repairsSchema',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Repairs Schema User','repairs-schema',NULL,'hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.role, ids.branch]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Repairs Schema Customer',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  return ids;
}

test("03.I Repairs / Follow-Up / Notifications physical shape remains canonical through its 03.06 constraint slice", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const tables = await client.query(`SELECT tablename FROM pg_catalog.pg_tables
        WHERE schemaname='public' AND tablename=ANY($1::text[]) ORDER BY tablename`, [REPAIR_TABLES]);
      assert.deepEqual(tables.rows.map((row) => row.tablename), [...REPAIR_TABLES].sort());

      const columns = await client.query(`SELECT c.relname AS table_name,a.attname AS column_name,
        pg_catalog.format_type(a.atttypid,a.atttypmod) AS data_type,a.attnotnull AS not_null
        FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid
        WHERE n.nspname='public' AND c.relkind='r' AND c.relname=ANY($1::text[])
          AND a.attnum>0 AND NOT a.attisdropped ORDER BY c.relname,a.attnum`, [REPAIR_TABLES]);
      const actual = Object.fromEntries(REPAIR_TABLES.map((table) => [table, []]));
      for (const row of columns.rows) actual[row.table_name].push([row.column_name,row.data_type,row.not_null]);
      assert.deepEqual(actual, EXPECTED_COLUMNS);

      const requiredConstraints = [
        "pk_repair_orders","uq_repair_orders__branch_document","pk_repair_status_history",
        "pk_repair_assignments","pk_repair_issue_reports","pk_repair_customer_decisions",
        "uq_repair_customer_decisions__issue","pk_repair_tracking_tokens","pk_customer_followups",
        "pk_followup_actions","pk_followup_status_history","pk_message_templates","pk_notifications",
        "pk_notification_recipients","ck_repair_orders__status","ck_repair_customer_decisions__decision",
        "ck_customer_followups__source_type","fk_customer_followups__source_event","fk_notifications__outbox_event",
      ];
      const constraints = await client.query(`SELECT conname FROM pg_catalog.pg_constraint
        WHERE conname=ANY($1::text[]) ORDER BY conname`, [requiredConstraints]);
      assert.equal(constraints.rowCount, requiredConstraints.length);

      const independentIndexes = await client.query(`SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND c.relname=ANY($1::text[]) AND con.oid IS NULL ORDER BY idx.relname`, [REPAIR_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 partial/query Repairs/Follow-Up/Notifications indexes remain deferred");

      const tokenShape = await client.query(`SELECT
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='repair_tracking_tokens' AND column_name='token_hash') AS has_hash,
        EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='repair_tracking_tokens' AND column_name='token') AS has_plaintext_token`);
      assert.deepEqual(tokenShape.rows[0], { has_hash: true, has_plaintext_token: false });

      const laterDomain = await client.query("SELECT to_regclass('public.print_templates') IS NOT NULL AS present");
      assert.equal(laterDomain.rows[0].present, true);

      const ids = await seedParents(client);
      const followup = "83000000-0000-4000-8000-000000000010";
      const notification = "83000000-0000-4000-8000-000000000011";
      await client.query(`INSERT INTO customer_followups
        (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
        VALUES ($1,$2,$3,'MANUAL',NULL,NULL,'CUSTOMER_CONTACT','Call customer','TODAY',$4,'OPEN',now(),now(),NULL)`,
        [followup, ids.counterparty, ids.branch, ids.user]);
      await client.query(`INSERT INTO notifications
        (id,event_type,notification_type,branch_id,source_type,source_id,outbox_event_id,title_key,message_key,message_params_json,created_at)
        VALUES ($1,'RepairCompleted','REPAIR_READY',$2,'REPAIR_ORDER',$3,NULL,'notifications.repairReady.title','notifications.repairReady.message',$4::jsonb,now())`,
        [notification, ids.branch, followup, JSON.stringify({ documentNumber: 7 })]);
      await client.query(`INSERT INTO notification_recipients (notification_id,user_id,seen_at,read_at)
        VALUES ($1,$2,NULL,NULL)`, [notification, ids.user]);

      const persisted = await client.query(`SELECT
        (SELECT source_id IS NULL FROM customer_followups WHERE id=$1) AS manual_source_is_nullable,
        (SELECT message_params_json FROM notifications WHERE id=$2) AS params,
        (SELECT seen_at IS NULL AND read_at IS NULL FROM notification_recipients WHERE notification_id=$2 AND user_id=$3) AS unseen_unread`,
        [followup, notification, ids.user]);
      assert.equal(persisted.rows[0].manual_source_is_nullable, true);
      assert.deepEqual(persisted.rows[0].params, { documentNumber: 7 });
      assert.equal(persisted.rows[0].unseen_unread, true);

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.equal(history.rows.find((row) => row.version === "0010")?.name, "repairs_followup_notifications");
      const slice = history.rows.find((row) => row.version === "0020");
      assert.equal(slice?.name, "repairs_followup_notifications_constraints");
      assert.match(slice?.checksum ?? "", /^[0-9a-f]{64}$/);
      assert.equal(history.rows.at(-1)?.version, "0020");
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
