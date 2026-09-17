import assert from "node:assert/strict";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, MIGRATIONS, REPAIR_TABLES } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const REPAIR_STATUSES = [
  "WAITING",
  "HANDED_TO_TECHNICIAN",
  "IN_REPAIR",
  "NEW_PROBLEM",
  "CUSTOMER_APPROVED",
  "TECHNICIAN_REJECTED",
  "CUSTOMER_REJECTED",
  "REPAIRED",
  "DELIVERED",
];

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try { return await fn(client); } finally { await client.end(); }
}

async function expectConstraint(promise, code, constraint) {
  await assert.rejects(promise, (error) =>
    error?.code === code && (constraint === undefined || error?.constraint === constraint));
}

async function seedFixture(client) {
  const ids = {
    company: "80000000-0000-4000-8000-000000000001",
    branch1: "80000000-0000-4000-8000-000000000002",
    branch2: "80000000-0000-4000-8000-000000000003",
    role: "80000000-0000-4000-8000-000000000004",
    user: "80000000-0000-4000-8000-000000000005",
    technician: "80000000-0000-4000-8000-000000000006",
    counterparty: "80000000-0000-4000-8000-000000000007",
    repair: "80000000-0000-4000-8000-000000000008",
    issue: "80000000-0000-4000-8000-000000000009",
    outbox1: "80000000-0000-4000-8000-000000000010",
    outbox2: "80000000-0000-4000-8000-000000000011",
  };

  await client.query(`INSERT INTO companies
    (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
    VALUES ($1,'Repairs Constraint Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`, [ids.company]);
  await client.query(`INSERT INTO branches
    (id,company_id,name,code,is_active,created_at,updated_at)
    VALUES ($1,$3,'Main','MAIN',true,now(),now()),($2,$3,'Second','SECOND',true,now(),now())`,
    [ids.branch1, ids.branch2, ids.company]);
  await client.query(`INSERT INTO roles (id,role_key,display_name_key,is_system)
    VALUES ($1,'REPAIRS_TEST','roles.repairsTest',true)`, [ids.role]);
  await client.query(`INSERT INTO users
    (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
    VALUES ($1,'Repairs User','repairs-test',NULL,'hash',$3,$4,'ALL','ar-EG',true,now(),now()),
           ($2,'Repairs Technician','repairs-tech',NULL,'hash',$3,$4,'ALL','ar-EG',true,now(),now())`,
    [ids.user, ids.technician, ids.role, ids.branch1]);
  await client.query(`INSERT INTO counterparties
    (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
    VALUES ($1,'Repair Customer',NULL,NULL,NULL,NULL,true,now(),now())`, [ids.counterparty]);
  await client.query(`INSERT INTO counterparty_roles (counterparty_id,role) VALUES ($1,'CUSTOMER')`, [ids.counterparty]);
  await client.query(`INSERT INTO outbox_events
    (id,event_type,aggregate_type,aggregate_id,payload_json,created_at,processed_at,retry_count)
    VALUES ($1,'RepairCompleted','REPAIR_ORDER',$3,'{}'::jsonb,now(),NULL,0),
           ($2,'RepairProblemReported','REPAIR_ORDER',$3,'{}'::jsonb,now(),NULL,0)`,
    [ids.outbox1, ids.outbox2, ids.repair]);

  await client.query(`INSERT INTO repair_orders
    (id,branch_id,document_number,counterparty_id,device_description,device_serial,reported_problem,status,current_technician_id,received_at,completed_at,delivered_at,version,customer_notes,internal_notes,created_by,created_at,updated_at)
    VALUES ($1,$2,1,$3,'Phone','SN-1','No power','WAITING',$4,now(),NULL,NULL,0,NULL,NULL,$5,now(),now())`,
    [ids.repair, ids.branch1, ids.counterparty, ids.technician, ids.user]);
  await client.query(`INSERT INTO repair_status_history
    (id,repair_order_id,from_status,to_status,changed_by,reason,changed_at)
    VALUES ('80000000-0000-4000-8000-000000000012',$1,NULL,'WAITING',$2,NULL,now())`,
    [ids.repair, ids.user]);
  await client.query(`INSERT INTO repair_issue_reports
    (id,repair_order_id,technician_id,problem_report,created_at)
    VALUES ($1,$2,$3,'Board issue',now())`, [ids.issue, ids.repair, ids.technician]);

  return ids;
}

