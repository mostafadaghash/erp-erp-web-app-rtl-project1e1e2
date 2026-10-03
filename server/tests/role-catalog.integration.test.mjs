import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  DEFAULT_SYSTEM_ROLES,
  RoleCatalogService,
} from "../infrastructure/authorization/role-catalog-service.ts";
import { withTransaction } from "../infrastructure/database/transaction.ts";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

const DRIFTED_SYSTEM_ADMIN_ID = "9d000000-0000-4000-8000-000000000001";
const CUSTOM_ROLE_ID = "9d000000-0000-4000-8000-000000000002";

test(
  "05.02 default Roles are canonical, idempotent, concurrency-safe, and preserve custom roles on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 20,
      application_name: "business-tech-erp-role-catalog-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };
    const service = new RoleCatalogService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `05.02 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await pool.query(
        `INSERT INTO roles (id,role_key,display_name_key,is_system)
         VALUES
           ($1,'SYSTEM_ADMIN','legacy.systemAdmin',false),
           ($2,'CUSTOM_REPORTER','roles.customReporter',false)`,
        [DRIFTED_SYSTEM_ADMIN_ID, CUSTOM_ROLE_ID],
      );

      const workers = Array.from({ length: 16 }, () =>
        service.ensureDefaultRoles(),
      );
      const results = await Promise.all(workers);

      for (const result of results) {
        assert.deepEqual(
          result.map((role) => role.roleKey),
          DEFAULT_SYSTEM_ROLES.map((role) => role.roleKey),
        );
        assert.ok(result.every((role) => role.isSystem === true));
      }

      const listed = await service.listDefaultRoles();
      assert.deepEqual(
        listed.map((role) => ({
          roleKey: role.roleKey,
          displayNameKey: role.displayNameKey,
          isSystem: role.isSystem,
        })),
        DEFAULT_SYSTEM_ROLES.map((role) => ({
          roleKey: role.roleKey,
          displayNameKey: role.displayNameKey,
          isSystem: true,
        })),
      );

      const allRoles = await pool.query(
        `SELECT id,role_key,display_name_key,is_system
           FROM roles
          ORDER BY role_key`,
      );
      assert.equal(allRoles.rowCount, 8);

      const systemRows = allRoles.rows.filter((row) =>
        DEFAULT_SYSTEM_ROLES.some((role) => role.roleKey === row.role_key),
      );
      assert.equal(systemRows.length, 7);
      assert.equal(new Set(systemRows.map((row) => row.role_key)).size, 7);
      assert.ok(systemRows.every((row) => row.is_system === true));

      const repairedAdmin = allRoles.rows.find(
        (row) => row.role_key === "SYSTEM_ADMIN",
      );
      assert.equal(repairedAdmin?.id, DRIFTED_SYSTEM_ADMIN_ID);
      assert.equal(repairedAdmin?.display_name_key, "roles.systemAdmin");
      assert.equal(repairedAdmin?.is_system, true);

      const customRole = allRoles.rows.find(
        (row) => row.role_key === "CUSTOM_REPORTER",
      );
      assert.deepEqual(customRole, {
        id: CUSTOM_ROLE_ID,
        role_key: "CUSTOM_REPORTER",
        display_name_key: "roles.customReporter",
        is_system: false,
      });

      assert.equal(
        allRoles.rows.some((row) => row.role_key === "ADMIN_SYSTEM"),
        false,
      );

      const rolePermissionCount = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM role_permissions",
      );
      assert.equal(rolePermissionCount.rows[0]?.count, 0);

      const roleIndexes = await pool.query(
        `SELECT indexname
           FROM pg_indexes
          WHERE schemaname='public'
            AND tablename='roles'
          ORDER BY indexname`,
      );
      assert.deepEqual(
        roleIndexes.rows.map((row) => row.indexname),
        ["pk_roles", "uq_roles__role_key"],
      );

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
