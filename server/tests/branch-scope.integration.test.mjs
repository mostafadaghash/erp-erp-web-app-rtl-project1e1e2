import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  BranchAccessDeniedError,
  BranchScopeService,
  BranchScopedAuthorizationService,
} from "../infrastructure/authorization/branch-scope-service.ts";
import {
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
  company: "9f000000-0000-4000-8000-000000000001",
  branch1: "9f000000-0000-4000-8000-000000000002",
  branch2: "9f000000-0000-4000-8000-000000000003",
  branch3: "9f000000-0000-4000-8000-000000000004",
  allUser: "9f000000-0000-4000-8000-000000000005",
  selectedUser: "9f000000-0000-4000-8000-000000000006",
  inactiveUser: "9f000000-0000-4000-8000-000000000007",
  invalidDefaultUser: "9f000000-0000-4000-8000-000000000008",
  permissionAllow: "9f000000-0000-4000-8000-000000000011",
  permissionDeny: "9f000000-0000-4000-8000-000000000012",
});

const KEYS = Object.freeze({
  allow: "phase05.branch_scope.allow",
  deny: "phase05.branch_scope.deny",
});

async function seedCompanyAndBranches(pool) {
  await pool.query(
    `INSERT INTO companies
      (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
     VALUES ($1,'Phase 05 Branch Scope Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
    [IDS.company],
  );
  await pool.query(
    `INSERT INTO branches
      (id,company_id,name,code,is_active,created_at,updated_at)
     VALUES
       ($1,$4,'Main','MAIN',true,now(),now()),
       ($2,$4,'Second','SECOND',true,now(),now()),
       ($3,$4,'Third','THIRD',true,now(),now())`,
    [IDS.branch1, IDS.branch2, IDS.branch3, IDS.company],
  );
}

async function seedUsers(pool, roleId) {
  await pool.query(
    `INSERT INTO users
      (id,name,username,email,password_hash,role_id,default_branch_id,
       branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
     VALUES
      ($1,'All Branches','phase05-all','phase05-all@example.test','test-only-hash',$2,$3,
       'ALL','ar-EG',true,NULL,now(),now())`,
    [IDS.allUser, roleId, IDS.branch1],
  );

  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO users
        (id,name,username,email,password_hash,role_id,default_branch_id,
         branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
       VALUES
        ($1,'Selected Branches','phase05-selected','phase05-selected@example.test','test-only-hash',$2,$3,
         'SELECTED','ar-EG',true,NULL,now(),now())`,
      [IDS.selectedUser, roleId, IDS.branch1],
    );
    await client.query(
      `INSERT INTO user_branch_access (user_id,branch_id)
       VALUES ($1,$2),($1,$3)`,
      [IDS.selectedUser, IDS.branch1, IDS.branch2],
    );
  });

  await withTransaction(pool, async (client) => {
    await client.query(
      `INSERT INTO users
        (id,name,username,email,password_hash,role_id,default_branch_id,
         branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
       VALUES
        ($1,'Inactive Selected','phase05-inactive-scope','phase05-inactive-scope@example.test','test-only-hash',$2,$3,
         'SELECTED','ar-EG',false,NULL,now(),now())`,
      [IDS.inactiveUser, roleId, IDS.branch1],
    );
    await client.query(
      "INSERT INTO user_branch_access (user_id,branch_id) VALUES ($1,$2)",
      [IDS.inactiveUser, IDS.branch1],
    );
  });
}

