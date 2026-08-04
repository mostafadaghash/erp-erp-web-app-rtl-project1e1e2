# Performance & Index Audit (Read-only)

Date: 2026-08-04  
Scope: `convex/**/*.ts` and React consumers under `src/**/*.tsx`.  
Constraint followed: no production code, migration, or schema changes were made.

## Executive summary

### Issues by severity

| Severity | Count |
|---|---:|
| Critical | 6 |
| High | 19 |
| Medium | 28 |
| Low | 11 |
| **Total** | **62** |

### Highest-priority 10 fixes

1. Add server-side indexed pagination for `invoices.list` and stop returning all invoices to `InvoicesPage`.
2. Add server-side indexed pagination/search for `products.list` and stop local search/`slice` in product pickers.
3. Replace report-period `.collect()` detail reads with precomputed daily/monthly summary tables for large date ranges.
4. Replace `branches.stats` multi-table full scans with per-branch indexed counts or materialized counters.
5. Add timestamp-aware compound indexes to `auditLogs.listPaginated` so date filters are not post-filters on broad branches/modules.
6. Split `deliveries.creationOptions` into order-scoped invoice queries or add customer/branch/status index to avoid cross-product filtering.
7. Fix `finance.accounts` / `dailySummary` N+1 available-balance calculations with daily account balance snapshots or bounded movement indexes.
8. Make `generalLedger.accountLedgerPaginated` page opening-balance calculation cursor-friendly and avoid repeated range `collect()` on page changes.
9. Add paginated branch/status/date lists for Orders, Repairs, Shipments, Suppliers, Customers, and Returns currently using unbounded collects.
10. Introduce projection DTOs for heavy list endpoints to avoid returning embedded items, notes, costs, history, and full documents unnecessarily.

### Suggested PR sequencing

1. **Schema indexes only:** add compound indexes listed below (`by_branch_creation`, `by_branch_status_creation`, `by_customer_branch_status_date`, audit-log compound indexes, finance account/date/status indexes). No behavior change.
2. **List pagination endpoints:** add new paginated queries while keeping current APIs for compatibility.
3. **React migration:** switch pages to `usePaginatedQuery`, server filters, and small DTOs.
4. **Reports/Stats aggregation:** add materialized counters/summary tables and background rebuild jobs.
5. **N+1 cleanup:** add denormalized names/status fields or batched lookup DTO helpers.
6. **Remove deprecated endpoints:** after manual validation, remove unbounded list APIs or restrict them to admin/setup flows.

### Manual testing risks

- Pagination changes may alter row ordering and “load more” behavior in RTL tables.
- Report totals must be reconciled against existing full-scan output for the same date ranges before rollout.
- Permission/branch isolation must be tested with admin, accountant, branch employee, and unassigned users.
- Search behavior may change when replacing client-side `includes()` with indexed normalized-prefix or search indexes.
- DTO slimming may break print modals or exports if they implicitly consume full documents.

## Cross-cutting findings

- Many queries correctly call `requirePermission`, `requireModulePermission`, or branch helper checks before returning data. Proposed replacements must preserve these gates and apply branch equality inside indexes where possible.
- Several list endpoints use `collect()` then `filterByBranch()` or role checks in memory. This preserves authorization only after the read, but still scans rows from other branches. Prefer `withIndex("by_branch...")` for non-admin users and explicit admin branch selection.
- Convex `.filter()` after `withIndex()` is still an in-query post-filter over the indexed range. It is acceptable for tiny bounded ranges but problematic when used after broad indexes such as `by_status` or all rows.
- Local React pagination/search (`slice`, local `filter`) indicates the server is returning more rows than needed.

## Orders

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Order detail collects all deliveries/transactions/ledger rows for one order. Usually bounded, but can grow with repeated COD reversals and ledger entries. | Medium | `convex/orders.ts`, `details`, ~47-50 | Large timeline payload and full collects on detail open. | Keep current indexes but add `.take(50)` or a paginated `orderTimeline`; consider `customerLedgerEntries.by_reference_createdAt` and `financialTransactions.by_reference_createdAt`. Preserve `assertBranchAccess` on parent order. | Yes, if detail UI only needs recent timeline or is paginated. |
| Order pagination is present, but non-admin all-status path still paginates an ordered table with a branch `.filter()` because no `orders.by_branch` index exists. | High | `convex/orderPagination.ts`, `list`, ~58-65 | Cursor pagination bounds returned rows but may walk many other-branch records to fill a page. | Add `orders.by_branch_creation` and use it for branch users; keep `orders.by_branch_status` for status-filtered pages. | Yes, same newest-first order. |
| Order stats are already materialized through `readOrderStats`, which is a positive pattern. Rebuild remains batch-based. | Low | `convex/orders.ts`, `stats`/`rebuildStats`, ~138-166 | No immediate read hot path issue; rebuild cost exists by design. | Keep rebuild behind `manage_settings`; ensure batches remain bounded. | Yes. |

