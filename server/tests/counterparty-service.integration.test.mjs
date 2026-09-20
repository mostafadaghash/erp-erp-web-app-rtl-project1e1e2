import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  CounterpartyError,
  CounterpartyService,
} from "../infrastructure/counterparties/counterparty-service.ts";
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
  company: "a3000000-0000-4000-8000-000000000001",
  branch: "a3000000-0000-4000-8000-000000000002",
  actor: "a3000000-0000-4000-8000-000000000003",
  missingActor: "a3000000-0000-4000-8000-000000000099",
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

test(
  "06.01 Unified Counterparty supports shared customer/supplier identity, optional profiles, and duplicate-safe roles on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 12,
      application_name: "business-tech-erp-counterparty-0601-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roleCatalog = new RoleCatalogService(database);
    const counterparties = new CounterpartyService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `06.01 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roles = await roleCatalog.ensureDefaultRoles();
      const systemAdmin = roles.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 06 Counterparty Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,'Counterparty Admin','phase06-admin','phase06-admin@example.test',
           'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.actor, systemAdmin.id, IDS.branch],
      );

      const dual = await counterparties.create({
        actorUserId: IDS.actor,
        name: "Shared Trading Account",
        phone: "0100 123 4567",
        address: "Cairo",
        notes: "shared identity",
        roles: ["CUSTOMER", "SUPPLIER"],
        customerProfile: {
          creditLimit: "5000.0000",
        },
        supplierProfile: {
          notes: "supplier profile on the same identity",
        },
      });

      assert.deepEqual(dual.roles, ["CUSTOMER", "SUPPLIER"]);
      assert.equal(dual.phone, "0100 123 4567");
      assert.equal(
        dual.normalizedPhone,
        null,
        "06.01 must not implement 06.02 phone normalization",
      );
      assert.deepEqual(dual.customerProfile, {
        defaultPriceListId: null,
        creditLimit: "5000.0000",
      });
      assert.deepEqual(dual.supplierProfile, {
        notes: "supplier profile on the same identity",
      });

      const persistedDual = await pool.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM counterparties WHERE id=$1) AS identities,
           (SELECT COUNT(*)::integer FROM counterparty_roles WHERE counterparty_id=$1) AS roles,
           (SELECT COUNT(*)::integer FROM customer_profiles WHERE counterparty_id=$1) AS customer_profiles,
           (SELECT COUNT(*)::integer FROM supplier_profiles WHERE counterparty_id=$1) AS supplier_profiles`,
        [dual.id],
      );
      assert.deepEqual(persistedDual.rows[0], {
        identities: 1,
        roles: 2,
        customer_profiles: 1,
        supplier_profiles: 1,
      });

      await assert.rejects(
        pool.query(
          `INSERT INTO counterparty_roles (counterparty_id,role)
           VALUES ($1,'CUSTOMER')`,
          [dual.id],
        ),
        /pk_counterparty_roles/,
      );

      const evolving = await counterparties.create({
        actorUserId: IDS.actor,
        name: "Role Evolution Account",
        roles: ["OTHER"],
      });
      assert.deepEqual(evolving.roles, ["OTHER"]);
      assert.equal(evolving.customerProfile, null);
      assert.equal(evolving.supplierProfile, null);

      await assert.rejects(
        () =>
          counterparties.upsertSupplierProfile({
            counterpartyId: evolving.id,
            actorUserId: IDS.actor,
            notes: "must fail until SUPPLIER role exists",
          }),
        (error) =>
          error instanceof CounterpartyError &&
          error.reason ===
            "SUPPLIER_PROFILE_REQUIRES_SUPPLIER_ROLE",
      );

      const concurrentCustomerAdds = await Promise.all(
        Array.from({ length: 8 }, () =>
          counterparties.addRole({
            counterpartyId: evolving.id,
            actorUserId: IDS.actor,
            role: "CUSTOMER",
          }),
        ),
      );
      for (const record of concurrentCustomerAdds) {
        assert.ok(record.roles.includes("CUSTOMER"));
      }

      const customerRoleCount = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM counterparty_roles
          WHERE counterparty_id=$1
            AND role='CUSTOMER'`,
        [evolving.id],
      );
      assert.equal(
        customerRoleCount.rows[0]?.count,
        1,
        "concurrent role additions must still produce one role pair",
      );

      await counterparties.addRole({
        counterpartyId: evolving.id,
        actorUserId: IDS.actor,
        role: "SUPPLIER",
      });

      const withCustomerProfile =
        await counterparties.upsertCustomerProfile({
          counterpartyId: evolving.id,
          actorUserId: IDS.actor,
          creditLimit: "1250.5000",
          defaultPriceListId: null,
        });
      assert.deepEqual(withCustomerProfile.customerProfile, {
        defaultPriceListId: null,
        creditLimit: "1250.5000",
      });

      const withBothProfiles =
        await counterparties.upsertSupplierProfile({
          counterpartyId: evolving.id,
          actorUserId: IDS.actor,
          notes: "supplier configuration",
        });
      assert.deepEqual(withBothProfiles.roles, [
        "CUSTOMER",
        "SUPPLIER",
        "OTHER",
      ]);
      assert.deepEqual(withBothProfiles.supplierProfile, {
        notes: "supplier configuration",
      });

      const updated = await counterparties.updateIdentity({
        counterpartyId: evolving.id,
        actorUserId: IDS.actor,
        name: "Role Evolution Account Updated",
        phone: "0111 222 3333",
        address: "Giza",
        notes: "identity updated without normalization",
      });
      assert.equal(updated.name, "Role Evolution Account Updated");
      assert.equal(updated.phone, "0111 222 3333");
      assert.equal(updated.normalizedPhone, null);
      assert.equal(updated.address, "Giza");

      const disabled = await counterparties.setActive({
        counterpartyId: evolving.id,
        actorUserId: IDS.actor,
        isActive: false,
      });
      assert.equal(disabled.isActive, false);
      assert.deepEqual(disabled.roles, [
        "CUSTOMER",
        "SUPPLIER",
        "OTHER",
      ]);

      const reenabled = await counterparties.setActive({
        counterpartyId: evolving.id,
        actorUserId: IDS.actor,
        isActive: true,
      });
      assert.equal(reenabled.isActive, true);

      const beforeInvalidActor = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM counterparties",
      );
      await assert.rejects(
        () =>
          counterparties.create({
            actorUserId: IDS.missingActor,
            name: "Must Roll Back",
            roles: ["CUSTOMER"],
          }),
        (error) =>
          error instanceof CounterpartyError &&
          error.reason === "ACTOR_NOT_FOUND_OR_INACTIVE",
      );
      const afterInvalidActor = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM counterparties",
      );
      assert.equal(
        afterInvalidActor.rows[0]?.count,
        beforeInvalidActor.rows[0]?.count,
      );

      const ledgerCounts = await pool.query(
        `SELECT
           (SELECT COUNT(*)::integer FROM customer_ledger_entries) AS customer_entries,
           (SELECT COUNT(*)::integer FROM supplier_ledger_entries) AS supplier_entries`,
      );
      assert.deepEqual(ledgerCounts.rows[0], {
        customer_entries: 0,
        supplier_entries: 0,
      });

      const audit = await pool.query(
        `SELECT action
           FROM audit_logs
          WHERE entity_type='COUNTERPARTY'
          ORDER BY created_at,id`,
      );
      const actions = audit.rows.map((row) => row.action);
      assert.ok(actions.includes("COUNTERPARTY_CREATED"));
      assert.ok(actions.includes("COUNTERPARTY_ROLE_ADDED"));
      assert.ok(
        actions.includes(
          "COUNTERPARTY_CUSTOMER_PROFILE_UPSERTED",
        ),
      );
      assert.ok(
        actions.includes(
          "COUNTERPARTY_SUPPLIER_PROFILE_UPSERTED",
        ),
      );
      assert.ok(actions.includes("COUNTERPARTY_IDENTITY_UPDATED"));
      assert.ok(actions.includes("COUNTERPARTY_DEACTIVATED"));
      assert.ok(actions.includes("COUNTERPARTY_ACTIVATED"));

      assert.deepEqual(await indexNames(pool, "counterparties"), [
        "gin_counterparties__name_trgm",
        "ix_counterparties__normalized_phone",
        "pk_counterparties",
      ]);
      assert.deepEqual(await indexNames(pool, "counterparty_roles"), [
        "ix_counterparty_roles__role_counterparty_id",
        "pk_counterparty_roles",
      ]);
      assert.deepEqual(await indexNames(pool, "customer_profiles"), [
        "pk_customer_profiles",
      ]);
      assert.deepEqual(await indexNames(pool, "supplier_profiles"), [
        "pk_supplier_profiles",
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
