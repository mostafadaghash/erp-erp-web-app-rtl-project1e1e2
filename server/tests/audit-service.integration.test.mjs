import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { AuditService } from "../infrastructure/audit/audit-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "98000000-0000-4000-8000-000000000001",
  branch: "98000000-0000-4000-8000-000000000002",
  role: "98000000-0000-4000-8000-000000000003",
  user: "98000000-0000-4000-8000-000000000004",
  entity1: "98000000-0000-4000-8000-000000000005",
  entity2: "98000000-0000-4000-8000-000000000006",
});

async function seedIdentity(pool) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 04 Audit Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$2,'Main','MAIN',true,now(),now())`,
    [IDS.branch, IDS.company],
  );
  await pool.query(
    `INSERT INTO roles (id,role_key,display_name_key,is_system)
     VALUES ($1,'PHASE_04_AUDIT_TEST','roles.phase04AuditTest',true)`,
    [IDS.role],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Audit User','audit-user','audit@example.test','hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [IDS.user, IDS.role, IDS.branch],
  );
}

test(
  "04.04 Audit Service records Who/What/When/Branch/Entity/Reason/Before/After atomically on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      application_name: "business-tech-erp-audit-service-test",
    });
    const service = new AuditService();

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.04 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await seedIdentity(pool);
      await pool.query(
        `CREATE TABLE phase04_audit_effect_probe (
           id uuid PRIMARY KEY,
           entity_id uuid NOT NULL,
           status text NOT NULL
         )`,
      );

      const beforeCreatedAt = new Date();
      const committed = await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO phase04_audit_effect_probe(id,entity_id,status)
           VALUES
             ('98000000-0000-4000-8000-000000000010',$1,'UPDATED')`,
          [IDS.entity1],
        );

        return service.record(client, {
          companyId: IDS.company,
          branchId: IDS.branch,
          userId: IDS.user,
          action: "UPDATE_POSTED_DOCUMENT",
          entityType: "SALES_INVOICE",
          entityId: IDS.entity1,
          reason: "customer correction",
          before: {
            status: "POSTED",
            totals: { grandTotal: 100, due: 25 },
          },
          after: {
            status: "POSTED",
            totals: { grandTotal: 120, due: 45 },
          },
        });
      });
      const afterCreatedAt = new Date();

      assert.equal(committed.companyId, IDS.company);
      assert.equal(committed.branchId, IDS.branch);
      assert.equal(committed.userId, IDS.user);
      assert.equal(committed.action, "UPDATE_POSTED_DOCUMENT");
      assert.equal(committed.entityType, "SALES_INVOICE");
      assert.equal(committed.entityId, IDS.entity1);
      assert.equal(committed.reason, "customer correction");
      assert.deepEqual(committed.before, {
        status: "POSTED",
        totals: { grandTotal: 100, due: 25 },
      });
      assert.deepEqual(committed.after, {
        status: "POSTED",
        totals: { grandTotal: 120, due: 45 },
      });
      assert.ok(
        committed.createdAt >= beforeCreatedAt &&
          committed.createdAt <= afterCreatedAt,
      );

      const persisted = await pool.query(
        `SELECT
           company_id,
           branch_id,
           user_id,
           action,
           entity_type,
           entity_id,
           reason,
           before_json,
           after_json,
           created_at
         FROM audit_logs
         WHERE id=$1`,
        [committed.id],
      );
      assert.deepEqual(
        {
          company_id: persisted.rows[0]?.company_id,
          branch_id: persisted.rows[0]?.branch_id,
          user_id: persisted.rows[0]?.user_id,
          action: persisted.rows[0]?.action,
          entity_type: persisted.rows[0]?.entity_type,
          entity_id: persisted.rows[0]?.entity_id,
          reason: persisted.rows[0]?.reason,
          before_json: persisted.rows[0]?.before_json,
          after_json: persisted.rows[0]?.after_json,
        },
        {
          company_id: IDS.company,
          branch_id: IDS.branch,
          user_id: IDS.user,
          action: "UPDATE_POSTED_DOCUMENT",
          entity_type: "SALES_INVOICE",
          entity_id: IDS.entity1,
          reason: "customer correction",
          before_json: {
            status: "POSTED",
            totals: { grandTotal: 100, due: 25 },
          },
          after_json: {
            status: "POSTED",
            totals: { grandTotal: 120, due: 45 },
          },
        },
      );

      const systemAudit = await withTransaction(pool, (client) =>
        service.record(client, {
          companyId: IDS.company,
          action: "SYSTEM_REBUILD",
          entityType: "READ_MODEL",
          entityId: IDS.entity2,
          before: null,
          after: { rebuilt: true },
        }),
      );
      assert.equal(systemAudit.branchId, null);
      assert.equal(systemAudit.userId, null);
      assert.equal(systemAudit.reason, null);
      assert.equal(systemAudit.before, null);
      assert.deepEqual(systemAudit.after, { rebuilt: true });

      const rollbackError = new Error("force audited transaction rollback");
      let rolledBackAuditId = null;

      await assert.rejects(
        withTransaction(pool, async (client) => {
          await client.query(
            `INSERT INTO phase04_audit_effect_probe(id,entity_id,status)
             VALUES
               ('98000000-0000-4000-8000-000000000011',$1,'MUST_ROLL_BACK')`,
            [IDS.entity2],
          );

          const audit = await service.record(client, {
            companyId: IDS.company,
            branchId: IDS.branch,
            userId: IDS.user,
            action: "DELETE_POSTED_DOCUMENT",
            entityType: "PURCHASE_INVOICE",
            entityId: IDS.entity2,
            reason: "rollback proof",
            before: { status: "POSTED", amount: 300 },
            after: { deleted: true },
          });
          rolledBackAuditId = audit.id;

          throw rollbackError;
        }),
        (error) => error === rollbackError,
      );

      assert.ok(rolledBackAuditId);
      const rollbackState = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM audit_logs
             WHERE id=$1) AS audit_rows,
           (SELECT count(*)::int
              FROM phase04_audit_effect_probe
             WHERE entity_id=$2) AS effect_rows`,
        [rolledBackAuditId, IDS.entity2],
      );
      assert.deepEqual(rollbackState.rows[0], {
        audit_rows: 0,
        effect_rows: 0,
      });

      const auditIndexes = await pool.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='audit_logs'
          ORDER BY indexname`,
      );
      assert.deepEqual(
        auditIndexes.rows.map((row) => row.indexname),
        [
          "ix_audit_logs__branch_id_created_at_desc",
          "ix_audit_logs__entity_type_entity_id_created_at_desc",
          "ix_audit_logs__user_id_created_at_desc",
          "pk_audit_logs",
        ],
      );

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool
        .query("DROP TABLE IF EXISTS phase04_audit_effect_probe")
        .catch(() => {});
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
