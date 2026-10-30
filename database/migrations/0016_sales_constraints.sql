-- Phase 03.06 Sales constraints only.
-- Independent query/search/performance and partial indexes remain deferred to Phase 03.07.
-- Purchasing/Tax-owned tax_codes target constraints remain deferred to the Purchasing/Tax constraint slice.

-- Canonical identities / 1:1 and link-table grains.
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT pk_sales_quotes PRIMARY KEY (id);

ALTER TABLE public.sales_quote_lines
  ADD CONSTRAINT pk_sales_quote_lines PRIMARY KEY (id);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT pk_sales_orders PRIMARY KEY (id);

ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT pk_sales_order_lines PRIMARY KEY (id);

ALTER TABLE public.sales_order_status_history
  ADD CONSTRAINT pk_sales_order_status_history PRIMARY KEY (id);

ALTER TABLE public.sales_order_shipping_details
  ADD CONSTRAINT pk_sales_order_shipping_details PRIMARY KEY (sales_order_id);

ALTER TABLE public.sales_order_deliveries
  ADD CONSTRAINT pk_sales_order_deliveries PRIMARY KEY (id);

ALTER TABLE public.sales_order_delivery_lines
  ADD CONSTRAINT pk_sales_order_delivery_lines PRIMARY KEY (delivery_id, sales_order_line_id);

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT pk_sales_invoices PRIMARY KEY (id);

ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT pk_sales_invoice_lines PRIMARY KEY (id);

ALTER TABLE public.sales_returns
  ADD CONSTRAINT pk_sales_returns PRIMARY KEY (id);

ALTER TABLE public.sales_return_lines
  ADD CONSTRAINT pk_sales_return_lines PRIMARY KEY (id);

-- Mandatory business-document uniqueness from Architecture v1.7 §28.5.
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT uq_sales_quotes__branch_document UNIQUE (branch_id, document_number),
  ADD CONSTRAINT uq_sales_quotes__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.sales_orders
  ADD CONSTRAINT uq_sales_orders__branch_document UNIQUE (branch_id, document_number),
  ADD CONSTRAINT uq_sales_orders__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT uq_sales_invoices__branch_document UNIQUE (branch_id, document_number),
  ADD CONSTRAINT uq_sales_invoices__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.sales_returns
  ADD CONSTRAINT uq_sales_returns__branch_document UNIQUE (branch_id, document_number);

