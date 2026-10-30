import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Client } = pg;

const THIS_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_MIGRATIONS_DIR = resolve(THIS_DIR, "../../database/migrations");
const MIGRATION_LOCK_KEY = "81717040304";
const FILE_PATTERN = /^([0-9]{4})_([a-z0-9]+(?:_[a-z0-9]+)*)\.meta\.json$/;
const ALLOWED_META_KEYS = new Set([
  "version",
  "name",
  "transactional",
  "preconditionSql",
  "verificationSql",
  "recovery",
]);

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function assertMetadata(meta, expectedVersion, expectedName, fileName) {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    throw new Error(`Migration metadata must be an object: ${fileName}`);
  }

  const keys = Object.keys(meta);
  const unknown = keys.filter((key) => !ALLOWED_META_KEYS.has(key));
  const missing = [...ALLOWED_META_KEYS].filter((key) => !(key in meta));
  if (unknown.length || missing.length) {
    throw new Error(
      `Migration metadata keys are invalid for ${fileName}; missing=[${missing.join(",")}], unknown=[${unknown.join(",")}]`,
    );
  }

  if (meta.version !== expectedVersion || !/^[0-9]{4}$/.test(meta.version) || Number(meta.version) <= 0) {
    throw new Error(`Migration version does not match filename or is invalid: ${fileName}`);
  }
  if (meta.name !== expectedName || !/^[a-z0-9]+(?:_[a-z0-9]+)*$/.test(meta.name)) {
    throw new Error(`Migration name does not match filename or is invalid: ${fileName}`);
  }
  if (typeof meta.transactional !== "boolean") {
    throw new Error(`Migration transactional must be boolean: ${fileName}`);
  }
  for (const field of ["preconditionSql", "verificationSql", "recovery"]) {
    if (typeof meta[field] !== "string" || !meta[field].trim()) {
      throw new Error(`Migration ${field} must be a non-empty string: ${fileName}`);
    }
  }
}

export async function loadMigrationDefinitions(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
  const metaFiles = files.filter((name) => name.endsWith(".meta.json"));
  const sqlFiles = files.filter((name) => name.endsWith(".sql"));

  const orphanSql = sqlFiles.filter(
    (name) => !files.includes(name.replace(/\.sql$/, ".meta.json")),
  );
  const orphanMeta = metaFiles.filter(
    (name) => !files.includes(name.replace(/\.meta\.json$/, ".sql")),
  );

  if (orphanSql.length || orphanMeta.length) {
    throw new Error(
      `Migration file pairs are incomplete; orphanSql=[${orphanSql.join(",")}], orphanMeta=[${orphanMeta.join(",")}]`,
    );
  }

  const definitions = [];
  const versions = new Set();
  const names = new Set();

  for (const metaFile of metaFiles) {
    const match = FILE_PATTERN.exec(metaFile);
    if (!match) throw new Error(`Invalid migration metadata filename: ${metaFile}`);

    const [, version, name] = match;
    if (versions.has(version)) throw new Error(`Duplicate migration version: ${version}`);
    if (names.has(name)) throw new Error(`Duplicate migration name: ${name}`);
    versions.add(version);
    names.add(name);

    const sqlFile = metaFile.replace(/\.meta\.json$/, ".sql");
    const metaRaw = await readFile(join(migrationsDir, metaFile), "utf8");
    const sql = await readFile(join(migrationsDir, sqlFile), "utf8");

    let meta;
    try {
      meta = JSON.parse(metaRaw);
    } catch (error) {
      throw new Error(`Invalid JSON in migration metadata ${metaFile}: ${error.message}`);
    }

    assertMetadata(meta, version, name, metaFile);
    if (!sql.trim()) throw new Error(`Migration SQL must not be empty: ${sqlFile}`);

    const checksum = sha256(`${canonicalJson(meta)}\n---SQL---\n${sql}`);
    definitions.push({
      ...meta,
      sql,
      checksum,
      metaFile,
      sqlFile,
    });
  }

  definitions.sort((a, b) => a.version.localeCompare(b.version));
  return definitions;
}

async function acquireMigrationLock(client) {
  await client.query("SELECT pg_advisory_lock($1::bigint)", [MIGRATION_LOCK_KEY]);
}

async function releaseMigrationLock(client) {
  await client.query("SELECT pg_advisory_unlock($1::bigint)", [MIGRATION_LOCK_KEY]);
}

