import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  InventoryLedgerError,
  InventoryLedgerService,
} from "../infrastructure/inventory/inventory-ledger-service.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b8000000-0000-4000-8000-000000000001",
  branch1: "b8000000-0000-4000-8000-000000000002",
  branch2: "b8000000-0000-4000-8000-000000000003",
  warehouse1: "b8000000-0000-4000-8000-000000000004",
  warehouse2: "b8000000-0000-4000-8000-000000000005",
  admin: "b8000000-0000-4000-8000-000000000006",
  branch1User: "b8000000-0000-4000-8000-000000000007",
  category: "b8000000-0000-4000-8000-000000000008",
  purchaseSource: "b8000000-0000-4000-8000-000000000009",
  transferSource: "b8000000-0000-4000-8000-000000000010",
  invalidSource: "b8000000-0000-4000-8000-000000000011",
  emptySource: "b8000000-0000-4000-8000-000000000012",
  directionSource: "b8000000-0000-4000-8000-000000000013",
  branch2Source: "b8000000-0000-4000-8000-000000000014",
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

async function createPostingBatch(pool, posting, input) {
  return withTransaction(pool, (client) =>
    posting.create(client, input),
  );
}

function postingInput({
  branchId = IDS.branch1,
  sourceType,
  sourceId,
  createdBy = IDS.admin,
  operationType = "POST",
  documentVersion = 1,
  reversesPostingBatchId = null,
}) {
  return {
    branchId,
    sourceType,
    sourceId,
    operationType,
    documentVersion,
    reversesPostingBatchId,
    createdBy,
  };
}

