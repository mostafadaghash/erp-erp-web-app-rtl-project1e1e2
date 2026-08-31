import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("SET-C01 uses the simplified settings navigation label", () => {
  const sidebar = read("src/components/Sidebar.tsx");

  assert.match(sidebar, /key:\s*"administration"[\s\S]*?label:\s*"الإعدادات"/);
  assert.doesNotMatch(sidebar, /الإدارة والإعدادات/);
});

test("SET-C02 removes internal text search from branches and employees", () => {
  const branches = read("src/components/BranchesPage.tsx");
  const employees = read("src/components/EmployeesPage.tsx");

  assert.doesNotMatch(branches, /بحث بالاسم أو العنوان/);
  assert.doesNotMatch(branches, /const \[search, setSearch\]/);
  assert.doesNotMatch(employees, /بحث بالاسم أو الهاتف/);
  assert.doesNotMatch(employees, /const \[search, setSearch\]/);
  assert.match(employees, /filterRole/);
});

test("SET-C03 removes the redundant settings helper copy", () => {
  const settings = read("src/components/SettingsPage.tsx");

  assert.doesNotMatch(settings, /غيّر الاسم والشعار والألوان في أي وقت بدون تعديل الكود/);
  assert.match(settings, /data-testid="settings-page"/);
});

test("SET-C04 hides global search only on requested settings pages", () => {
  const app = read("src/components/ERPApp.tsx");

  assert.match(
    app,
    /const PAGES_WITHOUT_GLOBAL_SEARCH = new Set<Page>\(\["branches", "employees", "settings"\]\);/,
  );
  assert.match(
    app,
    /!PAGES_WITHOUT_GLOBAL_SEARCH\.has\(currentPage\) && <GlobalSearch onNavigate=\{navigate\} \/>/,
  );
  assert.doesNotMatch(app, /PAGES_WITHOUT_GLOBAL_SEARCH[^;]*audit-logs/);
});