## Invoices

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| `invoices.list` does `ctx.db.query("invoices").collect()`, branch/status/customer filters in memory, sorts in memory, and returns full invoice docs including embedded items to users with profit permission. | Critical | `convex/invoices.ts`, `list`, ~101-122 | Full-table scan on every invoice page load; high memory/latency; cross-branch rows are read before filtering; heavy DTO payload. | Add/use `invoices.by_branch_status`, `by_branch_date`/`by_branch_creation`, `by_customer_branch_date`; implement `paginate()` and return list DTO without items/costs unless explicitly needed. Non-admin branch must be part of index prefix. | Yes, if a compatibility endpoint or equivalent ordering is kept. |
| `InvoicesPage` consumes all invoices and applies search/status filters locally. | Critical | `src/components/InvoicesPage.tsx`, ~25 and ~58-63 | Browser receives all invoice rows; search degrades and leaks unnecessary fields to client memory. | Replace with paginated server query accepting `branchId`, `status`, `customerId`, normalized search token, `paginationOpts`. | Yes, with UI-visible behavior preserved. |
| `invoices.stats` collects all invoices and reduces/filter counts in memory. | High | `convex/invoices.ts`, `stats`, ~408-418 | Full-table scan for dashboard/stat cards. | Maintain invoice status/revenue counters by branch, or query `by_branch_status` per status and date bucket; include branch isolation. | Yes; totals should match existing output. |
| `settings.first()` for tax rate is effectively singleton but lacks uniqueness/index. | Low | `convex/invoices.ts`, `prepareInvoice`, ~78 | Small table; not a performance risk unless multiple settings docs appear. | Keep as is or enforce singleton by schema/process later. | Yes. |

## Products

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| `products.list` collects all products, then applies branch filtering and client-side search in pages. | Critical | `convex/products.ts`, `list`, ~27; `src/components/ProductsPage.tsx`; `src/components/NewInvoicePage.tsx` ~24/44/189 | Full product catalog is transferred to list and invoice product picker; local `slice(0, 8)` is UI-only pagination. | Add `products.by_branch_active_name`, `by_branch_sku`, and possibly Convex search index on normalized name/SKU; return paginated picker DTO. | Yes. |
| Inventory movement history collects all movements for a product using `by_product` then orders desc. | High | `convex/products.ts`, `inventoryHistory`, ~123 | Product with many movements can create huge detail payload. | Add `inventoryMovements.by_product_created` or `by_product_date`; use `paginate()`. | Yes, with “load more”. |
| Product picker/list returns more fields than invoice/search views require. | Medium | `convex/products.ts`, `list`, ~27; `src/components/NewInvoicePage.tsx` ~24 | Larger payload and exposes cost-related fields to components that only need sell data. | Separate `productPicker` DTO: `_id`, `name`, `sku`, `sellPrice`, `stock`, `branchId`, `isActive`; require cost permission for cost fields. | Yes if full admin list remains. |

## Inventory

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Inventory balance/history depends on products full collects and product movement full collects. | High | `convex/products.ts`, ~27/123/157 | Slow stock pages and history views on large catalogs. | Product lists by branch/active; movements by product/date paginated; optional stock snapshot table for reporting. | Yes. |
| Change-stock mutations use direct `ctx.db.get(productId)` and are acceptable. | Low | `convex/lib/inventory.ts` | No index issue for point lookups. | Keep branch assertions wherever mutation caller passes branch. | Yes. |