async function seedPermissions(pool, roleId) {
  await pool.query(
    `INSERT INTO permissions (id,permission_key,module,description_key)
     VALUES
       ($1,$3,'phase05','permissions.phase05.branchScopeAllow'),
       ($2,$4,'phase05','permissions.phase05.branchScopeDeny')`,
    [IDS.permissionAllow, IDS.permissionDeny, KEYS.allow, KEYS.deny],
  );
  await pool.query(
    `INSERT INTO role_permissions (role_id,permission_id,is_allowed)
     VALUES ($1,$2,true),($1,$3,false)`,
    [roleId, IDS.permissionAllow, IDS.permissionDeny],
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
  "05.04 Branch Scope enforces ALL/SELECTED, default branch integrity, and cross-branch denial on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-branch-scope-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const roleCatalog = new RoleCatalogService(database);
    const branchScope = new BranchScopeService(database);
    const authorization = new BranchScopedAuthorizationService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `05.04 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const salesRole = roles.find((role) => role.roleKey === "SALES");
      assert.ok(salesRole);

      await seedCompanyAndBranches(pool);
      await seedUsers(pool, salesRole.id);
      await seedPermissions(pool, salesRole.id);

      const allThird = await branchScope.evaluate(IDS.allUser, IDS.branch3);
      assert.equal(allThird.allowed, true);
      assert.equal(allThird.source, "ALL");
      assert.equal(allThird.defaultBranchId, IDS.branch1);

      const allExplicitRows = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM user_branch_access WHERE user_id=$1",
        [IDS.allUser],
      );
      assert.equal(
        allExplicitRows.rows[0]?.count,
        0,
        "ALL scope must not require selected-branch mapping rows",
      );

      const selectedDefault = await branchScope.evaluate(
        IDS.selectedUser,
        IDS.branch1,
      );
      assert.equal(selectedDefault.allowed, true);
      assert.equal(selectedDefault.source, "SELECTED");
      assert.equal(selectedDefault.defaultBranchId, IDS.branch1);

      assert.equal(
        await branchScope.hasAccess(IDS.selectedUser, IDS.branch2),
        true,
      );
      assert.equal(
        await branchScope.hasAccess(IDS.selectedUser, IDS.branch3),
        false,
      );

      const inactive = await branchScope.evaluate(
        IDS.inactiveUser,
        IDS.branch1,
      );
      assert.equal(inactive.allowed, false);
      assert.equal(inactive.source, "USER_INACTIVE");

      const missingBranch = await branchScope.evaluate(
        IDS.allUser,
        "9f000000-0000-4000-8000-000000000099",
      );
      assert.equal(missingBranch.allowed, false);
      assert.equal(missingBranch.source, "BRANCH_NOT_FOUND");

      const missingUser = await branchScope.evaluate(
        "9f000000-0000-4000-8000-000000000098",
        IDS.branch1,
      );
      assert.equal(missingUser.allowed, false);
      assert.equal(missingUser.source, "NOT_FOUND");

      const granted = await authorization.require(
        IDS.selectedUser,
        KEYS.allow,
        IDS.branch2,
      );
      assert.equal(granted.allowed, true);
      assert.equal(granted.branchScope.allowed, true);
      assert.equal(granted.permission.allowed, true);

      await assert.rejects(
        () =>
          authorization.require(
            IDS.selectedUser,
            KEYS.allow,
            IDS.branch3,
          ),
        (error) =>
          error instanceof BranchAccessDeniedError &&
          error.branchId === IDS.branch3,
      );

      await assert.rejects(
        () =>
          authorization.require(
            IDS.selectedUser,
            KEYS.deny,
            IDS.branch2,
          ),
        (error) =>
          error instanceof PermissionDeniedError &&
          error.permissionKey === KEYS.deny,
      );

      await withTransaction(pool, async (client) => {
        await client.query(
          "DELETE FROM user_branch_access WHERE user_id=$1 AND branch_id=$2",
          [IDS.selectedUser, IDS.branch2],
        );

        await assert.rejects(
          () =>
            authorization.requireWithinTransaction(
              client,
              IDS.selectedUser,
              KEYS.allow,
              IDS.branch2,
            ),
          (error) =>
            error instanceof BranchAccessDeniedError &&
            error.branchId === IDS.branch2,
        );

        await client.query(
          "INSERT INTO user_branch_access (user_id,branch_id) VALUES ($1,$2)",
          [IDS.selectedUser, IDS.branch2],
        );

        const restored = await authorization.requireWithinTransaction(
          client,
          IDS.selectedUser,
          KEYS.allow,
          IDS.branch2,
        );
        assert.equal(restored.allowed, true);
      });

      await assert.rejects(
        () =>
          withTransaction(pool, async (client) => {
            await client.query(
              `INSERT INTO users
                (id,name,username,email,password_hash,role_id,default_branch_id,
                 branch_scope_mode,preferred_language,is_active,last_login_at,created_at,updated_at)
               VALUES
                ($1,'Invalid Default','phase05-invalid-default','phase05-invalid-default@example.test','test-only-hash',$2,$3,
                 'SELECTED','ar-EG',true,NULL,now(),now())`,
              [IDS.invalidDefaultUser, salesRole.id, IDS.branch3],
            );
            await client.query(
              "INSERT INTO user_branch_access (user_id,branch_id) VALUES ($1,$2)",
              [IDS.invalidDefaultUser, IDS.branch1],
            );
          }),
        /ct_users__default_branch_access_at_commit/,
      );

      await assert.rejects(
        () =>
          withTransaction(pool, async (client) => {
            await client.query(
              "UPDATE users SET default_branch_id=$1 WHERE id=$2",
              [IDS.branch3, IDS.selectedUser],
            );
          }),
        /ct_users__default_branch_access_at_commit/,
      );

      await assert.rejects(
        () =>
          withTransaction(pool, async (client) => {
            await client.query(
              "DELETE FROM user_branch_access WHERE user_id=$1 AND branch_id=$2",
              [IDS.selectedUser, IDS.branch1],
            );
          }),
        /ct_user_branch_access__preserves_default_at_commit/,
      );

      assert.deepEqual(await indexNames(pool, "user_branch_access"), [
        "pk_user_branch_access",
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
