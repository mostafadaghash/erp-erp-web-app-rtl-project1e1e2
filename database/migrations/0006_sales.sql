CREATE TABLE sales_quotes (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  counterparty_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  status text NOT NULL,
  valid_until date NOT NULL,
  subtotal numeric(18,4) NOT NULL,
  discount_total numeric(18,4) NOT NULL,
  tax_total numeric(18,4) NOT NULL,
  grand_total numeric(18,4) NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE sales_quote_lines (
  id uuid NOT NULL,
  quote_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  discount_amount numeric(18,4) NOT NULL,
  tax_code_id uuid,
  tax_rate_snapshot numeric(18,4),
  line_total numeric(18,4) NOT NULL
);

CREATE TABLE sales_orders (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  counterparty_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  status text NOT NULL,
  delivery_method text NOT NULL,
  sales_user_id uuid,
  customer_service_user_id uuid NOT NULL,
  customer_notes text,
  internal_notes text,
  source_quote_id uuid,
  version integer NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE sales_order_lines (
  id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  ordered_quantity numeric(18,6) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  discount_amount numeric(18,4) NOT NULL,
  tax_code_id uuid,
  line_total numeric(18,4) NOT NULL
);

CREATE TABLE sales_order_status_history (
  id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL
);

CREATE TABLE sales_order_shipping_details (
  sales_order_id uuid NOT NULL,
  shipping_company text,
  tracking_number text,
  shipping_cost numeric(18,4),
  shipping_address text,
  recipient_name text,
  recipient_phone text
);

CREATE TABLE sales_order_deliveries (
  id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  delivery_type text NOT NULL,
  status text NOT NULL,
  delivered_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE sales_order_delivery_lines (
  delivery_id uuid NOT NULL,
  sales_order_line_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL
);

CREATE TABLE sales_invoices (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  document_date date NOT NULL,
  document_version integer NOT NULL,
  counterparty_id uuid,
  warehouse_id uuid NOT NULL,
  price_list_id uuid NOT NULL,
  source_sales_order_id uuid,
  source_delivery_id uuid,
  subtotal numeric(18,4) NOT NULL,
  discount_total numeric(18,4) NOT NULL,
  tax_total numeric(18,4) NOT NULL,
  grand_total numeric(18,4) NOT NULL,
  paid_total numeric(18,4) NOT NULL,
  due_total numeric(18,4) NOT NULL,
  payment_status text NOT NULL,
  seller_user_id uuid,
  customer_notes text,
  internal_notes text,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

CREATE TABLE sales_invoice_lines (
  id uuid NOT NULL,
  invoice_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  price_source text NOT NULL,
  discount_amount numeric(18,4) NOT NULL,
  tax_code_id uuid,
  tax_rate_snapshot numeric(18,4),
  tax_amount numeric(18,4) NOT NULL,
  line_total numeric(18,4) NOT NULL,
  unit_cogs_snapshot numeric(18,4),
  cogs_total numeric(18,4)
);

CREATE TABLE sales_returns (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  document_date date NOT NULL,
  document_version integer NOT NULL,
  counterparty_id uuid,
  warehouse_id uuid NOT NULL,
  source_invoice_id uuid,
  subtotal numeric(18,4) NOT NULL,
  tax_total numeric(18,4) NOT NULL,
  grand_total numeric(18,4) NOT NULL,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

CREATE TABLE sales_return_lines (
  id uuid NOT NULL,
  sales_return_id uuid NOT NULL,
  source_invoice_line_id uuid,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  unit_price numeric(18,4) NOT NULL,
  discount_amount numeric(18,4) NOT NULL,
  tax_code_id uuid,
  historical_unit_cost numeric(18,4),
  line_total numeric(18,4) NOT NULL
);

CREATE VIEW sales_returnable_quantities_v AS
SELECT
  sil.id AS source_invoice_line_id,
  sil.quantity::numeric(18,6) AS sold_quantity,
  COALESCE(
    SUM(
      CASE
        WHEN sr.posted_at IS NOT NULL AND sr.deleted_at IS NULL THEN srl.quantity
        ELSE 0::numeric
      END
    ),
    0::numeric
  )::numeric(18,6) AS posted_returned_quantity,
  (
    sil.quantity - COALESCE(
      SUM(
        CASE
          WHEN sr.posted_at IS NOT NULL AND sr.deleted_at IS NULL THEN srl.quantity
          ELSE 0::numeric
        END
      ),
      0::numeric
    )
  )::numeric(18,6) AS returnable_quantity
FROM sales_invoice_lines AS sil
LEFT JOIN sales_return_lines AS srl
  ON srl.source_invoice_line_id = sil.id
LEFT JOIN sales_returns AS sr
  ON sr.id = srl.sales_return_id
GROUP BY sil.id, sil.quantity;