## Delivery/COD

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| `deliveries.list` uses `by_status` or all `by_status` ordered, then branch visibility and other UI filters likely occur after broad fetch. | High | `convex/deliveries.ts`, `list`, ~30-31 | Cross-branch broad scan; status-only index can be huge. | Add `deliveries.by_branch_status_creation` / `by_branch_status_expectedDate`; branch-scoped pagination. | Yes. |
| `deliveries.stats` collects all deliveries. | High | `convex/deliveries.ts`, `stats`, ~146 | Full-table scan for stat cards. | Use materialized delivery status counters by branch, updated on status transitions. | Yes. |
| COD summary collects financial transactions by type and settlements by status then filters by branch in memory. | High | `convex/deliveries.ts`, COD summary, ~154-155 | Type/status buckets can grow globally and read unauthorized branches before filtering. | Add `financialTransactions.by_branch_type_status_date`; `codSettlements.by_branch_status_date`; include branch in index prefix. | Yes. |
| `creationOptions` loads all ready orders for branch and all invoices for branch, then filters invoices per order/customer in memory. | Critical | `convex/deliveries.ts`, `creationOptions`, ~241 | Cross product O(orders × invoices); large payload with embedded items. | Query invoices per selected customer with `invoices.by_customer_branch_status` or build order-specific eligible invoice query. Return minimal DTOs. | Yes, but UI flow may need staged selection. |
| `unsettled` queries delivered rows by account/status then filters settlement/accounting fields in memory. | Medium | `convex/deliveries.ts`, `unsettled`, ~246 | Bounded by account/status but can grow for old delivered rows. | Add `deliveries.by_cod_account_status_settlement` including `codSettlementId` or maintain open COD queue table. | Yes. |

## Repairs

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Repairs list is consumed as regular query in `RepairsPage`, with a separate paginated query import suggesting inconsistent pagination. | High | `src/components/RepairsPage.tsx`, ~49-71 | Repair table can grow; local state filters risk full payload. | Use only `usePaginatedQuery(api.repairs.listPaginated, ...)` with `repairs.by_branch_status_date` and `by_customer_branch_date`. | Yes. |
| Repair customer/product part pickers can load broad products/customers lists. | Medium | `src/components/RepairsPage.tsx`, ~64-71; `convex/repairs.ts` | Large picker payloads. | Add small picker endpoints using branch and search indexes. | Yes. |
| General-ledger repair posting collects repair-related account/line ranges in helper paths. | Medium | `convex/lib/generalLedgerRepairs.ts`, ~180 | Repair posting/reporting can scan date/account ranges. | Keep by-account/date ranges bounded and consider summary balances for reports. | Yes. |

## Customers

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Customer options/lists are used broadly by invoices, orders, repairs, and pages; full customer list is fetched in invoice creation. | High | `src/components/NewInvoicePage.tsx`, ~25/161; `src/components/CustomersPage.tsx` | Large customer table payload and local search. | Add `customers.by_branch_active_name`, `by_branch_phone`, and search index for normalized name/phone; paginated picker DTO. | Yes. |
| `customerLedger.reviewOpenings` collects all customers for a branch and runs `deriveCustomerLedgerOpeningState` per customer. | Critical | `convex/customerLedger.ts`, ~60-61 | N+1 over every customer plus nested ledger/document scans. | Materialize opening-review state per customer/branch, or paginate customers and compute one page; add indexes used by nested checks with branch in prefix. | Yes if batch/paginated review is acceptable. |
| `deriveCustomerLedgerOpeningState` collects entries/invoices/orders/repairs for a customer and filters historical state. | High | `convex/lib/customerLedger.ts`, ~32-37 | Expensive per-customer scans; used in loops. | Use `customerLedgerEntries.by_customer_branch_date`, plus `invoices/orders/repairs.by_customer_branch` indexes; cache derived state. | Yes. |

## Suppliers

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Supplier options collect all suppliers and filter active in memory. | Medium | `convex/supplierPayments.ts`, `supplierOptions`, ~69; `convex/suppliers.ts`, ~49/67 | Grows with supplier table; no branch dimension exists for suppliers. | Add `suppliers.by_active_name` or normalized search index; return picker DTO. | Yes. |
| Supplier branch-balance view collects supplier balances by branch then may join supplier documents. | Medium | `convex/suppliers.ts`, ~85 | Bounded by branch but can be heavy with many suppliers. | Keep `supplierBalances.by_branch`, add denormalized supplier name or paginated branch supplier balances. | Yes. |
| Supplier receivable/open receipt pickers collect all supplier/receipt rows then filter status/remaining in memory. | High | `convex/supplierPayments.ts`, `openPurchaseReceipts`, ~65 | Open-payables selection scans historical receipts for supplier/branch. | Add `purchaseReceipts.by_supplier_branch_status_dueDate` or maintain open-payables queue where `remainingAmount > 0`. | Yes. |
| Supplier shipment lists collect arrived shipments and all suppliers. | High | `convex/suppliers.ts`, ~141-143 | Full arrived-shipment bucket and full supplier table used in supplier dashboard/options. | Add branch/date/status filters and paginated supplier shipment endpoint. | Yes. |

