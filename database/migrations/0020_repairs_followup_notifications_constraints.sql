-- Phase 03.06 Repairs / Follow-Up / Notifications constraints only.
-- Integrity unique indexes explicitly closed by Baseline v1.7 belong to 03.06 even though
-- PostgreSQL implements partial uniqueness with indexes. Non-integrity query/performance indexes
-- remain deferred to Phase 03.07.

-- Canonical identities and ordinary uniqueness.
ALTER TABLE public.repair_orders
  ADD CONSTRAINT pk_repair_orders PRIMARY KEY (id),
  ADD CONSTRAINT uq_repair_orders__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.repair_status_history
  ADD CONSTRAINT pk_repair_status_history PRIMARY KEY (id);

ALTER TABLE public.repair_assignments
  ADD CONSTRAINT pk_repair_assignments PRIMARY KEY (id);

ALTER TABLE public.repair_issue_reports
  ADD CONSTRAINT pk_repair_issue_reports PRIMARY KEY (id);

ALTER TABLE public.repair_customer_decisions
  ADD CONSTRAINT pk_repair_customer_decisions PRIMARY KEY (id),
  ADD CONSTRAINT uq_repair_customer_decisions__issue UNIQUE (repair_issue_report_id);

ALTER TABLE public.repair_tracking_tokens
  ADD CONSTRAINT pk_repair_tracking_tokens PRIMARY KEY (id);

ALTER TABLE public.customer_followups
  ADD CONSTRAINT pk_customer_followups PRIMARY KEY (id);

ALTER TABLE public.followup_actions
  ADD CONSTRAINT pk_followup_actions PRIMARY KEY (id);

-- Migration 0010 physically includes a UUID id column; preserve that canonical identity.
ALTER TABLE public.followup_status_history
  ADD CONSTRAINT pk_followup_status_history PRIMARY KEY (id);

ALTER TABLE public.message_templates
  ADD CONSTRAINT pk_message_templates PRIMARY KEY (id);

ALTER TABLE public.notifications
  ADD CONSTRAINT pk_notifications PRIMARY KEY (id);

ALTER TABLE public.notification_recipients
  ADD CONSTRAINT pk_notification_recipients PRIMARY KEY (notification_id, user_id);

