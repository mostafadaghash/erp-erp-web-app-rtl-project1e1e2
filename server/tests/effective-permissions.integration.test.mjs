import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  EffectivePermissionService,
  PermissionDeniedError,
} from "../infrastructure/authorization/effective-permission-service.ts";
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
  company: "9e000000-0000-4000-8000-000000000001",
  branch: "9e000000-0000-4000-8000-000000000002",
  activeUser: "9e000000-0000-4000-8000-000000000003",
  inactiveUser: "9e000000-0000-4000-8000-000000000004",
  permissionDefaultAllow: "9e000000-0000-4000-8000-000000000011",
  permissionDefaultDeny: "9e000000-0000-4000-8000-000000000012",
  permissionAllowOverride: "9e000000-0000-4000-8000-000000000013",
  permissionDenyOverride: "9e000000-0000-4000-8000-000000000014",
});

const KEYS = Object.freeze({
  defaultAllow: "phase05.default_allow",
  defaultDeny: "phase05.default_deny",
  allowOverride: "phase05.allow_override",
  denyOverride: "phase05.deny_override",
});

async function seedIdentity(pool, roleId) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 05 Permissions Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES ($1,$2,'Main','MAIN',true,now(),now())`,
    [IDS.branch, IDS.company],
  );
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,
       branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
     VALUES
      ($1,'Active User','phase05-active','phase05-active@example.test','test-only-hash',$3,$4,
       'ALL','ar-EG',true,NULL,now(),now()),
      ($2,'Inactive User','phase05-inactive','phase05-inactive@example.test','test-only-hash',$3,$4,
       'ALL','ar-EG',false,NULL,now(),now())`,
    [IDS.activeUser, IDS.inactiveUser, roleId, IDS.branch],
  );
}

async function seedPermissions(pool, roleId) {
  await pool.query(
    `INSERT INTO permissions (id,permission_key,module,description_key)
     VALUES
       ($1,$5,'phase05','permissions.phase05.defaultAllow'),
       ($2,$6,'phase05','permissions.phase05.defaultDeny'),
       ($3,$7,'phase05','permissions.phase05.allowOverride'),
       ($4,$8,'phase05','permissions.phase05.denyOverride')`,
    [
      IDS.permissionDefaultAllow,
      IDS.permissionDefaultDeny,
      IDS.permissionAllowOverride,
      IDS.permissionDenyOverride,
      KEYS.defaultAllow,
      KEYS.defaultDeny,
      KEYS.allowOverride,
      KEYS.denyOverride,
    ],
  );

  await pool.query(
    `INSERT INTO role_permissions (role_id,permission_id,is_allowed)
     VALUES
       ($1,$2,true),
       ($1,$3,false),
       ($1,$4,false),
       ($1,$5,true)`,
    [
      roleId,
      IDS.permissionDefaultAllow,
      IDS.permissionDefaultDeny,
      IDS.permissionAllowOverride,
      IDS.permissionDenyOverride,
    ],
  );

  await pool.query(
    `INSERT INTO user_permission_overrides
      (user_id,permission_id,effect,changed_by,changed_at)
     VALUES
       ($1,$3,'ALLOW',$1,now()),
       ($1,$4,'DENY',$1,now()),
       ($2,$3,'ALLOW',$1,now())`,
    [
      IDS.activeUser,
      IDS.inactiveUser,
      IDS.permissionAllowOverride,
      IDS.permissionDenyOverride,
    ],
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
  "05.03 Effective Permissions resolve Role Default -> ALLOW/DENY Override and fail closed on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-effective-permissions-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roleCatalog = new RoleCatalogService(database);
    const permissions = new EffectivePermissionService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `05.03 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const salesRole = roles.find((role) => role.roleKey === "SALES");
      assert.ok(salesRole);

      await seedIdentity(pool, salesRole.id);
      await seedPermissions(pool, salesRole.id);

      const defaultAllow = await permissions.evaluate(
        IDS.activeUser,
        KEYS.defaultAllow,
      );
      assert.equal(defaultAllow.allowed, true);
      assert.equal(defaultAllow.source, "ROLE_DEFAULT");
      assert.equal(defaultAllow.overrideEffect, null);

      const defaultDeny = await permissions.evaluate(
        IDS.activeUser,
        KEYS.defaultDeny,
      );
      assert.equal(defaultDeny.allowed, false);
      assert.equal(defaultDeny.source, "ROLE_DEFAULT");

      const allowOverride = await permissions.evaluate(
        IDS.activeUser,
        KEYS.allowOverride,
      );
      assert.equal(allowOverride.allowed, true);
      assert.equal(allowOverride.source, "USER_OVERRIDE");
      assert.equal(allowOverride.roleDefaultAllowed, false);
      assert.equal(allowOverride.overrideEffect, "ALLOW");

      const denyOverride = await permissions.evaluate(
        IDS.activeUser,
        KEYS.denyOverride,
      );
      assert.equal(denyOverride.allowed, false);
      assert.equal(denyOverride.source, "USER_OVERRIDE");
      assert.equal(denyOverride.roleDefaultAllowed, true);
      assert.equal(denyOverride.overrideEffect, "DENY");

      await pool.query(
        "DELETE FROM user_permission_overrides WHERE user_id=$1 AND permission_id=$2",
        [IDS.activeUser, IDS.permissionDenyOverride],
      );
      const inheritedAfterDelete = await permissions.evaluate(
        IDS.activeUser,
        KEYS.denyOverride,
      );
      assert.equal(inheritedAfterDelete.allowed, true);
      assert.equal(inheritedAfterDelete.source, "ROLE_DEFAULT");
      assert.equal(inheritedAfterDelete.overrideEffect, null);

      const inactive = await permissions.evaluate(
        IDS.inactiveUser,
        KEYS.allowOverride,
      );
      assert.equal(inactive.allowed, false);
      assert.equal(inactive.source, "USER_INACTIVE");

      const unknownPermission = await permissions.evaluate(
        IDS.activeUser,
        "phase05.unknown_permission",
      );
      assert.equal(unknownPermission.allowed, false);
      assert.equal(unknownPermission.source, "NOT_FOUND");

      const unknownUser = await permissions.evaluate(
        "9e000000-0000-4000-8000-000000000099",
        KEYS.defaultAllow,
      );
      assert.equal(unknownUser.allowed, false);
      assert.equal(unknownUser.source, "NOT_FOUND");

      assert.equal(
        await permissions.hasPermission(IDS.activeUser, KEYS.defaultAllow),
        true,
      );
      await assert.rejects(
        () => permissions.requirePermission(IDS.activeUser, KEYS.defaultDeny),
        (error) =>
          error instanceof PermissionDeniedError &&
          error.permissionKey === KEYS.defaultDeny,
      );

      const branchAccessCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM user_branch_access",
      );
      assert.equal(branchAccessCount.rows[0]?.count, 0);

      assert.deepEqual(await indexNames(pool, "permissions"), [
        "pk_permissions",
        "uq_permissions__permission_key",
      ]);
      assert.deepEqual(await indexNames(pool, "role_permissions"), [
        "pk_role_permissions",
      ]);
      assert.deepEqual(await indexNames(pool, "user_permission_overrides"), [
        "pk_user_permission_overrides",
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
