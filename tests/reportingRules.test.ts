import test from "node:test";
import assert from "node:assert/strict";
import {
  dateInRange,
  monthKey,
  monthKeysInRange,
  percentage,
  reversibleActivity,
  validateReportingRange,
} from "../shared/reportingRules.ts";

test("reporting range accepts real inclusive ISO dates", () => {
  assert.deepEqual(validateReportingRange("2026-01-01", "2026-12-31"), {
    from: "2026-01-01",
    to: "2026-12-31",
  });
});

test("reporting range rejects impossible reversed and oversized periods", () => {
  assert.throws(() => validateReportingRange("2026-02-30", "2026-03-01"));
  assert.throws(() => validateReportingRange("2026-03-02", "2026-03-01"));
  assert.throws(() => validateReportingRange("2025-01-01", "2026-12-31"));
});

test("date range boundaries are inclusive", () => {
  const range = { from: "2026-02-01", to: "2026-02-28" };
  assert.equal(dateInRange("2026-02-01", range), true);
  assert.equal(dateInRange("2026-02-28", range), true);
  assert.equal(dateInRange("2026-03-01", range), false);
});

test("reversible activity posts the original and a later negative event", () => {
  const january = { from: "2026-01-01", to: "2026-01-31" };
  const february = { from: "2026-02-01", to: "2026-02-28" };
  const document = {
    date: "2026-01-20",
    status: "reversed" as const,
    reversalDate: "2026-02-05",
  };
  assert.equal(reversibleActivity(document, 75, january), 75);
  assert.equal(reversibleActivity(document, 75, february), -75);
});

test("percentage is zero-safe and rounded to two decimals", () => {
  assert.equal(percentage(1, 3), 33.33);
  assert.equal(percentage(10, 0), 0);
});

test("month keys are derived from operation dates", () => {
  assert.equal(monthKey("2026-07-30"), "2026-07");
});

test("month ranges include empty intervening months across years", () => {
  assert.deepEqual(
    monthKeysInRange({ from: "2026-11-30", to: "2027-02-01" }),
    ["2026-11", "2026-12", "2027-01", "2027-02"],
  );
});
