import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { reconcileSnapshot } from "../scripts/wave0/reconcile-snapshot.mjs";

const root = process.cwd();

async function readJson(relativePath: string) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

describe("Wave 0 golden reconciliation", () => {
  it("passes the deterministic accounting and inventory golden dataset", async () => {
    const snapshot = await readJson("tests/fixtures/wave0-golden-snapshot.json");
    const report = reconcileSnapshot(snapshot);

    expect(report.summary.status).toBe("PASS");
    expect(report.summary.failedChecks).toBe(0);
    expect(report.failures).toEqual([]);
    expect(report.exceptions).toEqual([]);

    const controls = new Map(report.controls.map((item: { id: string; failed: number }) => [item.id, item]));
    expect(controls.get("A-01_GL_ENTRY_BALANCE")?.failed).toBe(0);
    expect(controls.get("A-03_CUSTOMER_LEDGER_REPLAY")?.failed).toBe(0);
    expect(controls.get("A-04_SUPPLIER_LEDGER_REPLAY")?.failed).toBe(0);
    expect(controls.get("A-05_FINANCIAL_ACCOUNT_REPLAY")?.failed).toBe(0);
    expect(controls.get("I-01_TO_I-04_INVENTORY_ENDING_STATE")?.failed).toBe(0);
    expect(controls.get("I-04_INVENTORY_MOVEMENT_CHAIN")?.failed).toBe(0);
  });

  it("fails closed when an inventory projection is tampered with", async () => {
    const snapshot = await readJson("tests/fixtures/wave0-golden-snapshot.json");
    snapshot.inventory.products[0].inventoryValue += 1;

    const report = reconcileSnapshot(snapshot);

    expect(report.summary.status).toBe("FAIL");
    expect(report.failures.some((failure: { classification: string }) => failure.classification === "INVENTORY_VALUE_DIFFERENCE")).toBe(true);
  });

  it("locks historical sale and return costing even after current average cost changes", async () => {
    const snapshot = await readJson("tests/fixtures/wave0-golden-snapshot.json");
    const facts = snapshot.businessFacts;

    expect(facts.sale.historicalCogs).toBe(facts.sale.qty * facts.sale.frozenUnitCost);
    expect(facts.costChangeAfterSale.averageCostBeforeReturn).toBe(113);
    expect(facts.salesReturn.currentAverageBeforeReturn).toBe(113);
    expect(facts.salesReturn.historicalUnitCost).toBe(facts.sale.frozenUnitCost);
    expect(facts.salesReturn.returnedCost).toBe(facts.salesReturn.qty * facts.sale.frozenUnitCost);
    expect(facts.salesReturn.historicalUnitCost).not.toBe(facts.salesReturn.currentAverageBeforeReturn);
  });

  it("keeps every executable business vector wired to repository tests that exist", async () => {
    const manifest = await readJson("tests/fixtures/wave0-golden-business-journeys.json");

    expect(manifest.vectors.length).toBeGreaterThan(0);
    for (const vector of manifest.vectors) {
      expect(vector.wave0Evidence).toBe("EXECUTABLE");
      expect(vector.adapterTests.length).toBeGreaterThan(0);
      for (const relativePath of vector.adapterTests) {
        const info = await stat(path.join(root, relativePath));
        expect(info.isFile(), `${vector.id} -> ${relativePath}`).toBe(true);
      }
    }
  });

  it("does not claim later-wave Company, ETA or Local Server journeys as Wave 0 implementation", async () => {
    const manifest = await readJson("tests/fixtures/wave0-golden-business-journeys.json");
    const deferred = new Set(manifest.deferredReferenceJourneys.flatMap((item: { ids: string[] }) => item.ids));

    expect(deferred.has("J-01")).toBe(true);
    expect(deferred.has("J-27")).toBe(true);
    expect(deferred.has("J-28")).toBe(true);
    expect(deferred.has("J-29")).toBe(true);
    expect(deferred.has("J-30")).toBe(true);
  });
});
