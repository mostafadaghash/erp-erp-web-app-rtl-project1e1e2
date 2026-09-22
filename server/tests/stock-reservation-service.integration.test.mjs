import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  StockReservationError,
  StockReservationService,
} from "../infrastructure/inventory/stock-reservation-service.ts";
import { StockPositionService } from "../infrastructure/inventory/stock-position-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "bb000000-0000-4000-8000-000000000001",
  branch1: "bb000000-0000-4000-8000-000000000002",
  branch2: "bb000000-0000-4000-8000-000000000003",
  warehouse1: "bb000000-0000-4000-8000-000000000004",
  warehouse1b: "bb000000-0000-4000-8000-000000000005",
  warehouseRace: "bb000000-0000-4000-8000-000000000006",
  warehouseStress: "bb000000-0000-4000-8000-000000000007",
  warehouseBranch2: "bb000000-0000-4000-8000-000000000008",
  admin: "bb000000-0000-4000-8000-000000000009",
  branch1User: "bb000000-0000-4000-8000-000000000010",
  category: "bb000000-0000-4000-8000-000000000011",
  counterparty: "bb000000-0000-4000-8000-000000000012",
  priceList: "bb000000-0000-4000-8000-000000000013",
});

async function insertOrder(
  pool,
  {
    orderId,
    lineId,
    branchId,
    warehouseId,
    documentNumber,
    userId,
    variantId,
    productUnitId,
    orderedQuantity,
  },
) {
  await pool.query(
    `INSERT INTO sales_orders
      (id,branch_id,document_number,counterparty_id,warehouse_id,price_list_id,
       status,delivery_method,sales_user_id,customer_service_user_id,
       customer_notes,internal_notes,source_quote_id,version,created_at,updated_at)
     VALUES
      ($1,$2,$3,$4,$5,$6,'CONFIRMED','PICKUP',$7,$7,NULL,NULL,NULL,1,now(),now())`,
    [
      orderId,
      branchId,
      documentNumber,
      IDS.counterparty,
      warehouseId,
      IDS.priceList,
      userId,
    ],
  );
  await pool.query(
    `INSERT INTO sales_order_lines
      (id,sales_order_id,variant_id,product_unit_id,ordered_quantity,
       unit_price,discount_amount,tax_code_id,line_total)
     VALUES ($1,$2,$3,$4,$5,100.0000,0.0000,NULL,$6)`,
    [
      lineId,
      orderId,
      variantId,
      productUnitId,
      orderedQuantity,
      (
        Number(orderedQuantity) * 100
      ).toFixed(4),
    ],
  );
}

async function stockState(pool, warehouseId, variantId) {
  const result = await pool.query(
    `SELECT
       on_hand::text AS on_hand,
       reserved::text AS reserved,
       (on_hand-reserved)::numeric(18,6)::text AS available,
       version
     FROM inventory_stock_positions
    WHERE warehouse_id=$1 AND variant_id=$2`,
    [warehouseId, variantId],
  );
  return result.rows[0] ?? null;
}

