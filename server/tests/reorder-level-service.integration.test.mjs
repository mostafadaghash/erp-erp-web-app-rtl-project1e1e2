import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import {
  ReorderLevelService,
} from "../infrastructure/products/reorder-level-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7600000-0000-4000-8000-000000000001",
  branch1: "b7600000-0000-4000-8000-000000000002",
  branch2: "b7600000-0000-4000-8000-000000000003",
  warehouse1: "b7600000-0000-4000-8000-000000000004",
  warehouse2: "b7600000-0000-4000-8000-000000000005",
  warehouse3: "b7600000-0000-4000-8000-000000000006",
  admin: "b7600000-0000-4000-8000-000000000007",
  selected1: "b7600000-0000-4000-8000-000000000008",
  selected2: "b7600000-0000-4000-8000-000000000009",
  category: "b7600000-0000-4000-8000-000000000010",
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

async function seedSelectedScope(
  pool,
  userId,
  branchId,
) {
  await pool.query(
    `INSERT INTO user_branch_access (user_id,branch_id)
     VALUES ($1,$2)`,
    [userId, branchId],
  );
  await pool.query(
    `UPDATE users
        SET branch_scope_mode='SELECTED'
      WHERE id=$1`,
    [userId],
  );
}

test(
  "07.06 Reorder Levels use Available and enforce Branch Scope on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name:
        "business-tech-erp-reorder-levels-0706-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const products = new ProductModelService(database);
    const units = new ProductUnitService(database);
    const reorder = new ReorderLevelService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0026");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(
        version.rows[0]?.server_version_num,
      );
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `07.06 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Reorder Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Reorder Admin','phase07-reorder-admin','phase07-reorder-admin@example.test',
           'test-only-hash',$4,$5,'ALL','ar-EG',true,NULL,now(),now()),
          ($2,'Branch One User','phase07-reorder-b1','phase07-reorder-b1@example.test',
           'test-only-hash',$4,$5,'ALL','ar-EG',true,NULL,now(),now()),
          ($3,'Branch Two User','phase07-reorder-b2','phase07-reorder-b2@example.test',
           'test-only-hash',$4,$6,'ALL','ar-EG',true,NULL,now(),now())`,
        [
          IDS.admin,
          IDS.selected1,
          IDS.selected2,
          systemAdmin.id,
          IDS.branch1,
          IDS.branch2,
        ],
      );

      await seedSelectedScope(
        pool,
        IDS.selected1,
        IDS.branch1,
      );
      await seedSelectedScope(
        pool,
        IDS.selected2,
        IDS.branch2,
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
        name: "Reorder Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;

      const firstLevel = await reorder.setReorderLevel({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse1,
        variantId,
        minimumQuantity: "5",
      });
      assert.deepEqual(firstLevel, {
        branchId: IDS.branch1,
        warehouseId: IDS.warehouse1,
        variantId,
        minimumQuantity: "5.000000",
      });

      const updatedLevel = await reorder.setReorderLevel({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse1,
        variantId,
        minimumQuantity: "6",
      });
      assert.equal(updatedLevel.minimumQuantity, "6.000000");

      await reorder.setReorderLevel({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse2,
        variantId,
        minimumQuantity: "3",
      });
      await reorder.setReorderLevel({
        actorUserId: IDS.admin,
        warehouseId: IDS.warehouse3,
        variantId,
        minimumQuantity: "4",
      });

      const uniqueRows = await pool.query(
        `SELECT warehouse_id,COUNT(*)::integer AS count
           FROM reorder_levels
          WHERE variant_id=$1
          GROUP BY warehouse_id
          ORDER BY warehouse_id`,
        [variantId],
      );
      assert.deepEqual(
        uniqueRows.rows.map((row) => row.count),
        [1, 1, 1],
      );

      await pool.query(
        `INSERT INTO inventory_stock_positions
          (warehouse_id,variant_id,on_hand,reserved,version,updated_at)
         VALUES
          ($1,$3,10.000000,5.000000,0,now()),
          ($2,$3,3.000000,0.000000,0,now())`,
        [IDS.warehouse1, IDS.warehouse2, variantId],
      );

      const branchOneAlerts =
        await reorder.listLowStockAlerts({
          actorUserId: IDS.selected1,
        });
      assert.equal(branchOneAlerts.length, 2);
      assert.deepEqual(
        new Set(
          branchOneAlerts.map(
            (alert) => alert.warehouseId,
          ),
        ),
        new Set([IDS.warehouse1, IDS.warehouse3]),
      );

      const warehouseOneAlert = branchOneAlerts.find(
        (alert) => alert.warehouseId === IDS.warehouse1,
      );
      assert.ok(warehouseOneAlert);
      assert.equal(warehouseOneAlert.onHand, "10.000000");
      assert.equal(warehouseOneAlert.reserved, "5.000000");
      assert.equal(warehouseOneAlert.available, "5.000000");
      assert.equal(
        warehouseOneAlert.minimumQuantity,
        "6.000000",
      );
      assert.equal(
        warehouseOneAlert.shortageQuantity,
        "1.000000",
      );

      const missingPositionAlert = branchOneAlerts.find(
        (alert) => alert.warehouseId === IDS.warehouse3,
      );
      assert.ok(missingPositionAlert);
      assert.equal(missingPositionAlert.onHand, "0.000000");
      assert.equal(missingPositionAlert.reserved, "0.000000");
      assert.equal(missingPositionAlert.available, "0.000000");
      assert.equal(
        missingPositionAlert.shortageQuantity,
        "4.000000",
      );

      const branchTwoBefore =
        await reorder.listLowStockAlerts({
          actorUserId: IDS.selected2,
        });
      assert.deepEqual(branchTwoBefore, []);

      const allBefore = await reorder.listLowStockAlerts({
        actorUserId: IDS.admin,
      });
      assert.equal(allBefore.length, 2);
      assert.equal(
        allBefore.some(
          (alert) => alert.warehouseId === IDS.warehouse2,
        ),
        false,
        "Available equal to minimum must not be a low-stock alert",
      );

      await pool.query(
        `UPDATE inventory_stock_positions
            SET reserved=1.000000,
                version=version+1,
                updated_at=clock_timestamp()
          WHERE warehouse_id=$1
            AND variant_id=$2`,
        [IDS.warehouse2, variantId],
      );

      const branchTwoAfter =
        await reorder.listLowStockAlerts({
          actorUserId: IDS.selected2,
        });
      assert.equal(branchTwoAfter.length, 1);
      assert.equal(
        branchTwoAfter[0]?.warehouseId,
        IDS.warehouse2,
      );
      assert.equal(
        branchTwoAfter[0]?.available,
        "2.000000",
      );
      assert.equal(
        branchTwoAfter[0]?.shortageQuantity,
        "1.000000",
      );

      const allAfter = await reorder.listLowStockAlerts({
        actorUserId: IDS.admin,
      });
      assert.equal(allAfter.length, 3);

      const explicitBranch =
        await reorder.listLowStockAlerts({
          actorUserId: IDS.admin,
          branchId: IDS.branch2,
        });
      assert.equal(explicitBranch.length, 1);
      assert.equal(
        explicitBranch[0]?.branchId,
        IDS.branch2,
      );

      const readableLevel = await reorder.getReorderLevel({
        actorUserId: IDS.selected1,
        warehouseId: IDS.warehouse1,
        variantId,
      });
      assert.equal(
        readableLevel?.minimumQuantity,
        "6.000000",
      );

      await assert.rejects(
        () =>
          reorder.setReorderLevel({
            actorUserId: IDS.selected1,
            warehouseId: IDS.warehouse2,
            variantId,
            minimumQuantity: "7",
          }),
        (error) =>
          error instanceof BranchAccessDeniedError &&
          error.branchId === IDS.branch2,
      );

      await assert.rejects(
        () =>
          reorder.getReorderLevel({
            actorUserId: IDS.selected1,
            warehouseId: IDS.warehouse2,
            variantId,
          }),
        (error) =>
          error instanceof BranchAccessDeniedError &&
          error.branchId === IDS.branch2,
      );

      await assert.rejects(
        () =>
          reorder.listLowStockAlerts({
            actorUserId: IDS.selected1,
            branchId: IDS.branch2,
          }),
        (error) =>
          error instanceof BranchAccessDeniedError &&
          error.branchId === IDS.branch2,
      );

      assert.equal(
        await reorder.clearReorderLevel({
          actorUserId: IDS.selected1,
          warehouseId: IDS.warehouse3,
          variantId,
        }),
        true,
      );
      assert.equal(
        await reorder.clearReorderLevel({
          actorUserId: IDS.selected1,
          warehouseId: IDS.warehouse3,
          variantId,
        }),
        false,
      );

      const branchOneAfterClear =
        await reorder.listLowStockAlerts({
          actorUserId: IDS.selected1,
        });
      assert.deepEqual(
        branchOneAfterClear.map(
          (alert) => alert.warehouseId,
        ),
        [IDS.warehouse1],
      );

      const audit = await pool.query(
        `SELECT action,branch_id,entity_id,after_json
           FROM audit_logs
          WHERE action IN (
            'REORDER_LEVEL_UPSERTED',
            'REORDER_LEVEL_CLEARED'
          )
          ORDER BY created_at,id`,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "REORDER_LEVEL_UPSERTED",
        ).length,
        4,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "REORDER_LEVEL_CLEARED",
        ).length,
        1,
      );
      assert.ok(
        audit.rows.every(
          (row) => row.entity_id === variantId,
        ),
      );

      assert.deepEqual(await indexNames(pool, "reorder_levels"), [
        "ix_reorder_levels__warehouse_id_variant_id",
        "pk_reorder_levels",
      ]);
      assert.deepEqual(
        await indexNames(pool, "inventory_stock_positions"),
        [
          "ix_inventory_stock_positions__variant_id_warehouse_id",
          "pk_inventory_stock_positions",
        ],
      );

      const history = await pool.query(
        "SELECT version,name FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(history.rows.at(-1), {
        version: "0026",
        name: "inventory_adjustment_permissions",
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
