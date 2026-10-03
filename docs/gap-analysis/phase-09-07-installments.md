# Phase 09.07 — Installments Gap Analysis

**Status:** `GAP_ANALYSIS_COMPLETE / BLOCKED_PENDING_ADR`  
**Authoritative source:** Business Tech ERP Architecture Baseline v1.7.  
**Analysis baseline SHA:** `e630166c23b4ce79b3d17ec6b551d1616f01554a`.  
**Existing architecture decision:** `docs/decisions/ADR-0017-installment-status-vocabulary.md`.  
**Scope of this step:** analysis/documentation only. No 09.07 Business DDL, Backend command, frontend cutover or Convex production change is introduced.

## 1. Authoritative V1 behavior

The Baseline defines Installments as a scheduling/settlement organizer, not a parallel ledger:

- `installment_plans` links a Counterparty and source document to a total schedule amount.
- `installments` stores due date, scheduled amount, `paid_amount_projection` and status.
- Creating the schedule itself creates no new debt and no Treasury movement.
- Financial Allocations and the Customer/Supplier Ledger remain Sources of Truth; there is no independent installment balance ledger.
- Real installment settlement uses Receipt/Disbursement + FinancialMovement + FinancialAllocation.
- Partial settlement is allowed.
- A FinancialAllocation must never exceed the remaining installment amount.
- One Receipt/Disbursement may allocate across multiple installments.
- Settlement uses `READ COMMITTED + SELECT ... FOR UPDATE` on the Installment and re-evaluates paid/remaining after the lock.
- `paid_amount_projection` and `status` are synchronous rebuildable projections.
- Canonical status vocabulary is `UPCOMING / DUE / PARTIAL / PAID / OVERDUE`.
- Detailed Customer/Supplier Ledger and Journal posting remains part of the later Posting Rules/GL work; 09.07 must not invent 09.08/09.09 accounting mappings.

## 2. Accepted status-vocabulary reconciliation

Architecture §25.13 and §27.10 use:

- `UPCOMING`
- `DUE`
- `PARTIAL`
- `PAID`
- `OVERDUE`

The §28.6 partial-index line instead uses `PENDING/PARTIALLY_PAID`. ADR-0017 already resolved this conflict:

- `PENDING` is not a canonical V1 Installment status;
- `PARTIALLY_PAID` is not canonical; use `PARTIAL`;
- the open-installment partial index must use the canonical non-PAID vocabulary;
- migration `0022_index_catalog.sql` already implements the corrected predicate:
  `status IN ('UPCOMING','DUE','PARTIAL','OVERDUE')`.

No 09.07 index change is required.

## 3. Current physical implementation

Existing schema in migration `0008_finance_settlement.sql`:

`installment_plans(id, counterparty_id, source_type, source_id, total_amount, created_at)`

`installments(id, plan_id, due_date, amount, paid_amount_projection, status)`

`financial_allocations(id, financial_source_type, financial_source_id, target_type, target_id, amount, created_at)`

Existing constraints in migration `0018_finance_settlement_constraints.sql`:

- PK on InstallmentPlan and Installment;
- Counterparty FK on plan;
- Installment -> Plan FK;
- `total_amount > 0`;
- Installment `amount > 0`;
- `0 <= paid_amount_projection <= amount`;
- status accepts exactly `UPCOMING/DUE/PARTIAL/PAID/OVERDUE`;
- FinancialAllocation `amount > 0`;
- unique logical allocation pair:
  `(financial_source_type, financial_source_id, target_type, target_id)`.

Existing approved indexes in migration `0022_index_catalog.sql`:

- `installment_plans(counterparty_id, source_type, source_id)`;
- `installments(plan_id, due_date)`;
- partial open-installment index on `(plan_id,due_date,id)` for `UPCOMING/DUE/PARTIAL/OVERDUE`;
- FinancialAllocation source and target lookup indexes.

## 4. Current-state classification

| Requirement | Current implementation | Classification |
| --- | --- | --- |
| InstallmentPlan physical shape | exists | Existing / compliant |
| Installment physical shape | exists | Existing / compliant |
| canonical status CHECK | exists and matches ADR-0017 | Existing / compliant |
| approved installment indexes | implemented in frozen 0022 catalog | Existing / compliant |
| FinancialAllocation table/indexes | exist | Existing / structurally compliant |
| plan/schedule command | absent | Missing |
| schedule creation must be cash-neutral/debt-neutral | no command exists | Missing behavioral gate |
| source document/counterparty validation | plan has polymorphic `source_type/source_id` only; no resolver exists | Missing |
| source branch/payment direction derivation | not stored on plan; no trusted resolver exists | Missing / architecture decision required |
| exact allowed `source_type` vocabulary | not enumerated by Baseline | Unresolved; do not invent |
| Installment `FOR UPDATE` settlement command | absent | Missing |
| partial settlement | no settlement command exists | Missing |
| over-allocation prevention after lock | absent | Missing |
| one cash document distributed across multiple installments | no allocation writer exists | Missing |
| FinancialAllocation polymorphic target integrity | no FK/trigger/service proves target is an Installment or source is the matching Receipt/Disbursement | Existing / needs guarded writer |
| source cash-document allocation cap | no service prevents allocations exceeding Receipt/Disbursement amount | Missing |
| Counterparty consistency between source document, plan and cash settlement | not enforced | Missing |
| `paid_amount_projection` synchronous writer | absent | Missing |
| projection rebuild/reconciliation | absent | Missing |
| status rebuild | absent | Missing and partly blocked by unresolved precedence |
| immutable allocation/history protection | FinancialAllocation has no dedicated 09.07 historical-mutation guard | Missing |
| Audit + Outbox | reusable infrastructure exists | Reuse |
| Receipt/Disbursement within-transaction primitive | exists in 09.03 | Reuse; Installment must lock before Treasury |
| Customer/Supplier Ledger settlement effect | later posting-rule integration | Defer to 09.09 |
| Journal | 09.08/09.09 | Defer |
| frontend/Convex cutover | later phases | Defer |

