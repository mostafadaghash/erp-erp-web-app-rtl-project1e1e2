#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const money = (value) => Math.round((Number(value) + Number.EPSILON) * 100) / 100;
const avg4 = (value) => Math.round((Number(value) + Number.EPSILON) * 10_000) / 10_000;
const sameMoney = (a, b) => money(a) === money(b);
const sameAvg = (a, b) => avg4(a) === avg4(b);

function addFailure(report, control, key, expected, actual, classification, records = []) {
  report.failures.push({ control, key, expected, actual, difference: money(Number(actual) - Number(expected)), classification, records });
}

function control(report, id, checked, failed) {
  report.controls.push({ id, checked, failed, passed: checked - failed });
}

function byKey(rows = []) {
  const map = new Map();
  for (const row of rows) {
    const key = String(row.key ?? "");
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

function reconcileGl(snapshot, report) {
  const entries = new Map((snapshot.gl?.journalEntries ?? []).map((entry) => [String(entry.id), entry]));
  const lines = snapshot.gl?.journalLines ?? [];
  const grouped = new Map();
  for (const line of lines) {
    const id = String(line.journalEntryId);
    if (!grouped.has(id)) grouped.set(id, []);
    grouped.get(id).push(line);
  }
  let checked = 0;
  let failed = 0;
  for (const [id, entry] of entries) {
    if (entry.status && entry.status !== "posted") continue;
    checked += 1;
    const entryLines = grouped.get(id) ?? [];
    const debit = money(entryLines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
    const credit = money(entryLines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
    if (!sameMoney(debit, credit)) {
      failed += 1;
      addFailure(report, "A-01", id, debit, credit, "UNEXPLAINED_DIFFERENCE", entryLines.map((line) => line.id).filter(Boolean));
    }
  }
  control(report, "A-01_GL_ENTRY_BALANCE", checked, failed);

  const postedIds = new Set([...entries].filter(([, entry]) => !entry.status || entry.status === "posted").map(([id]) => id));
  const postedLines = lines.filter((line) => postedIds.has(String(line.journalEntryId)));
  const debit = money(postedLines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0));
  const credit = money(postedLines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0));
  const trialFailed = sameMoney(debit, credit) ? 0 : 1;
  if (trialFailed) addFailure(report, "A-02", "trial-balance", debit, credit, "UNEXPLAINED_DIFFERENCE");
  control(report, "A-02_GL_TRIAL_BALANCE", 1, trialFailed);
}

function reconcileCustomer(snapshot, report) {
  const entries = byKey(snapshot.customer?.entries);
  const projections = snapshot.customer?.projections ?? [];
  let checked = 0;
  let failed = 0;
  for (const projection of projections) {
    const key = String(projection.key);
    const rows = entries.get(key) ?? [];
    const expected = {
      receivableBalance: money(rows.reduce((sum, row) => sum + Number(row.receivableDelta ?? 0), 0)),
      advanceBalance: money(rows.reduce((sum, row) => sum + Number(row.advanceDelta ?? 0), 0)),
      totalPurchases: money(rows.reduce((sum, row) => sum + Number(row.purchasesDelta ?? 0), 0)),
    };
    for (const field of Object.keys(expected)) {
      checked += 1;
      const actual = money(projection[field] ?? 0);
      if (!sameMoney(expected[field], actual)) {
        failed += 1;
        addFailure(report, "A-03", `${key}:${field}`, expected[field], actual, projection.legacyOpeningRequired ? "LEGACY_OPENING_REQUIRED" : "UNEXPLAINED_DIFFERENCE", rows.map((row) => row.id).filter(Boolean));
      }
    }
  }
  control(report, "A-03_CUSTOMER_LEDGER_REPLAY", checked, failed);
}

function reconcileSupplier(snapshot, report) {
  const entries = byKey(snapshot.supplier?.entries);
  const projections = snapshot.supplier?.projections ?? [];
  let checked = 0;
  let failed = 0;
  for (const projection of projections) {
    const key = String(projection.key);
    const rows = entries.get(key) ?? [];
    const expected = money(rows.reduce((sum, row) => sum + Number(row.amountDelta ?? 0), 0));
    const actual = money(projection.balance ?? 0);
    checked += 1;
    if (!sameMoney(expected, actual)) {
      failed += 1;
      addFailure(report, "A-04", key, expected, actual, projection.legacyOpeningRequired ? "LEGACY_OPENING_REQUIRED" : "UNEXPLAINED_DIFFERENCE", rows.map((row) => row.id).filter(Boolean));
    }
  }
  control(report, "A-04_SUPPLIER_LEDGER_REPLAY", checked, failed);
}

function reconcileFinance(snapshot, report) {
  const movements = byKey(snapshot.finance?.movements);
  const accounts = snapshot.finance?.accounts ?? [];
  let balanceChecked = 0;
  let balanceFailed = 0;
  let chainChecked = 0;
  let chainFailed = 0;
  for (const account of accounts) {
    const key = String(account.key);
    const rows = movements.get(key) ?? [];
    const expected = money(Number(account.openingBalance ?? 0) + rows.reduce((sum, row) => sum + Number(row.signedAmount ?? 0), 0));
    const actual = money(account.currentBalance ?? 0);
    balanceChecked += 1;
    if (!sameMoney(expected, actual)) {
      balanceFailed += 1;
      addFailure(report, "A-05", key, expected, actual, "UNEXPLAINED_DIFFERENCE", rows.map((row) => row.id).filter(Boolean));
    }
    let prior = money(account.openingBalance ?? 0);
    for (const row of rows) {
      if (row.balanceBefore === undefined || row.balanceAfter === undefined) continue;
      chainChecked += 1;
      const expectedAfter = money(prior + Number(row.signedAmount ?? 0));
      const beforeOk = sameMoney(row.balanceBefore, prior);
      const afterOk = sameMoney(row.balanceAfter, expectedAfter);
      if (!beforeOk || !afterOk) {
        chainFailed += 1;
        report.failures.push({
          control: "A-05-CHAIN",
          key,
          expected: { balanceBefore: prior, balanceAfter: expectedAfter },
          actual: { balanceBefore: money(row.balanceBefore), balanceAfter: money(row.balanceAfter) },
          difference: null,
          classification: "UNEXPLAINED_DIFFERENCE",
          records: row.id ? [row.id] : [],
        });
      }
      prior = money(row.balanceAfter);
    }
  }
  control(report, "A-05_FINANCIAL_ACCOUNT_REPLAY", balanceChecked, balanceFailed);
  control(report, "A-05_FINANCIAL_MOVEMENT_CHAIN", chainChecked, chainFailed);
}

function reconcileInventory(snapshot, report) {
  const movements = byKey(snapshot.inventory?.movements);
  const products = snapshot.inventory?.products ?? [];
  let endingChecked = 0;
  let endingFailed = 0;
  let chainChecked = 0;
  let chainFailed = 0;
  for (const product of products) {
    const key = String(product.key);
    const rows = movements.get(key) ?? [];
    if (product.openingStock === undefined || product.openingValue === undefined) {
      report.exceptions.push({ control: "I-OPENING", key, classification: "LEGACY_OPENING_REQUIRED", records: rows.map((row) => row.id).filter(Boolean) });
      continue;
    }
    let stock = Number(product.openingStock);
    let value = money(product.openingValue);
    let average = avg4(product.openingAverageCost ?? (stock === 0 ? 0 : value / stock));
    for (const row of rows) {
      chainChecked += 1;
      const beforeStockOk = row.stockBefore === undefined || Number(row.stockBefore) === stock;
      const beforeValueOk = row.inventoryValueBefore === undefined || sameMoney(row.inventoryValueBefore, value);
      const beforeAvgOk = row.averageCostBefore === undefined || sameAvg(row.averageCostBefore, average);
      const nextStock = stock + Number(row.quantityDelta ?? 0);
      const nextValue = nextStock === 0 ? 0 : money(value + Number(row.valueDelta ?? 0));
      const nextAverage = nextStock === 0 ? average : avg4(nextValue / nextStock);
      const afterStockOk = row.stockAfter === undefined || Number(row.stockAfter) === nextStock;
      const afterValueOk = row.inventoryValueAfter === undefined || sameMoney(row.inventoryValueAfter, nextValue);
      const afterAvgOk = row.averageCostAfter === undefined || sameAvg(row.averageCostAfter, nextAverage);
      if (nextStock < 0 || nextValue < 0 || !beforeStockOk || !beforeValueOk || !beforeAvgOk || !afterStockOk || !afterValueOk || !afterAvgOk) {
        chainFailed += 1;
        report.failures.push({
          control: "I-CHAIN",
          key,
          expected: { stockBefore: stock, valueBefore: value, averageBefore: average, stockAfter: nextStock, valueAfter: nextValue, averageAfter: nextAverage },
          actual: { stockBefore: row.stockBefore, valueBefore: row.inventoryValueBefore, averageBefore: row.averageCostBefore, stockAfter: row.stockAfter, valueAfter: row.inventoryValueAfter, averageAfter: row.averageCostAfter },
          difference: null,
          classification: nextStock < 0 ? "NEGATIVE_STOCK_REPLAY" : nextValue < 0 ? "NEGATIVE_VALUE_REPLAY" : "MOVEMENT_CHAIN_BREAK",
          records: row.id ? [row.id] : [],
        });
      }
      stock = nextStock;
      value = nextValue;
      average = nextAverage;
    }
    const checks = [
      ["stock", Number(product.stock), stock, "INVENTORY_QTY_DIFFERENCE", (a, b) => a === b],
      ["inventoryValue", money(product.inventoryValue ?? 0), value, "INVENTORY_VALUE_DIFFERENCE", sameMoney],
      ["costPrice", avg4(product.costPrice ?? 0), average, "INVENTORY_AVG_COST_DIFFERENCE", sameAvg],
    ];
    for (const [field, actual, expected, classification, comparator] of checks) {
      endingChecked += 1;
      if (!comparator(actual, expected)) {
        endingFailed += 1;
        addFailure(report, `I-END-${field}`, key, expected, actual, classification, rows.map((row) => row.id).filter(Boolean));
      }
    }
  }
  control(report, "I-01_TO_I-04_INVENTORY_ENDING_STATE", endingChecked, endingFailed);
  control(report, "I-04_INVENTORY_MOVEMENT_CHAIN", chainChecked, chainFailed);
}

export function reconcileSnapshot(snapshot) {
  const report = {
    formatVersion: 1,
    repositorySha: snapshot.metadata?.repositorySha ?? null,
    datasetId: snapshot.metadata?.datasetId ?? null,
    controls: [],
    failures: [],
    exceptions: [...(snapshot.exceptions ?? [])],
  };
  reconcileGl(snapshot, report);
  reconcileCustomer(snapshot, report);
  reconcileSupplier(snapshot, report);
  reconcileFinance(snapshot, report);
  reconcileInventory(snapshot, report);
  report.summary = {
    controls: report.controls.length,
    checks: report.controls.reduce((sum, item) => sum + item.checked, 0),
    failedChecks: report.controls.reduce((sum, item) => sum + item.failed, 0),
    failures: report.failures.length,
    exceptions: report.exceptions.length,
    status: report.failures.length === 0 ? "PASS" : "FAIL",
  };
  return report;
}

async function main() {
  const index = process.argv.indexOf("--input");
  if (index === -1 || !process.argv[index + 1]) {
    console.error("Usage: node scripts/wave0/reconcile-snapshot.mjs --input <snapshot.json>");
    process.exitCode = 64;
    return;
  }
  const path = process.argv[index + 1];
  const raw = await readFile(path, "utf8");
  const snapshot = JSON.parse(raw);
  const report = reconcileSnapshot(snapshot);
  report.inputSha256 = createHash("sha256").update(raw).digest("hex");
  console.log(JSON.stringify(report, null, 2));
  if (report.failures.length > 0) process.exitCode = 2;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exitCode = 1;
  });
}
