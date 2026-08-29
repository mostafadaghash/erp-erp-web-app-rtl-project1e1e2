import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [treasury, dashboard, shell, deliveries] = await Promise.all([
  readFile("src/components/TreasuryPage.tsx", "utf8"),
  readFile("src/components/Dashboard.tsx", "utf8"),
  readFile("src/components/ERPApp.tsx", "utf8"),
  readFile("src/components/DeliveriesPage.tsx", "utf8"),
]);

test("RELEASE-CLOSURE-01 finance initialization requires an explicit final confirmation", () => {
  assert.match(treasury, /setDialog\("initialize"\)/);
  assert.match(treasury, /data-testid="finance-confirmation-dialog"/);
  assert.match(treasury, /هذا الاعتماد نهائي/);
  assert.match(treasury, /data-testid=\{dialog === "initialize" \? "finance-confirm-final"/);
  assert.match(treasury, /if \(dialog === "initialize"\)[\s\S]*confirmInitialization\(\)/);
});

test("RELEASE-CLOSURE-02 generic clearing settlement excludes COD clearing accounts", () => {
  const definition = treasury.match(/const clearingAccounts = [^\n]+/)?.[0] ?? "";
  assert.match(definition, /paymob_clearing/);
  assert.match(definition, /fawry_clearing/);
  assert.match(definition, /card_clearing/);
  assert.doesNotMatch(definition, /cod_clearing/);
});

test("RELEASE-CLOSURE-03 creation remains centralized through the shared shell request path", () => {
  assert.doesNotMatch(dashboard, /onRequestCreate/);
  assert.match(shell, /const requestCreate = \(page: CreateTarget, nextVoucherKind\?: "receipt" \| "disbursement"\)/);
  assert.match(shell, /<Dashboard onOpenReport=\{openReport\} permissions=\{permissions\}/);
  for (const page of ["new-invoice", "new-purchase-invoice", "customers", "repairs", "vouchers", "inventory"]) {
    assert.ok(shell.includes(`page: "${page}"`), `missing shared create action for ${page}`);
  }
  assert.doesNotMatch(dashboard, /useMutation|api\.[\w.]+\.(?:create|update|remove)/);
});

test("RELEASE-CLOSURE-04 delivery print document is composed safely and waits for rendering", () => {
  assert.match(deliveries, /popup\.document\.documentElement\.dir = "rtl"/);
  assert.match(deliveries, /popup\.document\.head\.innerHTML/);
  assert.match(deliveries, /popup\.document\.body\.innerHTML = `<h1>/);
  assert.match(deliveries, /popup\.document\.fonts\?\.ready/);
  assert.match(deliveries, /popup\.document\.fonts\.ready\.then\(triggerPrint, triggerPrint\)/);
  assert.match(deliveries, /popup\.requestAnimationFrame\(\(\) => popup\.requestAnimationFrame/);
  assert.doesNotMatch(deliveries, /body\.innerHTML = `<html/);
});
