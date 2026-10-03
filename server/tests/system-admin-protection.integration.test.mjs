import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  SystemAdminProtectionError,
  SystemAdminProtectionService,
} from "../infrastructure/authorization/system-admin-protection-service.ts";
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
  company: "a2000000-0000-4000-8000-000000000001",
  branch: "a2000000-0000-4000-8000-000000000002",
  adminA: "a2000000-0000-4000-8000-000000000003",
  adminB: "a2000000-0000-4000-8000-000000000004",
  customSuper: "a2000000-0000-4000-8000-000000000005",
  customRole: "a2000000-0000-4000-8000-000000000006",
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

async function activeSystemAdminCount(pool, systemAdminRoleId) {
  const result = await pool.query(
    `SELECT COUNT(*)::integer AS count
       FROM users
      WHERE role_id=$1
        AND is_active=true`,
    [systemAdminRoleId],
  );
  return result.rows[0]?.count ?? 0;
}

async function userState(pool, userId) {
  const result = await pool.query(
    "SELECT role_id,is_active FROM users WHERE id=$1",
    [userId],
  );
  assert.equal(result.rowCount, 1);
  return result.rows[0];
}

function assertOneSuccessOneProtectedFailure(results) {
  assert.equal(results.length, 2);

  const fulfilled = results.filter(
    (result) => result.status === "fulfilled",
  );
  const rejected = results.filter(
    (result) => result.status === "rejected",
  );

  assert.equal(
    fulfilled.length,
    1,
    "exactly one concurrent removal may succeed",
  );
  assert.equal(
    rejected.length,
    1,
    "the competing removal must be rejected",
  );

  const rejection = rejected[0];
  assert.equal(rejection.status, "rejected");
  assert.ok(
    rejection.reason instanceof SystemAdminProtectionError,
  );
  assert.equal(
    rejection.reason.reason,
    "LAST_ACTIVE_SYSTEM_ADMIN",
  );
}

