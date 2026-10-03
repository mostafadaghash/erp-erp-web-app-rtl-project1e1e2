# ADR-0014 — Phase 03.I Repairs / Follow-Up / Notifications Schema Shape

**Status:** ACCEPTED  
**Date:** 2026-09-13  
**Phase:** 03.05 / 03.I — Repairs / Follow-Up / Notifications  
**Branch:** `agent/postgres-v1.7-core`

## Context

Architecture Baseline v1.7 §24.12–§24.14 and §25.15–§25.16 define the V1 Repairs, Customer Follow-Up, and Notifications domains. The Master Implementation Plan requires 03.I to create exactly the canonical physical relations before 03.J Printing/Reporting and before the general 03.06 Constraints / 03.07 Index Catalog passes.

The approved repair lifecycle contains these states only:

- `WAITING`
- `HANDED_TO_TECHNICIAN`
- `IN_REPAIR`
- `NEW_PROBLEM`
- `CUSTOMER_APPROVED`
- `TECHNICIAN_REJECTED`
- `CUSTOMER_REJECTED`
- `REPAIRED`
- `DELIVERED`

This phase freezes physical table/column/type/nullability shape. It does not implement repair commands, status-transition permissions, notification delivery, WhatsApp sending, public tracking endpoints, frontend cutover, generic constraints, or indexes.

## Decision

### 1. Canonical relations

03.I creates exactly these 12 relations:

- `repair_orders`
- `repair_status_history`
- `repair_assignments`
- `repair_issue_reports`
- `repair_customer_decisions`
- `repair_tracking_tokens`
- `customer_followups`
- `followup_actions`
- `followup_status_history`
- `message_templates`
- `notifications`
- `notification_recipients`

No legacy aliases or duplicate source-of-truth tables are created.

### 2. Repairs history and current convenience values

`repair_orders` is the aggregate root and contains current/convenience values such as `status`, `current_technician_id`, `completed_at`, and `delivered_at`.

`repair_status_history` and `repair_assignments` preserve append-only operational history. The service layer implemented later must use `READ COMMITTED + SELECT ... FOR UPDATE`, idempotency, permission checks, audit, and outbox behavior as required by v1.7. This schema migration does not implement those commands.

Lifecycle nullability decisions:

- `device_serial` is nullable because a received device may have no usable serial identifier.
- `current_technician_id` is nullable before assignment or after assignment termination.
- `completed_at` and `delivered_at` are nullable until those lifecycle milestones occur.
- `repair_status_history.from_status` is nullable for the initial status record.
- assignment receipt/termination timestamps are nullable until they occur.
- `repair_customer_decisions.notes` is optional.
- `repair_tracking_tokens.revoked_at` is nullable while a token remains active.

### 3. Two physical omissions resolved from the final Index Catalog

The short §25 field lists omit two physical columns that the final, closed §28 Index Catalog explicitly requires:

1. `repair_orders` receives `created_at` and `updated_at` as `timestamptz NOT NULL` because §28.7 requires indexes using both `updated_at` and `created_at`.
2. `followup_status_history` receives internal UUID `id NOT NULL` because §28.7 defines `(followup_id, changed_at DESC, id DESC)`.

These additions do not change business semantics. They make the §25 schema shape executable without contradicting the final Index Catalog. The actual indexes remain deferred to 03.07.

### 4. Customer follow-up task vs history

`customer_followups` is the mutable current work item. `followup_actions` and `followup_status_history` are append-only history structures.

A follow-up keeps source references instead of copying Sales Order or Repair Order data. `source_type` remains required. `source_id` is nullable only to support a `MANUAL` task that has no external aggregate row; later 03.06 checks/service validation must require `source_id` for `SALES_ORDER` and `REPAIR_ORDER` sources.

`source_event_id` is nullable because only automatic event-driven follow-ups carry it. The approved partial uniqueness for automatic deduplication is deferred to 03.06/03.07 exactly as the plan requires.

`completed_at` remains nullable while the task is open. `followup_actions.result` and `notes` are nullable because actions such as a WhatsApp open or a simple note do not always have a separate result value.

### 5. Tracking token security

`repair_tracking_tokens` stores `token_hash` only. No plaintext token column is created. Public tracking behavior and last-four-phone verification remain service/API work for the later Repairs phase.

### 6. Message templates and notifications

`message_templates` stores event key, language, template text, active state, and update time.

`notifications` stores source reference plus translation keys and `message_params_json`; it does not copy a full source-document snapshot. In accordance with ADR-0004, the selected JSON representation is `jsonb` and no automatic JSON index is added.

`outbox_event_id` is nullable because v1.7 explicitly allows notifications not originating from an automatic outbox event. The approved `(outbox_event_id, notification_type)` partial uniqueness remains deferred to 03.06/03.07.

`notification_recipients` stores per-user `seen_at` and `read_at`, both nullable. Opening the notification bell and the semantic difference between Seen and Read are later application behaviors; another user's state must never affect this row.

### 7. Data types

Consistent with ADR-0004:

- internal identities/references: `uuid`;
- visible repair document number: `bigint`;
- event/lifecycle timestamps: `timestamptz`;
- translated message parameters: `jsonb`;
- status/type/key/text values: `text`;
- active flags: `boolean`.

No money or inventory quantity is introduced by 03.I.

### 8. Constraints and indexes remain deferred

03.I intentionally does **not** add project-owned PK, FK, UNIQUE, partial UNIQUE, CHECK, delete-policy, or context constraints. Those remain 03.06.

03.I intentionally adds **no project-owned indexes**. The closed §28.7 catalog for repairs/follow-up/notifications remains 03.07.

This includes deferring:

- unique repair document numbers per branch;
- one active repair assignment per repair order;
- one customer decision per issue report;
- automatic follow-up `source_event_id` deduplication;
- notification outbox-event deduplication;
- notification recipient uniqueness;
- all dashboard/timeline/workload/bell indexes.

## Verification required

PostgreSQL 17 integration coverage must prove:

- exactly the 12 canonical 03.I relations exist;
- columns, types, order, and nullability match this decision;
- `repair_orders` includes the two required operational timestamps;
- `followup_status_history` has UUID `id` required by the final Index Catalog;
- tracking stores `token_hash` and no plaintext `token` column;
- notification params are `jsonb`, and per-user seen/read fields are nullable;
- migration `0010` is recorded with checksum, reruns idempotently, and passes verify-only;
- no `print_templates` or other 03.J relation exists;
- no general 03.06 constraint and no 03.07 project-owned index has been introduced.

## References

- Architecture Baseline v1.7 — §24.12 Repairs Domain, §24.13 Customer Follow-Up Domain, §24.14 Notifications Domain.
- Architecture Baseline v1.7 — §25.15 Repairs / Customer Follow-Up Schema and §25.16 Notifications Schema.
- Architecture Baseline v1.7 — §27.17 Repair Status Commands and §27.18 Customer Follow-Up Commands.
- Architecture Baseline v1.7 — §28.7 Repairs / Customer Follow-Up / Notifications final Index Catalog.
- Master Implementation Plan v1.0 — Phase 03.05 / 03.I.
