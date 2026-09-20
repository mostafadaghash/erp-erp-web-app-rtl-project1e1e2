import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  BranchAccessDeniedError,
} from "../infrastructure/authorization/branch-scope-service.ts";
import {
  RoleCatalogService,
} from "../infrastructure/authorization/role-catalog-service.ts";
import {
  CounterpartyLedgerError,
  CounterpartyLedgerService,
} from "../infrastructure/counterparties/counterparty-ledger-service.ts";
import {
  PostingBatchService,
} from "../infrastructure/posting/posting-batch-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "a5000000-0000-4000-8000-000000000001",
  branch1: "a5000000-0000-4000-8000-000000000002",
  branch2: "a5000000-0000-4000-8000-000000000003",
  actor: "a5000000-0000-4000-8000-000000000004",
  dualCounterparty: "a5000000-0000-4000-8000-000000000005",
  customerOnly: "a5000000-0000-4000-8000-000000000006",
  source1: "a5000000-0000-4000-8000-000000000007",
  source2: "a5000000-0000-4000-8000-000000000008",
});

async function indexNames(pool, tableName) {
  const result = await pool.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname='public'
        AND tablename=$1
      ORDER BY indexname`,
    [tableName],
  );
  return result.rows.map((row) => row.indexname);
}

async function createPostingBatch(
  pool,
  posting,
  input,
) {
  return withTransaction(pool, (client) =>
    posting.create(client, input),
  );
}

test(
  "06.03 Customer/Supplier Ledgers are separate, branch-scoped, append-only immutable history on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      application_name: "business-tech-erp-ledgers-0603-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const ledgers = new CounterpartyLedgerService(database);
    const posting = new PostingBatchService();

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0023");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `06.03 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 06 Ledger Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES
          ($1,$3,'Branch One','B1',true,now(),now()),
          ($2,$3,'Branch Two','B2',true,now(),now())`,
        [IDS.branch1, IDS.branch2, IDS.company],
      );
      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO users
            (id,name,username,email,password_hash,role_id,default_branch_id,
             branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
           VALUES
            ($1,'Ledger Admin','phase06-ledger-admin','phase06-ledger-admin@example.test',
             'test-only-hash',$2,$3,'SELECTED','ar-EG',true,NULL,now(),now())`,
          [IDS.actor, systemAdmin.id, IDS.branch1],
        );
        await client.query(
          `INSERT INTO user_branch_access (user_id,branch_id)
           VALUES ($1,$2)`,
          [IDS.actor, IDS.branch1],
        );
      });

      await pool.query(
        `INSERT INTO counterparties
          (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
         VALUES
          ($1,'Dual Ledger Account',NULL,NULL,NULL,NULL,true,now(),now()),
          ($2,'Customer Only',NULL,NULL,NULL,NULL,true,now(),now())`,
        [IDS.dualCounterparty, IDS.customerOnly],
      );
      await pool.query(
        `INSERT INTO counterparty_roles (counterparty_id,role)
         VALUES
          ($1,'CUSTOMER'),
          ($1,'SUPPLIER'),
          ($2,'CUSTOMER')`,
        [IDS.dualCounterparty, IDS.customerOnly],
      );

      const originalBatch = await createPostingBatch(
        pool,
        posting,
        {
          branchId: IDS.branch1,
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source1,
          operationType: "POST",
          documentVersion: 1,
          createdBy: IDS.actor,
        },
      );

      const customerOriginal = await ledgers.append(
        "CUSTOMER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
          entryType: "TEST_SOURCE_EFFECT",
          amount: "125.5000",
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source1,
          postingBatchId: originalBatch.id,
          occurredAt: new Date("2026-09-20T02:00:00.000Z"),
        },
      );
      const supplierOriginal = await ledgers.append(
        "SUPPLIER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
          entryType: "TEST_SOURCE_EFFECT",
          amount: "75.2500",
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source1,
          postingBatchId: originalBatch.id,
          occurredAt: new Date("2026-09-20T02:00:01.000Z"),
        },
      );

      const customerStatement = await ledgers.statement(
        "CUSTOMER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
        },
      );
      const supplierStatement = await ledgers.statement(
        "SUPPLIER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
        },
      );

      assert.deepEqual(
        customerStatement.map((entry) => entry.id),
        [customerOriginal.id],
      );
      assert.deepEqual(
        supplierStatement.map((entry) => entry.id),
        [supplierOriginal.id],
      );
      assert.equal(customerStatement[0]?.amount, "125.5000");
      assert.equal(supplierStatement[0]?.amount, "75.2500");

      await assert.rejects(
        pool.query(
          `UPDATE customer_ledger_entries
              SET amount=999
            WHERE id=$1`,
          [customerOriginal.id],
        ),
        /immutable; append reversal\/correction instead/,
      );
      await assert.rejects(
        pool.query(
          `DELETE FROM supplier_ledger_entries
            WHERE id=$1`,
          [supplierOriginal.id],
        ),
        /immutable; append reversal\/correction instead/,
      );

      const reversalBatch = await createPostingBatch(
        pool,
        posting,
        {
          branchId: IDS.branch1,
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source1,
          operationType: "REVERSAL",
          documentVersion: 2,
          reversesPostingBatchId: originalBatch.id,
          createdBy: IDS.actor,
        },
      );

      const customerReversal = await ledgers.append(
        "CUSTOMER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
          entryType: "TEST_REVERSAL_EFFECT",
          amount: "125.5000",
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source1,
          postingBatchId: reversalBatch.id,
          occurredAt: new Date("2026-09-20T02:01:00.000Z"),
        },
      );

      const customerAfterReversal = await ledgers.statement(
        "CUSTOMER",
        {
          actorUserId: IDS.actor,
          counterpartyId: IDS.dualCounterparty,
          branchId: IDS.branch1,
        },
      );
      assert.equal(customerAfterReversal.length, 2);
      assert.deepEqual(
        new Set(customerAfterReversal.map((entry) => entry.id)),
        new Set([customerOriginal.id, customerReversal.id]),
        "reversal must append history instead of replacing the original",
      );

      const originalStillThere = await pool.query(
        `SELECT amount::text AS amount
           FROM customer_ledger_entries
          WHERE id=$1`,
        [customerOriginal.id],
      );
      assert.equal(originalStillThere.rows[0]?.amount, "125.5000");

      await assert.rejects(
        () =>
          ledgers.append("SUPPLIER", {
            actorUserId: IDS.actor,
            counterpartyId: IDS.customerOnly,
            branchId: IDS.branch1,
            entryType: "TEST",
            amount: "1.0000",
            sourceType: "LEDGER_TEST_SOURCE",
            sourceId: IDS.source1,
            postingBatchId: originalBatch.id,
            occurredAt: new Date(),
          }),
        (error) =>
          error instanceof CounterpartyLedgerError &&
          error.reason === "ROLE_MISMATCH",
      );

      await assert.rejects(
        () =>
          ledgers.append("CUSTOMER", {
            actorUserId: IDS.actor,
            counterpartyId: IDS.dualCounterparty,
            branchId: IDS.branch1,
            entryType: "TEST",
            amount: "1.0000",
            sourceType: "WRONG_SOURCE",
            sourceId: IDS.source1,
            postingBatchId: originalBatch.id,
            occurredAt: new Date(),
          }),
        (error) =>
          error instanceof CounterpartyLedgerError &&
          error.reason === "POSTING_BATCH_SCOPE_MISMATCH",
      );

      const branch2Batch = await createPostingBatch(
        pool,
        posting,
        {
          branchId: IDS.branch2,
          sourceType: "LEDGER_TEST_SOURCE",
          sourceId: IDS.source2,
          operationType: "POST",
          documentVersion: 1,
          createdBy: IDS.actor,
        },
      );

      await assert.rejects(
        () =>
          ledgers.append("CUSTOMER", {
            actorUserId: IDS.actor,
            counterpartyId: IDS.dualCounterparty,
            branchId: IDS.branch2,
            entryType: "TEST",
            amount: "1.0000",
            sourceType: "LEDGER_TEST_SOURCE",
            sourceId: IDS.source2,
            postingBatchId: branch2Batch.id,
            occurredAt: new Date(),
          }),
        (error) => error instanceof BranchAccessDeniedError,
      );

      await assert.rejects(
        () =>
          ledgers.statement("CUSTOMER", {
            actorUserId: IDS.actor,
            counterpartyId: IDS.dualCounterparty,
            branchId: IDS.branch2,
          }),
        (error) => error instanceof BranchAccessDeniedError,
      );

      const branch2Count = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM customer_ledger_entries
          WHERE branch_id=$1`,
        [IDS.branch2],
      );
      assert.equal(branch2Count.rows[0]?.count, 0);

      const mutableBalanceColumns = await pool.query(
        `SELECT table_name,column_name
           FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name IN ('counterparties','customer_profiles','supplier_profiles')
            AND column_name IN ('balance','current_balance','customer_balance','supplier_balance')`,
      );
      assert.equal(
        mutableBalanceColumns.rowCount,
        0,
        "06.03 must not introduce mutable customer/supplier balance truth",
      );

      const triggers = await pool.query(
        `SELECT c.relname AS table_name,t.tgname
           FROM pg_trigger t
           JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public'
            AND NOT t.tgisinternal
            AND t.tgname IN (
              'bt_customer_ledger_entries__immutable',
              'bt_supplier_ledger_entries__immutable'
            )
          ORDER BY c.relname`,
      );
      assert.deepEqual(triggers.rows, [
        {
          table_name: "customer_ledger_entries",
          tgname: "bt_customer_ledger_entries__immutable",
        },
        {
          table_name: "supplier_ledger_entries",
          tgname: "bt_supplier_ledger_entries__immutable",
        },
      ]);

      assert.deepEqual(
        await indexNames(pool, "customer_ledger_entries"),
        [
          "ix_customer_ledger_entries__branch_id_occurred_at_desc_id_desc",
          "ix_customer_ledger_entries__counterparty_id_branch_id__25c18ba1",
          "ix_customer_ledger_entries__counterparty_id_occurred_a_6fc7e550",
          "ix_customer_ledger_entries__posting_batch_id",
          "ix_customer_ledger_entries__source_type_source_id",
          "pk_customer_ledger_entries",
        ],
      );
      assert.deepEqual(
        await indexNames(pool, "supplier_ledger_entries"),
        [
          "ix_supplier_ledger_entries__branch_id_occurred_at_desc_id_desc",
          "ix_supplier_ledger_entries__counterparty_id_branch_id__e9ac4a61",
          "ix_supplier_ledger_entries__counterparty_id_occurred_a_b58bc910",
          "ix_supplier_ledger_entries__posting_batch_id",
          "ix_supplier_ledger_entries__source_type_source_id",
          "pk_supplier_ledger_entries",
        ],
      );

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl);
    }
  },
);
