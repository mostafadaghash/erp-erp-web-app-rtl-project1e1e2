import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  activateOrAppend,
  closeTabsByIds,
  entityIdentity,
  nextNumberedTitle,
  parsePersistedWorkspace,
  reportIdentity,
  serializableWorkspace,
  singletonIdentity,
  uniqueIdentity,
  type WorkspaceTab,
} from "../src/workspace/workspaceModel.ts";
import { workspaceMessage } from "../src/i18n/workspaceMessages.ts";

const erpSource = readFileSync("src/components/ERPApp.tsx", "utf8");
const tabsSource = readFileSync("src/workspace/WorkspaceTabs.tsx", "utf8");
const modelSource = readFileSync("src/workspace/workspaceModel.ts", "utf8");

type Page = "dashboard" | "invoices" | "new-invoice" | "customer-ledger" | "reports";

function tab(overrides: Partial<WorkspaceTab<Page>> & Pick<WorkspaceTab<Page>, "id" | "page" | "identityKey">): WorkspaceTab<Page> {
  return {
    title: overrides.page,
    group: "test",
    kind: "singleton",
    dirty: false,
    restoreSafe: true,
    createdAt: 1,
    lastActiveAt: 1,
    ...overrides,
  };
}

test("WS-01 existing pages deduplicate by stable workspace identity", () => {
  const dashboard = tab({ id: "a", page: "dashboard", identityKey: singletonIdentity("dashboard") });
  const firstInvoices = tab({ id: "b", page: "invoices", identityKey: singletonIdentity("invoices") });
  const opened = activateOrAppend([dashboard], firstInvoices);
  assert.equal(opened.reused, false);
  assert.equal(opened.tabs.length, 2);

  const duplicate = tab({ id: "c", page: "invoices", identityKey: singletonIdentity("invoices") });
  const reused = activateOrAppend(opened.tabs, duplicate);
  assert.equal(reused.reused, true);
  assert.equal(reused.tabs.length, 2);
  assert.equal(reused.activeId, "b");
});

test("WS-02 new operations are independent instances with numbered titles", () => {
  const first = tab({ id: "new-1", page: "new-invoice", identityKey: uniqueIdentity("new-invoice"), kind: "new", title: "فاتورة بيع جديدة", restoreSafe: false });
  const secondTitle = nextNumberedTitle([first], "فاتورة بيع جديدة");
  assert.equal(secondTitle, "فاتورة بيع جديدة 2");
  const second = tab({ id: "new-2", page: "new-invoice", identityKey: uniqueIdentity("new-invoice"), kind: "new", title: secondTitle, restoreSafe: false });
  const result = activateOrAppend([first], second);
  assert.equal(result.reused, false);
  assert.equal(result.tabs.length, 2);
  assert.notEqual(first.identityKey, second.identityKey);
});

test("WS-03 entity and report tabs have deterministic non-duplicating identities", () => {
  assert.equal(entityIdentity("customer-ledger", "customer-1", "branch-2"), "entity:customer-ledger:customer-1:branch-2");
  assert.equal(reportIdentity("reports", "sales"), "report:reports:sales");
  assert.notEqual(reportIdentity("reports", "sales"), reportIdentity("reports", "inventory"));
});

test("WS-04 closing the active tab selects a nearby remaining tab", () => {
  const tabs = [
    tab({ id: "a", page: "dashboard", identityKey: "a" }),
    tab({ id: "b", page: "invoices", identityKey: "b" }),
    tab({ id: "c", page: "reports", identityKey: "c", kind: "report" }),
  ];
  const result = closeTabsByIds(tabs, "b", new Set(["b"]));
  assert.deepEqual(result.tabs.map((item) => item.id), ["a", "c"]);
  assert.equal(result.activeId, "c");
});

test("WS-05 refresh persistence excludes new and dirty work while retaining safe pages", () => {
  const tabs = [
    tab({ id: "dashboard", page: "dashboard", identityKey: singletonIdentity("dashboard") }),
    tab({ id: "new", page: "new-invoice", identityKey: uniqueIdentity("new-invoice"), kind: "new", restoreSafe: false, dirty: true }),
    tab({ id: "report", page: "reports", identityKey: reportIdentity("reports", "sales"), kind: "report", payload: { reportTarget: "sales" } }),
    tab({ id: "dirty-existing", page: "invoices", identityKey: singletonIdentity("invoices"), dirty: true }),
  ];
  const persisted = serializableWorkspace(tabs, "report");
  assert.deepEqual(persisted.tabs.map((item) => item.identityKey), [singletonIdentity("dashboard"), reportIdentity("reports", "sales")]);
  assert.equal(persisted.activeIdentityKey, reportIdentity("reports", "sales"));
  const reparsed = parsePersistedWorkspace<Page>(JSON.stringify(persisted));
  assert.equal(reparsed?.tabs.length, 2);
});

test("WS-06 ERP shell renders every opened tab as a retained panel instead of replacing currentPage", () => {
  assert.match(erpSource, /workspace\.tabs\.map\(renderTab\)/);
  assert.match(erpSource, /hidden=\{tab\.id !== workspace\.activeId\}/);
  assert.match(erpSource, /activateOrAppend/);
  assert.match(erpSource, /MULTI_INSTANCE_PAGES/);
  assert.match(erpSource, /uniqueIdentity/);
  assert.doesNotMatch(erpSource, /const \[currentPage, setCurrentPage\]/);
});

test("WS-07 unsaved new operations are protected on close and browser refresh", () => {
  assert.match(erpSource, /pendingCloseIds/);
  assert.match(erpSource, /tab\.kind === "new"/);
  assert.match(erpSource, /beforeunload/);
  assert.match(erpSource, /closeWithoutSaving/);
  assert.match(erpSource, /markTabDirty/);
});

test("WS-08 desktop overflow, open-page search, context close actions and mobile drawer exist", () => {
  assert.match(tabsSource, /overflow-x-auto/);
  assert.match(tabsSource, /scrollIntoView/);
  assert.match(tabsSource, /workspace-mobile-open-pages/);
  assert.match(tabsSource, /searchOpenPages/);
  assert.match(tabsSource, /closeOthers/);
  assert.match(tabsSource, /closeRight/);
  assert.match(tabsSource, /closeLeft/);
  assert.match(tabsSource, /closeAll/);
  assert.match(tabsSource, /onContextMenu/);
});

test("WS-09 workspace restore is account-scoped and permission-checked", () => {
  assert.match(erpSource, /WORKSPACE_STORAGE_PREFIX/);
  assert.match(erpSource, /String\(me\._id\)/);
  assert.match(erpSource, /canAccessPage\(tab\.page\)/);
  assert.match(modelSource, /restoreSafe/);
  assert.match(modelSource, /kind !== "new"/);
});

test("WS-10 workspace controls are bilingual", () => {
  assert.equal(workspaceMessage("ar", "openPages"), "الصفحات المفتوحة");
  assert.equal(workspaceMessage("en", "openPages"), "Open Pages");
  assert.equal(workspaceMessage("en", "closeWithoutSaving"), "Close Without Saving");
});
