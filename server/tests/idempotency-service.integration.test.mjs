import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import {
  IdempotencyConflictError,
  IdempotencyService,
  hashIdempotencyRequest,
} from "../infrastructure/idempotency/idempotency-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "94000000-0000-4000-8000-000000000001",
  branch: "94000000-0000-4000-8000-000000000002",
  role: "94000000-0000-4000-8000-000000000003",
  user: "94000000-0000-4000-8000-000000000004",
});

async function seedIdentity(pool) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 04 Idempotency Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
     VALUES ($1,'PHASE_04_TEST','roles.phase04Test',true)`,
    [IDS.role],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,branch_scope_mode,preferred_language,is_active,created_at,updated_at)
     VALUES ($1,'Phase 04 User','phase04-user','phase04@example.test','hash',$2,$3,'ALL','ar-EG',true,now(),now())`,
    [IDS.user, IDS.role, IDS.branch],
  );
}

function createService(pool) {
  return new IdempotencyService({
    transaction(work, options) {
      return withTransaction(pool, work, options);
    },
  });
}

function requestInput(key, payload, expiresAt = new Date(Date.now() + 60_000)) {
  return {
    key,
    userId: IDS.user,
    operationType: "PHASE_04_TEST_OPERATION",
    payload,
    expiresAt,
  };
}

async function dropProbe(pool) {
  await pool.query("DROP TABLE IF EXISTS public.phase04_idempotency_probe");
}

