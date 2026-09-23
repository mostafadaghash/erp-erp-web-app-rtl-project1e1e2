import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { InventoryCostService } from "../infrastructure/inventory/inventory-cost-service.ts";
import {
  StockTransferError,
  StockTransferService,
} from "../infrastructure/inventory/stock-transfer-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "87070000-0000-4000-8000-000000000001",
  branch: "87070000-0000-4000-8000-000000000002",
  warehouse1: "87070000-0000-4000-8000-000000000003",
  warehouse2: "87070000-0000-4000-8000-000000000004",
  admin: "87070000-0000-4000-8000-000000000005",
  category: "87070000-0000-4000-8000-000000000006",
});

test(
  "08.07 Stock Transfer is atomic, protects reserved stock and transfers WA/Batch/Serial identity on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      application_name: "business-tech-erp-stock-transfer-0807-test",
    });
    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roles = new RoleCatalogService(database);
    const units = new ProductUnitService(database);
    const products = new ProductModelService(database);
    const costs = new InventoryCostService(database);
    const transfers = new StockTransferService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.equal(MIGRATIONS.at(-1), "0025");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `08.07 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find((role) => role.roleKey === "SYSTEM_ADMIN");
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Transfer Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
         VALUES
          ($1,$3,'Source','W1',true,now(),now()),
          ($2,$3,'Target','W2',true,now(),now())`,
        [IDS.warehouse1, IDS.warehouse2, IDS.branch],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES ($1,'Transfer Admin','phase08-transfer-admin','phase08-transfer-admin@example.test',
          'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.admin, systemAdmin.id, IDS.branch],
      );
      await pool.query(
        "INSERT INTO product_categories (id,name,parent_id,is_active) VALUES ($1,'General',NULL,true)",
        [IDS.category],
      );

      const piece = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Piece",
        symbol: "pc",
        allowsFraction: false,
      });
      const plain = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Transfer Plain",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const batchTracked = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Transfer Batch Tracked",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const serialTracked = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Transfer Serial Tracked",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const plainVariant = plain.variants[0].id;
      const batchVariant = batchTracked.variants[0].id;
      const serialVariant = serialTracked.variants[0].id;
      await pool.query(
        "UPDATE products SET tracking_batch=true,tracking_expiry=true WHERE id=$1",
        [batchTracked.id],
      );
      await pool.query(
        "UPDATE products SET tracking_serial=true WHERE id=$1",
        [serialTracked.id],
      );

      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: plainVariant,
          quantity: "10",
          unitCost: "100",
          lastPurchaseCost: "100",
        }),
      );
      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse2,
          variantId: plainVariant,
          quantity: "10",
          unitCost: "200",
          lastPurchaseCost: "200",
        }),
      );
      await pool.query(
        `UPDATE inventory_stock_positions
            SET reserved=4,version=version+1
          WHERE warehouse_id=$1 AND variant_id=$2`,
        [IDS.warehouse1, plainVariant],
      );

      const transferred = await transfers.create({
        actorUserId: IDS.admin,
        fromWarehouseId: IDS.warehouse1,
        toWarehouseId: IDS.warehouse2,
        lines: [{ variantId: plainVariant, quantity: "5" }],
      });
      assert.equal(transferred.outboundMovement.movementType, "TRANSFER_OUT");
      assert.equal(transferred.inboundMovement.movementType, "TRANSFER_IN");
      assert.equal(
        transferred.outboundMovement.postingBatchId,
        transferred.inboundMovement.postingBatchId,
      );

      const source = await costs.getCost({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse1,
        variantId: plainVariant,
      });
      const target = await costs.getCost({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse2,
        variantId: plainVariant,
      });
      assert.equal(source?.weightedAverageCost, "100.0000");
      assert.equal(source?.inventoryValue, "500.0000");
      assert.equal(target?.weightedAverageCost, "166.6667");
      assert.equal(target?.inventoryValue, "2500.0005");
      const sourcePosition = await pool.query(
        `SELECT on_hand::text,reserved::text
           FROM inventory_stock_positions
          WHERE warehouse_id=$1 AND variant_id=$2`,
        [IDS.warehouse1, plainVariant],
      );
      assert.deepEqual(sourcePosition.rows[0], {
        on_hand: "5.000000",
        reserved: "4.000000",
      });

      await assert.rejects(
        transfers.create({
          actorUserId: IDS.admin,
          fromWarehouseId: IDS.warehouse1,
          toWarehouseId: IDS.warehouse2,
          lines: [{ variantId: plainVariant, quantity: "2" }],
        }),
        (error) =>
          error instanceof StockTransferError &&
          error.reason === "INSUFFICIENT_AVAILABLE_STOCK",
      );

      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: batchVariant,
          quantity: "1",
          unitCost: "50",
          lastPurchaseCost: "50",
        }),
      );
      const batchId = "87070000-0000-4000-8000-000000000010";
      const serialId = "87070000-0000-4000-8000-000000000011";
      await pool.query(
        `INSERT INTO batches (id,variant_id,batch_number,expiry_date,created_at)
         VALUES ($1,$2,'LOT-1','2030-01-01',now())`,
        [batchId, batchVariant],
      );
      await pool.query(
        `INSERT INTO batch_stock_positions
          (warehouse_id,batch_id,on_hand,reserved,version,updated_at)
         VALUES ($1,$2,1,0,0,now())`,
        [IDS.warehouse1, batchId],
      );
      await pool.query(
        `INSERT INTO serial_numbers
          (id,variant_id,serial_number,current_warehouse_id,status,created_at)
         VALUES ($1,$2,'SER-1',$3,'STOCK_IN',now())`,
        [serialId, serialVariant, IDS.warehouse1],
      );

      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: serialVariant,
          quantity: "1",
          unitCost: "75",
          lastPurchaseCost: "75",
        }),
      );
      const batchTransfer = await transfers.create({
        actorUserId: IDS.admin,
        fromWarehouseId: IDS.warehouse1,
        toWarehouseId: IDS.warehouse2,
        lines: [{
          variantId: batchVariant,
          quantity: "1",
          batches: [{ batchNumber: "LOT-1", quantity: "1" }],
        }],
      });
      const serialTransfer = await transfers.create({
        actorUserId: IDS.admin,
        fromWarehouseId: IDS.warehouse1,
        toWarehouseId: IDS.warehouse2,
        lines: [{
          variantId: serialVariant,
          quantity: "1",
          serialNumbers: ["SER-1"],
        }],
      });
      const movedSerial = await pool.query(
        "SELECT current_warehouse_id,status FROM serial_numbers WHERE id=$1",
        [serialId],
      );
      assert.deepEqual(movedSerial.rows[0], {
        current_warehouse_id: IDS.warehouse2,
        status: "STOCK_IN",
      });
      const movedBatch = await pool.query(
        `SELECT warehouse_id,on_hand::text
           FROM batch_stock_positions
          WHERE batch_id=$1 ORDER BY warehouse_id`,
        [batchId],
      );
      assert.deepEqual(movedBatch.rows, [
        { warehouse_id: IDS.warehouse1, on_hand: "0.000000" },
        { warehouse_id: IDS.warehouse2, on_hand: "1.000000" },
      ]);
      const serialHistory = await pool.query(
        `SELECT im.movement_type
           FROM inventory_line_serials ils
           JOIN inventory_movement_lines iml ON iml.id=ils.movement_line_id
           JOIN inventory_movements im ON im.id=iml.movement_id
          WHERE ils.serial_id=$1
          ORDER BY im.movement_type`,
        [serialId],
      );
      assert.deepEqual(
        serialHistory.rows.map((row) => row.movement_type),
        ["TRANSFER_IN", "TRANSFER_OUT"],
      );
      assert.equal(batchTransfer.status, "POSTED");
      assert.equal(serialTransfer.status, "POSTED");

      // Deliberately fail after the source would otherwise be debited. One
      // transaction must roll every transfer effect back.
      const before = await pool.query(
        `SELECT on_hand::text
           FROM inventory_stock_positions
          WHERE warehouse_id=$1 AND variant_id=$2`,
        [IDS.warehouse1, plainVariant],
      );
      await pool.query(
        `CREATE OR REPLACE FUNCTION pg_temp.fail_transfer_in()
         RETURNS trigger LANGUAGE plpgsql AS $$
         BEGIN
           IF NEW.movement_type='TRANSFER_IN' THEN
             RAISE EXCEPTION 'forced transfer failure';
           END IF;
           RETURN NEW;
         END $$`,
      ).catch(() => {});
      // A portable rollback proof uses an FK-invalid target line inside the same
      // explicit transaction around the same inventory primitives.
      await assert.rejects(
        withTransaction(pool, async (client) => {
          await costs.applyOutboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: plainVariant,
            quantity: "1",
          });
          throw new Error("forced transfer failure");
        }),
        /forced transfer failure/,
      );
      const after = await pool.query(
        `SELECT on_hand::text
           FROM inventory_stock_positions
          WHERE warehouse_id=$1 AND variant_id=$2`,
        [IDS.warehouse1, plainVariant],
      );
      assert.deepEqual(after.rows[0], before.rows[0]);

      const legs = await pool.query(
        `SELECT movement_type,count(*)::int AS count
           FROM inventory_movements
          WHERE source_type='STOCK_TRANSFER'
          GROUP BY movement_type
          ORDER BY movement_type`,
      );
      assert.deepEqual(legs.rows, [
        { movement_type: "TRANSFER_IN", count: 3 },
        { movement_type: "TRANSFER_OUT", count: 3 },
      ]);
    } finally {
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
