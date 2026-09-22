import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  ProductAttributeError,
  ProductAttributeService,
} from "../infrastructure/products/product-attribute-service.ts";
import { ProductIdentifierService } from "../infrastructure/products/product-identifier-service.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7400000-0000-4000-8000-000000000001",
  branch: "b7400000-0000-4000-8000-000000000002",
  actor: "b7400000-0000-4000-8000-000000000003",
  category: "b7400000-0000-4000-8000-000000000004",
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

function expectedSignature(selections) {
  return [...selections]
    .sort((left, right) => {
      const attributeOrder = left.attributeId.localeCompare(
        right.attributeId,
      );
      if (attributeOrder !== 0) return attributeOrder;
      return left.attributeValueId.localeCompare(
        right.attributeValueId,
      );
    })
    .map(
      (selection) =>
        `${selection.attributeId}:${selection.attributeValueId}`,
    )
    .join("|");
}

function assertOneSuccessOneCombinationConflict(settled) {
  const fulfilled = settled.filter(
    (entry) => entry.status === "fulfilled",
  );
  const rejected = settled.filter(
    (entry) => entry.status === "rejected",
  );

  assert.equal(fulfilled.length, 1);
  assert.equal(rejected.length, 1);
  assert.ok(
    rejected[0].reason instanceof ProductAttributeError,
  );
  assert.equal(
    rejected[0].reason.reason,
    "VARIANT_COMBINATION_ALREADY_EXISTS",
  );
}

