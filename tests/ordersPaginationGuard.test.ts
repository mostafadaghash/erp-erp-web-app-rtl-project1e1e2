import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const source = readFileSync(new URL("../convex/orderPagination.ts", import.meta.url), "utf8");
const ordersSource = readFileSync(new URL("../convex/orders.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../src/components/OrdersPage.tsx", import.meta.url), "utf8");

function sourceFiles(root: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if ([".ts", ".tsx"].includes(extname(path))) files.push(path);
  }
  return files;
}

test("Orders pagination endpoint is cursor based and bounded", () => {
  assert.match(source, /paginationOptsValidator/);
  assert.match(source, /\.paginate\(args\.paginationOpts\)/);
  assert.doesNotMatch(source, /\.collect\s*\(/);
  assert.doesNotMatch(source, /\.take\s*\(/);
  assert.doesNotMatch(source, /Number\s*\(.*cursor|slice\s*\(/);
});

test("Orders pagination preserves authorization and branch scoping", () => {
  assert.match(source, /requireModulePermission\(ctx, "view_orders", "orders"\)/);
  assert.match(source, /user\.role !== "admin" && !user\.branchId/);
  assert.match(source, /user\.role === "admin"/);
  assert.match(source, /withIndex\("by_branch_status"/);
  assert.match(source, /q\.eq\("branchId", branchId\)\.eq\("status", args\.status!\)/);
  assert.match(source, /q\.eq\(q\.field\("branchId"\), branchId\)/);
  assert.match(source, /withIndex\("by_status"/);
});

test("Orders pagination keeps newest-first semantics and linked invoice DTO", () => {
  assert.match(source, /\.order\("desc"\)/);
  assert.match(source, /order\.linkedInvoiceId/);
  assert.match(source, /linkedInvoiceNumber: invoice\?\.invoiceNumber/);
  assert.doesNotMatch(source, /@ts-ignore|as any/);
});

test("Orders UI consumes cursor pagination and exposes bounded load-more", () => {
  assert.match(uiSource, /usePaginatedQuery/);
  assert.match(uiSource, /api\.orderPagination\.list/);
  assert.match(uiSource, /initialNumItems:\s*25/);
  assert.match(uiSource, /loadMore\(25\)/);
  assert.match(uiSource, /paginationStatus\s*===\s*"CanLoadMore"/);
  assert.doesNotMatch(uiSource, /useQuery\(api\.orders\.list/);
});

test("Legacy orders.list is removed and cannot regain UI callers", () => {
  assert.doesNotMatch(ordersSource, /export const list\s*=\s*query\s*\(/);
  const srcRoot = fileURLToPath(new URL("../src", import.meta.url));
  const callers = sourceFiles(srcRoot).filter((path) => /api\.orders\.list\b/.test(readFileSync(path, "utf8")));
  assert.deepEqual(callers, []);
});