test(
  "Gate 05 preserves at least one active canonical SYSTEM_ADMIN under disable/demotion concurrency on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-system-admin-guard-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const protection = new SystemAdminProtectionService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `Gate 05 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      const sales = roles.find((role) => role.roleKey === "SALES");
      assert.ok(systemAdmin);
      assert.ok(sales);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 05 Admin Guard Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
        [IDS.company],
      );
      await pool.query(
        `INSERT INTO branches
          (id,company_id,name,code,is_active,created_at,updated_at)
         VALUES ($1,$2,'Main','MAIN',true,now(),now())`,
        [IDS.branch, IDS.company],
      );
      await pool.query(
        `INSERT INTO roles
          (id,role_key,display_name_key,is_system)
         VALUES ($1,'CUSTOM_SUPER','roles.customSuper',true)`,
        [IDS.customRole],
      );
      await pool.query(
        `INSERT INTO users
          (id,name,username,email,password_hash,role_id,default_branch_id,
           branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
         VALUES
          ($1,'Admin A','gate05-admin-a','gate05-admin-a@example.test','test-only-hash',$4,$6,
           'ALL','ar-EG',true,NULL,now(),now()),
          ($2,'Admin B','gate05-admin-b','gate05-admin-b@example.test','test-only-hash',$4,$6,
           'ALL','ar-EG',true,NULL,now(),now()),
          ($3,'Custom Super','gate05-custom-super','gate05-custom-super@example.test','test-only-hash',$5,$6,
           'ALL','ar-EG',true,NULL,now(),now())`,
        [
          IDS.adminA,
          IDS.adminB,
          IDS.customSuper,
          systemAdmin.id,
          IDS.customRole,
          IDS.branch,
        ],
      );

      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        2,
      );

      await protection.setUserActive({
        userId: IDS.adminA,
        isActive: false,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        1,
      );

      const auditBeforeRejectedDisable = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM audit_logs
          WHERE entity_type='USER'
            AND entity_id=$1
            AND action='USER_DEACTIVATED'`,
        [IDS.adminB],
      );

      await assert.rejects(
        () =>
          protection.setUserActive({
            userId: IDS.adminB,
            isActive: false,
            actorUserId: IDS.customSuper,
          }),
        (error) =>
          error instanceof SystemAdminProtectionError &&
          error.reason === "LAST_ACTIVE_SYSTEM_ADMIN",
      );

      assert.equal(
        (await userState(pool, IDS.adminB)).is_active,
        true,
      );
      const auditAfterRejectedDisable = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM audit_logs
          WHERE entity_type='USER'
            AND entity_id=$1
            AND action='USER_DEACTIVATED'`,
        [IDS.adminB],
      );
      assert.equal(
        auditAfterRejectedDisable.rows[0]?.count,
        auditBeforeRejectedDisable.rows[0]?.count,
        "rejected last-admin mutation must not leak an audit success record",
      );

      await protection.setUserActive({
        userId: IDS.adminA,
        isActive: true,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        2,
      );

      const concurrentDisable = await Promise.allSettled([
        protection.setUserActive({
          userId: IDS.adminA,
          isActive: false,
          actorUserId: IDS.customSuper,
        }),
        protection.setUserActive({
          userId: IDS.adminB,
          isActive: false,
          actorUserId: IDS.customSuper,
        }),
      ]);
      assertOneSuccessOneProtectedFailure(concurrentDisable);
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        1,
        "concurrent disables must leave exactly one active SYSTEM_ADMIN",
      );

      const stateAfterDisableA = await userState(pool, IDS.adminA);
      const stateAfterDisableB = await userState(pool, IDS.adminB);
      const disabledAdminId =
        stateAfterDisableA.is_active === false
          ? IDS.adminA
          : IDS.adminB;
      await protection.setUserActive({
        userId: disabledAdminId,
        isActive: true,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        2,
      );

      const concurrentDemotion = await Promise.allSettled([
        protection.changeUserRole({
          userId: IDS.adminA,
          roleId: sales.id,
          actorUserId: IDS.customSuper,
        }),
        protection.changeUserRole({
          userId: IDS.adminB,
          roleId: sales.id,
          actorUserId: IDS.customSuper,
        }),
      ]);
      assertOneSuccessOneProtectedFailure(concurrentDemotion);
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        1,
        "concurrent demotions must leave exactly one active SYSTEM_ADMIN",
      );

      const adminAState = await userState(pool, IDS.adminA);
      const adminBState = await userState(pool, IDS.adminB);
      const remainingAdminId =
        adminAState.role_id === systemAdmin.id
          ? IDS.adminA
          : IDS.adminB;
      const demotedAdminId =
        remainingAdminId === IDS.adminA
          ? IDS.adminB
          : IDS.adminA;

      await assert.rejects(
        () =>
          protection.changeUserRole({
            userId: remainingAdminId,
            roleId: sales.id,
            actorUserId: IDS.customSuper,
          }),
        (error) =>
          error instanceof SystemAdminProtectionError &&
          error.reason === "LAST_ACTIVE_SYSTEM_ADMIN",
      );

      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        1,
      );

      const customSuperState = await userState(
        pool,
        IDS.customSuper,
      );
      assert.equal(customSuperState.is_active, true);
      assert.equal(customSuperState.role_id, IDS.customRole);
      assert.notEqual(
        IDS.customRole,
        systemAdmin.id,
        "an active custom is_system role must not count as canonical SYSTEM_ADMIN",
      );

      await protection.changeUserRole({
        userId: IDS.customSuper,
        roleId: systemAdmin.id,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        2,
        "promotion to canonical SYSTEM_ADMIN must increase protected count",
      );

      await protection.setUserActive({
        userId: remainingAdminId,
        isActive: false,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        1,
      );

      await protection.changeUserRole({
        userId: demotedAdminId,
        roleId: systemAdmin.id,
        actorUserId: IDS.customSuper,
      });
      assert.equal(
        await activeSystemAdminCount(pool, systemAdmin.id),
        2,
      );

      const auditActions = await pool.query(
        `SELECT action
           FROM audit_logs
          WHERE company_id=$1
            AND entity_type='USER'
          ORDER BY created_at,id`,
        [IDS.company],
      );
      const actions = auditActions.rows.map((row) => row.action);
      assert.ok(actions.includes("USER_DEACTIVATED"));
      assert.ok(actions.includes("USER_ACTIVATED"));
      assert.ok(actions.includes("USER_ROLE_CHANGED"));

      assert.deepEqual(await indexNames(pool, "roles"), [
        "pk_roles",
        "uq_roles__role_key",
      ]);
      assert.deepEqual(await indexNames(pool, "users"), [
        "ix_users__default_branch_id",
        "ix_users__role_id",
        "pk_users",
        "ux_users__lower_email__where_email_is_not_null",
        "ux_users__lower_username",
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
