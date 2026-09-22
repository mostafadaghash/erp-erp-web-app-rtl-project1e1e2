import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { InventoryLedgerService } from "../infrastructure/inventory/inventory-ledger-service.ts";
import {
  SerialInventoryError,
  SerialInventoryService,
} from "../infrastructure/inventory/serial-inventory-service.ts";
import { PostingBatchService } from "../infrastructure/posting/posting-batch-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "ba000000-0000-4000-8000-000000000001",
  branch: "ba000000-0000-4000-8000-000000000002",
  warehouse: "ba000000-0000-4000-8000-000000000003",
  admin: "ba000000-0000-4000-8000-000000000004",
  category: "ba000000-0000-4000-8000-000000000005",
  receiveSource: "ba000000-0000-4000-8000-000000000006",
  saleSource1: "ba000000-0000-4000-8000-000000000007",
  saleSource2: "ba000000-0000-4000-8000-000000000008",
});

test(
  "08.05 Serials keep movement history authoritative and prevent concurrent double use on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name: "business-tech-erp-serials-0805-test",
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
    const serials = new SerialInventoryService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.equal(MIGRATIONS.at(-1), "0025");

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find((role) => role.roleKey === "SYSTEM_ADMIN");
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 08 Serial Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
         VALUES ($1,'Serial Admin','phase08-serial-admin','phase08-serial-admin@example.test',
          'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.admin, systemAdmin.id, IDS.branch],
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
        name: "Serialized Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const variantId = product.variants[0].id;
      await pool.query("UPDATE products SET tracking_serial=true WHERE id=$1", [product.id]);

      async function movement({ sourceId, type, quantity }) {
        return withTransaction(pool, async (client) => {
          const batch = await posting.create(client, {
            branchId: IDS.branch,
            sourceType: type === "SALE" ? "SALES_INVOICE" : "PURCHASE_INVOICE",
            sourceId,
            operationType: "POST",
            documentVersion: 1,
            reversesPostingBatchId: null,
            createdBy: IDS.admin,
          });
          return ledger.appendWithinTransaction(client, {
            actorUserId: IDS.admin,
            postingBatchId: batch.id,
            warehouseId: IDS.warehouse,
            movementType: type,
            lines: [{
              variantId,
              quantitySigned: quantity,
              unitCost: "100",
              totalCost: "100",
            }],
          });
        });
      }

      const inbound = await movement({
        sourceId: IDS.receiveSource,
        type: "PURCHASE",
        quantity: "1",
      });
      const received = await withTransaction(pool, (client) =>
        serials.receiveWithinTransaction(client, {
          actorUserId: IDS.admin,
          movementLineId: inbound.lines[0].id,
          serialNumbers: ["SER-001"],
        }),
      );
      assert.equal(received[0].status, "STOCK_IN");
      assert.equal(received[0].currentWarehouseId, IDS.warehouse);

      const sale1 = await movement({
        sourceId: IDS.saleSource1,
        type: "SALE",
        quantity: "-1",
      });
      const sale2 = await movement({
        sourceId: IDS.saleSource2,
        type: "SALE",
        quantity: "-1",
      });

      const outcomes = await Promise.allSettled([
        withTransaction(pool, (client) =>
          serials.issueWithinTransaction(client, {
            actorUserId: IDS.admin,
            movementLineId: sale1.lines[0].id,
            serialNumbers: ["SER-001"],
          }),
        ),
        withTransaction(pool, (client) =>
          serials.issueWithinTransaction(client, {
            actorUserId: IDS.admin,
            movementLineId: sale2.lines[0].id,
            serialNumbers: ["SER-001"],
          }),
        ),
      ]);

      assert.equal(outcomes.filter((x) => x.status === "fulfilled").length, 1);
      assert.equal(outcomes.filter((x) => x.status === "rejected").length, 1);
      const rejected = outcomes.find((x) => x.status === "rejected");
      assert.ok(
        rejected?.status === "rejected" &&
        rejected.reason instanceof SerialInventoryError &&
        rejected.reason.reason === "SERIAL_NOT_AVAILABLE",
      );

      const current = await serials.getCurrent({
        actorUserId: IDS.admin,
        variantId,
        serialNumber: "SER-001",
      });
      assert.equal(current?.status, "SOLD");
      assert.equal(current?.currentWarehouseId, null);

      const history = await pool.query(
        `SELECT im.movement_type
           FROM inventory_line_serials ils
           JOIN inventory_movement_lines iml ON iml.id=ils.movement_line_id
           JOIN inventory_movements im ON im.id=iml.movement_id
           JOIN serial_numbers sn ON sn.id=ils.serial_id
          WHERE sn.variant_id=$1 AND sn.serial_number='SER-001'
          ORDER BY im.occurred_at,im.id`,
        [variantId],
      );
      assert.equal(history.rowCount, 2);
      assert.equal(history.rows.filter((r) => r.movement_type === "PURCHASE").length, 1);
      assert.equal(history.rows.filter((r) => r.movement_type === "SALE").length, 1);

      const duplicate = await pool.query(
        `SELECT variant_id,serial_number,count(*)::int AS count
           FROM serial_numbers
          GROUP BY variant_id,serial_number
         HAVING count(*) > 1`,
      );
      assert.equal(duplicate.rowCount, 0);

      const verification = await runMigrations({ databaseUrl, verifyOnly: true });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
