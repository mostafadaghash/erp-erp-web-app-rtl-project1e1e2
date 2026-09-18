import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { DocumentSequenceService } from "../infrastructure/sequences/document-sequence-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "95000000-0000-4000-8000-000000000001",
  branch1: "95000000-0000-4000-8000-000000000002",
  branch2: "95000000-0000-4000-8000-000000000003",
  role: "95000000-0000-4000-8000-000000000004",
  user: "95000000-0000-4000-8000-000000000005",
});

async function seedIdentity(pool) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 04 Sequence Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
     VALUES ($1,'PHASE_04_SEQUENCE_TEST','roles.phase04SequenceTest',true)`,
    [IDS.role],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Sequence User','sequence-user','sequence@example.test','hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [IDS.user, IDS.role, IDS.branch1],
  );
}

async function allocateInTransaction(pool, service, input, work) {
  return withTransaction(pool, async (client) => {
    const allocation = await service.allocate(client, input);
    if (work) await work(client, allocation);
    return allocation;
  });
}

test(
  "04.02 Document Sequence Service is atomic, scoped, rollback-safe, and concurrency-safe on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      application_name: "business-tech-erp-document-sequence-test",
    });
    const service = new DocumentSequenceService();

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.02 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await seedIdentity(pool);
      await pool.query(
        `CREATE TABLE phase04_sequence_probe (
           id uuid PRIMARY KEY,
           branch_id uuid NOT NULL,
           document_type text NOT NULL,
           document_number bigint NOT NULL,
           UNIQUE (branch_id, document_type, document_number)
         )`,
      );
      await pool.query(
        `CREATE TABLE phase04_sequence_lock_probe (
           id integer PRIMARY KEY,
           marker text NOT NULL
         )`,
      );
      await pool.query(
        "INSERT INTO phase04_sequence_lock_probe(id,marker) VALUES (1,'lock-first')",
      );

      const first = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "SALES_INVOICE" },
        async (client, allocation) => {
          await client.query(
            `INSERT INTO phase04_sequence_probe
              (id,branch_id,document_type,document_number)
             VALUES ('95000000-0000-4000-8000-000000000010',$1,$2,$3)`,
            [IDS.branch1, "SALES_INVOICE", allocation.documentNumber.toString()],
          );
        },
      );
      const second = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "SALES_INVOICE" },
      );

      assert.equal(typeof first.documentNumber, "bigint");
      assert.equal(first.documentNumber, 1n);
      assert.equal(second.documentNumber, 2n);

      const separateType = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "SALES_RETURN" },
      );
      const separateBranch = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch2, documentType: "SALES_INVOICE" },
      );
      assert.equal(separateType.documentNumber, 1n);
      assert.equal(separateBranch.documentNumber, 1n);

      const lateAllocation = await withTransaction(pool, async (client) => {
        await client.query(
          "SELECT id FROM phase04_sequence_lock_probe WHERE id=1 FOR UPDATE",
        );

        const before = await client.query(
          `SELECT count(*)::int AS count
             FROM document_sequences
            WHERE branch_id=$1 AND document_type='LATE_ALLOCATION'`,
          [IDS.branch1],
        );
        assert.equal(before.rows[0]?.count, 0);

        return service.allocate(client, {
          branchId: IDS.branch1,
          documentType: "LATE_ALLOCATION",
        });
      });
      assert.equal(lateAllocation.documentNumber, 1n);

      const rollbackError = new Error("force sequence rollback");
      await assert.rejects(
        withTransaction(pool, async (client) => {
          const allocation = await service.allocate(client, {
            branchId: IDS.branch1,
            documentType: "ROLLBACK_DOC",
          });
          await client.query(
            `INSERT INTO phase04_sequence_probe
              (id,branch_id,document_type,document_number)
             VALUES ('95000000-0000-4000-8000-000000000011',$1,$2,$3)`,
            [IDS.branch1, "ROLLBACK_DOC", allocation.documentNumber.toString()],
          );
          throw rollbackError;
        }),
        (error) => error === rollbackError,
      );

      const rollbackState = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM document_sequences
             WHERE branch_id=$1 AND document_type='ROLLBACK_DOC') AS sequence_rows,
           (SELECT count(*)::int FROM phase04_sequence_probe
             WHERE branch_id=$1 AND document_type='ROLLBACK_DOC') AS business_rows`,
        [IDS.branch1],
      );
      assert.deepEqual(rollbackState.rows[0], {
        sequence_rows: 0,
        business_rows: 0,
      });

      const retryAfterRollback = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "ROLLBACK_DOC" },
      );
      assert.equal(retryAfterRollback.documentNumber, 1n);

      const workerCount = 32;
      const parallel = await Promise.all(
        Array.from({ length: workerCount }, (_, index) =>
          allocateInTransaction(
            pool,
            service,
            { branchId: IDS.branch1, documentType: "PARALLEL_INVOICE" },
            async (client, allocation) => {
              const id = `96000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
              await client.query(
                `INSERT INTO phase04_sequence_probe
                  (id,branch_id,document_type,document_number)
                 VALUES ($1,$2,$3,$4)`,
                [
                  id,
                  IDS.branch1,
                  "PARALLEL_INVOICE",
                  allocation.documentNumber.toString(),
                ],
              );
            },
          ),
        ),
      );

      const parallelNumbers = parallel
        .map((allocation) => allocation.documentNumber)
        .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

      assert.equal(new Set(parallelNumbers.map(String)).size, workerCount);
      assert.deepEqual(
        parallelNumbers,
        Array.from({ length: workerCount }, (_, index) => BigInt(index + 1)),
      );

      const persistedParallel = await pool.query(
        `SELECT probe.document_number::text AS document_number
           FROM phase04_sequence_probe AS probe
          WHERE probe.branch_id=$1 AND probe.document_type='PARALLEL_INVOICE'
          ORDER BY probe.document_number`,
        [IDS.branch1],
      );
      assert.deepEqual(
        persistedParallel.rows.map((row) => BigInt(row.document_number)),
        parallelNumbers,
      );

      const deletionFirst = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "DELETION_DOC" },
        async (client, allocation) => {
          await client.query(
            `INSERT INTO phase04_sequence_probe
              (id,branch_id,document_type,document_number)
             VALUES ('95000000-0000-4000-8000-000000000012',$1,$2,$3)`,
            [IDS.branch1, "DELETION_DOC", allocation.documentNumber.toString()],
          );
        },
      );
      assert.equal(deletionFirst.documentNumber, 1n);

      await withTransaction(pool, async (client) => {
        await client.query(
          `DELETE FROM phase04_sequence_probe
            WHERE branch_id=$1 AND document_type='DELETION_DOC' AND document_number=1`,
          [IDS.branch1],
        );
        await client.query(
          `INSERT INTO document_tombstones
            (id,document_type,original_id,branch_id,document_number,deleted_by,delete_reason,deleted_at)
           VALUES
            ('95000000-0000-4000-8000-000000000013','DELETION_DOC',
             '95000000-0000-4000-8000-000000000012',$1,1,$2,'test deletion',now())`,
          [IDS.branch1, IDS.user],
        );
      });

      const afterDeletion = await allocateInTransaction(
        pool,
        service,
        { branchId: IDS.branch1, documentType: "DELETION_DOC" },
      );
      assert.equal(afterDeletion.documentNumber, 2n);

      const sequenceState = await pool.query(
        `SELECT last_number::text AS last_number
           FROM document_sequences
          WHERE branch_id=$1 AND document_type='DELETION_DOC'`,
        [IDS.branch1],
      );
      assert.equal(sequenceState.rows[0]?.last_number, "2");

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.query("DROP TABLE IF EXISTS phase04_sequence_probe").catch(() => {});
      await pool.query("DROP TABLE IF EXISTS phase04_sequence_lock_probe").catch(() => {});
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
