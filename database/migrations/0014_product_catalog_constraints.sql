-- Phase 03.06 Product Catalog constraints only.
-- Independent query/search/performance indexes remain deferred to Phase 03.07.

ALTER TABLE public.product_categories
  ADD CONSTRAINT pk_product_categories PRIMARY KEY (id);

ALTER TABLE public.products
  ADD CONSTRAINT pk_products PRIMARY KEY (id);

ALTER TABLE public.product_variants
  ADD CONSTRAINT pk_product_variants PRIMARY KEY (id);

ALTER TABLE public.units
  ADD CONSTRAINT pk_units PRIMARY KEY (id);

ALTER TABLE public.product_units
  ADD CONSTRAINT pk_product_units PRIMARY KEY (id);

ALTER TABLE public.variant_barcodes
  ADD CONSTRAINT pk_variant_barcodes PRIMARY KEY (id);

ALTER TABLE public.attributes
  ADD CONSTRAINT pk_attributes PRIMARY KEY (id);

ALTER TABLE public.attribute_values
  ADD CONSTRAINT pk_attribute_values PRIMARY KEY (id);

ALTER TABLE public.price_lists
  ADD CONSTRAINT pk_price_lists PRIMARY KEY (id);

ALTER TABLE public.product_attributes
  ADD CONSTRAINT pk_product_attributes PRIMARY KEY (product_id, attribute_id);

ALTER TABLE public.variant_attribute_values
  ADD CONSTRAINT pk_variant_attribute_values PRIMARY KEY (variant_id, attribute_value_id);

ALTER TABLE public.price_list_items
  ADD CONSTRAINT pk_price_list_items PRIMARY KEY (price_list_id, variant_id, product_unit_id);

ALTER TABLE public.reorder_levels
  ADD CONSTRAINT pk_reorder_levels PRIMARY KEY (variant_id, warehouse_id);

ALTER TABLE public.product_variants
  ADD CONSTRAINT uq_product_variants__product_combination UNIQUE (product_id, combination_signature);

ALTER TABLE public.units
  ADD CONSTRAINT uq_units__name UNIQUE (name);

ALTER TABLE public.product_units
  ADD CONSTRAINT uq_product_units__product_unit UNIQUE (product_id, unit_id);

ALTER TABLE public.variant_barcodes
  ADD CONSTRAINT uq_variant_barcodes__barcode UNIQUE (barcode);

ALTER TABLE public.attribute_values
  ADD CONSTRAINT uq_attribute_values__attribute_value UNIQUE (attribute_id, value);

