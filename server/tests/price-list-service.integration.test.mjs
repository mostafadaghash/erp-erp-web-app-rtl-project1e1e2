import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { CounterpartyService } from "../infrastructure/counterparties/counterparty-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import { ProductModelService } from "../infrastructure/products/product-model-service.ts";
import {
  PRICE_LIST_PERMISSIONS,
  PriceListError,
  PriceListService,
} from "../infrastructure/products/price-list-service.ts";
import { ProductUnitService } from "../infrastructure/products/product-unit-service.ts";
import { PermissionDeniedError } from "../infrastructure/authorization/effective-permission-service.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "b7500000-0000-4000-8000-000000000001",
  branch: "b7500000-0000-4000-8000-000000000002",
  warehouse: "b7500000-0000-4000-8000-000000000003",
  admin: "b7500000-0000-4000-8000-000000000004",
  sales: "b7500000-0000-4000-8000-000000000005",
  category: "b7500000-0000-4000-8000-000000000006",
});

async function setOverride(
  pool,
  userId,
  permissionKey,
  effect,
  changedBy,
) {
  const permission = await pool.query(
    "SELECT id FROM permissions WHERE permission_key=$1",
    [permissionKey],
  );
  assert.equal(permission.rowCount, 1);
  await pool.query(
    `INSERT INTO user_permission_overrides
      (user_id,permission_id,effect,changed_by,changed_at)
     VALUES ($1,$2,$3,$4,clock_timestamp())
     ON CONFLICT (user_id,permission_id) DO UPDATE
       SET effect=EXCLUDED.effect,
           changed_by=EXCLUDED.changed_by,
           changed_at=clock_timestamp()`,
    [userId, permission.rows[0].id, effect, changedBy],
  );
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
  "07.05 Price Lists resolve defaults and enforce manual/below-minimum permissions on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name:
        "business-tech-erp-price-lists-0705-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const counterparties = new CounterpartyService(database);
    const products = new ProductModelService(database);
    const units = new ProductUnitService(database);
    const pricing = new PriceListService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);
      assert.equal(MIGRATIONS.at(-1), "0024");

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(
        version.rows[0]?.server_version_num,
      );
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `07.05 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const catalogRoles = await roles.ensureDefaultRoles();
      const systemAdmin = catalogRoles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      const salesRole = catalogRoles.find(
        (role) => role.roleKey === "SALES",
      );
      assert.ok(systemAdmin);
      assert.ok(salesRole);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 07 Pricing Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Main Branch','MAIN',true,now(),now())`,
        [IDS.branch, IDS.company],
      );
      await pool.query(
        `INSERT INTO warehouses
          (id,branch_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Main Warehouse','MAIN-WH',true,now(),now())`,
        [IDS.warehouse, IDS.branch],
      );
      await pool.query(
        `INSERT INTO branch_settings
          (branch_id,default_warehouse_id,default_price_list_id,
           settings_json,updated_at)
         VALUES ($1,$2,NULL,'{}'::jsonb,now())`,
        [IDS.branch, IDS.warehouse],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Pricing Admin','phase07-pricing-admin','phase07-pricing-admin@example.test',
           'test-only-hash',$3,$5,'ALL','ar-EG',true,NULL,now(),now()),
          ($2,'Pricing Sales','phase07-pricing-sales','phase07-pricing-sales@example.test',
           'test-only-hash',$4,$5,'ALL','ar-EG',true,NULL,now(),now())`,
        [
          IDS.admin,
          IDS.sales,
          systemAdmin.id,
          salesRole.id,
          IDS.branch,
        ],
      );
      await pool.query(
        `INSERT INTO product_categories
          (id,name,parent_id,is_active)
         VALUES ($1,'General',NULL,true)`,
        [IDS.category],
      );

      await pricing.ensurePricingPermissions();
      await pricing.ensurePricingPermissions();

      const permissionRows = await pool.query(
        `SELECT permission_key,module,description_key
           FROM permissions
          WHERE permission_key = ANY($1::text[])
          ORDER BY permission_key`,
        [Object.values(PRICE_LIST_PERMISSIONS)],
      );
      assert.equal(permissionRows.rowCount, 2);
      assert.deepEqual(
        permissionRows.rows.map((row) => row.permission_key),
        [
          PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
          PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
        ].sort(),
      );

      const belowDefaults = await pool.query(
        `SELECT r.role_key,rp.is_allowed
           FROM role_permissions rp
           JOIN roles r ON r.id=rp.role_id
           JOIN permissions p ON p.id=rp.permission_id
          WHERE p.permission_key=$1
          ORDER BY r.role_key`,
        [PRICE_LIST_PERMISSIONS.BELOW_MINIMUM],
      );
      assert.equal(belowDefaults.rowCount, 7);
      assert.deepEqual(
        belowDefaults.rows
          .filter((row) => row.is_allowed)
          .map((row) => row.role_key),
        ["SYSTEM_ADMIN"],
      );

      const manualDefaults = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM role_permissions rp
           JOIN permissions p ON p.id=rp.permission_id
          WHERE p.permission_key=$1`,
        [PRICE_LIST_PERMISSIONS.MANUAL_EDIT],
      );
      assert.equal(manualDefaults.rows[0]?.count, 0);

      const piece = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Piece",
        symbol: "pc",
        allowsFraction: false,
      });
      const box = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Box",
        symbol: "box",
        allowsFraction: false,
      });
      const purchaseOnly = await units.createUnit({
        actorUserId: IDS.admin,
        name: "Purchase Pack",
        symbol: "pp",
        allowsFraction: false,
      });

      const productA = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Pricing Product A",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const productB = await products.createSimpleProduct({
        actorUserId: IDS.admin,
        name: "Pricing Product B",
        categoryId: IDS.category,
        productType: "STOCK",
        baseUnitMasterId: piece.id,
      });
      const boxUnit = await units.addProductUnit({
        actorUserId: IDS.admin,
        productId: productA.id,
        unitId: box.id,
        conversionToBase: "12",
        isSellable: true,
        isPurchasable: true,
      });
      const purchaseUnit = await units.addProductUnit({
        actorUserId: IDS.admin,
        productId: productA.id,
        unitId: purchaseOnly.id,
        conversionToBase: "24",
        isSellable: false,
        isPurchasable: true,
      });

      const customer = await counterparties.create({
        actorUserId: IDS.admin,
        name: "Pricing Customer",
        roles: ["CUSTOMER"],
        customerProfile: {
          creditLimit: null,
          defaultPriceListId: null,
        },
      });

      const retail = await pricing.createPriceList({
        actorUserId: IDS.admin,
        name: "Retail",
      });
      const wholesale = await pricing.createPriceList({
        actorUserId: IDS.admin,
        name: "Wholesale",
      });
      const special = await pricing.createPriceList({
        actorUserId: IDS.admin,
        name: "Special",
      });
      const spare = await pricing.createPriceList({
        actorUserId: IDS.admin,
        name: "Spare",
      });

      const priceListCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM price_lists",
      );
      assert.equal(priceListCount.rows[0]?.count, 4);

      await pricing.setPriceListItem({
        actorUserId: IDS.admin,
        priceListId: retail.id,
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
        price: "10",
      });
      await pricing.setPriceListItem({
        actorUserId: IDS.admin,
        priceListId: retail.id,
        variantId: productA.variants[0].id,
        productUnitId: boxUnit.id,
        price: "120",
      });
      await pricing.setPriceListItem({
        actorUserId: IDS.admin,
        priceListId: wholesale.id,
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
        price: "9.5",
      });
      await pricing.setPriceListItem({
        actorUserId: IDS.admin,
        priceListId: special.id,
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
        price: "8.5",
      });

      const stored = await pool.query(
        `SELECT price::text AS price
           FROM price_list_items
          WHERE price_list_id=$1
            AND variant_id=$2
            AND product_unit_id=$3`,
        [retail.id, productA.variants[0].id, productA.baseUnitId],
      );
      assert.equal(stored.rows[0]?.price, "10.0000");

      await assert.rejects(
        () =>
          pricing.setPriceListItem({
            actorUserId: IDS.admin,
            priceListId: retail.id,
            variantId: productA.variants[0].id,
            productUnitId: productB.baseUnitId,
            price: "10",
          }),
        (error) =>
          error instanceof PriceListError &&
          error.reason === "CROSS_PRODUCT_UNIT_LINK",
      );

      await assert.rejects(
        () =>
          pricing.setPriceListItem({
            actorUserId: IDS.admin,
            priceListId: retail.id,
            variantId: productA.variants[0].id,
            productUnitId: purchaseUnit.id,
            price: "240",
          }),
        (error) =>
          error instanceof PriceListError &&
          error.reason === "PRODUCT_UNIT_NOT_SELLABLE",
      );

      await pricing.setBranchDefaultPriceList({
        actorUserId: IDS.admin,
        branchId: IDS.branch,
        priceListId: retail.id,
      });
      await pricing.setCustomerDefaultPriceList({
        actorUserId: IDS.admin,
        counterpartyId: customer.id,
        priceListId: wholesale.id,
      });

      const branchPrice = await pricing.resolveAutomaticPrice({
        actorUserId: IDS.sales,
        branchId: IDS.branch,
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
      });
      assert.deepEqual(branchPrice, {
        priceListId: retail.id,
        priceListSource: "BRANCH_DEFAULT",
        variantId: productA.variants[0].id,
        productUnitId: productA.baseUnitId,
        price: "10.0000",
        priceSource: "PRICE_LIST",
      });

      const customerPrice =
        await pricing.resolveAutomaticPrice({
          actorUserId: IDS.sales,
          branchId: IDS.branch,
          counterpartyId: customer.id,
          variantId: productA.variants[0].id,
          productUnitId: productA.baseUnitId,
        });
      assert.equal(customerPrice.priceListId, wholesale.id);
      assert.equal(
        customerPrice.priceListSource,
        "CUSTOMER_DEFAULT",
      );
      assert.equal(customerPrice.price, "9.5000");

      const explicitPrice =
        await pricing.resolveAutomaticPrice({
          actorUserId: IDS.sales,
          branchId: IDS.branch,
          counterpartyId: customer.id,
          explicitPriceListId: special.id,
          variantId: productA.variants[0].id,
          productUnitId: productA.baseUnitId,
        });
      assert.equal(explicitPrice.priceListId, special.id);
      assert.equal(explicitPrice.priceListSource, "EXPLICIT");
      assert.equal(explicitPrice.price, "8.5000");

      await assert.rejects(
        () =>
          pricing.setPriceListActive({
            actorUserId: IDS.admin,
            priceListId: retail.id,
            isActive: false,
          }),
        (error) =>
          error instanceof PriceListError &&
          error.reason === "PRICE_LIST_IS_DEFAULT",
      );
      await assert.rejects(
        () =>
          pricing.setPriceListActive({
            actorUserId: IDS.admin,
            priceListId: wholesale.id,
            isActive: false,
          }),
        (error) =>
          error instanceof PriceListError &&
          error.reason === "PRICE_LIST_IS_DEFAULT",
      );

      await pricing.setPriceListActive({
        actorUserId: IDS.admin,
        priceListId: spare.id,
        isActive: false,
      });
      await assert.rejects(
        () =>
          pricing.setBranchDefaultPriceList({
            actorUserId: IDS.admin,
            branchId: IDS.branch,
            priceListId: spare.id,
          }),
        (error) =>
          error instanceof PriceListError &&
          error.reason === "PRICE_LIST_INACTIVE",
      );
      await pricing.setPriceListActive({
        actorUserId: IDS.admin,
        priceListId: spare.id,
        isActive: true,
      });

      const minimum = await pricing.setMinimumSellingPrice({
        actorUserId: IDS.admin,
        variantId: productA.variants[0].id,
        minimumSellingPrice: "9",
      });
      assert.equal(minimum, "9.0000");

      const adminAtFloor =
        await pricing.authorizeEffectiveSalePrice({
          actorUserId: IDS.admin,
          branchId: IDS.branch,
          variantId: productA.variants[0].id,
          productUnitId: boxUnit.id,
          effectiveUnitPrice: "108",
          priceSource: "PRICE_LIST",
        });
      assert.equal(adminAtFloor.belowMinimum, false);

      const adminBelow =
        await pricing.authorizeEffectiveSalePrice({
          actorUserId: IDS.admin,
          branchId: IDS.branch,
          variantId: productA.variants[0].id,
          productUnitId: boxUnit.id,
          effectiveUnitPrice: "107.9999",
          priceSource: "PRICE_LIST",
        });
      assert.equal(adminBelow.belowMinimum, true);

      await assert.rejects(
        () =>
          pricing.authorizeEffectiveSalePrice({
            actorUserId: IDS.sales,
            branchId: IDS.branch,
            variantId: productA.variants[0].id,
            productUnitId: productA.baseUnitId,
            effectiveUnitPrice: "10",
            priceSource: "MANUAL",
          }),
        (error) =>
          error instanceof PermissionDeniedError &&
          error.permissionKey ===
            PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
      );

      await setOverride(
        pool,
        IDS.sales,
        PRICE_LIST_PERMISSIONS.MANUAL_EDIT,
        "ALLOW",
        IDS.admin,
      );

      const manualAllowed =
        await pricing.authorizeEffectiveSalePrice({
          actorUserId: IDS.sales,
          branchId: IDS.branch,
          variantId: productA.variants[0].id,
          productUnitId: productA.baseUnitId,
          effectiveUnitPrice: "10",
          priceSource: "MANUAL",
        });
      assert.equal(manualAllowed.belowMinimum, false);

      await assert.rejects(
        () =>
          pricing.authorizeEffectiveSalePrice({
            actorUserId: IDS.sales,
            branchId: IDS.branch,
            variantId: productA.variants[0].id,
            productUnitId: productA.baseUnitId,
            effectiveUnitPrice: "8.9999",
            priceSource: "MANUAL",
          }),
        (error) =>
          error instanceof PermissionDeniedError &&
          error.permissionKey ===
            PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
      );

      await setOverride(
        pool,
        IDS.sales,
        PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
        "ALLOW",
        IDS.admin,
      );

      const explicitOverride =
        await pricing.authorizeEffectiveSalePrice({
          actorUserId: IDS.sales,
          branchId: IDS.branch,
          variantId: productA.variants[0].id,
          productUnitId: productA.baseUnitId,
          effectiveUnitPrice: "8.9999",
          priceSource: "MANUAL",
        });
      assert.equal(explicitOverride.belowMinimum, true);

      await setOverride(
        pool,
        IDS.admin,
        PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
        "DENY",
        IDS.admin,
      );
      await assert.rejects(
        () =>
          pricing.authorizeEffectiveSalePrice({
            actorUserId: IDS.admin,
            branchId: IDS.branch,
            variantId: productA.variants[0].id,
            productUnitId: productA.baseUnitId,
            effectiveUnitPrice: "8",
            priceSource: "PRICE_LIST",
          }),
        (error) =>
          error instanceof PermissionDeniedError &&
          error.permissionKey ===
            PRICE_LIST_PERMISSIONS.BELOW_MINIMUM,
      );

      await pricing.setMinimumSellingPrice({
        actorUserId: IDS.admin,
        variantId: productA.variants[0].id,
        minimumSellingPrice: null,
      });
      const noFloor =
        await pricing.authorizeEffectiveSalePrice({
          actorUserId: IDS.sales,
          branchId: IDS.branch,
          variantId: productA.variants[0].id,
          productUnitId: productA.baseUnitId,
          effectiveUnitPrice: "0",
          priceSource: "PRICE_LIST",
        });
      assert.equal(noFloor.minimumSellingPrice, null);
      assert.equal(noFloor.belowMinimum, false);

      const audit = await pool.query(
        `SELECT action
           FROM audit_logs
          WHERE action IN (
            'PRICE_LIST_CREATED',
            'PRICE_LIST_ITEM_UPSERTED',
            'BRANCH_DEFAULT_PRICE_LIST_CHANGED',
            'CUSTOMER_DEFAULT_PRICE_LIST_CHANGED',
            'VARIANT_MINIMUM_SELLING_PRICE_CHANGED'
          )
          ORDER BY created_at,id`,
      );
      assert.equal(
        audit.rows.filter(
          (row) => row.action === "PRICE_LIST_CREATED",
        ).length,
        4,
      );
      assert.ok(
        audit.rows.some(
          (row) =>
            row.action === "PRICE_LIST_ITEM_UPSERTED",
        ),
      );
      assert.ok(
        audit.rows.some(
          (row) =>
            row.action ===
            "BRANCH_DEFAULT_PRICE_LIST_CHANGED",
        ),
      );
      assert.ok(
        audit.rows.some(
          (row) =>
            row.action ===
            "CUSTOMER_DEFAULT_PRICE_LIST_CHANGED",
        ),
      );
      assert.equal(
        audit.rows.filter(
          (row) =>
            row.action ===
            "VARIANT_MINIMUM_SELLING_PRICE_CHANGED",
        ).length,
        2,
      );

      assert.deepEqual(await indexNames(pool, "price_lists"), [
        "pk_price_lists",
      ]);
      assert.deepEqual(
        await indexNames(pool, "price_list_items"),
        [
          "ix_price_list_items__variant_id_price_list_id",
          "pk_price_list_items",
        ],
      );

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