-- Historical/master references default to RESTRICT. Composite FKs protect Branch context.
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT fk_sales_quotes__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_quotes__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_quotes__price_list
    FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_quotes__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_quote_lines
  ADD CONSTRAINT fk_sales_quote_lines__quote
    FOREIGN KEY (quote_id) REFERENCES public.sales_quotes(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_quote_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_quote_lines__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_orders
  ADD CONSTRAINT fk_sales_orders__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__price_list
    FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__sales_user
    FOREIGN KEY (sales_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__customer_service_user
    FOREIGN KEY (customer_service_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_orders__source_quote_branch
    FOREIGN KEY (source_quote_id, branch_id) REFERENCES public.sales_quotes(id, branch_id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT fk_sales_order_lines__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_order_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_order_lines__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_status_history
  ADD CONSTRAINT fk_sales_order_status_history__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_order_status_history__changed_by
    FOREIGN KEY (changed_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_shipping_details
  ADD CONSTRAINT fk_sales_order_shipping_details__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_deliveries
  ADD CONSTRAINT fk_sales_order_deliveries__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_order_deliveries__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_order_delivery_lines
  ADD CONSTRAINT fk_sales_order_delivery_lines__delivery
    FOREIGN KEY (delivery_id) REFERENCES public.sales_order_deliveries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_order_delivery_lines__sales_order_line
    FOREIGN KEY (sales_order_line_id) REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT fk_sales_invoices__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__price_list
    FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__source_sales_order_branch
    FOREIGN KEY (source_sales_order_id, branch_id) REFERENCES public.sales_orders(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__source_delivery
    FOREIGN KEY (source_delivery_id) REFERENCES public.sales_order_deliveries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__seller_user
    FOREIGN KEY (seller_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoices__deleted_by
    FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT fk_sales_invoice_lines__invoice
    FOREIGN KEY (invoice_id) REFERENCES public.sales_invoices(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoice_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_invoice_lines__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_returns
  ADD CONSTRAINT fk_sales_returns__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_returns__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_returns__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_returns__source_invoice_branch
    FOREIGN KEY (source_invoice_id, branch_id) REFERENCES public.sales_invoices(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_returns__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_returns__deleted_by
    FOREIGN KEY (deleted_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.sales_return_lines
  ADD CONSTRAINT fk_sales_return_lines__sales_return
    FOREIGN KEY (sales_return_id) REFERENCES public.sales_returns(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_return_lines__source_invoice_line
    FOREIGN KEY (source_invoice_line_id) REFERENCES public.sales_invoice_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_return_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_sales_return_lines__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE RESTRICT;

-- Close the Sales-owned references that Inventory migration 0015 intentionally deferred.
ALTER TABLE public.stock_reservations
  ADD CONSTRAINT fk_stock_reservations__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_reservations__sales_order_line
    FOREIGN KEY (sales_order_line_id) REFERENCES public.sales_order_lines(id) ON DELETE RESTRICT;

-- Explicit closed-domain rule from Architecture v1.7.
ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT ck_sales_invoice_lines__price_source
    CHECK (price_source IN ('PRICE_LIST', 'MANUAL'));

-- Numeric integrity. Sales/Returns use positive line quantities; signed effects belong to ledgers/movements.
ALTER TABLE public.sales_quotes
  ADD CONSTRAINT ck_sales_quotes__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_sales_quotes__totals_nonnegative CHECK (
    subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0
  );

ALTER TABLE public.sales_quote_lines
  ADD CONSTRAINT ck_sales_quote_lines__quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ck_sales_quote_lines__amounts_nonnegative CHECK (
    unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0
    AND (tax_rate_snapshot IS NULL OR tax_rate_snapshot >= 0)
  );

ALTER TABLE public.sales_orders
  ADD CONSTRAINT ck_sales_orders__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_sales_orders__version_nonnegative CHECK (version >= 0);

ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT ck_sales_order_lines__quantity_positive CHECK (ordered_quantity > 0),
  ADD CONSTRAINT ck_sales_order_lines__amounts_nonnegative CHECK (
    unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0
  );

ALTER TABLE public.sales_order_shipping_details
  ADD CONSTRAINT ck_sales_order_shipping_details__shipping_cost_nonnegative
    CHECK (shipping_cost IS NULL OR shipping_cost >= 0);

ALTER TABLE public.sales_order_delivery_lines
  ADD CONSTRAINT ck_sales_order_delivery_lines__quantity_positive CHECK (quantity > 0);

ALTER TABLE public.sales_invoices
  ADD CONSTRAINT ck_sales_invoices__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_sales_invoices__document_version_positive CHECK (document_version > 0),
  ADD CONSTRAINT ck_sales_invoices__totals_nonnegative CHECK (
    subtotal >= 0 AND discount_total >= 0 AND tax_total >= 0 AND grand_total >= 0
    AND paid_total >= 0 AND due_total >= 0
  ),
  ADD CONSTRAINT ck_sales_invoices__due_requires_counterparty CHECK (
    due_total = 0 OR counterparty_id IS NOT NULL
  );

ALTER TABLE public.sales_invoice_lines
  ADD CONSTRAINT ck_sales_invoice_lines__quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ck_sales_invoice_lines__amounts_nonnegative CHECK (
    unit_price >= 0 AND discount_amount >= 0 AND tax_amount >= 0 AND line_total >= 0
    AND (tax_rate_snapshot IS NULL OR tax_rate_snapshot >= 0)
    AND (unit_cogs_snapshot IS NULL OR unit_cogs_snapshot >= 0)
    AND (cogs_total IS NULL OR cogs_total >= 0)
  );

ALTER TABLE public.sales_returns
  ADD CONSTRAINT ck_sales_returns__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_sales_returns__document_version_positive CHECK (document_version > 0),
  ADD CONSTRAINT ck_sales_returns__totals_nonnegative CHECK (
    subtotal >= 0 AND tax_total >= 0 AND grand_total >= 0
  );

ALTER TABLE public.sales_return_lines
  ADD CONSTRAINT ck_sales_return_lines__quantity_positive CHECK (quantity > 0),
  ADD CONSTRAINT ck_sales_return_lines__amounts_nonnegative CHECK (
    unit_price >= 0 AND discount_amount >= 0 AND line_total >= 0
    AND (historical_unit_cost IS NULL OR historical_unit_cost >= 0)
  );

-- Every Variant + ProductUnit pair used by a Sales line must belong to the same Product.
CREATE FUNCTION public.fn_sales_line_product_unit_match_at_commit()
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
      CONSTRAINT = TG_NAME,
      MESSAGE = TG_NAME || ': Variant and ProductUnit must belong to the same Product';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_quote_lines__product_unit_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_quote_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_line_product_unit_match_at_commit();

CREATE CONSTRAINT TRIGGER ct_sales_order_lines__product_unit_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_order_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_line_product_unit_match_at_commit();

CREATE CONSTRAINT TRIGGER ct_sales_invoice_lines__product_unit_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_line_product_unit_match_at_commit();

CREATE CONSTRAINT TRIGGER ct_sales_return_lines__product_unit_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_return_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_line_product_unit_match_at_commit();

-- A Delivery line must belong to the same SalesOrder as its Delivery.
CREATE FUNCTION public.fn_sales_delivery_line_source_match_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_order_deliveries d
    JOIN public.sales_order_lines l ON l.id = NEW.sales_order_line_id
    WHERE d.id = NEW.delivery_id
      AND d.sales_order_id = l.sales_order_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_sales_order_delivery_lines__source_match_at_commit',
      MESSAGE = 'ct_sales_order_delivery_lines__source_match_at_commit: Delivery line must belong to the Delivery SalesOrder';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_order_delivery_lines__source_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_order_delivery_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_delivery_line_source_match_at_commit();

-- Preserve Delivery hierarchy and invoices sourced from a Delivery if either parent row changes.
CREATE FUNCTION public.fn_sales_delivery_hierarchy_preserve_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_id uuid;
BEGIN
  affected_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF TG_TABLE_NAME = 'sales_order_deliveries' THEN
    IF EXISTS (
      SELECT 1
      FROM public.sales_order_delivery_lines dl
      JOIN public.sales_order_lines l ON l.id = dl.sales_order_line_id
      JOIN public.sales_order_deliveries d ON d.id = dl.delivery_id
      WHERE dl.delivery_id = affected_id
        AND d.sales_order_id <> l.sales_order_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_sales_order_deliveries__preserve_hierarchy_at_commit',
        MESSAGE = 'ct_sales_order_deliveries__preserve_hierarchy_at_commit: Delivery lines must remain within the Delivery SalesOrder';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM public.sales_invoices si
      JOIN public.sales_order_deliveries d ON d.id = si.source_delivery_id
      JOIN public.sales_orders so ON so.id = d.sales_order_id
      WHERE si.source_delivery_id = affected_id
        AND (
          si.branch_id <> so.branch_id
          OR (si.source_sales_order_id IS NOT NULL AND si.source_sales_order_id <> d.sales_order_id)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_sales_order_deliveries__preserve_hierarchy_at_commit',
        MESSAGE = 'ct_sales_order_deliveries__preserve_hierarchy_at_commit: sourced Invoice must remain in the Delivery SalesOrder/Branch context';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.sales_order_delivery_lines dl
      JOIN public.sales_order_deliveries d ON d.id = dl.delivery_id
      JOIN public.sales_order_lines l ON l.id = dl.sales_order_line_id
      WHERE dl.sales_order_line_id = affected_id
        AND d.sales_order_id <> l.sales_order_id
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_sales_order_lines__preserve_delivery_hierarchy_at_commit',
        MESSAGE = 'ct_sales_order_lines__preserve_delivery_hierarchy_at_commit: Delivery lines must remain within the Delivery SalesOrder';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_order_deliveries__preserve_hierarchy_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_deliveries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_delivery_hierarchy_preserve_at_commit();

CREATE CONSTRAINT TRIGGER ct_sales_order_lines__preserve_delivery_hierarchy_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_delivery_hierarchy_preserve_at_commit();

-- Invoice source Delivery must belong to the same Branch, and to source_sales_order_id when supplied.
CREATE FUNCTION public.fn_sales_invoice_source_match_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_delivery_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales_order_deliveries d
    JOIN public.sales_orders so ON so.id = d.sales_order_id
    WHERE d.id = NEW.source_delivery_id
      AND so.branch_id = NEW.branch_id
      AND (NEW.source_sales_order_id IS NULL OR NEW.source_sales_order_id = d.sales_order_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_sales_invoices__source_match_at_commit',
      MESSAGE = 'ct_sales_invoices__source_match_at_commit: source Delivery must match Invoice Branch and source SalesOrder when supplied';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_invoices__source_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_invoices
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_invoice_source_match_at_commit();

-- A Return line linked to an original Invoice line must remain in the Return Branch and,
-- when the Return header has a source_invoice_id, under that exact source Invoice.
CREATE FUNCTION public.fn_sales_return_source_match_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_invoice_line_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.sales_returns sr
    JOIN public.sales_invoice_lines sil ON sil.id = NEW.source_invoice_line_id
    JOIN public.sales_invoices si ON si.id = sil.invoice_id
    WHERE sr.id = NEW.sales_return_id
      AND si.branch_id = sr.branch_id
      AND (sr.source_invoice_id IS NULL OR sr.source_invoice_id = sil.invoice_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_sales_return_lines__source_match_at_commit',
      MESSAGE = 'ct_sales_return_lines__source_match_at_commit: source Invoice line must match Return Branch/source Invoice context';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_return_lines__source_match_at_commit
AFTER INSERT OR UPDATE ON public.sales_return_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_return_source_match_at_commit();

CREATE FUNCTION public.fn_sales_return_source_preserve_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_id uuid;
BEGIN
  affected_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF TG_TABLE_NAME = 'sales_returns' THEN
    IF EXISTS (
      SELECT 1
      FROM public.sales_return_lines srl
      JOIN public.sales_invoice_lines sil ON sil.id = srl.source_invoice_line_id
      JOIN public.sales_invoices si ON si.id = sil.invoice_id
      JOIN public.sales_returns sr ON sr.id = srl.sales_return_id
      WHERE srl.sales_return_id = affected_id
        AND (
          si.branch_id <> sr.branch_id
          OR (sr.source_invoice_id IS NOT NULL AND sr.source_invoice_id <> sil.invoice_id)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_sales_returns__preserve_source_hierarchy_at_commit',
        MESSAGE = 'ct_sales_returns__preserve_source_hierarchy_at_commit: linked source lines must remain in Return Branch/source Invoice context';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
      FROM public.sales_return_lines srl
      JOIN public.sales_returns sr ON sr.id = srl.sales_return_id
      JOIN public.sales_invoice_lines sil ON sil.id = srl.source_invoice_line_id
      JOIN public.sales_invoices si ON si.id = sil.invoice_id
      WHERE srl.source_invoice_line_id = affected_id
        AND (
          si.branch_id <> sr.branch_id
          OR (sr.source_invoice_id IS NOT NULL AND sr.source_invoice_id <> sil.invoice_id)
        )
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_sales_invoice_lines__preserve_return_source_at_commit',
        MESSAGE = 'ct_sales_invoice_lines__preserve_return_source_at_commit: source line must remain in Return Branch/source Invoice context';
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_returns__preserve_source_hierarchy_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_returns
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_return_source_preserve_at_commit();

CREATE CONSTRAINT TRIGGER ct_sales_invoice_lines__preserve_return_source_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.sales_invoice_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_return_source_preserve_at_commit();

-- Reservation context: the referenced line must belong to the referenced order and Variant.
-- Active reservations must also use the order's current Warehouse; released/consumed rows remain historical.
CREATE FUNCTION public.fn_stock_reservations_sales_context_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.sales_orders so
    JOIN public.sales_order_lines sol ON sol.sales_order_id = so.id
    WHERE so.id = NEW.sales_order_id
      AND sol.id = NEW.sales_order_line_id
      AND sol.variant_id = NEW.variant_id
      AND (
        NEW.status NOT IN ('ACTIVE', 'PARTIALLY_CONSUMED')
        OR so.warehouse_id = NEW.warehouse_id
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_stock_reservations__sales_context_at_commit',
      MESSAGE = 'ct_stock_reservations__sales_context_at_commit: Reservation must match SalesOrder line/Variant and active Warehouse context';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_stock_reservations__sales_context_at_commit
AFTER INSERT OR UPDATE ON public.stock_reservations
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_stock_reservations_sales_context_at_commit();

CREATE FUNCTION public.fn_sales_orders_preserve_reservation_context_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_reservations r
    WHERE r.sales_order_id = NEW.id
      AND r.status IN ('ACTIVE', 'PARTIALLY_CONSUMED')
      AND r.warehouse_id <> NEW.warehouse_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_sales_orders__preserve_reservation_context_at_commit',
      MESSAGE = 'ct_sales_orders__preserve_reservation_context_at_commit: release/replace active reservations before changing SalesOrder Warehouse';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_orders__preserve_reservation_context_at_commit
AFTER UPDATE ON public.sales_orders
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_orders_preserve_reservation_context_at_commit();

CREATE FUNCTION public.fn_sales_order_lines_preserve_reservation_context_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.stock_reservations r
    WHERE r.sales_order_line_id = NEW.id
      AND (r.sales_order_id <> NEW.sales_order_id OR r.variant_id <> NEW.variant_id)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_sales_order_lines__preserve_reservation_context_at_commit',
      MESSAGE = 'ct_sales_order_lines__preserve_reservation_context_at_commit: Reservation must remain attached to the same SalesOrder line/Variant';
  END IF;
  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_sales_order_lines__preserve_reservation_context_at_commit
AFTER UPDATE ON public.sales_order_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_sales_order_lines_preserve_reservation_context_at_commit();
