-- Phase 03.06 Purchasing / Tax constraints only.
-- Independent query/search/performance and partial indexes remain deferred to Phase 03.07.
-- Returnable Quantity concurrency protection remains a service transaction rule:
-- lock the original PurchaseInvoiceLine FOR UPDATE and recompute posted returns in the same transaction.

-- Canonical identities.
ALTER TABLE public.tax_codes
  ADD CONSTRAINT pk_tax_codes PRIMARY KEY (id),
  ADD CONSTRAINT uq_tax_codes__code UNIQUE (code);

ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT pk_purchase_invoices PRIMARY KEY (id),
  ADD CONSTRAINT uq_purchase_invoices__branch_document UNIQUE (branch_id, document_number),
  ADD CONSTRAINT uq_purchase_invoices__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.purchase_invoice_lines
  ADD CONSTRAINT pk_purchase_invoice_lines PRIMARY KEY (id);

ALTER TABLE public.purchase_returns
  ADD CONSTRAINT pk_purchase_returns PRIMARY KEY (id),
  ADD CONSTRAINT uq_purchase_returns__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.purchase_return_lines
  ADD CONSTRAINT pk_purchase_return_lines PRIMARY KEY (id);

-- Historical/master references default to RESTRICT. Composite FKs protect Branch context.
ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT fk_purchase_invoices__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoices__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoices__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoices__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoices__deleted_by
    FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_invoice_lines
  ADD CONSTRAINT fk_purchase_invoice_lines__purchase_invoice
    FOREIGN KEY (purchase_invoice_id) REFERENCES public.purchase_invoices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoice_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoice_lines__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_invoice_lines__tax_code
    FOREIGN KEY (tax_code_id) REFERENCES public.tax_codes(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_returns
  ADD CONSTRAINT fk_purchase_returns__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_returns__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_returns__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_returns__source_invoice_branch
    FOREIGN KEY (source_purchase_invoice_id, branch_id) REFERENCES public.purchase_invoices(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_returns__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_returns__deleted_by
    FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.purchase_return_lines
  ADD CONSTRAINT fk_purchase_return_lines__purchase_return
    FOREIGN KEY (purchase_return_id) REFERENCES public.purchase_returns(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_return_lines__source_invoice_line
    FOREIGN KEY (source_purchase_invoice_line_id) REFERENCES public.purchase_invoice_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_purchase_return_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

-- Close the Sales tax references deliberately deferred by migration 0016 until tax_codes had a canonical PK.
ALTER TABLE public.sales_quote_lines
  ADD CONSTRAINT fk_sales_quote_lines__tax_code
    FOREIGN KEY (tax_code_id) REFERENCES public.tax_codes(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT fk_sales_order_lines__tax_code
    FOREIGN KEY (tax_code_id) REFERENCES public.tax_codes(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT fk_sales_invoice_lines__tax_code
    FOREIGN KEY (tax_code_id) REFERENCES public.tax_codes(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_return_lines
  ADD CONSTRAINT fk_sales_return_lines__tax_code
    FOREIGN KEY (tax_code_id) REFERENCES public.tax_codes(id) ON DELETE RESTRICT;

-- Numeric integrity. Signed cost_variance is intentionally not constrained to non-negative.
ALTER TABLE public.tax_codes
  ADD CONSTRAINT ck_tax_codes__rate_nonnegative CHECK (rate >= 0);

ALTER TABLE public.purchase_invoices
  ADD CONSTRAINT ck_purchase_invoices__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_purchase_invoices__document_version_positive CHECK (document_version > 0),
  ADD CONSTRAINT ck_purchase_invoices__totals_nonnegative CHECK (
    subtotal >= 0 AND discount_total >= 0 AND additional_cost >= 0 AND tax_total >= 0
    AND grand_total >= 0 AND paid_total >= 0 AND due_total >= 0
  ),
  ADD CONSTRAINT ck_purchase_invoices__due_requires_counterparty CHECK (
    due_total = 0 OR counterparty_id IS NOT NULL
  );

ALTER TABLE public.purchase_invoice_lines
  ADD CONSTRAINT ck_purchase_invoice_lines__quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ck_purchase_invoice_lines__amounts_nonnegative CHECK (
    purchase_unit_price >= 0 AND discount_amount >= 0 AND net_before_tax >= 0
    AND landed_cost_allocation >= 0 AND tax_amount >= 0 AND line_total >= 0
    AND (landed_unit_cost IS NULL OR landed_unit_cost >= 0)
  );

ALTER TABLE public.purchase_returns
  ADD CONSTRAINT ck_purchase_returns__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_purchase_returns__document_version_positive CHECK (document_version > 0),
  ADD CONSTRAINT ck_purchase_returns__total_nonnegative CHECK (total >= 0);

ALTER TABLE public.purchase_return_lines
  ADD CONSTRAINT ck_purchase_return_lines__quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ck_purchase_return_lines__amounts_nonnegative CHECK (
    commercial_unit_value_snapshot >= 0
    AND (inventory_unit_cost_snapshot IS NULL OR inventory_unit_cost_snapshot >= 0)
    AND tax_amount >= 0 AND line_total >= 0
  );

-- Every Variant + ProductUnit pair used by a PurchaseInvoiceLine must belong to the same Product.
CREATE FUNCTION public.fn_purchase_invoice_line_product_unit_match_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    JOIN public.product_units pu ON pu.id = NEW.product_unit_id
    WHERE pv.id = NEW.variant_id
      AND pv.product_id = pu.product_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_purchase_invoice_lines__product_unit_match_at_commit',
      MESSAGE = 'ct_purchase_invoice_lines__product_unit_match_at_commit: Variant and ProductUnit must belong to the same Product';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_purchase_invoice_lines__product_unit_match_at_commit
AFTER INSERT OR UPDATE ON public.purchase_invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_invoice_line_product_unit_match_at_commit();

-- A linked PurchaseReturn line must belong to the Return Branch/source PurchaseInvoice context.
-- Its Variant must be the same Variant as the source PurchaseInvoiceLine.
CREATE FUNCTION public.fn_purchase_return_source_match_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_purchase_invoice_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.purchase_returns pr
    JOIN public.purchase_invoice_lines pil ON pil.id = NEW.source_purchase_invoice_line_id
    JOIN public.purchase_invoices pi ON pi.id = pil.purchase_invoice_id
    WHERE pr.id = NEW.purchase_return_id
      AND pi.branch_id = pr.branch_id
      AND (pr.source_purchase_invoice_id IS NULL OR pr.source_purchase_invoice_id = pil.purchase_invoice_id)
      AND pil.variant_id = NEW.variant_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_purchase_return_lines__source_match_at_commit',
      MESSAGE = 'ct_purchase_return_lines__source_match_at_commit: source PurchaseInvoiceLine must match Return Branch/source Invoice/Variant context';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_purchase_return_lines__source_match_at_commit
AFTER INSERT OR UPDATE ON public.purchase_return_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_return_source_match_at_commit();

-- Preserve source hierarchy if a Return header or original PurchaseInvoiceLine is changed later.
CREATE FUNCTION public.fn_purchase_return_source_preserve_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_id uuid;
BEGIN
  affected_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF TG_TABLE_NAME = 'purchase_returns' THEN
    IF EXISTS (
      SELECT 1
      FROM public.purchase_return_lines prl
      JOIN public.purchase_invoice_lines pil ON pil.id = prl.source_purchase_invoice_line_id
      JOIN public.purchase_invoices pi ON pi.id = pil.purchase_invoice_id
      JOIN public.purchase_returns pr ON pr.id = prl.purchase_return_id
      WHERE prl.purchase_return_id = affected_id
        AND (
          pi.branch_id <> pr.branch_id
          OR (pr.source_purchase_invoice_id IS NOT NULL AND pr.source_purchase_invoice_id <> pil.purchase_invoice_id)
          OR pil.variant_id <> prl.variant_id
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_purchase_returns__preserve_source_hierarchy_at_commit',
        MESSAGE = 'ct_purchase_returns__preserve_source_hierarchy_at_commit: linked source lines must remain in Return Branch/source Invoice/Variant context';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.purchase_return_lines prl
      JOIN public.purchase_returns pr ON pr.id = prl.purchase_return_id
      JOIN public.purchase_invoice_lines pil ON pil.id = prl.source_purchase_invoice_line_id
      JOIN public.purchase_invoices pi ON pi.id = pil.purchase_invoice_id
      WHERE prl.source_purchase_invoice_line_id = affected_id
        AND (
          pi.branch_id <> pr.branch_id
          OR (pr.source_purchase_invoice_id IS NOT NULL AND pr.source_purchase_invoice_id <> pil.purchase_invoice_id)
          OR pil.variant_id <> prl.variant_id
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_purchase_invoice_lines__preserve_return_source_at_commit',
        MESSAGE = 'ct_purchase_invoice_lines__preserve_return_source_at_commit: source line must remain in Return Branch/source Invoice/Variant context';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_purchase_returns__preserve_source_hierarchy_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_returns
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_return_source_preserve_at_commit();

CREATE CONSTRAINT TRIGGER ct_purchase_invoice_lines__preserve_return_source_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_purchase_return_source_preserve_at_commit();