ALTER TABLE public.product_categories
  ADD CONSTRAINT fk_product_categories__parent
    FOREIGN KEY (parent_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.products
  ADD CONSTRAINT fk_products__category
    FOREIGN KEY (category_id) REFERENCES public.product_categories(id) ON DELETE RESTRICT;

ALTER TABLE public.product_variants
  ADD CONSTRAINT fk_product_variants__product
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT;

ALTER TABLE public.product_units
  ADD CONSTRAINT fk_product_units__product
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_product_units__unit
    FOREIGN KEY (unit_id) REFERENCES public.units(id) ON DELETE RESTRICT;

-- The Product -> Base ProductUnit edge is deferred so Product + Base Unit can be created atomically.
ALTER TABLE public.products
  ADD CONSTRAINT fk_products__base_unit
    FOREIGN KEY (base_unit_id) REFERENCES public.product_units(id)
    DEFERRABLE INITIALLY DEFERRED;

ALTER TABLE public.variant_barcodes
  ADD CONSTRAINT fk_variant_barcodes__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_variant_barcodes__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE CASCADE;

ALTER TABLE public.attribute_values
  ADD CONSTRAINT fk_attribute_values__attribute
    FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE;

ALTER TABLE public.product_attributes
  ADD CONSTRAINT fk_product_attributes__product
    FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_product_attributes__attribute
    FOREIGN KEY (attribute_id) REFERENCES public.attributes(id) ON DELETE CASCADE;

ALTER TABLE public.variant_attribute_values
  ADD CONSTRAINT fk_variant_attribute_values__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_variant_attribute_values__attribute_value
    FOREIGN KEY (attribute_value_id) REFERENCES public.attribute_values(id) ON DELETE CASCADE;

ALTER TABLE public.price_list_items
  ADD CONSTRAINT fk_price_list_items__price_list
    FOREIGN KEY (price_list_id) REFERENCES public.price_lists(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_price_list_items__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_price_list_items__product_unit
    FOREIGN KEY (product_unit_id) REFERENCES public.product_units(id) ON DELETE CASCADE;

ALTER TABLE public.reorder_levels
  ADD CONSTRAINT fk_reorder_levels__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_reorder_levels__warehouse
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE CASCADE;

-- Optional default Price List references become enforceable only after price_lists has its PK.
ALTER TABLE public.branch_settings
  ADD CONSTRAINT fk_branch_settings__default_price_list
    FOREIGN KEY (default_price_list_id) REFERENCES public.price_lists(id) ON DELETE SET NULL;

ALTER TABLE public.customer_profiles
  ADD CONSTRAINT fk_customer_profiles__default_price_list
    FOREIGN KEY (default_price_list_id) REFERENCES public.price_lists(id) ON DELETE SET NULL;

ALTER TABLE public.products
  ADD CONSTRAINT ck_products__product_type CHECK (product_type IN ('STOCK', 'SERVICE')),
  ADD CONSTRAINT ck_products__tracking_policy CHECK (
    NOT (tracking_serial AND tracking_batch)
    AND (NOT tracking_expiry OR tracking_batch)
  );

ALTER TABLE public.product_variants
  ADD CONSTRAINT ck_product_variants__minimum_selling_price
    CHECK (minimum_selling_price IS NULL OR minimum_selling_price >= 0);

ALTER TABLE public.product_units
  ADD CONSTRAINT ck_product_units__conversion_to_base CHECK (conversion_to_base > 0);

ALTER TABLE public.attributes
  ADD CONSTRAINT ck_attributes__usage_type CHECK (usage_type IN ('VARIANT', 'DESCRIPTIVE'));

ALTER TABLE public.attribute_values
  ADD CONSTRAINT ck_attribute_values__sort_order CHECK (sort_order >= 0);

ALTER TABLE public.price_list_items
  ADD CONSTRAINT ck_price_list_items__price CHECK (price >= 0);

ALTER TABLE public.reorder_levels
  ADD CONSTRAINT ck_reorder_levels__minimum_quantity CHECK (minimum_quantity >= 0);

CREATE FUNCTION public.fn_products_catalog_integrity_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.product_units pu
    WHERE pu.id = NEW.base_unit_id
      AND pu.product_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_products__catalog_integrity_at_commit',
      MESSAGE = 'ct_products__catalog_integrity_at_commit: base_unit_id must reference a ProductUnit owned by the same Product';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.product_id = NEW.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_products__catalog_integrity_at_commit',
      MESSAGE = 'ct_products__catalog_integrity_at_commit: every Product must retain at least one Variant';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_products__catalog_integrity_at_commit
AFTER INSERT OR UPDATE ON public.products
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_products_catalog_integrity_at_commit();

CREATE FUNCTION public.fn_product_units_preserve_catalog_integrity_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  affected_id uuid;
BEGIN
  affected_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;

  IF EXISTS (
    SELECT 1
    FROM public.products p
    JOIN public.product_units pu ON pu.id = p.base_unit_id
    WHERE p.base_unit_id = affected_id
      AND pu.product_id <> p.id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_product_units__preserve_catalog_integrity_at_commit',
      MESSAGE = 'ct_product_units__preserve_catalog_integrity_at_commit: a Base ProductUnit must remain owned by its Product';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.variant_barcodes vb
    JOIN public.product_variants pv ON pv.id = vb.variant_id
    JOIN public.product_units pu ON pu.id = vb.product_unit_id
    WHERE vb.product_unit_id = affected_id
      AND pv.product_id <> pu.product_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_product_units__preserve_catalog_integrity_at_commit',
      MESSAGE = 'ct_product_units__preserve_catalog_integrity_at_commit: Barcode Variant and ProductUnit must belong to the same Product';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_product_units__preserve_catalog_integrity_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.product_units
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_product_units_preserve_catalog_integrity_at_commit();

CREATE FUNCTION public.fn_variant_barcodes_product_match_at_commit()
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
      CONSTRAINT = 'ct_variant_barcodes__product_match_at_commit',
      MESSAGE = 'ct_variant_barcodes__product_match_at_commit: Barcode Variant and ProductUnit must belong to the same Product';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_variant_barcodes__product_match_at_commit
AFTER INSERT OR UPDATE ON public.variant_barcodes
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_variant_barcodes_product_match_at_commit();

CREATE FUNCTION public.fn_product_variants_preserve_catalog_integrity_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  old_product_id uuid;
  new_product_id uuid;
BEGIN
  old_product_id := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.product_id END;
  new_product_id := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.product_id END;

  IF old_product_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.products p WHERE p.id = old_product_id)
     AND NOT EXISTS (SELECT 1 FROM public.product_variants pv WHERE pv.product_id = old_product_id) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_product_variants__preserve_catalog_integrity_at_commit',
      MESSAGE = 'ct_product_variants__preserve_catalog_integrity_at_commit: every Product must retain at least one Variant';
  END IF;

  IF new_product_id IS NOT NULL AND EXISTS (
    SELECT 1
    FROM public.variant_barcodes vb
    JOIN public.product_units pu ON pu.id = vb.product_unit_id
    WHERE vb.variant_id = NEW.id
      AND pu.product_id <> new_product_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_product_variants__preserve_catalog_integrity_at_commit',
      MESSAGE = 'ct_product_variants__preserve_catalog_integrity_at_commit: Barcode Variant and ProductUnit must belong to the same Product';
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_product_variants__preserve_catalog_integrity_at_commit
AFTER INSERT OR UPDATE OR DELETE ON public.product_variants
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.fn_product_variants_preserve_catalog_integrity_at_commit();
