import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  ProductIdentifierError,
  ProductIdentifierService,
} from "../infrastructure/products/product-identifier-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7300000-0000-4000-8000-000000000001",
  branch: "b7300000-0000-4000-8000-000000000002",
  actor: "b7300000-0000-4000-8000-000000000003",
  category: "b7300000-0000-4000-8000-000000000004",
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

function assertOneSuccessOneConflict(
  settled,
  reason,
) {
  const fulfilled = settled.filter(
    (entry) => entry.status === "fulfilled",
  );
  const rejected = settled.filter(
    (entry) => entry.status === "rejected",
  );

  assert.equal(
    fulfilled.length,
    1,
    "exactly one concurrent writer must win",
  );
  assert.equal(
    rejected.length,
    1,
    "exactly one concurrent writer must lose",
  );
  assert.ok(
    rejected[0].reason instanceof ProductIdentifierError,
  );
  assert.equal(rejected[0].reason.reason, reason);
}

test(
  "07.03 Barcode/SKU uniqueness and exact lookup remain correct under PostgreSQL 17 concurrency",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name:
        "business-tech-erp-identifiers-0703-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const products = new ProductModelService(database);
    const units = new ProductUnitService(database);
    const identifiers = new ProductIdentifierService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0023");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(
        version.rows[0]?.server_version_num,
      );
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `07.03 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Identifier Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,'Identifier Admin','phase07-identifier-admin','phase07-identifier-admin@example.test',
           'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.actor, systemAdmin.id, IDS.branch],
      );
      await pool.query(
        `INSERT INTO product_categories
          (id,name,parent_id,is_active)
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
      const productABox = await units.addProductUnit({
        actorUserId: IDS.actor,
        productId: productA.id,
        unitId: box.id,
        conversionToBase: "12",
        isSellable: true,
        isPurchasable: true,
      });

      const uppercased = await identifiers.setVariantSku({
        actorUserId: IDS.actor,
        variantId: productA.variants[0].id,
        sku: "  aBc-001  ",
      });
      assert.equal(uppercased.sku, "ABC-001");

      const lookup = await identifiers.findVariantBySku(
        "abc-001",
      );
      assert.deepEqual(lookup, uppercased);

      const cleared = await identifiers.setVariantSku({
        actorUserId: IDS.actor,
        variantId: productA.variants[0].id,
        sku: "   ",
      });
      assert.equal(cleared.sku, null);

      const nullSkuCount = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM product_variants
          WHERE id IN ($1,$2)
            AND sku IS NULL`,
        [
          productA.variants[0].id,
          productB.variants[0].id,
        ],
      );
      assert.equal(nullSkuCount.rows[0]?.count, 2);

      const skuRace = await Promise.allSettled([
        identifiers.setVariantSku({
          actorUserId: IDS.actor,
          variantId: productA.variants[0].id,
          sku: "race-sku",
        }),
        identifiers.setVariantSku({
          actorUserId: IDS.actor,
          variantId: productB.variants[0].id,
          sku: "RACE-SKU",
        }),
      ]);
      assertOneSuccessOneConflict(
        skuRace,
        "SKU_ALREADY_EXISTS",
      );

      const raceSkuRows = await pool.query(
        `SELECT id,sku
           FROM product_variants
          WHERE sku='RACE-SKU'`,
      );
      assert.equal(raceSkuRows.rowCount, 1);
      assert.equal(raceSkuRows.rows[0]?.sku, "RACE-SKU");

      const raceSkuLookup = await identifiers.findVariantBySku(
        "race-sku",
      );
      assert.equal(raceSkuLookup?.sku, "RACE-SKU");

      const baseBarcode = await identifiers.addBarcode({
        actorUserId: IDS.actor,
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
        barcode: "  622100000001  ",
        isPrimary: true,
      });
      assert.equal(baseBarcode.barcode, "622100000001");
      assert.equal(
        baseBarcode.productUnitId,
        productA.baseUnitId,
      );

      const boxBarcode = await identifiers.addBarcode({
        actorUserId: IDS.actor,
        variantId: productA.variants[0].id,
        productUnitId: productABox.id,
        barcode: "622100000002",
        isPrimary: false,
      });
      assert.equal(
        boxBarcode.variantId,
        baseBarcode.variantId,
      );
      assert.notEqual(
        boxBarcode.productUnitId,
        baseBarcode.productUnitId,
      );

      const barcodeLookup = await identifiers.findBarcode(
        "622100000002",
      );
      assert.deepEqual(barcodeLookup, boxBarcode);

      await assert.rejects(
        () =>
          identifiers.addBarcode({
            actorUserId: IDS.actor,
            variantId: productA.variants[0].id,
            productUnitId: productB.baseUnitId,
            barcode: "622100000003",
            isPrimary: false,
          }),
        (error) =>
          error instanceof ProductIdentifierError &&
          error.reason === "CROSS_PRODUCT_UNIT_LINK",
      );

      await assert.rejects(
        () =>
          identifiers.addBarcode({
            actorUserId: IDS.actor,
            variantId: productB.variants[0].id,
            productUnitId: productB.baseUnitId,
            barcode: "622100000001",
            isPrimary: false,
          }),
        (error) =>
          error instanceof ProductIdentifierError &&
          error.reason === "BARCODE_ALREADY_EXISTS",
      );

      const barcodeRace = await Promise.allSettled([
        identifiers.addBarcode({
          actorUserId: IDS.actor,
          variantId: productA.variants[0].id,
          productUnitId: productABox.id,
          barcode: "RACE-BARCODE-01",
          isPrimary: false,
        }),
        identifiers.addBarcode({
          actorUserId: IDS.actor,
          variantId: productB.variants[0].id,
          productUnitId: productB.baseUnitId,
          barcode: "RACE-BARCODE-01",
          isPrimary: false,
        }),
      ]);
      assertOneSuccessOneConflict(
        barcodeRace,
        "BARCODE_ALREADY_EXISTS",
      );

      const raceBarcodeRows = await pool.query(
        `SELECT id,barcode
           FROM variant_barcodes
          WHERE barcode='RACE-BARCODE-01'`,
      );
      assert.equal(raceBarcodeRows.rowCount, 1);

      const raceBarcodeLookup =
        await identifiers.findBarcode("RACE-BARCODE-01");
      assert.equal(
        raceBarcodeLookup?.barcode,
        "RACE-BARCODE-01",
      );

      const audit = await pool.query(
        `SELECT action,entity_type,entity_id
           FROM audit_logs
          WHERE action IN (
            'VARIANT_SKU_UPDATED',
            'VARIANT_BARCODE_ADDED'
          )
          ORDER BY created_at,id`,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "VARIANT_SKU_UPDATED",
        ).length,
        3,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "VARIANT_BARCODE_ADDED",
        ).length,
        3,
      );

      assert.deepEqual(
        await indexNames(pool, "product_variants"),
        [
          "ix_product_variants__product_id_id__where_is_active_true",
          "pk_product_variants",
          "uq_product_variants__product_combination",
          "ux_product_variants__sku__where_sku_is_not_null",
        ],
      );
      assert.deepEqual(
        await indexNames(pool, "variant_barcodes"),
        [
          "ix_variant_barcodes__variant_id",
          "pk_variant_barcodes",
          "uq_variant_barcodes__barcode",
        ],
      );

      const history = await pool.query(
        "SELECT version,name FROM schema_migrations ORDER BY version",
      );
      assert.equal(history.rowCount, MIGRATIONS.length);
      assert.deepEqual(history.rows.at(-1), {
        version: "0023",
        name: "counterparty_ledger_immutability",
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