-- Historical/business references use RESTRICT so timeline/audit chains cannot be destroyed by cascades.
ALTER TABLE public.repair_orders
  ADD CONSTRAINT fk_repair_orders__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_orders__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_orders__current_technician
    FOREIGN KEY (current_technician_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_orders__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.repair_status_history
  ADD CONSTRAINT fk_repair_status_history__repair_order
    FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_status_history__changed_by
    FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.repair_assignments
  ADD CONSTRAINT fk_repair_assignments__repair_order
    FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_assignments__technician
    FOREIGN KEY (technician_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_assignments__assigned_by
    FOREIGN KEY (assigned_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.repair_issue_reports
  ADD CONSTRAINT fk_repair_issue_reports__repair_order
    FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_issue_reports__technician
    FOREIGN KEY (technician_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.repair_customer_decisions
  ADD CONSTRAINT fk_repair_customer_decisions__issue_report
    FOREIGN KEY (repair_issue_report_id) REFERENCES public.repair_issue_reports(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_repair_customer_decisions__recorded_by
    FOREIGN KEY (recorded_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.repair_tracking_tokens
  ADD CONSTRAINT fk_repair_tracking_tokens__repair_order
    FOREIGN KEY (repair_order_id) REFERENCES public.repair_orders(id) ON DELETE RESTRICT;

ALTER TABLE public.customer_followups
  ADD CONSTRAINT fk_customer_followups__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_followups__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_followups__assigned_user
    FOREIGN KEY (assigned_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_followups__source_event
    FOREIGN KEY (source_event_id) REFERENCES public.outbox_events(id) ON DELETE RESTRICT;

-- source_type/source_id is intentionally polymorphic (SalesOrder / RepairOrder / Manual).
-- Do not add a fake conventional FK for customer_followups.source_id.
ALTER TABLE public.followup_actions
  ADD CONSTRAINT fk_followup_actions__followup
    FOREIGN KEY (followup_id) REFERENCES public.customer_followups(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_followup_actions__user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.followup_status_history
  ADD CONSTRAINT fk_followup_status_history__followup
    FOREIGN KEY (followup_id) REFERENCES public.customer_followups(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_followup_status_history__changed_by
    FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.notifications
  ADD CONSTRAINT fk_notifications__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_notifications__outbox_event
    FOREIGN KEY (outbox_event_id) REFERENCES public.outbox_events(id) ON DELETE RESTRICT;

-- notifications.source_type/source_id is intentionally polymorphic; no fake source FK.
ALTER TABLE public.notification_recipients
  ADD CONSTRAINT fk_notification_recipients__notification
    FOREIGN KEY (notification_id) REFERENCES public.notifications(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_notification_recipients__user
    FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;

-- Closed-domain and numeric integrity explicitly approved by Architecture Baseline v1.7.
ALTER TABLE public.repair_orders
  ADD CONSTRAINT ck_repair_orders__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_repair_orders__version_nonnegative CHECK (version >= 0),
  ADD CONSTRAINT ck_repair_orders__status CHECK (
    status IN (
      'WAITING', 'HANDED_TO_TECHNICIAN', 'IN_REPAIR', 'NEW_PROBLEM',
      'CUSTOMER_APPROVED', 'TECHNICIAN_REJECTED', 'CUSTOMER_REJECTED',
      'REPAIRED', 'DELIVERED'
    )
  );

ALTER TABLE public.repair_status_history
  ADD CONSTRAINT ck_repair_status_history__from_status CHECK (
    from_status IS NULL OR from_status IN (
      'WAITING', 'HANDED_TO_TECHNICIAN', 'IN_REPAIR', 'NEW_PROBLEM',
      'CUSTOMER_APPROVED', 'TECHNICIAN_REJECTED', 'CUSTOMER_REJECTED',
      'REPAIRED', 'DELIVERED'
    )
  ),
  ADD CONSTRAINT ck_repair_status_history__to_status CHECK (
    to_status IN (
      'WAITING', 'HANDED_TO_TECHNICIAN', 'IN_REPAIR', 'NEW_PROBLEM',
      'CUSTOMER_APPROVED', 'TECHNICIAN_REJECTED', 'CUSTOMER_REJECTED',
      'REPAIRED', 'DELIVERED'
    )
  );

ALTER TABLE public.repair_customer_decisions
  ADD CONSTRAINT ck_repair_customer_decisions__decision CHECK (decision IN ('APPROVED', 'REJECTED'));

ALTER TABLE public.customer_followups
  ADD CONSTRAINT ck_customer_followups__source_type CHECK (source_type IN ('SALES_ORDER', 'REPAIR_ORDER', 'MANUAL'));

-- Approved 03.06 integrity partial uniqueness from Baseline §28.7 / Gap Analysis §8.
CREATE UNIQUE INDEX uq_repair_assignments__active
  ON public.repair_assignments (repair_order_id)
  WHERE ended_at IS NULL;

CREATE UNIQUE INDEX uq_customer_followups__source_event
  ON public.customer_followups (source_event_id)
  WHERE source_event_id IS NOT NULL;

CREATE UNIQUE INDEX uq_notifications__outbox_event_type
  ON public.notifications (outbox_event_id, notification_type)
  WHERE outbox_event_id IS NOT NULL;

-- No closed CHECK is invented for Follow-Up priority/status/type/action/result, message-template event keys,
-- notification event/type or template language because Baseline v1.7 does not define closed technical vocabularies for them.
-- All other Repairs / Follow-Up / Notifications query/performance indexes remain Phase 03.07.