test(
  "08.01 Inventory Ledger is append-only, signed, PostingBatch-traceable, branch-scoped, and immutable on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name:
        "business-tech-erp-inventory-ledger-0801-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const units = new ProductUnitService(database);
    const products = new ProductModelService(database);
    const posting = new PostingBatchService();
    const ledger = new InventoryLedgerService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0024");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(
        version.rows[0]?.server_version_num,
      );
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `08.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Inventory Ledger Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
      await pool.query(
        `INSERT INTO warehouses
          (id,branch_id,name,code,is_active,created_at,updated_at)
         VALUES
          ($1,$3,'Warehouse One','W1',true,now(),now()),
          ($2,$4,'Warehouse Two','W2',true,now(),now())`,
        [
          IDS.warehouse1,
          IDS.warehouse2,
          IDS.branch1,
          IDS.branch2,
        ],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Inventory Admin','phase08-inventory-admin','phase08-inventory-admin@example.test',
           'test-only-hash',$3,$4,'ALL','ar-EG',true,NULL,now(),now()),
          ($2,'Branch One User','phase08-inventory-b1','phase08-inventory-b1@example.test',
           'test-only-hash',$3,$4,'SELECTED','ar-EG',true,NULL,now(),now())`,
        [
          IDS.admin,
          IDS.branch1User,
          systemAdmin.id,
          IDS.branch1,
        ],
      );
      await pool.query(
        `INSERT INTO user_branch_access (user_id,branch_id)
         VALUES ($1,$2)`,
        [IDS.branch1User, IDS.branch1],
      );
      await pool.query(
        `INSERT INTO product_categories
          (id,name,parent_id,is_active)
         VALUES ($1,'General',NULL,true)`,
        [IDS.category],
      );

      const piece = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Piece",
        symbol: "pc",
        allowsFraction: false,
      });
      const product = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Inventory Ledger Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;

      const purchasePosted = await withTransaction(
        pool,
        async (client) => {
          const batch = await posting.create(
            client,
            postingInput({
              sourceType: "PURCHASE_INVOICE",
              sourceId: IDS.purchaseSource,
            }),
          );
          const movement = await ledger.appendWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              postingBatchId: batch.id,
              warehouseId: IDS.warehouse1,
              movementType: "PURCHASE",
              reasonCode: "PURCHASE_RECEIPT",
              notes: "phase 08.01 purchase receipt",
              lines: [
                {
                  variantId,
                  quantitySigned: "5",
                  unitCost: "100",
                  totalCost: "500",
                },
              ],
            },
          );
          return { batch, movement };
        },
      );

      assert.equal(
        purchasePosted.movement.branchId,
        IDS.branch1,
      );
      assert.equal(
        purchasePosted.movement.sourceType,
        "PURCHASE_INVOICE",
      );
      assert.equal(
        purchasePosted.movement.sourceId,
        IDS.purchaseSource,
      );
      assert.equal(
        purchasePosted.movement.postingBatchId,
        purchasePosted.batch.id,
      );
      assert.equal(
        purchasePosted.movement.occurredAt.getTime(),
        purchasePosted.batch.postedAt.getTime(),
      );
      assert.equal(
        purchasePosted.movement.createdBy,
        IDS.admin,
      );
      assert.equal(
        purchasePosted.movement.lines[0]?.quantitySigned,
        "5.000000",
      );
      assert.equal(
        purchasePosted.movement.lines[0]?.unitCost,
        "100.0000",
      );
      assert.equal(
        purchasePosted.movement.lines[0]?.totalCost,
        "500.0000",
      );

      const stockPositionCount = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM inventory_stock_positions`,
      );
      assert.equal(
        stockPositionCount.rows[0]?.count,
        0,
        "08.01 must not mutate Stock Positions before 08.02",
      );

      const fetchedPurchase = await ledger.getMovement({
        actorUserId: IDS.branch1User,
        movementId: purchasePosted.movement.id,
      });
      assert.equal(
        fetchedPurchase.id,
        purchasePosted.movement.id,
      );
      assert.equal(fetchedPurchase.lines.length, 1);

      await assert.rejects(
        () =>
          ledger.getMovement({
            actorUserId: IDS.branch1User,
            movementId:
              "b8000000-0000-4000-8000-000000000099",
          }),
        (error) =>
          error instanceof InventoryLedgerError &&
          error.reason === "MOVEMENT_NOT_FOUND",
      );

      const transfer = await withTransaction(
        pool,
        async (client) => {
          const batch = await posting.create(
            client,
            postingInput({
              sourceType: "STOCK_TRANSFER",
              sourceId: IDS.transferSource,
            }),
          );
          const outbound =
            await ledger.appendWithinTransaction(client, {
              actorUserId: IDS.admin,
              postingBatchId: batch.id,
              warehouseId: IDS.warehouse1,
              movementType: "TRANSFER_OUT",
              lines: [
                {
                  variantId,
                  quantitySigned: "-2",
                  unitCost: "100",
                  totalCost: "200",
                },
              ],
            });
          const inbound =
            await ledger.appendWithinTransaction(client, {
              actorUserId: IDS.admin,
              postingBatchId: batch.id,
              warehouseId: IDS.warehouse2,
              movementType: "TRANSFER_IN",
              lines: [
                {
                  variantId,
                  quantitySigned: "2",
                  unitCost: "100",
                  totalCost: "200",
                },
              ],
            });
          return { batch, outbound, inbound };
        },
      );

      assert.equal(transfer.outbound.branchId, IDS.branch1);
      assert.equal(transfer.inbound.branchId, IDS.branch2);
      assert.equal(
        transfer.outbound.postingBatchId,
        transfer.batch.id,
      );
      assert.equal(
        transfer.inbound.postingBatchId,
        transfer.batch.id,
      );
      assert.equal(
        transfer.outbound.sourceId,
        IDS.transferSource,
      );
      assert.equal(
        transfer.inbound.sourceId,
        IDS.transferSource,
      );

      await assert.rejects(
        () =>
          ledger.getMovement({
            actorUserId: IDS.branch1User,
            movementId: transfer.inbound.id,
          }),
        (error) => error instanceof BranchAccessDeniedError,
      );

      const branchMismatchBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          sourceType: "PURCHASE_INVOICE",
          sourceId: IDS.branch2Source,
        }),
      );
      await assert.rejects(
        () =>
          withTransaction(pool, (client) =>
            ledger.appendWithinTransaction(client, {
              actorUserId: IDS.admin,
              postingBatchId: branchMismatchBatch.id,
              warehouseId: IDS.warehouse2,
              movementType: "PURCHASE",
              lines: [
                {
                  variantId,
                  quantitySigned: "1",
                  unitCost: "10",
                  totalCost: "10",
                },
              ],
            }),
          ),
        (error) =>
          error instanceof InventoryLedgerError &&
          error.reason === "POSTING_BATCH_BRANCH_MISMATCH",
      );

      const actorMismatchBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          sourceType: "PURCHASE_INVOICE",
          sourceId: IDS.invalidSource,
        }),
      );
      await assert.rejects(
        () =>
          withTransaction(pool, (client) =>
            ledger.appendWithinTransaction(client, {
              actorUserId: IDS.branch1User,
              postingBatchId: actorMismatchBatch.id,
              warehouseId: IDS.warehouse1,
              movementType: "PURCHASE",
              lines: [
                {
                  variantId,
                  quantitySigned: "1",
                  unitCost: "10",
                  totalCost: "10",
                },
              ],
            }),
          ),
        (error) =>
          error instanceof InventoryLedgerError &&
          error.reason === "POSTING_BATCH_ACTOR_MISMATCH",
      );

      const branch2DeniedBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          branchId: IDS.branch2,
          sourceType: "PURCHASE_INVOICE",
          sourceId: IDS.branch2Source,
          createdBy: IDS.branch1User,
        }),
      );
      await assert.rejects(
        () =>
          withTransaction(pool, (client) =>
            ledger.appendWithinTransaction(client, {
              actorUserId: IDS.branch1User,
              postingBatchId: branch2DeniedBatch.id,
              warehouseId: IDS.warehouse2,
              movementType: "PURCHASE",
              lines: [
                {
                  variantId,
                  quantitySigned: "1",
                  unitCost: "10",
                  totalCost: "10",
                },
              ],
            }),
          ),
        (error) => error instanceof BranchAccessDeniedError,
      );

      await assert.rejects(
        pool.query(
          `UPDATE inventory_movements
              SET notes='tampered'
            WHERE id=$1`,
          [purchasePosted.movement.id],
        ),
        /immutable; append reversal\/correction instead/,
      );
      await assert.rejects(
        pool.query(
          `DELETE FROM inventory_movements
            WHERE id=$1`,
          [purchasePosted.movement.id],
        ),
        /immutable; append reversal\/correction instead/,
      );
      await assert.rejects(
        pool.query(
          `UPDATE inventory_movement_lines
              SET unit_cost=999
            WHERE id=$1`,
          [purchasePosted.movement.lines[0].id],
        ),
        /immutable; append reversal\/correction instead/,
      );
      await assert.rejects(
        pool.query(
          `DELETE FROM inventory_movement_lines
            WHERE id=$1`,
          [purchasePosted.movement.lines[0].id],
        ),
        /immutable; append reversal\/correction instead/,
      );

      const reversalPosted = await withTransaction(
        pool,
        async (client) => {
          const batch = await posting.create(
            client,
            postingInput({
              sourceType: "PURCHASE_INVOICE",
              sourceId: IDS.purchaseSource,
              operationType: "REVERSAL",
              documentVersion: 2,
              reversesPostingBatchId:
                purchasePosted.batch.id,
            }),
          );
          const movement = await ledger.appendWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              postingBatchId: batch.id,
              warehouseId: IDS.warehouse1,
              movementType: "PURCHASE_RETURN",
              reasonCode: "REVERSAL",
              lines: [
                {
                  variantId,
                  quantitySigned: "-5",
                  unitCost: "100",
                  totalCost: "500",
                },
              ],
            },
          );
          return { batch, movement };
        },
      );
      assert.notEqual(
        reversalPosted.movement.id,
        purchasePosted.movement.id,
      );

      const originalStillExists = await pool.query(
        `SELECT movement_type
           FROM inventory_movements
          WHERE id=$1`,
        [purchasePosted.movement.id],
      );
      assert.equal(
        originalStillExists.rows[0]?.movement_type,
        "PURCHASE",
      );

      const invalidTypeBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          sourceType: "INVENTORY_TEST",
          sourceId: IDS.invalidSource,
        }),
      );
      await assert.rejects(
        withTransaction(pool, (client) =>
          client.query(
            `INSERT INTO inventory_movements
              (id,branch_id,warehouse_id,movement_type,source_type,source_id,
               posting_batch_id,occurred_at,created_by,reason_code,notes)
             SELECT
               'b8000000-0000-4000-8000-000000000020',
               $2,$3,'BROKEN',pb.source_type,pb.source_id,pb.id,pb.posted_at,
               pb.created_by,NULL,NULL
             FROM posting_batches pb
             WHERE pb.id=$1`,
            [
              invalidTypeBatch.id,
              IDS.branch1,
              IDS.warehouse1,
            ],
          ),
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint ===
            "ck_inventory_movements__movement_type",
      );

      const contextBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          sourceType: "INVENTORY_TEST",
          sourceId: IDS.invalidSource,
        }),
      );
      await assert.rejects(
        withTransaction(pool, (client) =>
          client.query(
            `INSERT INTO inventory_movements
              (id,branch_id,warehouse_id,movement_type,source_type,source_id,
               posting_batch_id,occurred_at,created_by,reason_code,notes)
             SELECT
               'b8000000-0000-4000-8000-000000000021',
               $2,$3,'PURCHASE','WRONG_SOURCE',pb.source_id,pb.id,pb.posted_at,
               pb.created_by,NULL,NULL
             FROM posting_batches pb
             WHERE pb.id=$1`,
            [
              contextBatch.id,
              IDS.branch1,
              IDS.warehouse1,
            ],
          ),
        ),
        (error) =>
          error?.code === "23514" &&
          /posting context/.test(error?.message ?? ""),
      );

      const directionBatch = await createPostingBatch(
        pool,
        posting,
        postingInput({
          sourceType: "INVENTORY_TEST",
          sourceId: IDS.directionSource,
        }),
      );
      await assert.rejects(
        withTransaction(pool, async (client) => {
          const movementId =
            "b8000000-0000-4000-8000-000000000022";
          await client.query(
            `INSERT INTO inventory_movements
              (id,branch_id,warehouse_id,movement_type,source_type,source_id,
               posting_batch_id,occurred_at,created_by,reason_code,notes)
             SELECT
               $2,$3,$4,'SALE',pb.source_type,pb.source_id,pb.id,pb.posted_at,
               pb.created_by,NULL,NULL
             FROM posting_batches pb
             WHERE pb.id=$1`,
            [
              directionBatch.id,
              movementId,
              IDS.branch1,
              IDS.warehouse1,
            ],
          );
          await client.query(
            `INSERT INTO inventory_movement_lines
              (id,movement_id,variant_id,quantity_signed,unit_cost,total_cost)
             VALUES
              ('b8000000-0000-4000-8000-000000000023',$1,$2,1.000000,10.0000,10.0000)`,
            [movementId, variantId],
          );
        }),
        (error) =>
          error?.code === "23514" &&
          /outbound movement quantity must be negative/.test(
            error?.message ?? "",
          ),
      );

      const triggers = await pool.query(
        `SELECT c.relname AS table_name,t.tgname
           FROM pg_trigger t
           JOIN pg_class c ON c.oid=t.tgrelid
           JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE n.nspname='public'
            AND NOT t.tgisinternal
            AND t.tgname IN (
              'bt_inventory_movements__posting_context',
              'bt_inventory_movement_lines__direction',
              'bt_inventory_movements__immutable',
              'bt_inventory_movement_lines__immutable'
            )
          ORDER BY c.relname,t.tgname`,
      );
      assert.equal(triggers.rowCount, 4);

      assert.deepEqual(
        await indexNames(pool, "inventory_movements"),
        [
          "ix_inventory_movements__branch_id_occurred_at_desc_id_desc",
          "ix_inventory_movements__posting_batch_id",
          "ix_inventory_movements__source_type_source_id",
          "ix_inventory_movements__warehouse_id_occurred_at_desc_id_desc",
          "pk_inventory_movements",
        ],
      );
      assert.deepEqual(
        await indexNames(pool, "inventory_movement_lines"),
        [
          "ix_inventory_movement_lines__movement_id",
          "ix_inventory_movement_lines__variant_id_movement_id",
          "pk_inventory_movement_lines",
        ],
      );

      const history = await pool.query(
        "SELECT version,name FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(history.rows.at(-1), {
        version: "0024",
        name: "inventory_ledger_integrity",
      });

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(
        verification.skipped,
        MIGRATIONS,
      );
    } finally {
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl);
    }
  },
);