test(
  "08.04 Reservations preserve Available, history and concurrency safety on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 40,
      application_name:
        "business-tech-erp-reservations-0804-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const units = new ProductUnitService(database);
    const products = new ProductModelService(database);
    const stock = new StockPositionService(database);
    const reservations = new StockReservationService(database);

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
        `08.04 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Reservation Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,$6,'Warehouse One','W1',true,now(),now()),
          ($2,$6,'Warehouse One B','W1B',true,now(),now()),
          ($3,$6,'Warehouse Race','WR',true,now(),now()),
          ($4,$6,'Warehouse Stress','WS',true,now(),now()),
          ($5,$7,'Warehouse Branch Two','W2',true,now(),now())`,
        [
          IDS.warehouse1,
          IDS.warehouse1b,
          IDS.warehouseRace,
          IDS.warehouseStress,
          IDS.warehouseBranch2,
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
            ($1,'Reservation Admin','phase08-reservation-admin','phase08-reservation-admin@example.test',
             'test-only-hash',$3,$4,'ALL','ar-EG',true,NULL,now(),now()),
            ($2,'Branch One Reservation User','phase08-reservation-b1','phase08-reservation-b1@example.test',
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
        `INSERT INTO counterparties
          (id,name,phone,normalized_phone,address,notes,is_active,created_at,updated_at)
         VALUES ($1,'Reservation Customer',NULL,NULL,NULL,NULL,true,now(),now())`,
        [IDS.counterparty],
      );
      await pool.query(
        `INSERT INTO price_lists
          (id,name,is_active,created_at,updated_at)
         VALUES ($1,'Reservation Price List',true,now(),now())`,
        [IDS.priceList],
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
      const product = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Reservation Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;
      const productUnitId = product.baseProductUnit.id;

      await Promise.all([
        withTransaction(pool, (client) =>
          stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "10",
            reservedDelta: "0",
          }),
        ),
        withTransaction(pool, (client) =>
          stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1b,
            variantId,
            onHandDelta: "5",
            reservedDelta: "0",
          }),
        ),
        withTransaction(pool, (client) =>
          stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouseRace,
            variantId,
            onHandDelta: "10",
            reservedDelta: "0",
          }),
        ),
        withTransaction(pool, (client) =>
          stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouseStress,
            variantId,
            onHandDelta: "20",
            reservedDelta: "0",
          }),
        ),
        withTransaction(pool, (client) =>
          stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouseBranch2,
            variantId,
            onHandDelta: "10",
            reservedDelta: "0",
          }),
        ),
      ]);

      const order1 =
        "bb100000-0000-4000-8000-000000000001";
      const line1 =
        "bb200000-0000-4000-8000-000000000001";
      await insertOrder(pool, {
        orderId: order1,
        lineId: line1,
        branchId: IDS.branch1,
        warehouseId: IDS.warehouse1,
        documentNumber: 1,
        userId: IDS.admin,
        variantId,
        productUnitId,
        orderedQuantity: "20.000000",
      });

      const initial = await withTransaction(
        pool,
        (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: order1,
              salesOrderLineId: line1,
              warehouseId: IDS.warehouse1,
              variantId,
              desiredQuantity: "6",
            },
          ),
      );
      assert.equal(initial.status, "ACTIVE");
      assert.equal(initial.quantity, "6.000000");
      assert.deepEqual(
        await stockState(pool, IDS.warehouse1, variantId),
        {
          on_hand: "10.000000",
          reserved: "6.000000",
          available: "4.000000",
          version: 2,
        },
      );

      const increased = await withTransaction(
        pool,
        (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: order1,
              salesOrderLineId: line1,
              warehouseId: IDS.warehouse1,
              variantId,
              desiredQuantity: "8",
            },
          ),
      );
      assert.equal(increased.quantity, "8.000000");
      assert.deepEqual(
        await stockState(pool, IDS.warehouse1, variantId),
        {
          on_hand: "10.000000",
          reserved: "8.000000",
          available: "2.000000",
          version: 3,
        },
      );

      const decreased = await withTransaction(
        pool,
        (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: order1,
              salesOrderLineId: line1,
              warehouseId: IDS.warehouse1,
              variantId,
              desiredQuantity: "5",
            },
          ),
      );
      assert.equal(decreased.quantity, "5.000000");
      assert.deepEqual(
        await stockState(pool, IDS.warehouse1, variantId),
        {
          on_hand: "10.000000",
          reserved: "5.000000",
          available: "5.000000",
          version: 4,
        },
      );

      await assert.rejects(
        withTransaction(pool, (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: order1,
              salesOrderLineId: line1,
              warehouseId: IDS.warehouse1,
              variantId,
              desiredQuantity: "11",
            },
          ),
        ),
        (error) =>
          error instanceof StockReservationError &&
          error.reason === "INSUFFICIENT_AVAILABLE",
      );
      assert.equal(
        (await stockState(pool, IDS.warehouse1, variantId))
          ?.reserved,
        "5.000000",
      );

      await assert.rejects(
        withTransaction(pool, (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: order1,
              salesOrderLineId: line1,
              warehouseId: IDS.warehouse1,
              variantId,
              desiredQuantity: "21",
            },
          ),
        ),
        (error) =>
          error instanceof StockReservationError &&
          error.reason ===
            "DESIRED_QUANTITY_EXCEEDS_ORDER_LINE",
      );

      const partial = await withTransaction(
        pool,
        async (client) => {
          const consumed =
            await reservations.consumeWithinTransaction(
              client,
              {
                actorUserId: IDS.admin,
                salesOrderId: order1,
                salesOrderLineId: line1,
                quantity: "2",
              },
            );
          const beforeInventorySale =
            await client.query(
              `SELECT on_hand::text AS on_hand,reserved::text AS reserved
                 FROM inventory_stock_positions
                WHERE warehouse_id=$1 AND variant_id=$2`,
              [IDS.warehouse1, variantId],
            );
          assert.deepEqual(beforeInventorySale.rows[0], {
            on_hand: "10.000000",
            reserved: "3.000000",
          });
          await stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "-2",
            reservedDelta: "0",
          });
          return consumed;
        },
      );
      assert.equal(partial.status, "PARTIALLY_CONSUMED");
      assert.equal(partial.quantity, "3.000000");
      assert.deepEqual(
        await stockState(pool, IDS.warehouse1, variantId),
        {
          on_hand: "8.000000",
          reserved: "3.000000",
          available: "5.000000",
          version: 6,
        },
      );

      const consumedFinal = await withTransaction(
        pool,
        async (client) => {
          const consumed =
            await reservations.consumeWithinTransaction(
              client,
              {
                actorUserId: IDS.admin,
                salesOrderId: order1,
                salesOrderLineId: line1,
                quantity: "3",
              },
            );
          await stock.applyDeltaWithinTransaction(client, {
            actorUserId: IDS.admin,
            warehouseId: IDS.warehouse1,
            variantId,
            onHandDelta: "-3",
            reservedDelta: "0",
          });
          return consumed;
        },
      );
      assert.equal(consumedFinal.status, "CONSUMED");
      assert.equal(consumedFinal.releasedAt, null);
      assert.deepEqual(
        await stockState(pool, IDS.warehouse1, variantId),
        {
          on_hand: "5.000000",
          reserved: "0.000000",
          available: "5.000000",
          version: 8,
        },
      );
      assert.equal(
        await reservations.getActiveForLine({
          actorUserId: IDS.admin,
          salesOrderId: order1,
          salesOrderLineId: line1,
        }),
        null,
      );

      const cancelOrder =
        "bb100000-0000-4000-8000-000000000002";
      const cancelLine =
        "bb200000-0000-4000-8000-000000000002";
      await insertOrder(pool, {
        orderId: cancelOrder,
        lineId: cancelLine,
        branchId: IDS.branch1,
        warehouseId: IDS.warehouse1,
        documentNumber: 2,
        userId: IDS.admin,
        variantId,
        productUnitId,
        orderedQuantity: "2.000000",
      });
      await withTransaction(pool, (client) =>
        reservations.setLineReservationWithinTransaction(
          client,
          {
            actorUserId: IDS.admin,
            salesOrderId: cancelOrder,
            salesOrderLineId: cancelLine,
            warehouseId: IDS.warehouse1,
            variantId,
            desiredQuantity: "2",
          },
        ),
      );
      const released = await withTransaction(
        pool,
        (client) =>
          reservations.releaseRemainingWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: cancelOrder,
              salesOrderLineId: cancelLine,
            },
          ),
      );
      assert.equal(released?.status, "RELEASED");
      assert.ok(released?.releasedAt instanceof Date);
      assert.equal(
        await withTransaction(pool, (client) =>
          reservations.releaseRemainingWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: cancelOrder,
              salesOrderLineId: cancelLine,
            },
          ),
        ),
        null,
      );

      const moveOrder =
        "bb100000-0000-4000-8000-000000000003";
      const moveLine =
        "bb200000-0000-4000-8000-000000000003";
      await insertOrder(pool, {
        orderId: moveOrder,
        lineId: moveLine,
        branchId: IDS.branch1,
        warehouseId: IDS.warehouse1,
        documentNumber: 3,
        userId: IDS.admin,
        variantId,
        productUnitId,
        orderedQuantity: "2.000000",
      });
      await withTransaction(pool, (client) =>
        reservations.setLineReservationWithinTransaction(
          client,
          {
            actorUserId: IDS.admin,
            salesOrderId: moveOrder,
            salesOrderLineId: moveLine,
            warehouseId: IDS.warehouse1,
            variantId,
            desiredQuantity: "2",
          },
        ),
      );

      const moved = await withTransaction(
        pool,
        async (client) => {
          const result =
            await reservations.replaceWarehouseWithinTransaction(
              client,
              {
                actorUserId: IDS.admin,
                salesOrderId: moveOrder,
                salesOrderLineId: moveLine,
                targetWarehouseId: IDS.warehouse1b,
              },
            );
          await client.query(
            `UPDATE sales_orders
                SET warehouse_id=$1,
                    version=version+1,
                    updated_at=now()
              WHERE id=$2`,
            [IDS.warehouse1b, moveOrder],
          );
          return result;
        },
      );
      assert.equal(moved.released.status, "RELEASED");
      assert.equal(
        moved.created.warehouseId,
        IDS.warehouse1b,
      );
      assert.equal(moved.created.status, "ACTIVE");
      assert.equal(moved.oldPosition.reserved, "0.000000");
      assert.equal(moved.newPosition.reserved, "2.000000");

      const incompleteMoveOrder =
        "bb100000-0000-4000-8000-000000000004";
      const incompleteMoveLine =
        "bb200000-0000-4000-8000-000000000004";
      await insertOrder(pool, {
        orderId: incompleteMoveOrder,
        lineId: incompleteMoveLine,
        branchId: IDS.branch1,
        warehouseId: IDS.warehouse1,
        documentNumber: 4,
        userId: IDS.admin,
        variantId,
        productUnitId,
        orderedQuantity: "1.000000",
      });
      await withTransaction(pool, (client) =>
        reservations.setLineReservationWithinTransaction(
          client,
          {
            actorUserId: IDS.admin,
            salesOrderId: incompleteMoveOrder,
            salesOrderLineId: incompleteMoveLine,
            warehouseId: IDS.warehouse1,
            variantId,
            desiredQuantity: "1",
          },
        ),
      );
      await assert.rejects(
        withTransaction(pool, (client) =>
          reservations.replaceWarehouseWithinTransaction(
            client,
            {
              actorUserId: IDS.admin,
              salesOrderId: incompleteMoveOrder,
              salesOrderLineId: incompleteMoveLine,
              targetWarehouseId: IDS.warehouse1b,
            },
          ),
        ),
        (error) =>
          error?.code === "23514" &&
          error?.constraint ===
            "ct_stock_reservations__sales_context_at_commit",
      );
      const incompleteActive =
        await reservations.getActiveForLine({
          actorUserId: IDS.admin,
          salesOrderId: incompleteMoveOrder,
          salesOrderLineId: incompleteMoveLine,
        });
      assert.equal(
        incompleteActive?.warehouseId,
        IDS.warehouse1,
      );

      const branch2Order =
        "bb100000-0000-4000-8000-000000000005";
      const branch2Line =
        "bb200000-0000-4000-8000-000000000005";
      await insertOrder(pool, {
        orderId: branch2Order,
        lineId: branch2Line,
        branchId: IDS.branch2,
        warehouseId: IDS.warehouseBranch2,
        documentNumber: 1,
        userId: IDS.admin,
        variantId,
        productUnitId,
        orderedQuantity: "1.000000",
      });
      await assert.rejects(
        withTransaction(pool, (client) =>
          reservations.setLineReservationWithinTransaction(
            client,
            {
              actorUserId: IDS.branch1User,
              salesOrderId: branch2Order,
              salesOrderLineId: branch2Line,
              warehouseId: IDS.warehouseBranch2,
              variantId,
              desiredQuantity: "1",
            },
          ),
        ),
        BranchAccessDeniedError,
      );

      const raceOrders = [
        {
          orderId:
            "bb100000-0000-4000-8000-000000000006",
          lineId:
            "bb200000-0000-4000-8000-000000000006",
          documentNumber: 6,
        },
        {
          orderId:
            "bb100000-0000-4000-8000-000000000007",
          lineId:
            "bb200000-0000-4000-8000-000000000007",
          documentNumber: 7,
        },
      ];
      for (const item of raceOrders) {
        await insertOrder(pool, {
          ...item,
          branchId: IDS.branch1,
          warehouseId: IDS.warehouseRace,
          userId: IDS.admin,
          variantId,
          productUnitId,
          orderedQuantity: "6.000000",
        });
      }

      const race = await Promise.allSettled(
        raceOrders.map((item) =>
          withTransaction(pool, (client) =>
            reservations.setLineReservationWithinTransaction(
              client,
              {
                actorUserId: IDS.admin,
                salesOrderId: item.orderId,
                salesOrderLineId: item.lineId,
                warehouseId: IDS.warehouseRace,
                variantId,
                desiredQuantity: "6",
              },
            ),
          ),
        ),
      );
      assert.equal(
        race.filter((result) => result.status === "fulfilled")
          .length,
        1,
      );
      assert.equal(
        race.filter(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof StockReservationError &&
            result.reason.reason === "INSUFFICIENT_AVAILABLE",
        ).length,
        1,
      );
      assert.deepEqual(
        await stockState(pool, IDS.warehouseRace, variantId),
        {
          on_hand: "10.000000",
          reserved: "6.000000",
          available: "4.000000",
          version: 2,
        },
      );

      const stressCount = 25;
      const stressOrders = [];
      for (let index = 0; index < stressCount; index += 1) {
        const suffix = String(index + 20).padStart(12, "0");
        const orderId =
          `bb110000-0000-4000-8000-${suffix}`;
        const lineId =
          `bb210000-0000-4000-8000-${suffix}`;
        stressOrders.push({ orderId, lineId });
        await insertOrder(pool, {
          orderId,
          lineId,
          branchId: IDS.branch1,
          warehouseId: IDS.warehouseStress,
          documentNumber: 100 + index,
          userId: IDS.admin,
          variantId,
          productUnitId,
          orderedQuantity: "1.000000",
        });
      }

      const stress = await Promise.allSettled(
        stressOrders.map((item) =>
          withTransaction(pool, (client) =>
            reservations.setLineReservationWithinTransaction(
              client,
              {
                actorUserId: IDS.admin,
                salesOrderId: item.orderId,
                salesOrderLineId: item.lineId,
                warehouseId: IDS.warehouseStress,
                variantId,
                desiredQuantity: "1",
              },
            ),
          ),
        ),
      );
      assert.equal(
        stress.filter((result) => result.status === "fulfilled")
          .length,
        20,
      );
      assert.equal(
        stress.filter(
          (result) =>
            result.status === "rejected" &&
            result.reason instanceof StockReservationError &&
            result.reason.reason === "INSUFFICIENT_AVAILABLE",
        ).length,
        5,
      );
      assert.deepEqual(
        await stockState(
          pool,
          IDS.warehouseStress,
          variantId,
        ),
        {
          on_hand: "20.000000",
          reserved: "20.000000",
          available: "0.000000",
          version: 21,
        },
      );
      const activeStress = await pool.query(
        `SELECT count(*)::int AS count,
                sum(quantity)::numeric(18,6)::text AS quantity
           FROM stock_reservations
          WHERE warehouse_id=$1
            AND variant_id=$2
            AND status IN ('ACTIVE','PARTIALLY_CONSUMED')`,
        [IDS.warehouseStress, variantId],
      );
      assert.deepEqual(activeStress.rows[0], {
        count: 20,
        quantity: "20.000000",
      });

      const activeDuplicates = await pool.query(
        `SELECT sales_order_line_id,warehouse_id,variant_id,count(*)::int AS count
           FROM stock_reservations
          WHERE status IN ('ACTIVE','PARTIALLY_CONSUMED')
          GROUP BY sales_order_line_id,warehouse_id,variant_id
         HAVING count(*) > 1`,
      );
      assert.equal(activeDuplicates.rowCount, 0);

      assert.deepEqual(
        await (async () => {
          const result = await pool.query(
            `SELECT indexname
               FROM pg_indexes
              WHERE schemaname='public'
                AND tablename='stock_reservations'
              ORDER BY indexname`,
          );
          return result.rows.map((row) => row.indexname);
        })(),
        [
          "ix_stock_reservations__sales_order_id_status",
          "ix_stock_reservations__warehouse_id_variant_id__where__9001b813",
          "pk_stock_reservations",
          "ux_stock_reservations__sales_order_line_id_warehouse_i_7a546c4c",
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
