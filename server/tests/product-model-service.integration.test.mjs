import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import {
  ProductModelError,
  ProductModelService,
} from "../infrastructure/products/product-model-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7000000-0000-4000-8000-000000000001",
  branch: "b7000000-0000-4000-8000-000000000002",
  actor: "b7000000-0000-4000-8000-000000000003",
  category: "b7000000-0000-4000-8000-000000000004",
  unitPiece: "b7000000-0000-4000-8000-000000000005",
  unitHour: "b7000000-0000-4000-8000-000000000006",
  missingCategory: "b7000000-0000-4000-8000-000000000007",
  missingUnit: "b7000000-0000-4000-8000-000000000008",
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

async function rowCount(pool, tableName) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count FROM ${tableName}`,
  );
  return result.rows[0]?.count ?? 0;
}

async function expectDeferredConstraint(
  pool,
  work,
  constraint,
) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await work(client);
    await assert.rejects(
      client.query("COMMIT"),
      (error) =>
        error?.code === "23514" &&
        error?.constraint === constraint,
    );
    await client.query("ROLLBACK").catch(() => {});
  } finally {
    client.release();
  }
}

test(
  "07.01 Product Model creates STOCK/SERVICE simple products atomically with Base ProductUnit + internal Default Variant on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      application_name: "business-tech-erp-product-model-0701-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const products = new ProductModelService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0024");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `07.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Product Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,'Product Admin','phase07-product-admin','phase07-product-admin@example.test',
           'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.actor, systemAdmin.id, IDS.branch],
      );
      await pool.query(
        `INSERT INTO product_categories (id,name,parent_id,is_active)
         VALUES ($1,'General',NULL,true)`,
        [IDS.category],
      );
      await pool.query(
        `INSERT INTO units (id,name,symbol,allows_fraction,is_active)
         VALUES
          ($1,'Piece','pc',false,true),
          ($2,'Hour','hr',true,true)`,
        [IDS.unitPiece, IDS.unitHour],
      );

      const stock = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Stock Product",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: IDS.unitPiece,
      });

      assert.equal(stock.productType, "STOCK");
      assert.equal(stock.simpleProduct, true);
      assert.equal(stock.isActive, true);
      assert.equal(stock.variants.length, 1);
      assert.equal(stock.variants[0]?.isDefault, true);
      assert.equal(stock.variants[0]?.sku, null);
      assert.equal(stock.baseProductUnit.id, stock.baseUnitId);
      assert.equal(stock.baseProductUnit.unitId, IDS.unitPiece);
      assert.equal(stock.baseProductUnit.conversionToBase, "1.000000");

      const service = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Service Product",
        categoryId: IDS.category,
        productType: "SERVICE",
        baseUnitMasterId: IDS.unitHour,
      });

      assert.equal(service.productType, "SERVICE");
      assert.equal(service.simpleProduct, true);
      assert.equal(service.variants.length, 1);
      assert.equal(service.variants[0]?.isDefault, true);
      assert.equal(service.baseProductUnit.id, service.baseUnitId);
      assert.equal(service.baseProductUnit.unitId, IDS.unitHour);
      assert.equal(service.baseProductUnit.conversionToBase, "1.000000");

      const stored = await pool.query(
        `SELECT
           p.base_unit_id,
           pu.product_id,
           pu.unit_id,
           pu.conversion_to_base::text AS conversion_to_base,
           pu.is_sellable,
           pu.is_purchasable,
           (SELECT COUNT(*)::integer
              FROM product_variants pv
             WHERE pv.product_id=p.id) AS variant_count,
           (SELECT COUNT(*)::integer
              FROM product_variants pv
             WHERE pv.product_id=p.id
               AND pv.is_default=true) AS default_variant_count
         FROM products p
         JOIN product_units pu
           ON pu.id=p.base_unit_id
        WHERE p.id=$1`,
        [stock.id],
      );
      assert.deepEqual(stored.rows[0], {
        base_unit_id: stock.baseUnitId,
        product_id: stock.id,
        unit_id: IDS.unitPiece,
        conversion_to_base: "1.000000",
        is_sellable: true,
        is_purchasable: true,
        variant_count: 1,
        default_variant_count: 1,
      });

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

      const beforeMissingCategory = {
        products: await rowCount(pool, "products"),
        units: await rowCount(pool, "product_units"),
        variants: await rowCount(pool, "product_variants"),
      };
      await assert.rejects(
        () =>
          products.createSimpleProduct({
            actorUserId: IDS.actor,
            name: "Missing Category Product",
            categoryId: IDS.missingCategory,
            productType: "STOCK",
            baseUnitMasterId: IDS.unitPiece,
          }),
        (error) =>
          error instanceof ProductModelError &&
          error.reason === "CATEGORY_NOT_FOUND",
      );
      assert.deepEqual(
        {
          products: await rowCount(pool, "products"),
          units: await rowCount(pool, "product_units"),
          variants: await rowCount(pool, "product_variants"),
        },
        beforeMissingCategory,
        "missing Category must not leave partial Product rows",
      );

      const beforeMissingUnit = {
        products: await rowCount(pool, "products"),
        units: await rowCount(pool, "product_units"),
        variants: await rowCount(pool, "product_variants"),
      };
      await assert.rejects(
        () =>
          products.createSimpleProduct({
            actorUserId: IDS.actor,
            name: "Missing Unit Product",
            categoryId: IDS.category,
            productType: "SERVICE",
            baseUnitMasterId: IDS.missingUnit,
          }),
        (error) =>
          error instanceof ProductModelError &&
          error.reason === "UNIT_NOT_FOUND",
      );
      assert.deepEqual(
        {
          products: await rowCount(pool, "products"),
          units: await rowCount(pool, "product_units"),
          variants: await rowCount(pool, "product_variants"),
        },
        beforeMissingUnit,
        "missing Unit must not leave partial Product rows",
      );

      await expectDeferredConstraint(
        pool,
        (client) =>
          client.query(
            `DELETE FROM product_variants
              WHERE product_id=$1`,
            [stock.id],
          ),
        "ct_product_variants__preserve_catalog_integrity_at_commit",
      );

      const stockAfterRejectedDelete = await products.get(stock.id);
      assert.equal(stockAfterRejectedDelete.variants.length, 1);
      assert.equal(stockAfterRejectedDelete.variants[0]?.isDefault, true);

      const audit = await pool.query(
        `SELECT action,entity_type,entity_id,after_json
           FROM audit_logs
          WHERE action='PRODUCT_CREATED'
          ORDER BY entity_id`,
      );
      assert.equal(audit.rowCount, 2);
      assert.deepEqual(
        new Set(audit.rows.map((row) => row.entity_id)),
        new Set([stock.id, service.id]),
      );
      for (const row of audit.rows) {
        assert.equal(row.entity_type, "PRODUCT");
        assert.equal(row.after_json?.simpleProduct, true);
        assert.ok(row.after_json?.baseProductUnitId);
        assert.ok(row.after_json?.defaultVariantId);
      }

      assert.deepEqual(await indexNames(pool, "products"), [
        "gin_products__name_trgm",
        "ix_products__category_id",
        "ix_products__category_id_id__where_is_active_true",
        "pk_products",
      ]);
      assert.deepEqual(await indexNames(pool, "product_variants"), [
        "ix_product_variants__product_id_id__where_is_active_true",
        "pk_product_variants",
        "uq_product_variants__product_combination",
        "ux_product_variants__sku__where_sku_is_not_null",
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
        version: "0024",
        name: "inventory_ledger_integrity",
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
