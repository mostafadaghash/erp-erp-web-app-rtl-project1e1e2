import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import {
  OutboxWorker,
  TransactionalOutboxService,
} from "../infrastructure/outbox/transactional-outbox.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  rollbackAggregate: "99000000-0000-4000-8000-000000000001",
  restartAggregate: "99000000-0000-4000-8000-000000000002",
  retryAggregate: "99000000-0000-4000-8000-000000000003",
});

function createPool(applicationName) {
  return new Pool({
    connectionString: databaseUrl,
    max: 20,
    application_name: applicationName,
  });
}

function createWorker(pool) {
  return new OutboxWorker({
    transaction(work, options) {
      return withTransaction(pool, work, options);
    },
  });
}

test(
  "04.05 Transactional Outbox survives restart, retries safely, and prevents duplicate logical results under worker concurrency on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    let pool = createPool("business-tech-erp-outbox-producer");
    const outbox = new TransactionalOutboxService();

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.05 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await pool.query(
        `CREATE TABLE phase04_outbox_source_probe (
           id uuid PRIMARY KEY,
           aggregate_id uuid NOT NULL,
           status text NOT NULL
         )`,
      );
      await pool.query(
        `CREATE TABLE phase04_outbox_consumer_results (
           event_id uuid PRIMARY KEY,
           aggregate_id uuid NOT NULL,
           event_type text NOT NULL,
           deliveries integer NOT NULL DEFAULT 1
         )`,
      );

      const rollbackError = new Error("force source transaction rollback");
      let rolledBackEventId = null;

      await assert.rejects(
        withTransaction(pool, async (client) => {
          await client.query(
            `INSERT INTO phase04_outbox_source_probe(id,aggregate_id,status)
             VALUES
               ('99000000-0000-4000-8000-000000000010',$1,'MUST_ROLL_BACK')`,
            [IDS.rollbackAggregate],
          );

          const event = await outbox.enqueue(client, {
            eventType: "SourceRolledBack",
            aggregateType: "TEST_AGGREGATE",
            aggregateId: IDS.rollbackAggregate,
            payload: { status: "MUST_ROLL_BACK" },
          });
          rolledBackEventId = event.id;
          throw rollbackError;
        }),
        (error) => error === rollbackError,
      );

      assert.ok(rolledBackEventId);
      const rollbackState = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM outbox_events
             WHERE id=$1) AS outbox_rows,
           (SELECT count(*)::int
              FROM phase04_outbox_source_probe
             WHERE aggregate_id=$2) AS source_rows`,
        [rolledBackEventId, IDS.rollbackAggregate],
      );
      assert.deepEqual(rollbackState.rows[0], {
        outbox_rows: 0,
        source_rows: 0,
      });

      const restartEvent = await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO phase04_outbox_source_probe(id,aggregate_id,status)
           VALUES
             ('99000000-0000-4000-8000-000000000011',$1,'COMMITTED')`,
          [IDS.restartAggregate],
        );

        return outbox.enqueue(client, {
          eventType: "RestartProof",
          aggregateType: "TEST_AGGREGATE",
          aggregateId: IDS.restartAggregate,
          payload: { sourceCommitted: true },
        });
      });

      assert.equal(restartEvent.processedAt, null);
      assert.equal(restartEvent.retryCount, 0);

      await pool.end();
      pool = createPool("business-tech-erp-outbox-after-restart");

      const restartedWorker = createWorker(pool);
      const restartResult = await restartedWorker.processBatch(
        async (client, event) => {
          assert.equal(event.id, restartEvent.id);
          await client.query(
            `INSERT INTO phase04_outbox_consumer_results
              (event_id,aggregate_id,event_type,deliveries)
             VALUES ($1,$2,$3,1)
             ON CONFLICT (event_id)
             DO UPDATE SET deliveries =
               phase04_outbox_consumer_results.deliveries + 1`,
            [event.id, event.aggregateId, event.eventType],
          );
        },
        { batchSize: 10 },
      );

      assert.deepEqual(restartResult, {
        claimedCount: 1,
        processedEventIds: [restartEvent.id],
        failed: [],
      });

      const restartPersistence = await pool.query(
        `SELECT
           processed_at IS NOT NULL AS processed,
           retry_count
         FROM outbox_events
         WHERE id=$1`,
        [restartEvent.id],
      );
      assert.deepEqual(restartPersistence.rows[0], {
        processed: true,
        retry_count: 0,
      });

      const retryEvent = await withTransaction(pool, (client) =>
        outbox.enqueue(client, {
          eventType: "RetryProof",
          aggregateType: "TEST_AGGREGATE",
          aggregateId: IDS.retryAggregate,
          payload: { attempt: "first" },
        }),
      );

      const retryWorker = createWorker(pool);
      const firstRetry = await retryWorker.processBatch(
        async (_client, event) => {
          assert.equal(event.id, retryEvent.id);
          throw new Error("consumer application failure");
        },
        { batchSize: 1 },
      );
      assert.deepEqual(firstRetry, {
        claimedCount: 1,
        processedEventIds: [],
        failed: [{ eventId: retryEvent.id, retryCount: 1 }],
      });

      const failedState = await pool.query(
        `SELECT processed_at, retry_count
           FROM outbox_events
          WHERE id=$1`,
        [retryEvent.id],
      );
      assert.equal(failedState.rows[0]?.processed_at, null);
      assert.equal(failedState.rows[0]?.retry_count, 1);

      const successfulRetry = await retryWorker.processBatch(
        async (client, event) => {
          await client.query(
            `INSERT INTO phase04_outbox_consumer_results
              (event_id,aggregate_id,event_type,deliveries)
             VALUES ($1,$2,$3,1)
             ON CONFLICT (event_id)
             DO UPDATE SET deliveries =
               phase04_outbox_consumer_results.deliveries + 1`,
            [event.id, event.aggregateId, event.eventType],
          );
        },
        { batchSize: 1 },
      );
      assert.deepEqual(successfulRetry, {
        claimedCount: 1,
        processedEventIds: [retryEvent.id],
        failed: [],
      });

      const recoveredState = await pool.query(
        `SELECT
           processed_at IS NOT NULL AS processed,
           retry_count
         FROM outbox_events
         WHERE id=$1`,
        [retryEvent.id],
      );
      assert.deepEqual(recoveredState.rows[0], {
        processed: true,
        retry_count: 1,
      });

      const concurrencyEvents = [];
      await withTransaction(pool, async (client) => {
        for (let index = 0; index < 40; index += 1) {
          const suffix = String(index + 100).padStart(12, "0");
          const aggregateId = `99000000-0000-4000-8000-${suffix}`;
          concurrencyEvents.push(
            await outbox.enqueue(client, {
              eventType: "ConcurrentDelivery",
              aggregateType: "TEST_AGGREGATE",
              aggregateId,
              payload: { index },
            }),
          );
        }
      });

      const concurrentConsumer = async (client, event) => {
        await client.query(
          `INSERT INTO phase04_outbox_consumer_results
            (event_id,aggregate_id,event_type,deliveries)
           VALUES ($1,$2,$3,1)
           ON CONFLICT (event_id)
           DO UPDATE SET deliveries =
             phase04_outbox_consumer_results.deliveries + 1`,
          [event.id, event.aggregateId, event.eventType],
        );
        await client.query("SELECT pg_sleep(0.005)");
      };

      const workerA = createWorker(pool);
      const workerB = createWorker(pool);
      const [batchA, batchB] = await Promise.all([
        workerA.processBatch(concurrentConsumer, { batchSize: 20 }),
        workerB.processBatch(concurrentConsumer, { batchSize: 20 }),
      ]);

      assert.equal(batchA.claimedCount, 20);
      assert.equal(batchB.claimedCount, 20);
      assert.equal(batchA.failed.length, 0);
      assert.equal(batchB.failed.length, 0);

      const allProcessedIds = [
        ...batchA.processedEventIds,
        ...batchB.processedEventIds,
      ];
      assert.equal(allProcessedIds.length, 40);
      assert.equal(new Set(allProcessedIds).size, 40);
      assert.deepEqual(
        new Set(allProcessedIds),
        new Set(concurrencyEvents.map((event) => event.id)),
      );

      const concurrencyState = await pool.query(
        `SELECT
           count(*)::int AS result_count,
           max(deliveries)::int AS max_deliveries,
           min(deliveries)::int AS min_deliveries
         FROM phase04_outbox_consumer_results
         WHERE event_type='ConcurrentDelivery'`,
      );
      assert.deepEqual(concurrencyState.rows[0], {
        result_count: 40,
        max_deliveries: 1,
        min_deliveries: 1,
      });

      const pendingConcurrency = await pool.query(
        `SELECT count(*)::int AS count
           FROM outbox_events
          WHERE event_type='ConcurrentDelivery'
            AND processed_at IS NULL`,
      );
      assert.equal(pendingConcurrency.rows[0]?.count, 0);

      const outboxIndexes = await pool.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='outbox_events'
          ORDER BY indexname`,
      );
      assert.deepEqual(
        outboxIndexes.rows.map((row) => row.indexname),
        [
          "ix_outbox_events__created_at_id__where_processed_at_is_null",
          "pk_outbox_events",
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
        .query("DROP TABLE IF EXISTS phase04_outbox_consumer_results")
        .catch(() => {});
      await pool
        .query("DROP TABLE IF EXISTS phase04_outbox_source_probe")
        .catch(() => {});
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl);
    }
  },
);