test(
  "07.04 Dynamic Attributes canonicalize Variant combinations and prevent duplicate combinations under PostgreSQL 17 concurrency",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name:
        "business-tech-erp-dynamic-attributes-0704-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const products = new ProductModelService(database);
    const units = new ProductUnitService(database);
    const identifiers = new ProductIdentifierService(database);
    const attributes = new ProductAttributeService(database);

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
        `07.04 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Attributes Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,'Attributes Admin','phase07-attributes-admin','phase07-attributes-admin@example.test',
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

      const productA = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Variant Product A",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const productB = await products.createSimpleProduct({
        actorUserId: IDS.actor,
        name: "Variant Product B",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });

      const originalDefaultVariantId =
        productA.variants[0].id;

      await identifiers.setVariantSku({
        actorUserId: IDS.actor,
        variantId: originalDefaultVariantId,
        sku: "preserve-me",
      });
      const originalBarcode = await identifiers.addBarcode({
        actorUserId: IDS.actor,
        variantId: originalDefaultVariantId,
        productUnitId: productA.baseUnitId,
        barcode: "ATTR-PRESERVE-001",
        isPrimary: true,
      });

      const color = await attributes.createAttribute({
        actorUserId: IDS.actor,
        name: "Color",
        attributeType: "TEXT",
        usageType: "VARIANT",
      });
      const size = await attributes.createAttribute({
        actorUserId: IDS.actor,
        name: "Size",
        attributeType: "TEXT",
        usageType: "VARIANT",
      });
      const brand = await attributes.createAttribute({
        actorUserId: IDS.actor,
        name: "Brand",
        attributeType: "TEXT",
        usageType: "DESCRIPTIVE",
      });
      const capacity = await attributes.createAttribute({
        actorUserId: IDS.actor,
        name: "Capacity",
        attributeType: "TEXT",
        usageType: "VARIANT",
      });

      const red = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: color.id,
        value: "Red",
        sortOrder: 1,
      });
      const blue = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: color.id,
        value: "Blue",
        sortOrder: 2,
      });
      const medium = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: size.id,
        value: "M",
        sortOrder: 1,
      });
      const large = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: size.id,
        value: "L",
        sortOrder: 2,
      });
      const acme = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: brand.id,
        value: "ACME",
        sortOrder: 1,
      });
      const capacity128 = await attributes.addAttributeValue({
        actorUserId: IDS.actor,
        attributeId: capacity.id,
        value: "128GB",
        sortOrder: 1,
      });

      for (const attributeId of [
        color.id,
        size.id,
        brand.id,
      ]) {
        await attributes.linkAttributeToProduct({
          actorUserId: IDS.actor,
          productId: productA.id,
          attributeId,
        });
      }
      for (const attributeId of [color.id, size.id]) {
        await attributes.linkAttributeToProduct({
          actorUserId: IDS.actor,
          productId: productB.id,
          attributeId,
        });
      }

      await assert.rejects(
        () =>
          attributes.createVariantFromAttributes({
            actorUserId: IDS.actor,
            productId: productA.id,
            name: "ACME",
            attributeValueIds: [acme.id],
          }),
        (error) =>
          error instanceof ProductAttributeError &&
          error.reason ===
            "DESCRIPTIVE_ATTRIBUTE_NOT_ALLOWED_IN_VARIANT",
      );

      await assert.rejects(
        () =>
          attributes.createVariantFromAttributes({
            actorUserId: IDS.actor,
            productId: productA.id,
            name: "128 GB",
            attributeValueIds: [capacity128.id],
          }),
        (error) =>
          error instanceof ProductAttributeError &&
          error.reason ===
            "ATTRIBUTE_NOT_LINKED_TO_PRODUCT",
      );

      await assert.rejects(
        () =>
          attributes.createVariantFromAttributes({
            actorUserId: IDS.actor,
            productId: productA.id,
            name: "Two Colors",
            attributeValueIds: [red.id, blue.id],
          }),
        (error) =>
          error instanceof ProductAttributeError &&
          error.reason === "DUPLICATE_ATTRIBUTE_SELECTION",
      );

      const redMedium = await attributes.createVariantFromAttributes({
        actorUserId: IDS.actor,
        productId: productA.id,
        name: "Red / M",
        attributeValueIds: [medium.id, red.id],
      });

      assert.equal(
        redMedium.variantId,
        originalDefaultVariantId,
        "first real Variant must reuse the internal Default row",
      );
      assert.equal(redMedium.reusedInternalDefault, true);
      assert.equal(redMedium.isDefault, false);
      assert.equal(
        redMedium.combinationSignature,
        expectedSignature([
          {
            attributeId: color.id,
            attributeValueId: red.id,
          },
          {
            attributeId: size.id,
            attributeValueId: medium.id,
          },
        ]),
      );

      const preservedSku =
        await identifiers.findVariantBySku("PRESERVE-ME");
      assert.equal(
        preservedSku?.variantId,
        originalDefaultVariantId,
      );
      const preservedBarcode =
        await identifiers.findBarcode(
          originalBarcode.barcode,
        );
      assert.equal(
        preservedBarcode?.variantId,
        originalDefaultVariantId,
      );

      const composition =
        await attributes.getVariantComposition(
          redMedium.variantId,
        );
      assert.equal(
        composition.combinationSignature,
        redMedium.combinationSignature,
      );
      assert.deepEqual(
        new Set(
          composition.selections.map(
            (selection) => selection.attributeValueId,
          ),
        ),
        new Set([red.id, medium.id]),
      );

      await assert.rejects(
        () =>
          attributes.createVariantFromAttributes({
            actorUserId: IDS.actor,
            productId: productA.id,
            name: "Duplicate Red / M",
            attributeValueIds: [red.id, medium.id],
          }),
        (error) =>
          error instanceof ProductAttributeError &&
          error.reason ===
            "VARIANT_COMBINATION_ALREADY_EXISTS",
      );

      const blueMedium =
        await attributes.createVariantFromAttributes({
          actorUserId: IDS.actor,
          productId: productA.id,
          name: "Blue / M",
          attributeValueIds: [blue.id, medium.id],
        });
      assert.equal(blueMedium.reusedInternalDefault, false);
      assert.notEqual(
        blueMedium.variantId,
        redMedium.variantId,
      );
      assert.notEqual(
        blueMedium.combinationSignature,
        redMedium.combinationSignature,
      );

      const productAVariants = await pool.query(
        `SELECT id,is_default,combination_signature
           FROM product_variants
          WHERE product_id=$1
          ORDER BY id`,
        [productA.id],
      );
      assert.equal(productAVariants.rowCount, 2);
      assert.equal(
        productAVariants.rows.filter(
          (row) => row.is_default === true,
        ).length,
        0,
      );

      const race = await Promise.allSettled([
        attributes.createVariantFromAttributes({
          actorUserId: IDS.actor,
          productId: productB.id,
          name: "Race Red / L A",
          attributeValueIds: [red.id, large.id],
        }),
        attributes.createVariantFromAttributes({
          actorUserId: IDS.actor,
          productId: productB.id,
          name: "Race Red / L B",
          attributeValueIds: [large.id, red.id],
        }),
      ]);
      assertOneSuccessOneCombinationConflict(race);

      const raceSignature = expectedSignature([
        {
          attributeId: color.id,
          attributeValueId: red.id,
        },
        {
          attributeId: size.id,
          attributeValueId: large.id,
        },
      ]);
      const raceRows = await pool.query(
        `SELECT id
           FROM product_variants
          WHERE product_id=$1
            AND combination_signature=$2`,
        [productB.id, raceSignature],
      );
      assert.equal(raceRows.rowCount, 1);

      const variantLinks = await pool.query(
        `SELECT
           vav.variant_id,
           av.attribute_id,
           vav.attribute_value_id
         FROM variant_attribute_values vav
         JOIN attribute_values av
           ON av.id=vav.attribute_value_id
        WHERE vav.variant_id=$1
        ORDER BY av.attribute_id,vav.attribute_value_id`,
        [redMedium.variantId],
      );
      assert.equal(variantLinks.rowCount, 2);
      assert.deepEqual(
        new Set(
          variantLinks.rows.map(
            (row) => row.attribute_value_id,
          ),
        ),
        new Set([red.id, medium.id]),
      );

      const audit = await pool.query(
        `SELECT action
           FROM audit_logs
          WHERE action IN (
            'ATTRIBUTE_CREATED',
            'ATTRIBUTE_VALUE_CREATED',
            'PRODUCT_ATTRIBUTE_LINKED',
            'PRODUCT_VARIANT_COMPOSED'
          )
          ORDER BY created_at,id`,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "ATTRIBUTE_CREATED",
        ).length,
        4,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "ATTRIBUTE_VALUE_CREATED",
        ).length,
        6,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "PRODUCT_ATTRIBUTE_LINKED",
        ).length,
        5,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "PRODUCT_VARIANT_COMPOSED",
        ).length,
        3,
      );

      assert.deepEqual(await indexNames(pool, "attributes"), [
        "ix_attributes__usage_type_is_active",
        "pk_attributes",
      ]);
      assert.deepEqual(
        await indexNames(pool, "attribute_values"),
        [
          "ix_attribute_values__attribute_id_sort_order",
          "pk_attribute_values",
          "uq_attribute_values__attribute_value",
        ],
      );
      assert.deepEqual(
        await indexNames(pool, "product_attributes"),
        ["pk_product_attributes"],
      );
      assert.deepEqual(
        await indexNames(pool, "variant_attribute_values"),
        [
          "ix_variant_attribute_values__attribute_value_id_variant_id",
          "pk_variant_attribute_values",
        ],
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
