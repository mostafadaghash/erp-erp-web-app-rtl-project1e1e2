import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const invoices = await readFile("src/components/InvoicesPage.tsx", "utf8");

test("IDL-01 presets use local day boundaries", () => {
  assert.match(invoices, /new Date\(now\.getFullYear\(\), now\.getMonth\(\), now\.getDate\(\)\)/);
  assert.match(invoices, /now\.getDate\(\) - 6/);
  assert.match(invoices, /new Date\(now\.getFullYear\(\), now\.getMonth\(\), 1\)/);
  assert.match(invoices, /new Date\(now\.getFullYear\(\), now\.getMonth\(\) \+ 1, 1\)/);
});

test("IDL-02 custom end date is inclusive by using next-day exclusive bound", () => {
  assert.match(invoices, /parsedTo\.getDate\(\) \+ 1/);
  assert.match(invoices, /timestamp >= from\.getTime\(\) && timestamp < toExclusive\.getTime\(\)/);
});
