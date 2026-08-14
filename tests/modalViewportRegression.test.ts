import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const app = read("src/components/ERPApp.tsx");
const employees = read("src/components/EmployeesPage.tsx");
const contacts = read("src/components/ContactFormModal.tsx");

test("MODAL-01 application page host does not trap fixed dialogs", () => {
  assert.doesNotMatch(
    app,
    /<main className="flex-1 overflow-y-auto">\s*<div className="animate-fade-in-up">/,
  );
});

test("MODAL-02 employee creation stays above chrome and inside the viewport", () => {
  assert.match(employees, /fixed inset-0 z-\[100\]/);
  assert.match(employees, /max-h-\[calc\(100dvh-1rem\)\]/);
  assert.match(employees, /overflow-y-auto/);
  assert.match(employees, /sticky top-0/);
});

test("MODAL-03 customer and supplier creation stays scrollable in the viewport", () => {
  assert.match(contacts, /fixed inset-0 z-\[100\]/);
  assert.match(contacts, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(contacts, /overflow-y-auto/);
});