async function bootstrapMigrationMetadata(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version text NOT NULL,
      name text NOT NULL,
      checksum text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT pk_schema_migrations PRIMARY KEY (version),
      CONSTRAINT ck_schema_migrations_version_format CHECK (version ~ '^[0-9]{4}$'),
      CONSTRAINT ck_schema_migrations_checksum_format CHECK (checksum ~ '^[0-9a-f]{64}$')
    )
  `);
  await validateMigrationMetadataShape(client);
}

async function validateMigrationMetadataShape(client) {
  const columns = await client.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'schema_migrations'
    ORDER BY ordinal_position
  `);
  const actual = columns.rows.map((row) => [row.column_name, row.data_type, row.is_nullable]);
  const expected = [
    ["version", "text", "NO"],
    ["name", "text", "NO"],
    ["checksum", "text", "NO"],
    ["applied_at", "timestamp with time zone", "NO"],
  ];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`schema_migrations metadata table has an unexpected shape: ${JSON.stringify(actual)}`);
  }

  const pk = await client.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.schema_migrations'::regclass AND contype = 'p'
  `);
  if (pk.rowCount !== 1 || pk.rows[0].conname !== "pk_schema_migrations") {
    throw new Error("schema_migrations primary key contract is invalid");
  }
}

async function requireExistingMigrationMetadata(client) {
  const exists = await client.query(
    "SELECT to_regclass('public.schema_migrations') IS NOT NULL AS ok",
  );
  if (exists.rows[0]?.ok !== true) {
    throw new Error("schema_migrations does not exist; apply migrations before verification");
  }
  await validateMigrationMetadataShape(client);
}

async function requireBooleanTrue(client, sql, label) {
  const result = await client.query(sql);
  if (result.rowCount !== 1 || result.fields.length < 1) {
    throw new Error(`${label} must return exactly one row with a boolean first column`);
  }
  const value = result.rows[0][result.fields[0].name];
  if (value !== true) {
    throw new Error(`${label} failed; expected boolean true`);
  }
}

async function readAppliedMigrations(client) {
  const result = await client.query(`
    SELECT version, name, checksum, applied_at
    FROM schema_migrations
    ORDER BY version
  `);
  return result.rows;
}

function validateAppliedHistory(definitions, appliedRows) {
  const byVersion = new Map(definitions.map((definition) => [definition.version, definition]));

  for (const row of appliedRows) {
    const definition = byVersion.get(row.version);
    if (!definition) {
      throw new Error(`Applied migration ${row.version} is missing from the repository`);
    }
    if (definition.name !== row.name) {
      throw new Error(`Applied migration ${row.version} name drift detected`);
    }
    if (definition.checksum !== row.checksum) {
      throw new Error(`Applied migration ${row.version} checksum drift detected`);
    }
  }
}

async function applyOneMigration(client, migration) {
  const label = `${migration.version}_${migration.name}`;
  let transactionOpen = false;

  try {
    if (migration.transactional) {
      await client.query("BEGIN");
      transactionOpen = true;
    }

    await requireBooleanTrue(client, migration.preconditionSql, `${label} precondition`);
    await client.query(migration.sql);
    await requireBooleanTrue(client, migration.verificationSql, `${label} verification`);
    await client.query(
      "INSERT INTO schema_migrations (version, name, checksum) VALUES ($1, $2, $3)",
      [migration.version, migration.name, migration.checksum],
    );

    if (transactionOpen) {
      await client.query("COMMIT");
      transactionOpen = false;
    }
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query("ROLLBACK");
        transactionOpen = false;
      } catch (rollbackError) {
        throw new Error(
          `${label} failed and rollback also failed; original=${error.message}; rollback=${rollbackError.message}; recovery=${migration.recovery}`,
        );
      }
    }

    if (!migration.transactional) {
      throw new Error(
        `${label} non-transactional migration failed; recovery=${migration.recovery}; cause=${error.message}`,
      );
    }
    throw error;
  }
}

export async function runMigrations({
  databaseUrl = process.env.ERP_DATABASE_URL,
  migrationsDir = DEFAULT_MIGRATIONS_DIR,
  verifyOnly = false,
} = {}) {
  if (!databaseUrl || typeof databaseUrl !== "string") {
    throw new Error("ERP_DATABASE_URL is required");
  }

  const definitions = await loadMigrationDefinitions(migrationsDir);
  const client = new Client({
    connectionString: databaseUrl,
    application_name: "business-tech-erp-migrations",
  });
  await client.connect();

  let lockHeld = false;
  try {
    await acquireMigrationLock(client);
    lockHeld = true;

    if (verifyOnly) await requireExistingMigrationMetadata(client);
    else await bootstrapMigrationMetadata(client);

    let appliedRows = await readAppliedMigrations(client);
    validateAppliedHistory(definitions, appliedRows);

    const appliedVersions = new Set(appliedRows.map((row) => row.version));
    const highestAppliedVersion = appliedRows.at(-1)?.version ?? null;
    if (
      highestAppliedVersion &&
      definitions.some(
        (definition) =>
          !appliedVersions.has(definition.version) &&
          definition.version.localeCompare(highestAppliedVersion) < 0,
      )
    ) {
      throw new Error(
        `Out-of-order pending migration exists below applied version ${highestAppliedVersion}`,
      );
    }

    const applied = [];
    const skipped = [];

    for (const migration of definitions) {
      if (appliedVersions.has(migration.version)) {
        await requireBooleanTrue(
          client,
          migration.verificationSql,
          `${migration.version}_${migration.name} verification`,
        );
        skipped.push(migration.version);
        continue;
      }

      if (verifyOnly) {
        throw new Error(
          `Pending migration ${migration.version}_${migration.name} found during verify-only mode`,
        );
      }

      await applyOneMigration(client, migration);
      applied.push(migration.version);
      appliedVersions.add(migration.version);
    }

    appliedRows = await readAppliedMigrations(client);
    validateAppliedHistory(definitions, appliedRows);

    return {
      applied,
      skipped,
      total: definitions.length,
    };
  } finally {
    if (lockHeld) {
      try {
        await releaseMigrationLock(client);
      } catch {
        // The connection is about to be closed; never hide the original migration result.
      }
    }
    await client.end().catch(() => {});
  }
}

async function main() {
  const mode = process.argv[2] ?? "apply";
  if (!["apply", "verify"].includes(mode)) {
    throw new Error("Usage: node scripts/database/migrations.mjs [apply|verify]");
  }

  const result = await runMigrations({ verifyOnly: mode === "verify" });
  process.stdout.write(
    `${JSON.stringify({
      mode,
      applied: result.applied,
      skipped: result.skipped,
      total: result.total,
    })}\n`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`Database migration failure: ${error.message}\n`);
    process.exitCode = 1;
  });
}
