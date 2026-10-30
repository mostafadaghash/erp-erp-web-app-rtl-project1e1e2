import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
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
  company: "a4000000-0000-4000-8000-000000000001",
  branch: "a4000000-0000-4000-8000-000000000002",
  actor: "a4000000-0000-4000-8000-000000000003",
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
  "06.02 Phone Normalization preserves display values, stores canonical values, and searches by normalized_phone on PostgreSQL 17",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 8,
      application_name: "business-tech-erp-phone-normalization-0602-test",
    });

    const database = {
      transaction(work, options) {
        return withTransaction(pool, work, options);
      },
    };

    const roles = new RoleCatalogService(database);
    const counterparties = new CounterpartyService(database);

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `06.02 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      const roleCatalog = await roles.ensureDefaultRoles();
      const systemAdmin = roleCatalog.find(
        (role) => role.roleKey === "SYSTEM_ADMIN",
      );
      assert.ok(systemAdmin);

      await pool.query(
        `INSERT INTO companies
          (id,name,base_currency_code,default_language,timezone,is_active,created_at,updated_at)
         VALUES ($1,'Phase 06 Phone Co','EGP','ar-EG','Africa/Cairo',true,now(),now())`,
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
          ($1,'Phone Admin','phase06-phone-admin','phase06-phone-admin@example.test',
           'test-only-hash',$2,$3,'ALL','ar-EG',true,NULL,now(),now())`,
        [IDS.actor, systemAdmin.id, IDS.branch],
      );

      const localArabic = await counterparties.create({
        actorUserId: IDS.actor,
        name: "Local Arabic Digits",
        phone: "  ٠١٠٠ ١٢٣ ٤٥٦٧  ",
        roles: ["CUSTOMER"],
      });
      assert.equal(localArabic.phone, "٠١٠٠ ١٢٣ ٤٥٦٧");
      assert.equal(localArabic.normalizedPhone, "01001234567");

      const internationalPlus = await counterparties.create({
        actorUserId: IDS.actor,
        name: "International Plus",
        phone: "+20 (100) 123-4567",
        roles: ["CUSTOMER"],
      });
      assert.equal(
        internationalPlus.normalizedPhone,
        "201001234567",
      );

      const internationalDoubleZero = await counterparties.create({
        actorUserId: IDS.actor,
        name: "International Double Zero",
        phone: "0020-100-123-4567",
        roles: ["SUPPLIER"],
      });
      assert.equal(
        internationalDoubleZero.normalizedPhone,
        "201001234567",
      );

      const sameInternationalMatches =
        await counterparties.searchByPhone(
          "+20 100 123 4567",
        );
      assert.deepEqual(
        sameInternationalMatches.map((record) => record.id).sort(),
        [internationalPlus.id, internationalDoubleZero.id].sort(),
      );

      const sameViaDoubleZero =
        await counterparties.searchByPhone(
          "0020 100 123 4567",
        );
      assert.deepEqual(
        sameViaDoubleZero.map((record) => record.id).sort(),
        [internationalPlus.id, internationalDoubleZero.id].sort(),
      );

      const localArabicSearch =
        await counterparties.searchByPhone(
          "٠١٠٠-١٢٣-٤٥٦٧",
        );
      assert.deepEqual(
        localArabicSearch.map((record) => record.id),
        [localArabic.id],
      );

      const localLatinSearch =
        await counterparties.searchByPhone(
          "0100 123 4567",
        );
      assert.deepEqual(
        localLatinSearch.map((record) => record.id),
        [localArabic.id],
      );

      assert.deepEqual(
        await counterparties.searchByPhone(
          "+20 111 000 0000",
        ),
        [],
      );

      const updated = await counterparties.updateIdentity({
        counterpartyId: localArabic.id,
        actorUserId: IDS.actor,
        name: localArabic.name,
        phone: "+20 111 222 3333",
        address: localArabic.address,
        notes: localArabic.notes,
      });
      assert.equal(updated.phone, "+20 111 222 3333");
      assert.equal(updated.normalizedPhone, "201112223333");

      assert.deepEqual(
        await counterparties.searchByPhone("0100 123 4567"),
        [],
        "old canonical value must stop matching after phone update",
      );
      assert.deepEqual(
        (
          await counterparties.searchByPhone(
            "0020 111 222 3333",
          )
        ).map((record) => record.id),
        [localArabic.id],
      );

      const noPhone = await counterparties.create({
        actorUserId: IDS.actor,
        name: "No Phone",
        phone: "   ",
        roles: ["OTHER"],
      });
      assert.equal(noPhone.phone, null);
      assert.equal(noPhone.normalizedPhone, null);

      const duplicateCanonicalCount = await pool.query(
        `SELECT COUNT(*)::integer AS count
           FROM counterparties
          WHERE normalized_phone='201001234567'`,
      );
      assert.equal(
        duplicateCanonicalCount.rows[0]?.count,
        2,
        "normalized_phone is intentionally searchable but not unique",
      );

      const persisted = await pool.query(
        `SELECT phone,normalized_phone
           FROM counterparties
          WHERE id=$1`,
        [internationalPlus.id],
      );
      assert.deepEqual(persisted.rows[0], {
        phone: "+20 (100) 123-4567",
        normalized_phone: "201001234567",
      });

      const beforeInvalid = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM counterparties",
      );
      await assert.rejects(
        () =>
          counterparties.create({
            actorUserId: IDS.actor,
            name: "Invalid Phone",
            phone: "0100 ext 5",
            roles: ["CUSTOMER"],
          }),
        /unsupported characters/,
      );
      const afterInvalid = await pool.query(
        "SELECT COUNT(*)::integer AS count FROM counterparties",
      );
      assert.equal(
        afterInvalid.rows[0]?.count,
        beforeInvalid.rows[0]?.count,
      );

      assert.deepEqual(await indexNames(pool, "counterparties"), [
        "gin_counterparties__name_trgm",
        "ix_counterparties__normalized_phone",
        "pk_counterparties",
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