test("03.06 Repairs / Follow-Up / Notifications constraints enforce canonical integrity on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.deepEqual(first.applied, MIGRATIONS);
    assert.deepEqual(first.skipped, []);

    await withClient(async (client) => {
      const expectedConstraints = [
        "pk_repair_orders","uq_repair_orders__branch_document","pk_repair_status_history",
        "pk_repair_assignments","pk_repair_issue_reports","pk_repair_customer_decisions",
        "uq_repair_customer_decisions__issue","pk_repair_tracking_tokens","pk_customer_followups",
        "pk_followup_actions","pk_followup_status_history","pk_message_templates","pk_notifications",
        "pk_notification_recipients","fk_repair_orders__branch","fk_repair_orders__counterparty",
        "fk_repair_orders__current_technician","fk_repair_orders__created_by",
        "fk_repair_status_history__repair_order","fk_repair_status_history__changed_by",
        "fk_repair_assignments__repair_order","fk_repair_assignments__technician",
        "fk_repair_assignments__assigned_by","fk_repair_issue_reports__repair_order",
        "fk_repair_issue_reports__technician","fk_repair_customer_decisions__issue_report",
        "fk_repair_customer_decisions__recorded_by","fk_repair_tracking_tokens__repair_order",
        "fk_customer_followups__counterparty","fk_customer_followups__branch",
        "fk_customer_followups__assigned_user","fk_customer_followups__source_event",
        "fk_followup_actions__followup","fk_followup_actions__user",
        "fk_followup_status_history__followup","fk_followup_status_history__changed_by",
        "fk_notifications__branch","fk_notifications__outbox_event",
        "fk_notification_recipients__notification","fk_notification_recipients__user",
        "ck_repair_orders__document_number_positive","ck_repair_orders__version_nonnegative",
        "ck_repair_orders__status","ck_repair_status_history__from_status",
        "ck_repair_status_history__to_status","ck_repair_customer_decisions__decision",
        "ck_customer_followups__source_type",
      ];
      const constraints = await client.query(`SELECT conname,contype FROM pg_catalog.pg_constraint
        WHERE conname = ANY($1::text[]) ORDER BY conname`, [expectedConstraints]);
      assert.equal(constraints.rowCount, expectedConstraints.length);

      const followupHistoryPk = await client.query(`SELECT pg_get_constraintdef(oid) AS definition
        FROM pg_catalog.pg_constraint WHERE conname='pk_followup_status_history'`);
      assert.match(followupHistoryPk.rows[0].definition, /PRIMARY KEY \(followup_id, changed_at\)/);

      const independentIndexes = await client.query(`
        SELECT idx.relname AS index_name
        FROM pg_catalog.pg_index i
        JOIN pg_catalog.pg_class tbl ON tbl.oid=i.indrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=tbl.relnamespace
        JOIN pg_catalog.pg_class idx ON idx.oid=i.indexrelid
        LEFT JOIN pg_catalog.pg_constraint con ON con.conindid=i.indexrelid
        WHERE n.nspname='public' AND tbl.relname=ANY($1::text[]) AND con.oid IS NULL
        ORDER BY idx.relname`, [REPAIR_TABLES]);
      assert.deepEqual(independentIndexes.rows, [], "03.07 partial/query Repairs/Follow-Up/Notifications indexes must remain deferred");

      const fakeSourceFks = await client.query(`SELECT count(*)::int AS count
        FROM pg_catalog.pg_constraint con
        JOIN pg_catalog.pg_class c ON c.oid=con.conrelid
        JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relname IN ('customer_followups','notifications')
          AND con.contype='f' AND pg_get_constraintdef(con.oid) ILIKE '%FOREIGN KEY (source_id)%'`);
      assert.equal(fakeSourceFks.rows[0].count, 0, "polymorphic source_id must not receive a fake conventional FK");

      const ids = await seedFixture(client);

      await expectConstraint(client.query(`INSERT INTO repair_orders
        (id,branch_id,document_number,counterparty_id,device_description,device_serial,reported_problem,status,current_technician_id,received_at,completed_at,delivered_at,version,customer_notes,internal_notes,created_by,created_at,updated_at)
        VALUES ('80000000-0000-4000-8000-000000000020',$1,1,$2,'Tablet',NULL,'Broken','WAITING',NULL,now(),NULL,NULL,0,NULL,NULL,$3,now(),now())`,
        [ids.branch1, ids.counterparty, ids.user]), "23505", "uq_repair_orders__branch_document");

      await expectConstraint(client.query(`UPDATE repair_orders SET status='INVALID' WHERE id=$1`, [ids.repair]),
        "23514", "ck_repair_orders__status");
      await expectConstraint(client.query(`UPDATE repair_orders SET document_number=0 WHERE id=$1`, [ids.repair]),
        "23514", "ck_repair_orders__document_number_positive");
      await expectConstraint(client.query(`UPDATE repair_orders SET version=-1 WHERE id=$1`, [ids.repair]),
        "23514", "ck_repair_orders__version_nonnegative");

      for (let index = 0; index < REPAIR_STATUSES.length; index += 1) {
        const id = `81000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
        await client.query(`INSERT INTO repair_orders
          (id,branch_id,document_number,counterparty_id,device_description,device_serial,reported_problem,status,current_technician_id,received_at,completed_at,delivered_at,version,customer_notes,internal_notes,created_by,created_at,updated_at)
          VALUES ($1,$2,$3,$4,'Status probe',NULL,'Probe',$5,NULL,now(),NULL,NULL,0,NULL,NULL,$6,now(),now())`,
          [id, ids.branch2, index + 100, ids.counterparty, REPAIR_STATUSES[index], ids.user]);
      }
      const acceptedStatuses = await client.query(`SELECT array_agg(status ORDER BY status) AS statuses
        FROM repair_orders WHERE branch_id=$1 AND document_number>=100`, [ids.branch2]);
      assert.deepEqual(acceptedStatuses.rows[0].statuses, [...REPAIR_STATUSES].sort());

      await expectConstraint(client.query(`INSERT INTO repair_status_history
        (id,repair_order_id,from_status,to_status,changed_by,reason,changed_at)
        VALUES ('80000000-0000-4000-8000-000000000021',$1,'INVALID','IN_REPAIR',$2,NULL,now())`,
        [ids.repair, ids.user]), "23514", "ck_repair_status_history__from_status");
      await expectConstraint(client.query(`INSERT INTO repair_status_history
        (id,repair_order_id,from_status,to_status,changed_by,reason,changed_at)
        VALUES ('80000000-0000-4000-8000-000000000022',$1,'WAITING','INVALID',$2,NULL,now())`,
        [ids.repair, ids.user]), "23514", "ck_repair_status_history__to_status");

      await client.query(`INSERT INTO repair_customer_decisions
        (id,repair_issue_report_id,decision,notes,recorded_by,recorded_at)
        VALUES ('80000000-0000-4000-8000-000000000023',$1,'APPROVED',NULL,$2,now())`, [ids.issue, ids.user]);
      await expectConstraint(client.query(`INSERT INTO repair_customer_decisions
        (id,repair_issue_report_id,decision,notes,recorded_by,recorded_at)
        VALUES ('80000000-0000-4000-8000-000000000024',$1,'REJECTED',NULL,$2,now())`,
        [ids.issue, ids.user]), "23505", "uq_repair_customer_decisions__issue");
      await expectConstraint(client.query(`INSERT INTO repair_customer_decisions
        (id,repair_issue_report_id,decision,notes,recorded_by,recorded_at)
        VALUES ('80000000-0000-4000-8000-000000000025','ffffffff-ffff-4fff-8fff-ffffffffffff','INVALID',NULL,$1,now())`,
        [ids.user]), "23514", "ck_repair_customer_decisions__decision");

      const followup1 = "80000000-0000-4000-8000-000000000030";
      const followup2 = "80000000-0000-4000-8000-000000000031";
      await client.query(`INSERT INTO customer_followups
        (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
        VALUES ($1,$3,$4,'REPAIR_ORDER',$5,$6,'CUSTOMER_CONTACT','Call customer','URGENT',$7,'OPEN',now(),now(),NULL),
               ($2,$3,$4,'REPAIR_ORDER',$5,$6,'CUSTOMER_CONTACT','Retry-safe probe','URGENT',$7,'OPEN',now(),now(),NULL)`,
        [followup1, followup2, ids.counterparty, ids.branch1, ids.repair, ids.outbox1, ids.user]);
      const duplicateSourceEvent = await client.query(`SELECT count(*)::int AS count FROM customer_followups WHERE source_event_id=$1`, [ids.outbox1]);
      assert.equal(duplicateSourceEvent.rows[0].count, 2, "source_event partial uniqueness remains intentionally deferred to 03.07");

      for (const [index, sourceType] of ["SALES_ORDER", "REPAIR_ORDER", "MANUAL"].entries()) {
        await client.query(`INSERT INTO customer_followups
          (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
          VALUES ($1,$2,$3,$4,$5,NULL,'SOURCE_PROBE','Probe','LATER',$6,'OPEN',now(),now(),NULL)`,
          [`82000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, ids.counterparty, ids.branch1, sourceType,
            sourceType === "MANUAL" ? null : ids.repair, ids.user]);
      }
      await expectConstraint(client.query(`INSERT INTO customer_followups
        (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
        VALUES ('80000000-0000-4000-8000-000000000032',$1,$2,'INVALID',NULL,NULL,'BAD','Bad','LATER',$3,'OPEN',now(),now(),NULL)`,
        [ids.counterparty, ids.branch1, ids.user]), "23514", "ck_customer_followups__source_type");
      await expectConstraint(client.query(`INSERT INTO customer_followups
        (id,counterparty_id,branch_id,source_type,source_id,source_event_id,followup_type,required_action,priority,assigned_user_id,status,due_at,created_at,completed_at)
        VALUES ('80000000-0000-4000-8000-000000000033',$1,$2,'MANUAL',NULL,'ffffffff-ffff-4fff-8fff-ffffffffffff','BAD_EVENT','Bad event','LATER',$3,'OPEN',now(),now(),NULL)`,
        [ids.counterparty, ids.branch1, ids.user]), "23503", "fk_customer_followups__source_event");

      await client.query(`INSERT INTO followup_actions
        (id,followup_id,action_type,result,notes,user_id,created_at)
        VALUES ('80000000-0000-4000-8000-000000000034',$1,'CALL','CONTACTED',NULL,$2,now())`, [followup1, ids.user]);
      await client.query(`INSERT INTO followup_status_history
        (followup_id,from_status,to_status,changed_by,changed_at)
        VALUES ($1,'OPEN','LATER',$2,now())`, [followup1, ids.user]);

      await client.query(`INSERT INTO repair_assignments
        (id,repair_order_id,technician_id,assigned_at,received_by_technician_at,ended_at,assigned_by)
        VALUES ('80000000-0000-4000-8000-000000000040',$1,$2,now(),NULL,NULL,$3),
               ('80000000-0000-4000-8000-000000000041',$1,$2,now(),NULL,NULL,$3)`, [ids.repair, ids.technician, ids.user]);
      const duplicateActiveAssignment = await client.query(`SELECT count(*)::int AS count FROM repair_assignments WHERE repair_order_id=$1 AND ended_at IS NULL`, [ids.repair]);
      assert.equal(duplicateActiveAssignment.rows[0].count, 2, "active-assignment partial uniqueness remains intentionally deferred to 03.07");

      const notification1 = "80000000-0000-4000-8000-000000000050";
      const notification2 = "80000000-0000-4000-8000-000000000051";
      await client.query(`INSERT INTO notifications
        (id,event_type,notification_type,branch_id,source_type,source_id,outbox_event_id,title_key,message_key,message_params_json,created_at)
        VALUES ($1,'RepairCompleted','REPAIR_READY',$3,'REPAIR_ORDER',$4,$5,'repair.ready.title','repair.ready.message','{}'::jsonb,now()),
               ($2,'RepairCompleted','REPAIR_READY',$3,'REPAIR_ORDER',$4,$5,'repair.ready.title','repair.ready.message','{}'::jsonb,now())`,
        [notification1, notification2, ids.branch1, ids.repair, ids.outbox2]);
      const duplicateNotification = await client.query(`SELECT count(*)::int AS count FROM notifications WHERE outbox_event_id=$1 AND notification_type='REPAIR_READY'`, [ids.outbox2]);
      assert.equal(duplicateNotification.rows[0].count, 2, "notification outbox/type partial uniqueness remains intentionally deferred to 03.07");

      await expectConstraint(client.query(`INSERT INTO notifications
        (id,event_type,notification_type,branch_id,source_type,source_id,outbox_event_id,title_key,message_key,message_params_json,created_at)
        VALUES ('80000000-0000-4000-8000-000000000052','RepairCompleted','REPAIR_READY',$1,'REPAIR_ORDER',$2,'ffffffff-ffff-4fff-8fff-ffffffffffff','x','y','{}'::jsonb,now())`,
        [ids.branch1, ids.repair]), "23503", "fk_notifications__outbox_event");

      await client.query(`INSERT INTO notification_recipients (notification_id,user_id,seen_at,read_at)
        VALUES ($1,$2,NULL,NULL)`, [notification1, ids.user]);
      await expectConstraint(client.query(`INSERT INTO notification_recipients (notification_id,user_id,seen_at,read_at)
        VALUES ($1,$2,now(),NULL)`, [notification1, ids.user]), "23505", "pk_notification_recipients");

      await expectConstraint(client.query(`DELETE FROM repair_orders WHERE id=$1`, [ids.repair]), "23503");
      await expectConstraint(client.query(`DELETE FROM customer_followups WHERE id=$1`, [followup1]), "23503");

      const history = await client.query("SELECT version,name,checksum FROM schema_migrations ORDER BY version");
      assert.equal(history.rowCount, MIGRATIONS.length);
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
