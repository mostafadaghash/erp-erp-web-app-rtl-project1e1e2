import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  OrganizationError,
  OrganizationService,
} from "../infrastructure/organization/organization-service.ts";
import {
  RoleCatalogService,
} from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "a1000000-0000-4000-8000-000000000001",
  bootstrapBranch: "a1000000-0000-4000-8000-000000000002",
  bootstrapWarehouse: "a1000000-0000-4000-8000-000000000003",
  actor: "a1000000-0000-4000-8000-000000000004",
  secondaryWarehouse: "a1000000-0000-4000-8000-000000000005",
  inactiveWarehouse: "a1000000-0000-4000-8000-000000000006",
  postingBatch: "a1000000-0000-4000-8000-000000000007",
  postingSource: "a1000000-0000-4000-8000-000000000008",
  movement: "a1000000-0000-4000-8000-000000000009",
  missingActor: "a1000000-0000-4000-8000-000000000099",
});

async function seedBootstrap(pool, roleId) {
  await pool.query(
    `INSERT INTO companies
      (id,name,short_name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 05 Organization Co','P05','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$2,'Bootstrap','BOOT',true,now(),now())`,
    [IDS.bootstrapBranch, IDS.company],
  );
  await pool.query(
    `INSERT INTO warehouses
      (id,branch_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$2,'Bootstrap Warehouse','BOOT-WH',true,now(),now())`,
    [IDS.bootstrapWarehouse, IDS.bootstrapBranch],
  );
  await pool.query(
    `INSERT INTO branch_settings
      (branch_id,default_warehouse_id,settings_json,updated_at)
     VALUES ($1,$2,'{}'::jsonb,now())`,
    [IDS.bootstrapBranch, IDS.bootstrapWarehouse],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,
       branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
     VALUES
      ($1,'Organization Admin','phase05-org-admin','phase05-org-admin@example.test',
       'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
    [IDS.actor, roleId, IDS.bootstrapBranch],
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
  "05.05 Organization enforces company settings, branch lifecycle, default warehouse truth, and warehouse history safety on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-organization-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roles = new RoleCatalogService(database);
    const organization = new OrganizationService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `05.05 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roleCatalog = await roles.ensureDefaultRoles();
      const systemAdmin = roleCatalog.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);
      await seedBootstrap(pool, systemAdmin.id);

      const settings1 = await organization.updateCompanySettings({
        companyId: IDS.company,
        actorUserId: IDS.actor,
        settings: {
          vatEnabled: true,
          vatRate: 14,
          invoiceFooter: "Thank you",
          shippingFields: {
            address: true,
            recipientPhone: true,
          },
        },
      });
      assert.deepEqual(settings1, {
        vatEnabled: true,
        vatRate: 14,
        invoiceFooter: "Thank you",
        shippingFields: {
          address: true,
          recipientPhone: true,
        },
      });

      const settings2 = await organization.updateCompanySettings({
        companyId: IDS.company,
        actorUserId: IDS.actor,
        settings: {
          vatEnabled: false,
          vatRate: 14,
          locale: "ar-EG",
        },
      });
      assert.deepEqual(settings2, {
        vatEnabled: false,
        vatRate: 14,
        locale: "ar-EG",
      });
      assert.deepEqual(
        await organization.getCompanySettings(IDS.company),
        settings2,
      );

      const created = await organization.createBranch({
        companyId: IDS.company,
        actorUserId: IDS.actor,
        name: "Nasr City",
        code: "NASR",
        defaultWarehouseName: "Nasr Main Warehouse",
        defaultWarehouseCode: "NASR-WH",
      });

      const branchState = await pool.query(
        `SELECT b.id,b.company_id,b.is_active,
                bs.default_warehouse_id,
                w.branch_id AS warehouse_branch_id,
                w.is_active AS warehouse_is_active
           FROM branches b
           JOIN branch_settings bs ON bs.branch_id=b.id
           JOIN warehouses w ON w.id=bs.default_warehouse_id
          WHERE b.id=$1`,
        [created.branchId],
      );
      assert.equal(branchState.rowCount, 1);
      assert.equal(branchState.rows[0].company_id, IDS.company);
      assert.equal(branchState.rows[0].is_active, true);
      assert.equal(
        branchState.rows[0].default_warehouse_id,
        created.defaultWarehouseId,
      );
      assert.equal(
        branchState.rows[0].warehouse_branch_id,
        created.branchId,
      );
      assert.equal(branchState.rows[0].warehouse_is_active, true);

      const createdWarehouseCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM warehouses WHERE branch_id=$1",
        [created.branchId],
      );
      assert.equal(
        createdWarehouseCount.rows[0]?.count,
        1,
        "branch creation must atomically create at least one default warehouse",
      );

      const defaultWarehouse = await organization.getDefaultWarehouse(
        created.branchId,
      );
      assert.equal(defaultWarehouse.warehouseId, created.defaultWarehouseId);
      assert.equal(defaultWarehouse.branchId, created.branchId);
      assert.equal(defaultWarehouse.isActive, true);

      const warehouseDefaultColumns = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema='public'
            AND table_name='warehouses'
            AND column_name ILIKE '%default%'`,
      );
      assert.deepEqual(
        warehouseDefaultColumns.rows,
        [],
        "warehouses must not contain a competing default flag",
      );

      await organization.setBranchActive({
        branchId: created.branchId,
        actorUserId: IDS.actor,
        isActive: false,
      });
      let lifecycle = await pool.query(
        "SELECT is_active FROM branches WHERE id=$1",
        [created.branchId],
      );
      assert.equal(lifecycle.rows[0]?.is_active, false);

      const branchStillExists = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM branches WHERE id=$1",
        [created.branchId],
      );
      assert.equal(
        branchStillExists.rows[0]?.count,
        1,
        "branch lifecycle must deactivate rather than physically delete",
      );

      await organization.setBranchActive({
        branchId: created.branchId,
        actorUserId: IDS.actor,
        isActive: true,
      });
      lifecycle = await pool.query(
        "SELECT is_active FROM branches WHERE id=$1",
        [created.branchId],
      );
      assert.equal(lifecycle.rows[0]?.is_active, true);

      await pool.query(
        `INSERT INTO warehouses
          (id,branch_id,name,code,is_active,created_at,updated_at)
         VALUES
          ($1,$3,'Secondary Warehouse','NASR-WH-2',true,now(),now()),
          ($2,$3,'Inactive Warehouse','NASR-WH-OFF',false,now(),now())`,
        [IDS.secondaryWarehouse, IDS.inactiveWarehouse, created.branchId],
      );

      const changedDefault = await organization.setDefaultWarehouse({
        branchId: created.branchId,
        warehouseId: IDS.secondaryWarehouse,
        actorUserId: IDS.actor,
      });
      assert.equal(changedDefault.warehouseId, IDS.secondaryWarehouse);
      assert.equal(
        (await organization.getDefaultWarehouse(created.branchId)).warehouseId,
        IDS.secondaryWarehouse,
      );

      await assert.rejects(
        () =>
          organization.setDefaultWarehouse({
            branchId: created.branchId,
            warehouseId: IDS.inactiveWarehouse,
            actorUserId: IDS.actor,
          }),
        (error) =>
          error instanceof OrganizationError &&
          error.reason === "WAREHOUSE_INACTIVE",
      );

      await assert.rejects(
        () =>
          organization.setDefaultWarehouse({
            branchId: created.branchId,
            warehouseId: IDS.bootstrapWarehouse,
            actorUserId: IDS.actor,
          }),
        (error) =>
          error instanceof OrganizationError &&
          error.reason === "WAREHOUSE_BRANCH_MISMATCH",
      );

      await assert.rejects(
        () =>
          organization.setWarehouseActive({
            warehouseId: IDS.secondaryWarehouse,
            actorUserId: IDS.actor,
            isActive: false,
          }),
        (error) =>
          error instanceof OrganizationError &&
          error.reason === "WAREHOUSE_IS_DEFAULT",
      );

      await organization.setWarehouseActive({
        warehouseId: created.defaultWarehouseId,
        actorUserId: IDS.actor,
        isActive: false,
      });
      const disabledOldDefault = await pool.query(
        "SELECT is_active FROM warehouses WHERE id=$1",
        [created.defaultWarehouseId],
      );
      assert.equal(disabledOldDefault.rows[0]?.is_active, false);

      await organization.setWarehouseActive({
        warehouseId: created.defaultWarehouseId,
        actorUserId: IDS.actor,
        isActive: true,
      });

      await assert.rejects(
        () =>
          organization.moveWarehouseToBranch({
            warehouseId: IDS.secondaryWarehouse,
            targetBranchId: IDS.bootstrapBranch,
            actorUserId: IDS.actor,
          }),
        (error) =>
          error instanceof OrganizationError &&
          error.reason === "WAREHOUSE_IS_DEFAULT",
      );

      await organization.moveWarehouseToBranch({
        warehouseId: created.defaultWarehouseId,
        targetBranchId: IDS.bootstrapBranch,
        actorUserId: IDS.actor,
      });
      const moved = await pool.query(
        "SELECT branch_id FROM warehouses WHERE id=$1",
        [created.defaultWarehouseId],
      );
      assert.equal(moved.rows[0]?.branch_id, IDS.bootstrapBranch);

      await pool.query(
        `INSERT INTO posting_batches
          (id,branch_id,source_type,source_id,operation_type,document_version,
           reverses_posting_batch_id,posted_at,created_by)
         VALUES ($1,$2,'ORGANIZATION_TEST',$3,'POST',1,NULL,now(),$4)`,
        [IDS.postingBatch, IDS.bootstrapBranch, IDS.postingSource, IDS.actor],
      );
      await pool.query(
        `INSERT INTO inventory_movements
          (id,branch_id,warehouse_id,movement_type,source_type,source_id,
           posting_batch_id,occurred_at,created_by,reason_code,notes)
         VALUES
          ($1,$2,$3,'OPENING','ORGANIZATION_TEST',$4,$5,now(),$6,'TEST','Phase 05.05')`,
        [
          IDS.movement,
          IDS.bootstrapBranch,
          created.defaultWarehouseId,
          IDS.postingSource,
          IDS.postingBatch,
          IDS.actor,
        ],
      );

      await assert.rejects(
        () =>
          organization.moveWarehouseToBranch({
            warehouseId: created.defaultWarehouseId,
            targetBranchId: created.branchId,
            actorUserId: IDS.actor,
          }),
        (error) =>
          error instanceof OrganizationError &&
          error.reason === "WAREHOUSE_HAS_MOVEMENTS",
      );

      await assert.rejects(
        pool.query(
          "UPDATE warehouses SET branch_id=$1 WHERE id=$2",
          [created.branchId, created.defaultWarehouseId],
        ),
        /fk_inventory_movements__warehouse_branch/,
      );

      await organization.setWarehouseActive({
        warehouseId: created.defaultWarehouseId,
        actorUserId: IDS.actor,
        isActive: false,
      });
      const historicalWarehouse = await pool.query(
        "SELECT is_active,branch_id FROM warehouses WHERE id=$1",
        [created.defaultWarehouseId],
      );
      assert.equal(historicalWarehouse.rows[0]?.is_active, false);
      assert.equal(
        historicalWarehouse.rows[0]?.branch_id,
        IDS.bootstrapBranch,
      );

      const beforeRollbackCounts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM branches) AS branches,
           (SELECT COUNT(*)::integer FROM warehouses) AS warehouses,
           (SELECT COUNT(*)::integer FROM branch_settings) AS branch_settings`,
      );
      await assert.rejects(
        () =>
          organization.createBranch({
            companyId: IDS.company,
            actorUserId: IDS.missingActor,
            name: "Rollback Branch",
            code: "ROLLBACK",
            defaultWarehouseName: "Rollback Warehouse",
            defaultWarehouseCode: "ROLLBACK-WH",
          }),
        /fk_audit_logs__user/,
      );
      const afterRollbackCounts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM branches) AS branches,
           (SELECT COUNT(*)::integer FROM warehouses) AS warehouses,
           (SELECT COUNT(*)::integer FROM branch_settings) AS branch_settings`,
      );
      assert.deepEqual(
        afterRollbackCounts.rows[0],
        beforeRollbackCounts.rows[0],
        "branch + default warehouse + settings + audit must rollback atomically",
      );
      const rollbackBranch = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM branches WHERE code='ROLLBACK'",
      );
      assert.equal(rollbackBranch.rows[0]?.count, 0);

      const auditActions = await pool.query(
        `SELECT action
           FROM audit_logs
          WHERE company_id=$1
            AND action LIKE 'ORGANIZATION_%'
          ORDER BY created_at,id`,
        [IDS.company],
      );
      const actions = auditActions.rows.map((row) => row.action);
      assert.ok(actions.includes("ORGANIZATION_COMPANY_SETTINGS_UPDATED"));
      assert.ok(actions.includes("ORGANIZATION_BRANCH_CREATED"));
      assert.ok(actions.includes("ORGANIZATION_BRANCH_DEACTIVATED"));
      assert.ok(actions.includes("ORGANIZATION_BRANCH_ACTIVATED"));
      assert.ok(actions.includes("ORGANIZATION_DEFAULT_WAREHOUSE_CHANGED"));
      assert.ok(actions.includes("ORGANIZATION_WAREHOUSE_BRANCH_CHANGED"));
      assert.ok(actions.includes("ORGANIZATION_WAREHOUSE_DEACTIVATED"));

      assert.deepEqual(await indexNames(pool, "branches"), [
        "ix_branches__company_id_is_active",
        "pk_branches",
        "uq_branches__company_code",
      ]);
      assert.deepEqual(await indexNames(pool, "warehouses"), [
        "ix_warehouses__branch_id__where_is_active_true",
        "pk_warehouses",
        "uq_warehouses__branch_code",
        "uq_warehouses__id_branch",
      ]);
      assert.deepEqual(await indexNames(pool, "branch_settings"), [
        "pk_branch_settings",
      ]);
      assert.deepEqual(await indexNames(pool, "company_settings"), [
        "pk_company_settings",
      ]);

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
