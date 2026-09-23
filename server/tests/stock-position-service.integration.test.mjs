import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  StockPositionError,
  StockPositionService,
} from "../infrastructure/inventory/stock-position-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b9000000-0000-4000-8000-000000000001",
  branch1: "b9000000-0000-4000-8000-000000000002",
  branch2: "b9000000-0000-4000-8000-000000000003",
  warehouse1: "b9000000-0000-4000-8000-000000000004",
  warehouse2: "b9000000-0000-4000-8000-000000000005",
  warehouse3: "b9000000-0000-4000-8000-000000000006",
  admin: "b9000000-0000-4000-8000-000000000007",
  branch1User: "b9000000-0000-4000-8000-000000000008",
  category: "b9000000-0000-4000-8000-000000000009",
});

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test(
  "08.02 Stock Positions are synchronous lock rows with exact deltas, derived availability, versioning, branch scope, rollback, and concurrency safety on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 32,
      application_name:
        "business-tech-erp-stock-positions-0802-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const units = new ProductUnitService(database);
    const products = new ProductModelService(database);
    const positions = new StockPositionService(database);

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
        `08.02 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Stock Position Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
            ($1,'Stock Admin','phase08-stock-admin','phase08-stock-admin@example.test',
             'test-only-hash',$3,$4,'ALL','ar-EG',true,NULL,now(),now()),
            ($2,'Branch One User','phase08-stock-b1','phase08-stock-b1@example.test',
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
        allowsFraction: false,
      });
      const product = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Stock Position Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const product2 = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Rollback Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;
      const variant2Id = product2.variants[0].id;

      assert.equal(
        await positions.getPosition({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId,
        }),
        null,
      );

      const received = await withTransaction(
        pool,
        (client) =>
          positions.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "10",
            reservedDelta: "0",
          }),
      );
      assert.equal(received.onHand, "10.000000");
      assert.equal(received.reserved, "0.000000");
      assert.equal(received.available, "10.000000");
      assert.equal(received.version, 1);

      const reserved = await withTransaction(
        pool,
        (client) =>
          positions.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "0",
            reservedDelta: "3",
          }),
      );
      assert.equal(reserved.onHand, "10.000000");
      assert.equal(reserved.reserved, "3.000000");
      assert.equal(reserved.available, "7.000000");
      assert.equal(reserved.version, 2);

      const shortfall = await withTransaction(
        pool,
        (client) =>
          positions.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "-12",
            reservedDelta: "0",
          }),
      );
      assert.equal(shortfall.onHand, "-2.000000");
      assert.equal(shortfall.reserved, "3.000000");
      assert.equal(shortfall.available, "-5.000000");
      assert.equal(shortfall.version, 3);

      await assert.rejects(
        withTransaction(pool, (client) =>
          positions.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "0",
            reservedDelta: "-4",
          }),
        ),
        (error) =>
          error instanceof StockPositionError &&
          error.reason === "RESERVED_WOULD_BE_NEGATIVE",
      );
      const afterRejectedReserved =
        await positions.getPosition({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId,
        });
      assert.equal(afterRejectedReserved?.reserved, "3.000000");
      assert.equal(afterRejectedReserved?.version, 3);

      await assert.rejects(
        () =>
          positions.getPosition({
            actorUserId: IDS.branch1User,
            warehouseId: IDS.warehouse2,
            variantId,
          }),
        BranchAccessDeniedError,
      );

      await assert.rejects(
        withTransaction(pool, async (client) => {
          await positions.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId: variant2Id,
            onHandDelta: "5",
            reservedDelta: "0",
          });
          throw new Error("force rollback");
        }),
        /force rollback/,
      );
      assert.equal(
        await positions.getPosition({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse1,
          variantId: variant2Id,
        }),
        null,
      );

      await Promise.all([
        withTransaction(pool, async (client) => {
          const locked = await positions.lockManyWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              positions: [
                {
                  warehouseId: IDS.warehouse2,
                  variantId,
                },
                {
                  warehouseId: IDS.warehouse1,
                  variantId,
                },
              ],
            },
          );
          assert.deepEqual(
            locked.map((row) => row.warehouseId),
            [IDS.warehouse1, IDS.warehouse2],
          );
          await delay(50);
        }),
        withTransaction(pool, async (client) => {
          const locked = await positions.lockManyWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              positions: [
                {
                  warehouseId: IDS.warehouse1,
                  variantId,
                },
                {
                  warehouseId: IDS.warehouse2,
                  variantId,
                },
              ],
            },
          );
          assert.deepEqual(
            locked.map((row) => row.warehouseId),
            [IDS.warehouse1, IDS.warehouse2],
          );
        }),
      ]);

      const workers = 20;
      await Promise.all(
        Array.from({ length: workers }, () =>
          withTransaction(pool, (client) =>
            positions.applyDeltaWithinTransaction(client, {
              actorUserId: IDS.admin,
              warehouseId: IDS.warehouse3,
              variantId,
              onHandDelta: "1",
              reservedDelta: "0",
            }),
          ),
        ),
      );

      const concurrent =
        await positions.getPosition({
          actorUserId: IDS.admin,
          warehouseId: IDS.warehouse3,
          variantId,
        });
      assert.equal(concurrent?.onHand, "20.000000");
      assert.equal(concurrent?.reserved, "0.000000");
      assert.equal(concurrent?.available, "20.000000");
      assert.equal(concurrent?.version, workers);

      const physicalAvailable = await pool.query(
        `SELECT EXISTS (
           SELECT 1
             FROM information_schema.columns
            WHERE table_schema='public'
              AND table_name='inventory_stock_positions'
              AND column_name='available'
         ) AS has_available_column`,
      );
      assert.equal(
        physicalAvailable.rows[0]?.has_available_column,
        false,
        "08.02 uses the v1.7-approved derived expression instead of a writable available column",
      );

      const indexes = await pool.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='inventory_stock_positions'
          ORDER BY indexname`,
      );
      assert.deepEqual(
        indexes.rows.map((row) => row.indexname),
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
