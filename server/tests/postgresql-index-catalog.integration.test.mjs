import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import pg from "pg";

import { runMigrations } from "../../scripts/database/migrations.mjs";
import { cleanupDatabase, withClient } from "./postgresql-schema-test-support.mjs";

const { Client } = pg;
const databaseUrl = process.env.ERP_TEST_DATABASE_URL;
const manifestUrl = new URL("../../database/index-catalog/phase-03-07-indexes.json", import.meta.url);
const integrityIndexNames = new Set([
  "uq_repair_assignments__active",
  "uq_customer_followups__source_event",
  "uq_notifications__outbox_event_type",
]);

function splitKeys(columns) {
  const inner = columns.trim().slice(1, -1);
  const keys = [];
  let start = 0;
  let depth = 0;
  let quote = null;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote && inner[i - 1] !== "\\") quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if (ch === "," && depth === 0) {
      keys.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  keys.push(inner.slice(start).trim());
  return keys;
}

function stripOuterParens(value) {
  let s = value.trim();
  while (s.startsWith("(") && s.endsWith(")")) {
    let depth = 0;
    let balanced = true;
    for (let i = 0; i < s.length; i += 1) {
      if (s[i] === "(") depth += 1;
      else if (s[i] === ")") depth -= 1;
      if (depth === 0 && i < s.length - 1) {
        balanced = false;
        break;
      }
    }
    if (!balanced) break;
    s = s.slice(1, -1).trim();
  }
  return s;
}

function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/::[a-z_ ]+(?:\[\])?/g, "")
    .replace(/\s+/g, " ")
    .replace(/\s+desc$/g, " desc")
    .replace(/\s+asc$/g, " asc");
}

function normalizePredicate(value) {
  if (value == null) return null;
  let s = value
    .trim()
    .toLowerCase()
    .replace(/::[a-z_ ]+(?:\[\])?/g, "")
    .replace(/\s+/g, " ");
  s = stripOuterParens(s);
  s = s.replace(
    /([a-z0-9_]+)\s*=\s*any\s*\(\s*array\[(.*?)\]\s*\)/g,
    (_, column, list) => `${column} in (${list})`,
  );
  s = s
    .replace(/\(\s*(-?\d+(?:\.\d+)?)\s*\)/g, "$1")
    .replace(/\s*,\s*/g, ",")
    .replace(/\s*=\s*/g, "=")
    .replace(/\s*>\s*/g, ">")
    .replace(/\s+is\s+not\s+null/g, " is not null")
    .replace(/\s+is\s+null/g, " is null")
    .replace(/\s+in\s+\(/g, " in (")
    .replace(/\)\s*$/g, ")");
  return stripOuterParens(s);
}

async function loadManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

async function queryIndexes(client) {
  const result = await client.query(`
    SELECT
      idx.relname AS index_name,
      tbl.relname AS table_name,
      am.amname AS method,
      i.indisunique AS is_unique,
      pg_get_expr(i.indpred, i.indrelid, true) AS predicate,
      ARRAY(
        SELECT pg_get_indexdef(i.indexrelid, k, true) ||
          CASE WHEN NOT opc.opcdefault THEN ' ' || opc.opcname ELSE '' END ||
          CASE WHEN (i.indoption[k - 1] & 1) = 1 THEN ' DESC' ELSE '' END
        FROM generate_series(1, i.indnkeyatts) AS k
        JOIN pg_catalog.pg_opclass opc ON opc.oid = i.indclass[k - 1]
        ORDER BY k
      ) AS keys,
      con.oid IS NOT NULL AS constraint_backing
    FROM pg_catalog.pg_index i
    JOIN pg_catalog.pg_class idx ON idx.oid = i.indexrelid
    JOIN pg_catalog.pg_class tbl ON tbl.oid = i.indrelid
    JOIN pg_catalog.pg_namespace n ON n.oid = tbl.relnamespace
    JOIN pg_catalog.pg_am am ON am.oid = idx.relam
    LEFT JOIN pg_catalog.pg_constraint con ON con.conindid = i.indexrelid
    WHERE n.nspname = 'public'
    ORDER BY tbl.relname, idx.relname
  `);
  return result.rows;
}

