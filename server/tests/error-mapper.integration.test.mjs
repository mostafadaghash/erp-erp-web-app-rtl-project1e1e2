import assert from "node:assert/strict";
import test from "node:test";
import { Pool } from "pg";

import {
  ERROR_CODES,
  toErrorContract,
} from "../infrastructure/errors/error-mapper.ts";
import { runMigrations } from "../../scripts/database/migrations.mjs";
import {
  cleanupDatabase,
  MIGRATIONS,
} from "./postgresql-schema-test-support.mjs";

const databaseUrl = process.env.ERP_TEST_DATABASE_URL;

async function captureFailure(work) {
  try {
    await work();
  } catch (error) {
    return error;
  }
  assert.fail("Expected PostgreSQL operation to fail");
}

function assertSafeContract(contract) {
  const publicJson = JSON.stringify(contract);
  assert.doesNotMatch(
    publicJson,
    /INSERT|SELECT|phase04_error|constraint|password|postgresql|detail|stack/i,
  );
  assert.deepEqual(Object.keys(contract).sort(), ["errorCode", "params"]);
}

test(
  "04.06 Error Mapping converts real PostgreSQL 17 failures into stable safe contracts",
  { skip: databaseUrl === undefined },
  async () => {
    assert.ok(databaseUrl);

    await cleanupDatabase(databaseUrl);
    const pool = new Pool({
      connectionString: databaseUrl,
      max: 4,
      application_name: "business-tech-erp-error-mapping-test",
    });

    try {
      const applied = await runMigrations({ databaseUrl });
      assert.deepEqual(applied.applied, MIGRATIONS);
      assert.deepEqual(applied.skipped, []);

      const version = await pool.query("SHOW server_version_num");
      const versionNumber = Number(version.rows[0]?.server_version_num);
      assert.ok(
        versionNumber >= 170000 && versionNumber < 180000,
        `04.06 requires PostgreSQL 17; received server_version_num=${version.rows[0]?.server_version_num}`,
      );

      await pool.query(
        `CREATE TABLE phase04_error_parent (
           id integer PRIMARY KEY
         )`,
      );
      await pool.query(
        `CREATE TABLE phase04_error_probe (
           id uuid PRIMARY KEY,
           required_value text NOT NULL,
           unique_value text NOT NULL,
           positive_value integer NOT NULL
             CONSTRAINT ck_phase04_error_probe_positive CHECK (positive_value > 0),
           parent_id integer
             CONSTRAINT fk_phase04_error_probe_parent
             REFERENCES phase04_error_parent(id),
           CONSTRAINT uq_phase04_error_probe_unique UNIQUE (unique_value)
         )`,
      );
      await pool.query("INSERT INTO phase04_error_parent(id) VALUES (1)");
      await pool.query(
        `INSERT INTO phase04_error_probe
          (id,required_value,unique_value,positive_value,parent_id)
         VALUES
          ('9a000000-0000-4000-8000-000000000001','ok','duplicate',1,1)`,
      );

      const cases = [
        {
          expected: ERROR_CODES.DB_UNIQUE_CONFLICT,
          run: () => pool.query(
            `INSERT INTO phase04_error_probe
              (id,required_value,unique_value,positive_value,parent_id)
             VALUES
              ('9a000000-0000-4000-8000-000000000002','ok','duplicate',1,1)`,
          ),
        },
        {
          expected: ERROR_CODES.DB_REFERENCE_CONFLICT,
          run: () => pool.query(
            `INSERT INTO phase04_error_probe
              (id,required_value,unique_value,positive_value,parent_id)
             VALUES
              ('9a000000-0000-4000-8000-000000000003','ok','reference',1,999)`,
          ),
        },
        {
          expected: ERROR_CODES.DB_CHECK_VIOLATION,
          run: () => pool.query(
            `INSERT INTO phase04_error_probe
              (id,required_value,unique_value,positive_value,parent_id)
             VALUES
              ('9a000000-0000-4000-8000-000000000004','ok','check',0,1)`,
          ),
        },
        {
          expected: ERROR_CODES.DB_REQUIRED_VALUE_MISSING,
          run: () => pool.query(
            `INSERT INTO phase04_error_probe
              (id,required_value,unique_value,positive_value,parent_id)
             VALUES
              ('9a000000-0000-4000-8000-000000000005',NULL,'required',1,1)`,
          ),
        },
        {
          expected: ERROR_CODES.DB_INVALID_INPUT,
          run: () => pool.query(
            `SELECT id
               FROM phase04_error_probe
              WHERE id = $1::uuid`,
            ["not-a-uuid"],
          ),
        },
      ];

      for (const entry of cases) {
        const error = await captureFailure(entry.run);
        const contract = toErrorContract(error);
        assert.deepEqual(contract, {
          errorCode: entry.expected,
          params: {},
        });
        assertSafeContract(contract);
      }

      const verification = await runMigrations({
        databaseUrl,
        verifyOnly: true,
      });
      assert.deepEqual(verification.applied, []);
      assert.deepEqual(verification.skipped, MIGRATIONS);
    } finally {
      await pool.query("DROP TABLE IF EXISTS phase04_error_probe").catch(() => {});
      await pool.query("DROP TABLE IF EXISTS phase04_error_parent").catch(() => {});
      await pool.end();
      await cleanupDatabase(databaseUrl);
    }
  },
);
