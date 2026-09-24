import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import {
  ProductUnitError,
  ProductUnitService,
} from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7200000-0000-4000-8000-000000000001",
  branch: "b7200000-0000-4000-8000-000000000002",
  actor: "b7200000-0000-4000-8000-000000000003",
  category: "b7200000-0000-4000-8000-000000000004",
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

test(
  "07.02 Units enforce exact conversion, usage flags, fraction policy and same-Product linkage on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      application_name: "business-tech-erp-units-0702-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const products = new ProductModelService(database);
    const units = new ProductUnitService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0026");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `07.02 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Units Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Main Branch','MAIN',true,now(),now())`,
        [IDS.branch, IDS.company],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Units Admin','phase07-units-admin','phase07-units-admin@example.test',
           'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.actor, systemAdmin.id, IDS.branch],
      );
      await pool.query(
        `INSERT INTO product_categories (id,name,parent_id,is_active)
         VALUES ($1,'General',NULL,true)`,
        [IDS.category],
      );

      const piece = await units.createUnit({
        actorUserId: IDS.actor,
        name: "Piece",
        symbol: "pc",
        allowsFraction: false,
      });
      const box = await units.createUnit({
        actorUserId: IDS.actor,
        name: "Box",
        symbol: "box",
        allowsFraction: false,
      });
      const fractionalPack = await units.createUnit({
        actorUserId: IDS.actor,
        name: "Fraction Pack",
        symbol: "fp",
        allowsFraction: true,
      });

      assert.equal(piece.allowsFraction, false);
      assert.equal(box.allowsFraction, false);
      assert.equal(fractionalPack.allowsFraction, true);

      const productA = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Product A",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const productB = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Product B",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });

      const boxProductUnit = await units.addProductUnit({
        actorUserId: IDS.actor,
        productId: productA.id,
        unitId: box.id,
        conversionToBase: "12",
        isSellable: true,
        isPurchasable: false,
      });
      assert.equal(boxProductUnit.conversionToBase, "12.000000");
      assert.equal(boxProductUnit.isSellable, true);
      assert.equal(boxProductUnit.isPurchasable, false);
      assert.equal(boxProductUnit.isBase, false);

      const fractionalProductUnit = await units.addProductUnit({
        actorUserId: IDS.actor,
        productId: productA.id,
        unitId: fractionalPack.id,
        conversionToBase: "2",
        isSellable: true,
        isPurchasable: true,
      });

      const integerBox = await units.validateAndConvertQuantity({
        variantId: productA.variants[0].id,
        productUnitId: boxProductUnit.id,
        quantity: "2",
        usage: "SELL",
      });
      assert.deepEqual(integerBox, {
        variantId: productA.variants[0].id,
        productUnitId: boxProductUnit.id,
        productId: productA.id,
        quantity: "2.000000",
        baseQuantity: "24.000000",
        conversionToBase: "12.000000",
        allowsFraction: false,
        usage: "SELL",
      });

      await assert.rejects(
        () =>
          units.validateAndConvertQuantity({
            variantId: productA.variants[0].id,
            productUnitId: boxProductUnit.id,
            quantity: "1.5",
            usage: "SELL",
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "FRACTION_NOT_ALLOWED",
      );

      const fractional = await units.validateAndConvertQuantity({
        variantId: productA.variants[0].id,
        productUnitId: fractionalProductUnit.id,
        quantity: "1.5",
        usage: "SELL",
      });
      assert.equal(fractional.quantity, "1.500000");
      assert.equal(fractional.baseQuantity, "3.000000");

      await assert.rejects(
        () =>
          units.validateAndConvertQuantity({
            variantId: productA.variants[0].id,
            productUnitId: boxProductUnit.id,
            quantity: "1",
            usage: "PURCHASE",
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "PRODUCT_UNIT_NOT_PURCHASABLE",
      );

      const updatedBox = await units.updateProductUnitPolicy({
        actorUserId: IDS.actor,
        productUnitId: boxProductUnit.id,
        conversionToBase: "12.000000",
        isSellable: false,
        isPurchasable: true,
      });
      assert.equal(updatedBox.isSellable, false);
      assert.equal(updatedBox.isPurchasable, true);

      await assert.rejects(
        () =>
          units.validateAndConvertQuantity({
            variantId: productA.variants[0].id,
            productUnitId: boxProductUnit.id,
            quantity: "1",
            usage: "SELL",
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "PRODUCT_UNIT_NOT_SELLABLE",
      );

      const purchaseBox = await units.validateAndConvertQuantity({
        variantId: productA.variants[0].id,
        productUnitId: boxProductUnit.id,
        quantity: "2",
        usage: "PURCHASE",
      });
      assert.equal(purchaseBox.baseQuantity, "24.000000");

      await assert.rejects(
        () =>
          units.validateAndConvertQuantity({
            variantId: productB.variants[0].id,
            productUnitId: boxProductUnit.id,
            quantity: "1",
            usage: "PURCHASE",
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "CROSS_PRODUCT_UNIT_LINK",
      );

      await assert.rejects(
        () =>
          units.updateProductUnitPolicy({
            actorUserId: IDS.actor,
            productUnitId: productA.baseUnitId,
            conversionToBase: "2",
            isSellable: true,
            isPurchasable: true,
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "BASE_UNIT_CONVERSION_MUST_BE_ONE",
      );
      const baseAfterRejectedUpdate = await units.getProductUnit(
        productA.baseUnitId,
      );
      assert.equal(baseAfterRejectedUpdate.isBase, true);
      assert.equal(baseAfterRejectedUpdate.conversionToBase, "1.000000");

      await units.updateProductUnitPolicy({
        actorUserId: IDS.actor,
        productUnitId: fractionalProductUnit.id,
        conversionToBase: "0.333333",
        isSellable: true,
        isPurchasable: true,
      });

      await assert.rejects(
        () =>
          units.validateAndConvertQuantity({
            variantId: productA.variants[0].id,
            productUnitId: fractionalProductUnit.id,
            quantity: "0.333333",
            usage: "SELL",
          }),
        (error) =>
          error instanceof ProductUnitError &&
          error.reason === "BASE_QUANTITY_PRECISION_EXCEEDED",
      );

      const baseTruth = await pool.query(
        `SELECT
           EXISTS (
             SELECT 1
               FROM information_schema.columns
              WHERE table_schema='public'
                AND table_name='product_units'
                AND column_name='is_base'
           ) AS has_is_base,
           EXISTS (
             SELECT 1
               FROM information_schema.columns
              WHERE table_schema='public'
                AND table_name='products'
                AND column_name='base_unit_id'
           ) AS has_base_unit_id`,
      );
      assert.deepEqual(baseTruth.rows[0], {
        has_is_base: false,
        has_base_unit_id: true,
      });

      const audit = await pool.query(
        `SELECT action,entity_type,entity_id
           FROM audit_logs
          WHERE action IN (
            'UNIT_CREATED',
            'PRODUCT_UNIT_ADDED',
            'PRODUCT_UNIT_POLICY_UPDATED'
          )
          ORDER BY created_at,id`,
      );
      assert.equal(
        audit.rows.filter((row) => row.action === "UNIT_CREATED").length,
        3,
      );
      assert.equal(
        audit.rows.filter((row) => row.action === "PRODUCT_UNIT_ADDED").length,
        2,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "PRODUCT_UNIT_POLICY_UPDATED",
        ).length,
        2,
      );

      assert.deepEqual(await indexNames(pool, "units"), [
        "pk_units",
        "uq_units__name",
      ]);
      assert.deepEqual(await indexNames(pool, "product_units"), [
        "ix_product_units__unit_id",
        "pk_product_units",
        "uq_product_units__product_unit",
      ]);

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
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.end().catch(() => {});
      await cleanupDatabase(databaseUrl);
    }
  },
);
