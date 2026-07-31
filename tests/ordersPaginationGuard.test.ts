import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../convex/orderPagination.ts", import.meta.url), "utf8");
const uiSource = readFileSync(new URL("../src/components/OrdersPage.tsx", import.meta.url), "utf8");

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