test("03.07 frozen Index Catalog is exact on PostgreSQL 17", async (t) => {
  if (!databaseUrl) return t.skip("ERP_TEST_DATABASE_URL is not configured");
  const manifest = await loadManifest();
  assert.equal(manifest.version, "0022");
  assert.equal(manifest.name, "index_catalog");
  assert.equal(manifest.expected_new_index_count, 155);
  assert.equal(manifest.entries.length, 155);
  assert.equal(new Set(manifest.entries.map((entry) => entry.name)).size, 155);

  await cleanupDatabase(databaseUrl);
  try {
    const first = await runMigrations({ databaseUrl });
    assert.equal(first.applied.at(-1), "0022");

    await withClient(databaseUrl, async (client) => {
      const indexes = await queryIndexes(client);
      const byName = new Map(indexes.map((row) => [row.index_name, row]));

      for (const expected of manifest.entries) {
        const actual = byName.get(expected.name);
        assert.ok(actual, `missing approved index ${expected.name}`);
        assert.equal(actual.table_name, expected.table, `${expected.name} table`);
        assert.equal(actual.method, expected.method, `${expected.name} access method`);
        assert.equal(actual.is_unique, expected.unique, `${expected.name} uniqueness`);
        assert.equal(actual.constraint_backing, false, `${expected.name} must be an independent catalog index`);

        const expectedKeys = splitKeys(expected.columns).map(normalizeKey);
        const actualKeys = actual.keys.map(normalizeKey);
        assert.deepEqual(actualKeys, expectedKeys, `${expected.name} key order/expression`);

        assert.equal(
          normalizePredicate(actual.predicate),
          normalizePredicate(expected.predicate),
          `${expected.name} predicate`,
        );
      }

      const approvedIndependent = new Set([
        ...manifest.entries.map((entry) => entry.name),
        ...integrityIndexNames,
      ]);
      const actualIndependent = indexes
        .filter((row) => !row.constraint_backing)
        .map((row) => row.index_name)
        .sort();
      assert.deepEqual(
        actualIndependent,
        [...approvedIndependent].sort(),
        "no unapproved independent index may exist",
      );

      const receiptIndexes = indexes.filter((row) => row.table_name === "receipts");
      assert.equal(
        receiptIndexes.some((row) => row.keys.some((key) => /sales_order_id/i.test(key))),
        false,
        "ADR-0024 forbids receipts.sales_order_id index",
      );
      const advanceIndexes = indexes.filter((row) => row.table_name === "advance_applications");
      assert.equal(
        advanceIndexes.some((row) => row.keys.some((key) => /posting_batch_id/i.test(key))),
        false,
        "ADR-0024 forbids advance_applications.posting_batch_id index",
      );

      const installment = indexes.find(
        (row) => row.table_name === "installments" && row.predicate != null,
      );
      assert.ok(installment, "open-installment partial index must exist");
      const installmentPredicate = normalizePredicate(installment.predicate);
      for (const value of ["upcoming", "due", "partial", "overdue"]) {
        assert.match(installmentPredicate, new RegExp(`'${value}'`));
      }
      assert.doesNotMatch(installmentPredicate, /'pending'|'partially_paid'/);

      // No general B-tree index created by 03.07 may be a strict key prefix of
      // another general B-tree index on the same table. Partial indexes are
      // intentionally excluded because their hot-row predicate is part of the design.
      const generalBtree = indexes.filter(
        (row) => row.method === "btree" && row.predicate == null,
      );
      for (const expected of manifest.entries.filter(
        (entry) => entry.method === "btree" && entry.predicate == null,
      )) {
        const current = byName.get(expected.name);
        const currentKeys = current.keys.map(normalizeKey);
        for (const other of generalBtree) {
          if (other.index_name === current.index_name || other.table_name !== current.table_name) continue;
          const otherKeys = other.keys.map(normalizeKey);
          if (otherKeys.length <= currentKeys.length) continue;
          const isStrictPrefix = currentKeys.every((key, index) => key === otherKeys[index]);
          assert.equal(
            isStrictPrefix,
            false,
            `${current.index_name} must not be a redundant prefix of ${other.index_name}`,
          );
        }
      }

      const history = await client.query(
        "SELECT version,name,checksum FROM schema_migrations ORDER BY version",
      );
      const latest = history.rows.at(-1);
      assert.equal(latest?.version, "0022");
      assert.equal(latest?.name, "index_catalog");
      assert.match(latest?.checksum ?? "", /^[0-9a-f]{64}$/);
    });

    const second = await runMigrations({ databaseUrl });
    assert.equal(second.applied.length, 0);
    assert.equal(second.skipped.at(-1), "0022");

    const verification = await runMigrations({ databaseUrl, verifyOnly: true });
    assert.equal(verification.applied.length, 0);
    assert.equal(verification.skipped.at(-1), "0022");
  } finally {
    await cleanupDatabase(databaseUrl);
  }
});
