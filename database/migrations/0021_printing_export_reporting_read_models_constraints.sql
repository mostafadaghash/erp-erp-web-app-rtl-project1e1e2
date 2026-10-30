-- Phase 03.06 Printing / Export / Reporting Read Models constraints only.
-- Read-model relations remain rebuildable projections, never historical Sources of Truth.
-- No query/search/performance indexes from Phase 03.07 are introduced here.

-- Canonical printing identities and per-branch/per-document default grain.
ALTER TABLE public.print_templates
  ADD CONSTRAINT pk_print_templates PRIMARY KEY (id),
  ADD CONSTRAINT ck_print_templates__paper_size CHECK (
    paper_size IN ('A4', 'A3', 'THERMAL_80', 'THERMAL_57')
  );

ALTER TABLE public.branch_print_defaults
  ADD CONSTRAINT pk_branch_print_defaults PRIMARY KEY (branch_id, document_type),
  ADD CONSTRAINT fk_branch_print_defaults__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_branch_print_defaults__print_template
    FOREIGN KEY (print_template_id) REFERENCES public.print_templates(id) ON DELETE RESTRICT;

-- ADR-0016 compatibility fields remain optional mirrors only; the normalized map above is canonical.
ALTER TABLE public.branch_settings
  ADD CONSTRAINT fk_branch_settings__default_sales_print_template
    FOREIGN KEY (default_sales_print_template_id) REFERENCES public.print_templates(id) ON DELETE SET NULL,
  ADD CONSTRAINT fk_branch_settings__default_purchase_print_template
    FOREIGN KEY (default_purchase_print_template_id) REFERENCES public.print_templates(id) ON DELETE SET NULL;

-- Rebuildable reporting grains and canonical dimension references.
ALTER TABLE public.reporting_daily_branch_metrics
  ADD CONSTRAINT pk_reporting_daily_branch_metrics PRIMARY KEY (branch_id, date),
  ADD CONSTRAINT fk_reporting_daily_branch_metrics__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE;

ALTER TABLE public.reporting_inventory_balances
  ADD CONSTRAINT pk_reporting_inventory_balances PRIMARY KEY (branch_id, warehouse_id, variant_id),
  ADD CONSTRAINT fk_reporting_inventory_balances__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id)
    REFERENCES public.warehouses(id, branch_id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_reporting_inventory_balances__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE;

ALTER TABLE public.reporting_counterparty_balances
  ADD CONSTRAINT pk_reporting_counterparty_balances PRIMARY KEY (counterparty_id),
  ADD CONSTRAINT fk_reporting_counterparty_balances__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE CASCADE;

ALTER TABLE public.reporting_treasury_balances
  ADD CONSTRAINT pk_reporting_treasury_balances PRIMARY KEY (treasury_id),
  ADD CONSTRAINT fk_reporting_treasury_balances__treasury
    FOREIGN KEY (treasury_id) REFERENCES public.treasuries(id) ON DELETE CASCADE;

ALTER TABLE public.reporting_followup_metrics
  ADD CONSTRAINT pk_reporting_followup_metrics PRIMARY KEY (branch_id, date, source_type),
  ADD CONSTRAINT fk_reporting_followup_metrics__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE CASCADE,
  ADD CONSTRAINT ck_reporting_followup_metrics__created_count_nonnegative CHECK (created_count >= 0),
  ADD CONSTRAINT ck_reporting_followup_metrics__completed_count_nonnegative CHECK (completed_count >= 0),
  ADD CONSTRAINT ck_reporting_followup_metrics__overdue_count_nonnegative CHECK (overdue_count >= 0);

-- Intentionally no CHECK is invented for document_type or reporting source_type.
-- Monetary/balance projections may legitimately be signed; no blanket non-negative checks are added.
-- Export jobs/history tables are not part of the approved V1 physical schema and are not created here.
