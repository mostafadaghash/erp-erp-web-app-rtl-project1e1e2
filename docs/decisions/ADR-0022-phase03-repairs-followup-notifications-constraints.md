# ADR-0022 — Phase 03.06 Repairs / Follow-Up / Notifications Constraint Boundary

**Status:** ACCEPTED  
**Date:** 2026-09-17  
**Phase:** 03.06 — Constraints  
**Authority:** `Business-Tech-ERP-Architecture-Baseline-v1.7-Final.docx` §§25.15, 25.16, 26, 28.7 plus `docs/gap-analysis/phase-03-06-constraints-gap-analysis.md`

## Context

Migration `0010_repairs_followup_notifications` froze the physical columns for Repairs, Customer Follow-Up and Notifications. Phase 03.06 must add relational integrity without rewriting the historical migration or pulling ordinary query/performance indexes forward from Phase 03.07.

Baseline v1.7 also closes three partial uniqueness rules whose purpose is integrity rather than performance:

1. one active `repair_assignments` row per RepairOrder (`ended_at IS NULL`);
2. one automatic `customer_followups` row per non-null `source_event_id`;
3. one `notifications` row per `(outbox_event_id, notification_type)` when `outbox_event_id IS NOT NULL`.

Although PostgreSQL implements these rules using partial unique indexes, the Gap Analysis §8 explicitly classifies such structures as Phase 03.06 integrity requirements. Phase 03.07 owns only the remaining non-integrity query/search/performance indexes.

The physical migration `0010` contains `followup_status_history.id uuid NOT NULL`. That existing identity is preserved; Phase 03.06 does not pretend the column is absent or replace it with an invented natural-key identity.

## Decision

Migration `0020_repairs_followup_notifications_constraints` will:

- keep `followup_status_history(id)` as its primary key;
- add canonical PK/FK/UNIQUE/CHECK constraints for the 12 Repairs / Follow-Up / Notifications tables;
- use `ON DELETE RESTRICT` for historical/business references so repair timelines, assignments, issue reports, decisions, follow-up history and notification recipient state cannot be destroyed by parent deletion;
- enforce repair document uniqueness by `(branch_id, document_number)`;
- enforce one final customer decision per `repair_issue_report_id`;
- enforce the approved Repair status vocabulary:
  - `WAITING`
  - `HANDED_TO_TECHNICIAN`
  - `IN_REPAIR`
  - `NEW_PROBLEM`
  - `CUSTOMER_APPROVED`
  - `TECHNICIAN_REJECTED`
  - `CUSTOMER_REJECTED`
  - `REPAIRED`
  - `DELIVERED`;
- enforce customer decision `APPROVED | REJECTED`;
- enforce Follow-Up `source_type = SALES_ORDER | REPAIR_ORDER | MANUAL`;
- link non-null Follow-Up `source_event_id` and Notification `outbox_event_id` to `outbox_events(id)` with restrictive FKs;
- retain `customer_followups.source_type/source_id` and `notifications.source_type/source_id` as polymorphic references with no fake conventional FK;
- create these Phase 03.06 integrity partial unique indexes:
  - `uq_repair_assignments__active` on `(repair_order_id) WHERE ended_at IS NULL`;
  - `uq_customer_followups__source_event` on `(source_event_id) WHERE source_event_id IS NOT NULL`;
  - `uq_notifications__outbox_event_type` on `(outbox_event_id, notification_type) WHERE outbox_event_id IS NOT NULL`.

## Deliberate non-decisions

This slice does not invent closed CHECK vocabularies for Follow-Up status, priority, followup type, action/result, message-template language/event keys, or notification event/type because Baseline v1.7 does not close those technical vocabularies.

This slice does not implement the transaction/service rules that require `NEW_PROBLEM` to create an issue report in the same transaction, or customer approval/rejection to create the associated decision and notifications. Those remain later backend command/transaction responsibilities.

This slice does not add operational dashboard, technician workload, source history, unseen notification, timeline, or other performance indexes from §28.7. Those remain Phase 03.07.

## Consequences

- Retries cannot create duplicate automatic Follow-Ups or duplicate notification types for the same Outbox Event.
- A RepairOrder cannot have two active technician assignments simultaneously.
- Historical Repair/Follow-Up chains are protected from destructive parent deletion.
- Physical schema identity remains consistent with migration `0010`.
- Phase 03.07 can add only the remaining cataloged performance indexes and must not duplicate PK/UNIQUE/integrity index structures already created by `0020`.

## Verification contract

PostgreSQL 17 behavioral integration must prove the PK/FK/UNIQUE/CHECK catalog, all nine Repair statuses, decision and Follow-Up source domains, one active assignment, source-event retry deduplication, notification outbox/type retry deduplication, recipient uniqueness, historical deletion protection, absence of fake polymorphic source FKs, migration checksum/idempotent rerun/verify-only behavior, and that only the three approved integrity partial indexes exist before 03.07.
