CREATE TABLE purchase_invoices (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  document_date date NOT NULL,
  document_version integer NOT NULL,
  counterparty_id uuid,
  warehouse_id uuid NOT NULL,
  subtotal numeric(18,4) NOT NULL,
  discount_total numeric(18,4) NOT NULL,
  additional_cost numeric(18,4) NOT NULL,
  tax_total numeric(18,4) NOT NULL,
  grand_total numeric(18,4) NOT NULL,
  paid_total numeric(18,4) NOT NULL,
  due_total numeric(18,4) NOT NULL,
  payment_status text NOT NULL,
  notes text,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

CREATE TABLE purchase_invoice_lines (
  id uuid NOT NULL,
  purchase_invoice_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  product_unit_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  purchase_unit_price numeric(18,4) NOT NULL,
  discount_amount numeric(18,4) NOT NULL,
  net_before_tax numeric(18,4) NOT NULL,
  landed_cost_allocation numeric(18,4) NOT NULL,
  landed_unit_cost numeric(18,4),
  tax_code_id uuid,
  tax_amount numeric(18,4) NOT NULL,
  line_total numeric(18,4) NOT NULL
);

CREATE TABLE purchase_returns (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  document_date date NOT NULL,
  document_version integer NOT NULL,
  counterparty_id uuid,
  warehouse_id uuid NOT NULL,
  source_purchase_invoice_id uuid,
  total numeric(18,4) NOT NULL,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  deleted_at timestamptz,
  deleted_by uuid,
  delete_reason text
);

CREATE TABLE purchase_return_lines (
  id uuid NOT NULL,
  purchase_return_id uuid NOT NULL,
  source_purchase_invoice_line_id uuid,
  variant_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  commercial_unit_value_snapshot numeric(18,4) NOT NULL,
  inventory_unit_cost_snapshot numeric(18,4),
  cost_variance numeric(18,4),
  tax_amount numeric(18,4) NOT NULL,
  line_total numeric(18,4) NOT NULL
);

CREATE TABLE tax_codes (
  id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  rate numeric(18,4) NOT NULL,
  tax_type text NOT NULL,
  is_purchase_recoverable boolean NOT NULL,
  is_active boolean NOT NULL
);

CREATE VIEW purchase_returnable_quantities_v AS
SELECT
  pil.id AS source_purchase_invoice_line_id,
  pil.quantity::numeric(18,6) AS purchased_quantity,
  COALESCE(
    SUM(CASE WHEN pr.id IS NOT NULL AND pr.deleted_at IS NULL THEN prl.quantity ELSE 0::numeric END),
    0::numeric
  )::numeric(18,6) AS posted_returned_quantity,
  (
    pil.quantity - COALESCE(
      SUM(CASE WHEN pr.id IS NOT NULL AND pr.deleted_at IS NULL THEN prl.quantity ELSE 0::numeric END),
      0::numeric
    )
  )::numeric(18,6) AS returnable_quantity
FROM purchase_invoice_lines AS pil
LEFT JOIN purchase_return_lines AS prl
  ON prl.source_purchase_invoice_line_id = pil.id
LEFT JOIN purchase_returns AS pr
  ON pr.id = prl.purchase_return_id
GROUP BY pil.id, pil.quantity;
