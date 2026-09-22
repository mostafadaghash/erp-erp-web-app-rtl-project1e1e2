import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  InventoryCostError,
  InventoryCostService,
} from "../infrastructure/inventory/inventory-cost-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "ba000000-0000-4000-8000-000000000001",
  branch1: "ba000000-0000-4000-8000-000000000002",
  branch2: "ba000000-0000-4000-8000-000000000003",
  warehouse1: "ba000000-0000-4000-8000-000000000004",
  warehouse2: "ba000000-0000-4000-8000-000000000005",
  warehouse3: "ba000000-0000-4000-8000-000000000006",
  admin: "ba000000-0000-4000-8000-000000000007",
  branch1User: "ba000000-0000-4000-8000-000000000008",
  category: "ba000000-0000-4000-8000-000000000009",
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

test(
  "08.03 Weighted Average Cost is exact, current-posting ordered, rollback-safe and concurrency-safe on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 32,
      application_name:
        "business-tech-erp-weighted-average-cost-0803-test",
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

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0025");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(
        version.rows[0]?.server_version_num,
      );
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `08.03 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 WA Cost Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,$4,'Warehouse One','W1',true,now(),now()),
          ($2,$5,'Warehouse Two','W2',true,now(),now()),
          ($3,$4,'Warehouse Three','W3',true,now(),now())`,
        [
          IDS.warehouse1,
          IDS.warehouse2,
          IDS.warehouse3,
          IDS.branch1,
          IDS.branch2,
        ],
      );

      await withTransaction(pool, async (client) => {
        await client.query(
          `INSERT INTO users
            (id,name,username,email,password_hash,role_id,default_branch_id,
             branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
           VALUES
            ($1,'Cost Admin','phase08-cost-admin','phase08-cost-admin@example.test',
             'test-only-hash',$3,$4,'ALL','ar-EG',true,NULL,now(),now()),
            ($2,'Branch One Cost User','phase08-cost-b1','phase08-cost-b1@example.test',
             'test-only-hash',$3,$4,'SELECTED','ar-EG',true,NULL,now(),now())`,
          [
            IDS.admin,
            IDS.branch1User,
            systemAdmin.id,
            IDS.branch1,
          ],
        );
        await client.query(
          `INSERT INTO user_branch_access (user_id,branch_id)
           VALUES ($1,$2)`,
          [IDS.branch1User, IDS.branch1],
        );
      });

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
        allowsFraction: true,
      });

      const product = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "WA Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const roundingProduct = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "WA Rounding Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const rollbackProduct = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "WA Rollback Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const negativeProduct = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "WA Negative Edge Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });

      const variantId = product.variants[0].id;
      const roundingVariantId = roundingProduct.variants[0].id;
      const rollbackVariantId = rollbackProduct.variants[0].id;
      const negativeVariantId = negativeProduct.variants[0].id;

      assert.equal(
        await costs.getCost({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId,
        }),
        null,
        "read path must not create a cost projection row",
      );
      const noGhostRows = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM inventory_stock_positions
             WHERE warehouse_id=$1 AND variant_id=$2) AS stock_count,
           (SELECT count(*)::int
              FROM variant_warehouse_cost_projection
             WHERE warehouse_id=$1 AND variant_id=$2) AS cost_count`,
        [IDS.warehouse1, variantId],
      );
      assert.deepEqual(noGhostRows.rows[0], {
        stock_count: 0,
        cost_count: 0,
      });

      const purchase1 = await withTransaction(
        pool,
        (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "10",
            unitCost: "100",
            lastPurchaseCost: "100",
          }),
      );
      assert.equal(purchase1.position.onHand, "10.000000");
      assert.equal(
        purchase1.cost.weightedAverageCost,
        "100.0000",
      );
      assert.equal(
        purchase1.cost.lastPurchaseCost,
        "100.0000",
      );
      assert.equal(
        purchase1.cost.inventoryValue,
        "1000.0000",
      );
      assert.equal(purchase1.inboundValue, "1000.0000");

      const purchase2 = await withTransaction(
        pool,
        (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "10",
            unitCost: "200",
            lastPurchaseCost: "200",
          }),
      );
      assert.equal(purchase2.position.onHand, "20.000000");
      assert.equal(
        purchase2.cost.weightedAverageCost,
        "150.0000",
      );
      assert.equal(
        purchase2.cost.lastPurchaseCost,
        "200.0000",
      );
      assert.equal(
        purchase2.cost.inventoryValue,
        "3000.0000",
      );

      const sale = await withTransaction(
        pool,
        (client) =>
          costs.applyOutboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "5",
          }),
      );
      assert.equal(sale.position.onHand, "15.000000");
      assert.equal(sale.unitCost, "150.0000");
      assert.equal(sale.totalCost, "750.0000");
      assert.equal(
        sale.cost.weightedAverageCost,
        "150.0000",
      );
      assert.equal(
        sale.cost.lastPurchaseCost,
        "200.0000",
      );
      assert.equal(
        sale.cost.inventoryValue,
        "2250.0000",
      );

      const linkedSalesReturn = await withTransaction(
        pool,
        (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "5",
            unitCost: "100",
          }),
      );
      assert.equal(
        linkedSalesReturn.position.onHand,
        "20.000000",
      );
      assert.equal(
        linkedSalesReturn.cost.weightedAverageCost,
        "137.5000",
      );
      assert.equal(
        linkedSalesReturn.cost.lastPurchaseCost,
        "200.0000",
        "non-purchase inbound must not rewrite Last Purchase Cost",
      );
      assert.equal(
        linkedSalesReturn.cost.inventoryValue,
        "2750.0000",
      );

      const purchaseReturnStyle = await withTransaction(
        pool,
        (client) =>
          costs.applyOutboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "2",
          }),
      );
      assert.equal(
        purchaseReturnStyle.position.onHand,
        "18.000000",
      );
      assert.equal(
        purchaseReturnStyle.unitCost,
        "137.5000",
      );
      assert.equal(
        purchaseReturnStyle.totalCost,
        "275.0000",
      );
      assert.equal(
        purchaseReturnStyle.cost.weightedAverageCost,
        "137.5000",
      );
      assert.equal(
        purchaseReturnStyle.cost.lastPurchaseCost,
        "200.0000",
      );
      assert.equal(
        purchaseReturnStyle.cost.inventoryValue,
        "2475.0000",
      );

      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: roundingVariantId,
          quantity: "1",
          unitCost: "10",
          lastPurchaseCost: "10",
        }),
      );
      const rounded = await withTransaction(
        pool,
        (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: roundingVariantId,
            quantity: "2",
            unitCost: "11",
            lastPurchaseCost: "11",
          }),
      );
      assert.equal(
        rounded.cost.weightedAverageCost,
        "10.6667",
      );
      assert.equal(
        rounded.cost.inventoryValue,
        "32.0001",
        "Inventory Value must equal rounded On Hand × rounded WA",
      );

      await assert.rejects(
        withTransaction(pool, async (client) => {
          await costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: rollbackVariantId,
            quantity: "5",
            unitCost: "50",
            lastPurchaseCost: "50",
          });
          throw new Error("force WA rollback");
        }),
        /force WA rollback/,
      );
      assert.equal(
        await costs.getCost({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: rollbackVariantId,
        }),
        null,
      );
      const rollbackRows = await pool.query(
        `SELECT
           (SELECT count(*)::int
              FROM inventory_stock_positions
             WHERE warehouse_id=$1 AND variant_id=$2) AS stock_count,
           (SELECT count(*)::int
              FROM variant_warehouse_cost_projection
             WHERE warehouse_id=$1 AND variant_id=$2) AS cost_count`,
        [IDS.warehouse1, rollbackVariantId],
      );
      assert.deepEqual(rollbackRows.rows[0], {
        stock_count: 0,
        cost_count: 0,
      });

      await assert.rejects(
        withTransaction(pool, (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.branch1User,
            warehouseId: IDS.warehouse2,
            variantId,
            quantity: "1",
            unitCost: "100",
            lastPurchaseCost: "100",
          }),
        ),
        BranchAccessDeniedError,
      );

      await Promise.all([
        withTransaction(pool, async (client) => {
          const locked =
            await costs.lockManyWithinTransaction(client, {
              actorUserId: IDS.admin,
              positions: [
                {
                  warehouseId: IDS.warehouse2,
                  variantId: roundingVariantId,
                },
                {
                  warehouseId: IDS.warehouse1,
                  variantId: roundingVariantId,
                },
              ],
            });
          assert.deepEqual(
            locked.map(
              (row) => row.position.warehouseId,
            ),
            [IDS.warehouse1, IDS.warehouse2],
          );
          await delay(50);
        }),
        withTransaction(pool, async (client) => {
          const locked =
            await costs.lockManyWithinTransaction(client, {
              actorUserId: IDS.admin,
              positions: [
                {
                  warehouseId: IDS.warehouse1,
                  variantId: roundingVariantId,
                },
                {
                  warehouseId: IDS.warehouse2,
                  variantId: roundingVariantId,
                },
              ],
            });
          assert.deepEqual(
            locked.map(
              (row) => row.position.warehouseId,
            ),
            [IDS.warehouse1, IDS.warehouse2],
          );
        }),
      ]);

      await pool.query(
        `UPDATE variant_warehouse_cost_projection
            SET inventory_value=999
          WHERE warehouse_id=$1
            AND variant_id=$2`,
        [IDS.warehouse1, variantId],
      );
      await assert.rejects(
        withTransaction(pool, (client) =>
          costs.applyOutboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            quantity: "1",
          }),
        ),
        (error) =>
          error instanceof InventoryCostError &&
          error.reason === "COST_PROJECTION_DRIFT",
      );
      await pool.query(
        `UPDATE variant_warehouse_cost_projection
            SET inventory_value=2475
          WHERE warehouse_id=$1
            AND variant_id=$2`,
        [IDS.warehouse1, variantId],
      );

      await withTransaction(pool, (client) =>
        costs.applyInboundWithinTransaction(client, {
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: negativeVariantId,
          quantity: "1",
          unitCost: "100",
          lastPurchaseCost: "100",
        }),
      );
      const negative = await withTransaction(
        pool,
        (client) =>
          costs.applyOutboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: negativeVariantId,
            quantity: "2",
          }),
      );
      assert.equal(negative.position.onHand, "-1.000000");
      assert.equal(
        negative.cost.weightedAverageCost,
        "100.0000",
      );
      assert.equal(
        negative.cost.inventoryValue,
        "-100.0000",
      );

      await assert.rejects(
        withTransaction(pool, (client) =>
          costs.applyInboundWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: negativeVariantId,
            quantity: "1",
            unitCost: "120",
            lastPurchaseCost: "120",
          }),
        ),
        (error) =>
          error instanceof InventoryCostError &&
          error.reason ===
            "ZERO_QUANTITY_VALUE_RESIDUAL",
      );
      const afterResidualReject = await costs.getCost({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse1,
        variantId: negativeVariantId,
      });
      assert.equal(
        afterResidualReject?.weightedAverageCost,
        "100.0000",
      );
      assert.equal(
        afterResidualReject?.lastPurchaseCost,
        "100.0000",
      );
      assert.equal(
        afterResidualReject?.inventoryValue,
        "-100.0000",
      );

      const workers = 20;
      await Promise.all(
        Array.from({ length: workers }, () =>
          withTransaction(pool, (client) =>
            costs.applyInboundWithinTransaction(client, {
              actorUserId: IDS.admin,
              warehouseId: IDS.warehouse3,
              variantId: rollbackVariantId,
              quantity: "1",
              unitCost: "100",
              lastPurchaseCost: "100",
            }),
          ),
        ),
      );

      const concurrentCost = await costs.getCost({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse3,
        variantId: rollbackVariantId,
      });
      assert.equal(
        concurrentCost?.weightedAverageCost,
        "100.0000",
      );
      assert.equal(
        concurrentCost?.lastPurchaseCost,
        "100.0000",
      );
      assert.equal(
        concurrentCost?.inventoryValue,
        "2000.0000",
      );

      const concurrentStock = await pool.query(
        `SELECT
           on_hand::text AS on_hand,
           reserved::text AS reserved,
           version
         FROM inventory_stock_positions
        WHERE warehouse_id=$1
          AND variant_id=$2`,
        [IDS.warehouse3, rollbackVariantId],
      );
      assert.deepEqual(concurrentStock.rows[0], {
        on_hand: "20.000000",
        reserved: "0.000000",
        version: 20,
      });

      const valueFormula = await pool.query(
        `SELECT count(*)::int AS mismatches
           FROM variant_warehouse_cost_projection c
           JOIN inventory_stock_positions s
             ON s.warehouse_id=c.warehouse_id
            AND s.variant_id=c.variant_id
          WHERE c.inventory_value
             <> round(
                  s.on_hand * c.weighted_average_cost,
                  4
                )`,
      );
      assert.equal(
        valueFormula.rows[0]?.mismatches,
        0,
        "every persisted cost row must satisfy Inventory Value = On Hand × WA at numeric(18,4)",
      );

      assert.deepEqual(
        await indexNames(
          pool,
          "variant_warehouse_cost_projection",
        ),
        [
          "ix_variant_warehouse_cost_projection__variant_id_warehouse_id",
          "pk_variant_warehouse_cost_projection",
        ],
      );

      const history = await pool.query(
        "SELECT version,name FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(history.rows.at(-1), {
        version: "0025",
        name: "batch_expiry_permission",
      });

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
