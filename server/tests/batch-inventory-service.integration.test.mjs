import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  BatchInventoryError,
  BatchInventoryService,
} from "../infrastructure/inventory/batch-inventory-service.ts";
import { InventoryLedgerService } from "../infrastructure/inventory/inventory-ledger-service.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const IDS = Object.freeze({
  company: "bb000000-0000-4000-8000-000000000001",
  branch: "bb000000-0000-4000-8000-000000000002",
  warehouse: "bb000000-0000-4000-8000-000000000003",
  admin: "bb000000-0000-4000-8000-000000000004",
  category: "bb000000-0000-4000-8000-000000000005",
});

test(
  "08.06 Batch/Expiry uses lock-row quantities, FEFO, audited expired override, and prevents a last-unit race on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 16,
      application_name: "business-tech-erp-batches-0806-test",
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
    const batches = new BatchInventoryService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.equal(MIGRATIONS.at(-1), "0025");

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Batch Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Branch','B1',true,now(),now())`,
        [IDS.branch, IDS.company],
      );
      await pool.query(
        `INSERT INTO warehouses
          (id,branch_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Warehouse','W1',true,now(),now())`,
        [IDS.warehouse, IDS.branch],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES ($1,'Batch Admin','phase08-batch-admin','phase08-batch-admin@example.test',
          'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.admin, systemAdmin.id, IDS.branch],
      );
      await pool.query(
        `INSERT INTO user_permission_overrides
          (user_id,permission_id,effect,changed_by,changed_at)
         SELECT $1,id,'ALLOW',$1,now()
           FROM permissions
          WHERE permission_key='inventory.sell_expired_batch'`,
        [IDS.admin],
      );
      await pool.query(
        `INSERT INTO product_categories (id,name,parent_id,is_active)
         VALUES ($1,'General',NULL,true)`,
        [IDS.category],
      );

      const piece = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Piece",
        symbol: "pc",
        allowsFraction: false,
      });

      async function createTrackedProduct(name) {
        const product = await products.createSimpleProduct({
          actorUserId: IDS.admin,
          name,
          categoryId: IDS.category,
          productType: "STOCK",
          baseUnitMasterId: piece.id,
        });
        await pool.query(
          "UPDATE products SET tracking_batch=true,tracking_expiry=true WHERE id=$1",
          [product.id],
        );
        return product;
      }

      const fefoProduct = await createTrackedProduct("FEFO Product");
      const raceProduct = await createTrackedProduct("Race Product");
      const expiredProduct = await createTrackedProduct("Expired Product");
      const fefoVariant = fefoProduct.variants[0].id;
      const raceVariant = raceProduct.variants[0].id;
      const expiredVariant = expiredProduct.variants[0].id;

      let sequence = 0;
      async function movement(variantId, type, quantity) {
        sequence += 1;
        const sourceId =
          `bb000000-0000-4000-8000-${String(100000000000 + sequence).slice(-12)}`;
        return withTransaction(pool, async (client) => {
          const batch = await posting.create(client, {
            branchId: IDS.branch,
            sourceType:
              type === "SALE" ? "SALES_INVOICE" : "PURCHASE_INVOICE",
            sourceId,
            operationType: "POST",
            documentVersion: 1,
            reversesPostingBatchId: null,
            createdBy: IDS.admin,
          });
          const total = (
            Math.abs(Number(quantity)) * 100
          ).toFixed(4);
          return ledger.appendWithinTransaction(client, {
            actorUserId: IDS.admin,
            postingBatchId: batch.id,
            warehouseId: IDS.warehouse,
            movementType: type,
            lines: [{
              variantId,
              quantitySigned: quantity,
              unitCost: "100",
              totalCost: total,
            }],
          });
        });
      }

      const fefoIn = await movement(fefoVariant, "PURCHASE", "3");
      await withTransaction(pool, (client) =>
        batches.receiveWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: fefoIn.lines[0].id,
          batches: [
            { batchNumber: "LATER", expiryDate: "2099-12-31", quantity: "2" },
            { batchNumber: "EARLIER", expiryDate: "2099-01-01", quantity: "1" },
          ],
        }),
      );
      const fefoOut = await movement(fefoVariant, "SALE", "-1");
      const fefoAllocated = await withTransaction(pool, (client) =>
        batches.issueFefoWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: fefoOut.lines[0].id,
        }),
      );
      assert.deepEqual(
        fefoAllocated.map((row) => row.batchNumber),
        ["EARLIER"],
      );

      const raceIn = await movement(raceVariant, "PURCHASE", "1");
      await withTransaction(pool, (client) =>
        batches.receiveWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: raceIn.lines[0].id,
          batches: [{
            batchNumber: "LAST-UNIT",
            expiryDate: "2099-12-31",
            quantity: "1",
          }],
        }),
      );
      const raceOut1 = await movement(raceVariant, "SALE", "-1");
      const raceOut2 = await movement(raceVariant, "SALE", "-1");
      const race = await Promise.allSettled([
        withTransaction(pool, (client) =>
          batches.issueFefoWithinTransaction(client, {
            actorUserId: IDS.admin,
            movementLineId: raceOut1.lines[0].id,
          }),
        ),
        withTransaction(pool, (client) =>
          batches.issueFefoWithinTransaction(client, {
            actorUserId: IDS.admin,
            movementLineId: raceOut2.lines[0].id,
          }),
        ),
      ]);
      assert.equal(race.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(race.filter((x) => x.status === "rejected").length, 1);
      const raceRejected = race.find((x) => x.status === "rejected");
      assert.ok(
        raceRejected?.status === "rejected" &&
        raceRejected.reason instanceof BatchInventoryError &&
        raceRejected.reason.reason === "INSUFFICIENT_BATCH_AVAILABLE",
      );

      const expiredIn = await movement(expiredVariant, "PURCHASE", "1");
      await withTransaction(pool, (client) =>
        batches.receiveWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: expiredIn.lines[0].id,
          batches: [{
            batchNumber: "EXPIRED",
            expiryDate: "2020-01-01",
            quantity: "1",
          }],
        }),
      );
      const expiredOutBlocked = await movement(expiredVariant, "SALE", "-1");
      await assert.rejects(
        withTransaction(pool, (client) =>
          batches.issueFefoWithinTransaction(client, {
            actorUserId: IDS.admin,
            movementLineId: expiredOutBlocked.lines[0].id,
          }),
        ),
        (error) =>
          error instanceof BatchInventoryError &&
          error.reason === "EXPIRED_BATCH_BLOCKED",
      );

      const expiredOutAllowed = await movement(expiredVariant, "SALE", "-1");
      const expiredAllocated = await withTransaction(pool, (client) =>
        batches.issueFefoWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: expiredOutAllowed.lines[0].id,
          expiredOverrideReason: "Approved expired Batch exception",
        }),
      );
      assert.equal(expiredAllocated[0]?.isExpired, true);

      const audit = await pool.query(
        `SELECT action,reason,user_id,branch_id
           FROM audit_logs
          WHERE action='inventory.batch.expired_sale_override'`,
      );
      assert.equal(audit.rowCount, 1);
      assert.equal(audit.rows[0]?.reason, "Approved expired Batch exception");
      assert.equal(audit.rows[0]?.user_id, IDS.admin);
      assert.equal(audit.rows[0]?.branch_id, IDS.branch);

      const negativeBatch = await pool.query(
        `SELECT *
           FROM batch_stock_positions
          WHERE on_hand < 0 OR reserved < 0`,
      );
      assert.equal(negativeBatch.rowCount, 0);

      const permission = await pool.query(
        `SELECT module,description_key
           FROM permissions
          WHERE permission_key='inventory.sell_expired_batch'`,
      );
      assert.equal(permission.rowCount, 1);
      assert.equal(permission.rows[0]?.module, "inventory");

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
