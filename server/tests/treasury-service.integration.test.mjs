import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { RoleCatalogService } from "../infrastructure/authorization/role-catalog-service.ts";
import { BranchAccessDeniedError } from "../infrastructure/authorization/branch-scope-service.ts";
import { PermissionDeniedError } from "../infrastructure/authorization/effective-permission-service.ts";
import {
  TREASURY_PERMISSIONS,
  TreasuryError,
  TreasuryService,
} from "../infrastructure/finance/treasury-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const IDS = Object.freeze({
  company: "d9010000-0000-4000-8000-000000000001",
  branchA: "d9010000-0000-4000-8000-000000000002",
  branchB: "d9010000-0000-4000-8000-000000000003",
  inactiveBranch: "d9010000-0000-4000-8000-000000000004",
  admin: "d9010000-0000-4000-8000-000000000005",
  selectedUser: "d9010000-0000-4000-8000-000000000006",
  deniedUser: "d9010000-0000-4000-8000-000000000007",
  viewPermission: "d9010000-0000-4000-8000-000000000011",
  managePermission: "d9010000-0000-4000-8000-000000000012",
});

test(
  "09.01 Treasuries enforce free names, branch scope, permissions and case-insensitive uniqueness on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);
    await cleanupDatabase(databaseUrl);

    const pool = new Pool({
      connectionString: databaseUrl,
      max: 10,
      application_name: "business-tech-erp-treasury-0901-test",
    });
    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roleCatalog = new RoleCatalogService(database);
    const treasuries = new TreasuryService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `09.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const adminRole = roles.find((role) => role.roleKey === "SYSTEM_ADMIN");
      const accountantRole = roles.find((role) => role.roleKey === "ACCOUNTANT");
      assert.ok(adminRole);
      assert.ok(accountantRole);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 09 Finance Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES
          ($1,$4,'Branch A','A',true,now(),now()),
          ($2,$4,'Branch B','B',true,now(),now()),
          ($3,$4,'Inactive','OFF',false,now(),now())`,
        [IDS.branchA, IDS.branchB, IDS.inactiveBranch, IDS.company],
      );
      await pool.query(
        `INSERT INTO permissions (id,permission_key,module,description_key)
         VALUES
          ($1,$3,'finance','permissions.finance.accounts.view'),
          ($2,$4,'finance','permissions.finance.accounts.manage')`,
        [
          IDS.viewPermission,
          IDS.managePermission,
          TREASURY_PERMISSIONS.view,
          TREASURY_PERMISSIONS.manage,
        ],
      );
      await pool.query(
        `INSERT INTO role_permissions (role_id,permission_id,is_allowed)
         VALUES
          ($1,$3,true),($1,$4,true),
          ($2,$3,true),($2,$4,true)`,
        [
          adminRole.id,
          accountantRole.id,
          IDS.viewPermission,
          IDS.managePermission,
        ],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Admin','phase09-admin','phase09-admin@example.test','test',$4,$5,'ALL','ar-EG',true,NULL,now(),now()),
          ($2,'Selected','phase09-selected','phase09-selected@example.test','test',$4,$5,'SELECTED','ar-EG',true,NULL,now(),now()),
          ($3,'Denied','phase09-denied','phase09-denied@example.test','test',$4,$5,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.admin, IDS.selectedUser, IDS.deniedUser, accountantRole.id, IDS.branchA],
      );
      await pool.query(
        `INSERT INTO user_branch_access (user_id,branch_id)
         VALUES ($1,$2)`,
        [IDS.selectedUser, IDS.branchA],
      );
      await pool.query(
        `INSERT INTO user_permission_overrides
          (user_id,permission_id,effect,changed_by,changed_at)
         VALUES ($1,$2,'DENY',$1,now())`,
        [IDS.deniedUser, IDS.managePermission],
      );

      const main = await treasuries.create({
        actorUserId: IDS.admin,
        branchId: IDS.branchA,
        name: "  Main Cash  ",
        notes: "  Front desk  ",
      });
      assert.equal(main.name, "Main Cash");
      assert.equal(main.notes, "Front desk");
      assert.equal(main.isActive, true);
      assert.equal("type" in main, false);
      assert.equal("code" in main, false);
      assert.equal("currentBalance" in main, false);

      await assert.rejects(
        () =>
          treasuries.create({
            actorUserId: IDS.admin,
            branchId: IDS.branchA,
            name: "main cash",
          }),
        (error) =>
          error instanceof TreasuryError &&
          error.reason === "TREASURY_NAME_CONFLICT",
      );

      const otherBranchSameName = await treasuries.create({
        actorUserId: IDS.admin,
        branchId: IDS.branchB,
        name: "MAIN CASH",
      });
      assert.equal(otherBranchSameName.branchId, IDS.branchB);

      const wallet = await treasuries.create({
        actorUserId: IDS.admin,
        branchId: IDS.branchA,
        name: "InstaPay",
      });
      assert.equal(wallet.name, "InstaPay");

      const listed = await treasuries.list(IDS.selectedUser, IDS.branchA);
      assert.deepEqual(
        listed.map((item) => item.name),
        ["InstaPay", "Main Cash"],
      );

      await assert.rejects(
        () => treasuries.list(IDS.selectedUser, IDS.branchB),
        BranchAccessDeniedError,
      );
      await assert.rejects(
        () =>
          treasuries.create({
            actorUserId: IDS.deniedUser,
            branchId: IDS.branchA,
            name: "Denied",
          }),
        PermissionDeniedError,
      );
      await assert.rejects(
        () =>
          treasuries.create({
            actorUserId: IDS.admin,
            branchId: IDS.inactiveBranch,
            name: "Inactive Branch Cash",
          }),
        (error) =>
          error instanceof TreasuryError &&
          error.reason === "BRANCH_INACTIVE",
      );

      const renamed = await treasuries.update({
        actorUserId: IDS.admin,
        treasuryId: wallet.id,
        branchId: IDS.branchA,
        name: "Bank",
        notes: "",
      });
      assert.equal(renamed.name, "Bank");
      assert.equal(renamed.notes, null);

      await assert.rejects(
        () =>
          treasuries.update({
            actorUserId: IDS.admin,
            treasuryId: wallet.id,
            branchId: IDS.branchA,
            name: "MAIN CASH",
          }),
        (error) =>
          error instanceof TreasuryError &&
          error.reason === "TREASURY_NAME_CONFLICT",
      );

      const disabled = await treasuries.setActive({
        actorUserId: IDS.admin,
        treasuryId: main.id,
        branchId: IDS.branchA,
        isActive: false,
      });
      assert.equal(disabled.isActive, false);

      const persisted = await pool.query(
        `SELECT id,branch_id,name,is_active,notes,created_at
           FROM treasuries
          WHERE id=$1`,
        [main.id],
      );
      assert.equal(persisted.rowCount, 1);
      assert.equal(persisted.rows[0]?.is_active, false);

      const treasuryColumns = await pool.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema='public' AND table_name='treasuries'
          ORDER BY ordinal_position`,
      );
      assert.deepEqual(
        treasuryColumns.rows.map((row) => row.column_name),
        ["id", "branch_id", "name", "is_active", "notes", "created_at"],
      );

      const movementCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM financial_movements",
      );
      const receiptCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM receipts",
      );
      const disbursementCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM disbursements",
      );
      const transferCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM treasury_transfers",
      );
      assert.equal(movementCount.rows[0]?.count, 0);
      assert.equal(receiptCount.rows[0]?.count, 0);
      assert.equal(disbursementCount.rows[0]?.count, 0);
      assert.equal(transferCount.rows[0]?.count, 0);

      const audit = await pool.query(
        `SELECT action,entity_type
           FROM audit_log
          WHERE entity_type='TREASURY'
          ORDER BY occurred_at,id`,
      );
      assert.ok(audit.rows.some((row) => row.action === "TREASURY_CREATED"));
      assert.ok(audit.rows.some((row) => row.action === "TREASURY_UPDATED"));
      assert.ok(audit.rows.some((row) => row.action === "TREASURY_DEACTIVATED"));

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
