CREATE TABLE serial_numbers (
  id uuid NOT NULL,
  variant_id uuid NOT NULL,
  serial_number text NOT NULL,
  current_warehouse_id uuid,
  status text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE batches (
  id uuid NOT NULL,
  variant_id uuid NOT NULL,
  batch_number text NOT NULL,
  expiry_date date,
  created_at timestamptz NOT NULL
);

CREATE TABLE inventory_movements (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  movement_type text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_batch_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  reason_code text,
  notes text
);

CREATE TABLE inventory_movement_lines (
  id uuid NOT NULL,
  movement_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity_signed numeric(18,6) NOT NULL,
  unit_cost numeric(18,4) NOT NULL,
  total_cost numeric(18,4) NOT NULL
);

CREATE TABLE inventory_line_serials (
  movement_line_id uuid NOT NULL,
  serial_id uuid NOT NULL
);

CREATE TABLE inventory_line_batches (
  movement_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL
);

CREATE TABLE inventory_stock_positions (
  warehouse_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  on_hand numeric(18,6) NOT NULL,
  reserved numeric(18,6) NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE variant_warehouse_cost_projection (
  warehouse_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  weighted_average_cost numeric(18,4) NOT NULL,
  last_purchase_cost numeric(18,4) NOT NULL,
  inventory_value numeric(18,4) NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE batch_stock_positions (
  warehouse_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  on_hand numeric(18,6) NOT NULL,
  reserved numeric(18,6) NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE stock_reservations (
  id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  sales_order_line_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  released_at timestamptz
);

CREATE TABLE stock_transfers (
  id uuid NOT NULL,
  document_number bigint NOT NULL,
  issuing_branch_id uuid NOT NULL,
  from_warehouse_id uuid NOT NULL,
  to_warehouse_id uuid NOT NULL,
  status text NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  posted_at timestamptz NOT NULL
);

CREATE TABLE stock_transfer_lines (
  id uuid NOT NULL,
  transfer_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL
);

CREATE TABLE stocktake_sessions (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  warehouse_id uuid NOT NULL,
  status text NOT NULL,
  started_by uuid NOT NULL,
  started_at timestamptz NOT NULL,
  approved_by uuid,
  approved_at timestamptz
);

CREATE TABLE stocktake_lines (
  id uuid NOT NULL,
  session_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  book_quantity_at_count numeric(18,6) NOT NULL,
  counted_quantity numeric(18,6) NOT NULL,
  counted_at timestamptz NOT NULL,
  stock_position_version_at_count integer NOT NULL,
  difference numeric(18,6) NOT NULL,
  notes text
);

CREATE TABLE stocktake_line_serials (
  stocktake_line_id uuid NOT NULL,
  serial_id uuid NOT NULL
);

CREATE TABLE stocktake_line_batches (
  stocktake_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL
);

CREATE TABLE inventory_adjustments (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  warehouse_id uuid NOT NULL,
  source_stocktake_id uuid,
  reason_code text NOT NULL,
  notes text,
  created_by uuid NOT NULL,
  posted_at timestamptz NOT NULL
);

CREATE TABLE inventory_adjustment_lines (
  id uuid NOT NULL,
  adjustment_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity_difference numeric(18,6) NOT NULL,
  unit_cost numeric(18,4) NOT NULL
);

CREATE TABLE inventory_adjustment_line_serials (
  adjustment_line_id uuid NOT NULL,
  serial_id uuid NOT NULL
);

CREATE TABLE inventory_adjustment_line_batches (
  adjustment_line_id uuid NOT NULL,
  batch_id uuid NOT NULL,
  quantity numeric(18,6) NOT NULL
);