## Finance

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Account pickers query active accounts globally then filter branch in memory. | High | `convex/finance.ts`, `collectionAccountPicker`/`refundAccountPicker`/`disbursementAccountPicker`, ~90-92 | Reads all active accounts across branches; weak branch isolation at storage level. | Add `financialAccounts.by_branch_active_type` and query branch first for non-admin/accountant; admin can require selected branch or paginate. | Yes. |
| `finance.accounts` returns all accounts when admin/accountant omits branch and calculates available balance per account. | Critical | `convex/finance.ts`, `accounts`, ~93; `convex/lib/finance.ts`, `calculateAvailableBalance`, ~59 | Full-account scan plus N+1 movement range scans. | Require branch or paginate accounts; maintain `financialAccountDailyBalances`/available snapshot; use `financialMovements.by_account_date` only for bounded incremental ranges. | Mostly yes; admin “all branches” view may need pagination. |
| Finance ledger paginates movements but each page row does several lookups and user profile `.first()` lookups. | Medium | `convex/finance.ts`, `ledger`, ~95 | N+1 per page; acceptable for 20 rows but visible latency. | Denormalize accountName/branchName/employeeName where immutable enough, or batch cache IDs per page. | Yes. |
| Legacy finance review scans invoices, orders, repairs, expenses, and payments fully. | High | `convex/finance.ts`, `legacyReview`, ~97 | Setup page can time out on migrated production data. | Use indexed counts/materialized migration-review counters; keep admin/initialize permission. | Yes. |
| Daily and collection summaries collect all daily movements/transactions then reduce/filter in memory. | Medium | `convex/finance.ts`, `dailySummary`/`collectionSummary`, ~102-104 | Bounded by branch/date but busy branches may be large. | Add daily summary table keyed by branch/date/account/type; or `financialTransactions.by_branch_type_status_date`. | Yes. |

## General Ledger

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Chart/account picker collects all active accounts then filters posting in memory. | Medium | `convex/generalLedger.ts`, `chart`/`accountPicker`, ~31-32 | Chart is moderate but grows over time; DTO is good. | Add `chartOfAccounts.by_active_posting_code` or include `isPosting` in index. | Yes. |
| Account ledger page computes opening balance with multiple `.collect()` range scans before/around each page. | High | `convex/generalLedger.ts`, `accountLedgerPaginated`, ~66-89 | Pagination still performs large historical scans, especially first page after long history. | Store monthly/period running balances by account/branch and a cursor-stable line sequence; use snapshots plus small same-day range. | Yes if balances are reconciled. |
| Trial balance reads prior/current period balances then does N+1 account document fetches and final in-memory sort. | High | `convex/generalLedger.ts`, `trial`, ~92 | Large chart/period history causes slow reports. | Denormalize account code/name/normalSide into period balances or batch map chart once using `chartOfAccounts.by_code`. | Yes. |
| Period close uses `generalLedgerPeriodBalances.by_period` without branch. | Medium | `convex/generalLedger.ts`, `closePeriod`, ~36 | Global period scan; OK for admin-only close but scales with branches/accounts. | Add `by_period_branch` or use `by_branch_period` per active branch; permission already strong. | Yes. |
| Posting helpers collect branches/settings/account lines in operational paths. | Medium | `convex/lib/generalLedgerOperations.ts`, ~256/273/293/371/388 | Posting could slow as historical transactions grow. | Prefer targeted branch/account/date indexes and snapshots. | Yes. |

## Audit Log

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| `auditLogs.listPaginated` uses real pagination and several compound indexes, but timestamp filters are applied with `.filter()` rather than as index range fields. | Medium | `convex/auditLogs.ts`, `listPaginated`, ~62-144 | A date-limited audit search may still walk a broad user/module/branch range. | Add timestamp-suffixed indexes: `by_branch_timestamp`, `by_user_timestamp`, `by_module_action_timestamp`, `by_branch_module_action_timestamp`. | Yes, same filters and DTO. |
| DTO mapping is good, but filtered result can still be large if pagination cursor walks many non-matching rows. | High | `convex/auditLogs.ts`, ~144-147 | Pagination may skip through large unmatched ranges. | Choose index based on most selective provided filter; reject broad search without date/branch. | Yes with validation. |

## Reports

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Business report uses branch/date indexes for transactional range reads, but still `collect()`s every matching detail row across many tables for each branch/date range. | High | `convex/reporting.ts`, `loadBranchData`, ~130-229 | Bounded and branch-isolated, but large one-year reports on busy branches can read many rows and build aggregates in memory. | Add daily/monthly aggregate tables by branch/module/status/type; keep branch/date indexes for drill-down fallback. | Yes, after reconciliation. |
| Branch selection for reports may collect all branches for admin/accountant. | Low | `convex/reporting.ts`, ~68/97 | Small table; acceptable. | Optional active branch index if branch count grows. | Yes. |
| React reports page should avoid local slicing/filtering after report payload. | Medium | `src/components/ReportsPage.tsx` | Large reports can freeze browser. | Paginate drill-down rows and keep top-level aggregates small. | Yes. |

