# ADR-0022 — Phase 03.06 Repairs / Follow-Up / Notifications Constraints

- **Status:** Accepted
- **Date:** 2026-09-17
- **Phase:** 03.06 — Constraints
- **Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx`

## Context

Migration `0010_repairs_followup_notifications` created the approved physical shape for Repairs, Customer Follow-Up and Notifications without the relational constraint layer. Architecture Baseline v1.7 closes the Repairs status vocabulary, repair customer decision vocabulary and Follow-Up source domain, requires historical timeline protection through restrictive relationships, and requires ordinary uniqueness for repair document numbers, one final customer decision per issue report and notification recipient state.

The Baseline also places active RepairAssignment uniqueness, automatic Follow-Up source-event deduplication and Notification outbox-event/type deduplication in the locked §28 Index Catalog as partial unique indexes. The established Phase 03.06 policy from earlier slices is to keep independent/partial/expression Index Catalog DDL in Phase 03.07 rather than pull it forward into an ordinary constraint migration.

The approved physical shape of `followup_status_history` contains no standalone `id` column even though it is historical. Because Phase 03.06 must remain additive and must not rewrite migration `0010`, its natural append-only grain is represented by `(followup_id, changed_at)`.

## Decision

1. Migration `0020_repairs_followup_notifications_constraints` establishes primary keys for Repair, Follow-Up, template and Notification entity tables.
2. `followup_status_history` uses composite primary key `(followup_id, changed_at)` without changing its approved column shape.
3. `notification_recipients` uses composite primary key `(notification_id, user_id)`, satisfying the mandatory recipient uniqueness requirement.
4. Repair document numbers are unique by `(branch_id, document_number)`.
5. `repair_customer_decisions(repair_issue_report_id)` is unique, so one Issue Report has at most one final Customer Decision row.
6. Historical Repair / Follow-Up relationships use `ON DELETE RESTRICT`: repair orders, status history, assignments, issue reports, decisions, tracking tokens, Follow-Up actions/history and their user/counterparty/branch references cannot be destroyed by cascading parent deletion.
7. `repair_orders.current_technician_id`, assignment technician/user references and all recorded-by/changed-by/assigned-by references point to canonical `users(id)`.
8. `customer_followups.source_event_id` and `notifications.outbox_event_id` reference `outbox_events(id)` because the Baseline explicitly defines these as the event identity used for automatic task/notification retry handling.
9. `customer_followups.source_type/source_id` remains intentionally polymorphic across `SALES_ORDER / REPAIR_ORDER / MANUAL`; no fake conventional FK is introduced on `source_id`.
10. `notifications.source_type/source_id` remains intentionally polymorphic; no fake conventional FK is introduced on `source_id`.
11. Repair current status and Repair status-history old/new values use the canonical V1 vocabulary: `WAITING`, `HANDED_TO_TECHNICIAN`, `IN_REPAIR`, `NEW_PROBLEM`, `CUSTOMER_APPROVED`, `TECHNICIAN_REJECTED`, `CUSTOMER_REJECTED`, `REPAIRED`, `DELIVERED`.
12. Customer repair decision is restricted to `APPROVED / REJECTED`.
13. Follow-Up source type is restricted to `SALES_ORDER / REPAIR_ORDER / MANUAL`.
14. Repair document number must be positive and Repair version cannot be negative.
15. No closed CHECK is invented for Follow-Up priority/status/type/action/result, Message Template event key/language, or Notification event/type because Baseline v1.7 does not define closed technical vocabularies for those fields.

## Deliberately deferred to Phase 03.07

The following locked Index Catalog items are not pulled into migration `0020`:

- `PARTIAL UNIQUE (repair_order_id) WHERE ended_at IS NULL` for one active RepairAssignment.
- `UNIQUE (source_event_id) WHERE source_event_id IS NOT NULL` for automatic Follow-Up deduplication.
- `UNIQUE (outbox_event_id, notification_type) WHERE outbox_event_id IS NOT NULL` for automatic Notification deduplication.
- Repair / Follow-Up / Notification query indexes, technician workload partial index, open Follow-Up partial index and unseen-recipient partial index.

This deferral does not change their approved V1 requirement; it preserves the official execution order by keeping partial/index DDL inside Phase 03.07.

## Deliberately deferred to later backend phases

- Repair Status command transition policy, permission checks and sensitive-transition reasons.
- Enforcing `NEW_PROBLEM` + Issue Report in one transaction.
- Enforcing `CUSTOMER_APPROVED / CUSTOMER_REJECTED` + Customer Decision in one transaction.
- Technician rejection reason policy.
- Follow-Up action locking/reschedule/assignment effects.
- Idempotency, Audit/Outbox emission, notifications and Post-Delivery Follow-Up creation.
- Polymorphic source existence validation for Follow-Ups and Notifications.

## Consequences

- Repair and Follow-Up historical rows can no longer reference missing canonical parents/users/branches/counterparties where a direct relationship exists.
- Invalid Repair statuses, Repair decisions and Follow-Up source types are rejected by PostgreSQL.
- Duplicate repair document numbers in one Branch and duplicate final decisions for one Issue Report are rejected.
- Recipient identity is canonical and duplicate recipient rows are rejected.
- Automatic event references must point to real Outbox events.
- Partial/index-catalog dedupe rules remain visibly deferred rather than being silently omitted or prematurely implemented.

## Verification contract

PostgreSQL 17 behavioral integration tests for this slice must prove:

- canonical PK/FK/UNIQUE/CHECK constraints are installed;
- Repair document-number duplicates fail inside one Branch;
- all nine canonical Repair statuses are accepted and invalid statuses are rejected;
- Repair status-history old/new status checks are enforced;
- one Issue Report accepts only one Customer Decision and decision is `APPROVED / REJECTED` only;
- direct Branch/Counterparty/User/Repair/Follow-Up/Outbox foreign-key violations fail;
- Follow-Up source type accepts `SALES_ORDER / REPAIR_ORDER / MANUAL` and rejects invalid values;
- no fake source FK exists on polymorphic Follow-Up/Notification `source_id`;
- recipient duplicates fail;
- historical parent deletion is restricted;
- independent/partial Repairs/Follow-Up/Notification indexes remain absent until 03.07;
- active-assignment, source-event and Notification outbox dedupe partial rules remain structurally deferred to 03.07 rather than silently implemented in 03.06;
- migration checksum, idempotent rerun and verify-only behavior remain valid;
- no frontend cutover, dual write, Convex Production change or merge to `main` occurs.
