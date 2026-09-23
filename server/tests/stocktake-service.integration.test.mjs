import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { InventoryCostService } from "../infrastructure/inventory/inventory-cost-service.ts";
import {
  StocktakeError,
  StocktakeService,
} from "../infrastructure/inventory/stocktake-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const IDS = Object.freeze({
  company: "88080000-0000-4000-8000-000000000001",
  branch: "88080000-0000-4000-8000-000000000002",
  warehouse: "88080000-0000-4000-8000-000000000003",
  admin: "88080000-0000-4000-8000-000000000004",
  category: "88080000-0000-4000-8000-000000000005",
});

test(
  "08.08 Stocktake enforces snapshot/version rules and atomically approves stored differences on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      application_name: "business-tech-erp-stocktake-0808-test",
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
    const stocktakes = new StocktakeService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.equal(MIGRATIONS.at(-1), "0025");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(versionNumber >= 170000 && versionNumber < 180000);

      const catalogRoles = await roles.ensureDefaultRoles();
      const adminRole = catalogRoles.find((role) => role.roleKey === "SYSTEM_ADMIN");
      assert.ok(adminRole);
      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Stocktake Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
         VALUES ($1,'Stocktake Admin','phase08-stocktake-admin','phase08-stocktake-admin@example.test',
          'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.admin, adminRole.id, IDS.branch],
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
      const product = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Counted Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;
      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse,
          variantId,
          quantity: "10",
          unitCost: "100",
          lastPurchaseCost: "100",
        }),
      );

      const opened = await stocktakes.open({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse,
      });
      assert.equal(opened.status, "OPEN");
      const staleSnapshot = await stocktakes.snapshot({
        actorUserId: IDS.admin,
        sessionId: opened.id,
        variantId,
      });
      assert.equal(staleSnapshot.bookQuantity, "10.000000");

      // A live stock change after the UI snapshot invalidates only this line.
      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse,
          variantId,
          quantity: "1",
          unitCost: "100",
        }),
      );
      await assert.rejects(
        stocktakes.countLine({
          actorUserId: IDS.admin,
          sessionId: opened.id,
          variantId,
          countedQuantity: "7",
          expectedBookQuantity: staleSnapshot.bookQuantity,
          expectedStockPositionVersion: staleSnapshot.stockPositionVersion,
        }),
        (error) =>
          error instanceof StocktakeError &&
          error.reason === "POSITION_VERSION_CHANGED",
      );

      const freshSnapshot = await stocktakes.snapshot({
        actorUserId: IDS.admin,
        sessionId: opened.id,
        variantId,
      });
      assert.equal(freshSnapshot.bookQuantity, "11.000000");
      await stocktakes.countLine({
        actorUserId: IDS.admin,
        sessionId: opened.id,
        variantId,
        countedQuantity: "7",
        expectedBookQuantity: freshSnapshot.bookQuantity,
        expectedStockPositionVersion: freshSnapshot.stockPositionVersion,
        notes: "physical count",
      });
      const counted = await stocktakes.markCounted({
        actorUserId: IDS.admin,
        sessionId: opened.id,
      });
      assert.equal(counted.status, "COUNTED");

      // Later operations do not rewrite the frozen difference. Approval applies
      // counted-book_at_count (-4) to current On Hand (13), resulting in 9.
      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse,
          variantId,
          quantity: "2",
          unitCost: "100",
        }),
      );
      const approved = await stocktakes.approve({
        actorUserId: IDS.admin,
        sessionId: opened.id,
      });
      assert.equal(approved.status, "APPROVED");
      assert.equal(approved.approvedBy, IDS.admin);
      assert.ok(approved.approvedAt instanceof Date);

      const line = await pool.query(
        `SELECT book_quantity_at_count::text,counted_quantity::text,
                stock_position_version_at_count,difference::text
           FROM stocktake_lines WHERE session_id=$1`,
        [opened.id],
      );
      assert.deepEqual(line.rows[0], {
        book_quantity_at_count: "11.000000",
        counted_quantity: "7.000000",
        stock_position_version_at_count: freshSnapshot.stockPositionVersion,
        difference: "-4.000000",
      });
      const position = await pool.query(
        `SELECT on_hand::text FROM inventory_stock_positions
          WHERE warehouse_id=$1 AND variant_id=$2`,
        [IDS.warehouse, variantId],
      );
      assert.equal(position.rows[0].on_hand, "9.000000");

      const adjustment = await pool.query(
        `SELECT ia.source_stocktake_id,ial.quantity_difference::text,ial.unit_cost::text
           FROM inventory_adjustments ia
           JOIN inventory_adjustment_lines ial ON ial.adjustment_id=ia.id
          WHERE ia.source_stocktake_id=$1`,
        [opened.id],
      );
      assert.deepEqual(adjustment.rows, [{
        source_stocktake_id: opened.id,
        quantity_difference: "-4.000000",
        unit_cost: "100.0000",
      }]);
      const movement = await pool.query(
        `SELECT im.movement_type,iml.quantity_signed::text,iml.unit_cost::text
           FROM inventory_movements im
           JOIN inventory_movement_lines iml ON iml.movement_id=im.id
          WHERE im.source_type='STOCKTAKE' AND im.source_id=$1`,
        [opened.id],
      );
      assert.deepEqual(movement.rows, [{
        movement_type: "ADJUSTMENT",
        quantity_signed: "-4.000000",
        unit_cost: "100.0000",
      }]);

      await assert.rejects(
        stocktakes.countLine({
          actorUserId: IDS.admin,
          sessionId: opened.id,
          variantId,
          countedQuantity: "9",
          expectedBookQuantity: "9",
          expectedStockPositionVersion: freshSnapshot.stockPositionVersion,
        }),
        (error) =>
          error instanceof StocktakeError &&
          error.reason === "SESSION_IMMUTABLE",
      );
      await assert.rejects(
        stocktakes.approve({
          actorUserId: IDS.admin,
          sessionId: opened.id,
        }),
        (error) =>
          error instanceof StocktakeError &&
          error.reason === "SESSION_IMMUTABLE",
      );
    } finally {
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
