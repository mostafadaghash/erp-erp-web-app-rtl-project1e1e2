import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import {
  PostingBatchReferenceError,
  PostingBatchService,
} from "../infrastructure/posting/posting-batch-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "97000000-0000-4000-8000-000000000001",
  branch1: "97000000-0000-4000-8000-000000000002",
  branch2: "97000000-0000-4000-8000-000000000003",
  role: "97000000-0000-4000-8000-000000000004",
  user: "97000000-0000-4000-8000-000000000005",
  source1: "97000000-0000-4000-8000-000000000006",
  source2: "97000000-0000-4000-8000-000000000007",
});

async function seedIdentity(pool) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 04 Posting Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES
      ($1,$3,'Main','MAIN',true,now(),now()),
      ($2,$3,'Second','SECOND',true,now(),now())`,
    [IDS.branch1, IDS.branch2, IDS.company],
  );
  await pool.query(
    `INSERT INTO roles (id,role_key,display_name_key,is_system)
     VALUES ($1,'PHASE_04_POSTING_TEST','roles.phase04PostingTest',true)`,
    [IDS.role],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Posting User','posting-user','posting@example.test','hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [IDS.user, IDS.role, IDS.branch1],
  );
}

function input(overrides = {}) {
  return {
    branchId: IDS.branch1,
    sourceType: "SALES_INVOICE",
    sourceId: IDS.source1,
    operationType: "POST",
    documentVersion: 1,
    createdBy: IDS.user,
    ...overrides,
  };
}

test(
  "04.03 Posting Batch Service preserves traceability, reversal links, server time, and rollback atomicity on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name: "business-tech-erp-posting-batch-test",
    });
    const service = new PostingBatchService();

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.03 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await seedIdentity(pool);
      await pool.query(
        `CREATE TABLE phase04_posting_effect_probe (
           id uuid PRIMARY KEY,
           posting_batch_id uuid NOT NULL
             REFERENCES posting_batches(id) ON DELETE RESTRICT,
           effect_kind text NOT NULL
         )`,
      );

      const beforePost = new Date();
      const posted = await withTransaction(pool, (client) =>
        service.create(client, input()),
      );
      const afterPost = new Date();

      assert.equal(posted.operationType, "POST");
      assert.equal(posted.branchId, IDS.branch1);
      assert.equal(posted.sourceType, "SALES_INVOICE");
      assert.equal(posted.sourceId, IDS.source1);
      assert.equal(posted.documentVersion, 1);
      assert.equal(posted.reversesPostingBatchId, null);
      assert.equal(posted.createdBy, IDS.user);
      assert.ok(posted.postedAt >= beforePost && posted.postedAt <= afterPost);

      const correction = await withTransaction(pool, (client) =>
        service.create(
          client,
          input({
            operationType: "CORRECTION",
            documentVersion: 2,
          }),
        ),
      );
      assert.equal(correction.operationType, "CORRECTION");
      assert.equal(correction.documentVersion, 2);
      assert.equal(correction.reversesPostingBatchId, null);

      const reversal = await withTransaction(pool, (client) =>
        service.create(
          client,
          input({
            operationType: "REVERSAL",
            reversesPostingBatchId: posted.id,
          }),
        ),
      );
      assert.equal(reversal.operationType, "REVERSAL");
      assert.equal(reversal.reversesPostingBatchId, posted.id);

      const deleteReversal = await withTransaction(pool, (client) =>
        service.create(
          client,
          input({
            operationType: "DELETE_REVERSAL",
            reversesPostingBatchId: correction.id,
            documentVersion: 2,
          }),
        ),
      );
      assert.equal(deleteReversal.operationType, "DELETE_REVERSAL");
      assert.equal(deleteReversal.reversesPostingBatchId, correction.id);

      await assert.rejects(
        withTransaction(pool, (client) =>
          service.create(
            client,
            input({
              operationType: "REVERSAL",
              reversesPostingBatchId:
                "97000000-0000-4000-8000-000000000099",
            }),
          ),
        ),
        (error) =>
          error instanceof PostingBatchReferenceError &&
          error.reason === "REFERENCE_NOT_FOUND",
      );

      const foreignSourcePost = await withTransaction(pool, (client) =>
        service.create(
          client,
          input({
            sourceId: IDS.source2,
          }),
        ),
      );

      await assert.rejects(
        withTransaction(pool, (client) =>
          service.create(
            client,
            input({
              operationType: "REVERSAL",
              reversesPostingBatchId: foreignSourcePost.id,
            }),
          ),
        ),
        (error) =>
          error instanceof PostingBatchReferenceError &&
          error.reason === "REFERENCE_SCOPE_MISMATCH",
      );

      const foreignBranchPost = await withTransaction(pool, (client) =>
        service.create(
          client,
          input({
            branchId: IDS.branch2,
          }),
        ),
      );

      await assert.rejects(
        withTransaction(pool, (client) =>
          service.create(
            client,
            input({
              operationType: "REVERSAL",
              reversesPostingBatchId: foreignBranchPost.id,
            }),
          ),
        ),
        (error) =>
          error instanceof PostingBatchReferenceError &&
          error.reason === "REFERENCE_SCOPE_MISMATCH",
      );

      const rollbackError = new Error("force posting rollback");
      let rolledBackBatchId = null;

      await assert.rejects(
        withTransaction(pool, async (client) => {
          const batch = await service.create(
            client,
            input({
              sourceType: "INVENTORY_ADJUSTMENT",
              sourceId:
                "97000000-0000-4000-8000-000000000008",
            }),
          );
          rolledBackBatchId = batch.id;

          await client.query(
            `INSERT INTO phase04_posting_effect_probe
              (id,posting_batch_id,effect_kind)
             VALUES
              ('97000000-0000-4000-8000-000000000010',$1,'INVENTORY_MOVEMENT')`,
            [batch.id],
          );

          throw rollbackError;
        }),
        (error) => error === rollbackError,
      );

      assert.ok(rolledBackBatchId);
      const rollbackState = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM posting_batches
             WHERE id=$1) AS posting_batches,
           (SELECT count(*)::int
              FROM phase04_posting_effect_probe
             WHERE posting_batch_id=$1) AS effects`,
        [rolledBackBatchId],
      );
      assert.deepEqual(rollbackState.rows[0], {
        posting_batches: 0,
        effects: 0,
      });

      const sourceTrace = await pool.query(
        `SELECT
           id,
           operation_type,
           document_version,
           reverses_posting_batch_id
         FROM posting_batches
         WHERE source_type='SALES_INVOICE'
           AND source_id=$1
         ORDER BY posted_at, id`,
        [IDS.source1],
      );

      const byId = new Map(sourceTrace.rows.map((row) => [row.id, row]));
      assert.equal(byId.get(posted.id)?.operation_type, "POST");
      assert.equal(byId.get(correction.id)?.operation_type, "CORRECTION");
      assert.equal(
        byId.get(reversal.id)?.reverses_posting_batch_id,
        posted.id,
      );
      assert.equal(
        byId.get(deleteReversal.id)?.reverses_posting_batch_id,
        correction.id,
      );

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool
        .query("DROP TABLE IF EXISTS phase04_posting_effect_probe")
        .catch(() => {});
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
