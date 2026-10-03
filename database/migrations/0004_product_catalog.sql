CREATE TABLE product_categories (
  id uuid NOT NULL,
  name text NOT NULL,
  parent_id uuid,
  is_active boolean NOT NULL
);

CREATE TABLE products (
  id uuid NOT NULL,
  name text NOT NULL,
  category_id uuid NOT NULL,
  product_type text NOT NULL,
  base_unit_id uuid NOT NULL,
  tracking_serial boolean NOT NULL,
  tracking_batch boolean NOT NULL,
  tracking_expiry boolean NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE product_variants (
  id uuid NOT NULL,
  product_id uuid NOT NULL,
  name text NOT NULL,
  sku text,
  is_default boolean NOT NULL,
  combination_signature text NOT NULL,
  minimum_selling_price numeric(18,4),
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE units (
  id uuid NOT NULL,
  name text NOT NULL,
  symbol text NOT NULL,
  allows_fraction boolean NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE product_units (
  id uuid NOT NULL,
  product_id uuid NOT NULL,
  unit_id uuid NOT NULL,
  conversion_to_base numeric(18,6) NOT NULL,
  is_sellable boolean NOT NULL,
  is_purchasable boolean NOT NULL
);

CREATE TABLE variant_barcodes (
  id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  barcode text NOT NULL,
  is_primary boolean NOT NULL
);

CREATE TABLE attributes (
  id uuid NOT NULL,
  name text NOT NULL,
  attribute_type text NOT NULL,
  usage_type text NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE attribute_values (
  id uuid NOT NULL,
  attribute_id uuid NOT NULL,
  value text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE product_attributes (
  product_id uuid NOT NULL,
  attribute_id uuid NOT NULL
);

CREATE TABLE variant_attribute_values (
  variant_id uuid NOT NULL,
  attribute_value_id uuid NOT NULL
);

CREATE TABLE price_lists (
  id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE price_list_items (
  price_list_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  price numeric(18,4) NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE reorder_levels (
  variant_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  minimum_quantity numeric(18,6) NOT NULL
);