## 5. Blocking architecture gaps

### 5.1 Status precedence is intentionally unresolved

ADR-0017 explicitly states that it resolves vocabulary only and does **not** define state-transition precedence. It calls out the concrete unresolved case:

> if a partially paid installment is also past due, the later Finance service must use an approved lifecycle rule; ADR-0017 does not silently add a sixth combined status.

Therefore 09.07 implementation must not choose silently between `PARTIAL` and `OVERDUE`.

The decision also needs to freeze the business-date rule used for `DUE/OVERDUE` evaluation so a rebuild is deterministic across server/runtime environments.

### 5.2 Source resolution is not fully specified

The approved physical plan deliberately stores no `branch_id` or direction. §28.6 states Branch/Counterparty filtering is derived from Source Truth.

However the Baseline does not enumerate an exact closed set of `installment_plans.source_type` values or a complete resolver table describing:

- which source document families may own a plan;
- how Branch is derived for each;
- whether settlement is Receipt or Disbursement for each;
- how Counterparty equality is verified.

Because Sales and Purchasing business modules are implemented later in Phases 10 and 11, 09.07 must not accept client-supplied branch/direction as authoritative merely to work around the missing source resolver.

A versioned 09.07 ADR must define the generic trusted-resolution contract and explicitly defer source-family adapters to their owning modules where those documents do not yet have canonical posting services.

## 6. Lock-order / composition finding

The current `CashDocumentPostingService` already exposes:

- `postReceiptWithinTransaction(...)`
- `postDisbursementWithinTransaction(...)`

This is the correct reusable cash primitive.

Installment Settlement must acquire the Installment root lock first, recompute the effective allocated amount, then call the cash-document primitive so Treasury is locked later. That preserves the global V1 lock order:

`Business Document / dependent target -> Financial/Treasury rows -> Sequence`.

A new duplicate Receipt/Disbursement writer is not allowed.

For multi-installment settlement from one cash document, all target Installments must be locked in deterministic ID order before Treasury/cash posting. The command must validate the complete allocation set before writing cash effects.

## 7. Required implementation after the blocking ADR

Once the architecture ADR is accepted, 09.07 implementation may include only:

1. InstallmentPlan/Schedule creation service with Idempotency, trusted source resolution, Counterparty validation, cash/debt neutrality and Audit/Outbox;
2. deterministic Installment root locking;
3. one canonical FinancialAllocation writer for `target_type='INSTALLMENT'`;
4. Receipt/Disbursement composition through the existing 09.03 within-transaction primitive;
5. partial and multi-installment settlement;
6. source-cash amount cap + per-installment remaining cap;
7. synchronous paid/status projection update;
8. projection rebuild/reconciliation from effective FinancialAllocations;
9. immutable settlement/allocation history;
10. no new Index Catalog entry;
11. no GL/Journal mapping or final Customer/Supplier Ledger posting rule before 09.08/09.09;
12. no frontend cutover or Convex write.

## 8. Required PostgreSQL 17 tests after the ADR

- schedule creation creates no FinancialMovement, Treasury effect or duplicate debt;
- canonical status vocabulary only;
- source/counterparty mismatch rejected;
- schedule rows preserve deterministic due dates/amounts;
- settlement locks Installments before Treasury;
- partial payment updates projection without over-allocation;
- exact payment reaches PAID;
- one Receipt distributes across multiple customer installments atomically;
- one Disbursement distributes across multiple supplier installments atomically;
- allocation total cannot exceed the cash source amount;
- allocation cannot exceed any Installment remaining amount;
- concurrent settlements on the same Installment cannot over-allocate;
- idempotent replay does not duplicate CashDocument/FinancialMovement/Allocation;
- same key/different payload conflicts;
- forced failure rolls back CashDocument, FinancialMovement, Allocation, projections, Audit and Outbox;
- projection rebuild equals approved FinancialAllocation history;
- direct mutation/deletion of protected settlement history is rejected;
- frozen Index Catalog remains exact;
- verify-only migrations clean;
- all historical PostgreSQL schema/constraint/index/DDL regressions remain green;
- Full CI green on one final implementation SHA before 09.07 can close.

## 9. Exit from this step

The requested 09.07 Gap Analysis is complete.

09.07 is **not** ready for Business implementation yet because two business semantics are explicitly unresolved by the source material:

1. status precedence/business-date semantics;
2. trusted source-document resolution / direction derivation.

No inference has been silently promoted into a business rule.

**Next Action:** create one bounded 09.07 architecture ADR resolving those two items, then change 09.07 to `READY_FOR_IMPLEMENTATION`.