## Employees

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Auth/profile helpers collect all user profiles for fallback profile matching. | Medium | `convex/lib/auth.ts`, ~42/288 | User count growth slows every auth fallback path. | Ensure all callers use `userProfiles.by_user` / `by_token`; remove global fallback or bound it to admin setup. | Yes, if identity mapping remains correct. |
| Branch employee checks collect all profiles then filter by branch. | Medium | `convex/branches.ts`, ~88/114 | Branch stats/management slows with employees. | Add `userProfiles.by_branch` and `by_branch_role` if roles are queried. | Yes. |
| Employee UI lists should be paginated if employee count grows. | Low | `src/components/EmployeesPage.tsx` | Usually small table; low risk. | Paginated employee list with branch/role indexes. | Yes. |

## Settings

| Finding | Severity | Location | Impact | Proposed query/index | Behavior-preserving? |
|---|---|---|---|---|---|
| Settings singleton uses `.first()` with no index in several functions. | Low | `convex/settings.ts`, ~9/33/53/92; `convex/invoices.ts`, ~78 | Table is intended singleton; minimal performance issue but no uniqueness guarantee. | Keep read pattern or add singleton key field/index in a future schema PR. | Yes. |
| Branches/categories list collect all rows. | Low | `convex/branches.ts`, ~10; `convex/categories.ts`, ~9 | Small configuration tables; acceptable unless used as unbounded public data. | Add active indexes only if needed. | Yes. |

## Additional module notes

### Sales Returns / Purchase Returns

- `salesReturns.list` falls back to collecting all sales returns and `salesReturns.create` list path also loads all invoices before branch filtering in some flows (`convex/salesReturns.ts`, ~20/32/36/60). Severity: High. Proposed indexes: `salesReturns.by_branch_date`, `by_invoice_status`; use paginated list DTOs. Behavior-preserving: yes.
- Purchase returns already use paginated React query (`src/components/PurchaseReturnsPage.tsx`, ~22), which is a positive pattern. Verify server query always includes `branchId` in the index prefix and avoids full receipt history scans.

### Shipments / Purchases

- `shipments.list` can call `.order("desc").collect()` without branch/status index when no status is passed and `shipmentOptions` collects all products and suppliers (`convex/shipments.ts`, ~25-27/65-66). Severity: High. Proposed indexes: `shipments.by_branch_status_date`, product/supplier picker indexes. Behavior-preserving: yes.
- Purchase receipt duplicate checks by external invoice key use `.first()` on an index and are acceptable.

### Expenses / Leads / CRM

- Similar list/picker patterns exist in CRM/expenses modules: broad collects and local filters are Medium/High depending on table size. Add branch/date/status indexes and paginated queries before significant data growth.

## Branch isolation and permission checklist for proposed fixes

For each replacement query:

- Call the same `requirePermission` / `requireModulePermission` currently used before returning data.
- Resolve effective branch with existing helpers (`resolveWriteBranch`, `scopedBranch`, `selectableBranch`, `assertBranchAccess`) before building the query.
- For non-admin/non-accountant users, make `branchId` the first index field whenever the table is branch-owned.
- For admin/accountant global views, either require explicit branch/date filters or paginate over an index ordered by creation/date.
- Keep DTOs permission-aware: cost/profit fields only for users with profit permissions; financial account access only for allowed branch/role.
- Keep mutation idempotency indexes and request-id lookups unchanged unless replaced with equivalent unique indexes.

## Commands used for the audit

```bash
pwd
find .. -name AGENTS.md -print
rg --files -g 'convex/**/*.ts' -g 'src/**/*.{ts,tsx,js,jsx}' -g 'docs/**'
rg -n "\.collect\(|\.take\(|\.first\(|\.filter\(|\.order\(|paginate\(|pagination|slice\(|sort\(|map\(|for \(|forEach\(|Promise\.all|useQuery|api\." convex src -g '*.{ts,tsx}'
rg -n "ctx\.db\.query\([^\n]+\)\.(collect|first|take)|\.collect\(|\.take\(|\.first\(" convex -g '*.ts'
nl -ba convex/orders.ts convex/invoices.ts convex/products.ts convex/deliveries.ts convex/repairs.ts convex/customers.ts convex/suppliers.ts convex/finance.ts convex/reporting.ts convex/auditLogs.ts convex/employees.ts convex/settings.ts convex/generalLedger.ts
```