test(
  "04.01 Idempotency Service is atomic, replay-safe, parallel-safe, and cleanable on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 16,
      application_name: "business-tech-erp-idempotency-test",
    });

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await seedIdentity(pool);
      await pool.query(
        `CREATE TABLE phase04_idempotency_probe (
           id text PRIMARY KEY,
           claim_key text NOT NULL,
           payload text NOT NULL
         )`,
      );

      const service = createService(pool);

      let sequentialWorkCalls = 0;
      const sequentialInput = requestInput("idem-sequential-001", {
        amount: 125,
        lines: [{ sku: "A", qty: 1 }],
      });

      const first = await service.execute(sequentialInput, async (client) => {
        sequentialWorkCalls += 1;
        await client.query(
          "INSERT INTO phase04_idempotency_probe(id,claim_key,payload) VALUES ($1,$2,$3)",
          ["sequential-result", sequentialInput.key, "first"],
        );
        return {
          value: { documentId: "sequential-result" },
          resultReference: "TEST:sequential-result",
        };
      });

      assert.equal(first.state, "EXECUTED");
      assert.equal(first.resultReference, "TEST:sequential-result");
      assert.deepEqual(first.value, { documentId: "sequential-result" });

      const replay = await service.execute(sequentialInput, async () => {
        throw new Error("replayed work must not execute");
      });

      assert.equal(replay.state, "REPLAYED");
      assert.equal(replay.resultReference, "TEST:sequential-result");
      assert.equal(replay.requestHash, first.requestHash);
      assert.equal(sequentialWorkCalls, 1);

      await assert.rejects(
        service.execute(
          requestInput("idem-sequential-001", {
            amount: 126,
            lines: [{ sku: "A", qty: 1 }],
          }),
          async () => {
            throw new Error("conflicting work must not execute");
          },
        ),
        (error) =>
          error instanceof IdempotencyConflictError &&
          error.reason === "REQUEST_HASH_MISMATCH",
      );

      let parallelWorkCalls = 0;
      const parallelInput = requestInput("idem-parallel-001", {
        customerId: "C-1",
        amount: 200,
      });

      const parallelResults = await Promise.all(
        Array.from({ length: 8 }, () =>
          service.execute(parallelInput, async (client) => {
            parallelWorkCalls += 1;
            await client.query(
              "INSERT INTO phase04_idempotency_probe(id,claim_key,payload) VALUES ($1,$2,$3)",
              ["parallel-result", parallelInput.key, "parallel"],
            );
            await client.query("SELECT pg_sleep(0.15)");
            return {
              value: { documentId: "parallel-result" },
              resultReference: "TEST:parallel-result",
            };
          }),
        ),
      );

      assert.equal(parallelWorkCalls, 1);
      assert.equal(
        parallelResults.filter((result) => result.state === "EXECUTED").length,
        1,
      );
      assert.equal(
        parallelResults.filter((result) => result.state === "REPLAYED").length,
        7,
      );

      const parallelProbe = await pool.query(
        "SELECT count(*)::int AS count FROM phase04_idempotency_probe WHERE claim_key=$1",
        [parallelInput.key],
      );
      assert.equal(parallelProbe.rows[0]?.count, 1);

      const rollbackInput = requestInput("idem-rollback-001", {
        source: "rollback-proof",
      });
      const forcedFailure = new Error("force idempotent business rollback");

      await assert.rejects(
        service.execute(rollbackInput, async (client) => {
          await client.query(
            "INSERT INTO phase04_idempotency_probe(id,claim_key,payload) VALUES ($1,$2,$3)",
            ["rollback-result", rollbackInput.key, "must-rollback"],
          );
          throw forcedFailure;
        }),
        (error) => error === forcedFailure,
      );

      const rollbackState = await pool.query(
        `SELECT
           (SELECT count(*)::int FROM idempotency_keys WHERE key=$1) AS claims,
           (SELECT count(*)::int FROM phase04_idempotency_probe WHERE claim_key=$1) AS effects`,
        [rollbackInput.key],
      );
      assert.deepEqual(rollbackState.rows[0], { claims: 0, effects: 0 });

      const afterRollback = await service.execute(
        rollbackInput,
        async (client) => {
          await client.query(
            "INSERT INTO phase04_idempotency_probe(id,claim_key,payload) VALUES ($1,$2,$3)",
            ["rollback-result", rollbackInput.key, "retry-succeeded"],
          );
          return {
            value: { documentId: "rollback-result" },
            resultReference: "TEST:rollback-result",
          };
        },
      );
      assert.equal(afterRollback.state, "EXECUTED");

      const incompletePayload = { source: "known-incomplete" };
      const incompleteHash = hashIdempotencyRequest(incompletePayload);
      await pool.query(
        `INSERT INTO idempotency_keys
          (id,key,user_id,operation_type,request_hash,result_reference,created_at,completed_at,expires_at)
         VALUES
          ('94000000-0000-4000-8000-000000000020',$1,$2,'PHASE_04_TEST_OPERATION',$3,NULL,now(),NULL,now()+interval '1 hour')`,
        ["idem-incomplete-001", IDS.user, incompleteHash],
      );

      const incomplete = await service.execute(
        requestInput("idem-incomplete-001", incompletePayload),
        async () => {
          throw new Error("known incomplete state must not execute work");
        },
      );
      assert.equal(incomplete.state, "INCOMPLETE");
      assert.equal(incomplete.completedAt, null);

      await pool.query(
        `INSERT INTO idempotency_keys
          (id,key,user_id,operation_type,request_hash,result_reference,created_at,completed_at,expires_at)
         VALUES
          ('94000000-0000-4000-8000-000000000021','idem-expired-001',$1,'PHASE_04_TEST_OPERATION',$2,'TEST:expired-1',now()-interval '2 hours',now()-interval '2 hours',now()-interval '1 hour'),
          ('94000000-0000-4000-8000-000000000022','idem-expired-002',$1,'PHASE_04_TEST_OPERATION',$2,NULL,now()-interval '2 hours',NULL,now()-interval '1 hour'),
          ('94000000-0000-4000-8000-000000000023','idem-future-001',$1,'PHASE_04_TEST_OPERATION',$2,NULL,now(),NULL,now()+interval '1 hour')`,
        [IDS.user, hashIdempotencyRequest({ cleanup: true })],
      );

      assert.deepEqual(
        await service.cleanupExpired({ batchSize: 1 }),
        { deletedCount: 1 },
      );
      assert.deepEqual(
        await service.cleanupExpired({ batchSize: 1 }),
        { deletedCount: 1 },
      );
      assert.deepEqual(
        await service.cleanupExpired({ batchSize: 1 }),
        { deletedCount: 0 },
      );

      const cleanupState = await pool.query(
        `SELECT
           count(*) FILTER (WHERE key LIKE 'idem-expired-%')::int AS expired,
           count(*) FILTER (WHERE key = 'idem-future-001')::int AS future
         FROM idempotency_keys`,
      );
      assert.deepEqual(cleanupState.rows[0], { expired: 0, future: 1 });

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await dropProbe(pool).catch(() => {});
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
