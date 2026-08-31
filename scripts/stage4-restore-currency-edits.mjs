import { readFileSync, writeFileSync } from "node:fs";

function replaceExactly(source, from, to, label) {
  const count = source.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected exactly one match, found ${count}`);
  return source.replace(from, to);
}

{
  const path = "convex/schema.ts";
  let source = readFileSync(path, "utf8");
  source = `import { currencyValidator } from "./lib/currency.ts";\n${source}`;
  source = replaceExactly(source, 'baseCurrency:v.literal("EGP")', "baseCurrency:currencyValidator", "general ledger base currency schema");
  source = replaceExactly(source, "currency: v.string(),", "currency: currencyValidator,", "system currency schema");
  writeFileSync(path, source);
}

{
  const path = "tests/generalLedgerFoundationUiRegression.test.ts";
  let source = readFileSync(path, "utf8");
  source = replaceExactly(
    source,
    'test("GLUI-22 previews debit credit and difference in EGP", () => {\n  assert.match(ui, /إجمالي المدين:/);\n  assert.match(ui, /إجمالي الدائن:/);\n  assert.match(ui, /الفرق:/);\n  assert.match(ui, /currency: "EGP"/);\n});',
    'test("GLUI-22 previews debit credit and difference in the configured base currency", () => {\n  assert.match(ui, /إجمالي المدين:/);\n  assert.match(ui, /إجمالي الدائن:/);\n  assert.match(ui, /الفرق:/);\n  assert.match(ui, /useCurrency\\(\\)/);\n  assert.match(ui, /formatCurrency\\(totals\\.debit\\)/);\n  assert.match(ui, /currencyCode/);\n});',
    "general ledger UI currency regression",
  );
  writeFileSync(path, source);
}

console.log("Restored files received only the intended currency edits.");
