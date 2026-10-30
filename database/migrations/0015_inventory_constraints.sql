-- Phase 03.06 Inventory constraints only.
-- Independent query/search/performance and partial indexes remain deferred to Phase 03.07.

-- Composite Warehouse + Branch target required by the approved context-integrity rules.
-- This is a constraint-owned backing index, not an independent Phase 03.07 index.
ALTER TABLE public.warehouses
  ADD CONSTRAINT uq_warehouses__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.serial_numbers
  ADD CONSTRAINT pk_serial_numbers PRIMARY KEY (id);

ALTER TABLE public.batches
  ADD CONSTRAINT pk_batches PRIMARY KEY (id);

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT pk_inventory_movements PRIMARY KEY (id);

ALTER TABLE public.inventory_movement_lines
  ADD CONSTRAINT pk_inventory_movement_lines PRIMARY KEY (id);

ALTER TABLE public.inventory_line_serials
  ADD CONSTRAINT pk_inventory_line_serials PRIMARY KEY (movement_line_id, serial_id);

ALTER TABLE public.inventory_line_batches
  ADD CONSTRAINT pk_inventory_line_batches PRIMARY KEY (movement_line_id, batch_id);

ALTER TABLE public.inventory_stock_positions
  ADD CONSTRAINT pk_inventory_stock_positions PRIMARY KEY (warehouse_id, variant_id);

ALTER TABLE public.variant_warehouse_cost_projection
  ADD CONSTRAINT pk_variant_warehouse_cost_projection PRIMARY KEY (warehouse_id, variant_id);

ALTER TABLE public.batch_stock_positions
  ADD CONSTRAINT pk_batch_stock_positions PRIMARY KEY (warehouse_id, batch_id);

ALTER TABLE public.stock_reservations
  ADD CONSTRAINT pk_stock_reservations PRIMARY KEY (id);

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT pk_stock_transfers PRIMARY KEY (id);

ALTER TABLE public.stock_transfer_lines
  ADD CONSTRAINT pk_stock_transfer_lines PRIMARY KEY (id);

ALTER TABLE public.stocktake_sessions
  ADD CONSTRAINT pk_stocktake_sessions PRIMARY KEY (id);

ALTER TABLE public.stocktake_lines
  ADD CONSTRAINT pk_stocktake_lines PRIMARY KEY (id);

ALTER TABLE public.stocktake_line_serials
  ADD CONSTRAINT pk_stocktake_line_serials PRIMARY KEY (stocktake_line_id, serial_id);

ALTER TABLE public.stocktake_line_batches
  ADD CONSTRAINT pk_stocktake_line_batches PRIMARY KEY (stocktake_line_id, batch_id);

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT pk_inventory_adjustments PRIMARY KEY (id);

ALTER TABLE public.inventory_adjustment_lines
  ADD CONSTRAINT pk_inventory_adjustment_lines PRIMARY KEY (id);

ALTER TABLE public.inventory_adjustment_line_serials
  ADD CONSTRAINT pk_inventory_adjustment_line_serials PRIMARY KEY (adjustment_line_id, serial_id);

ALTER TABLE public.inventory_adjustment_line_batches
  ADD CONSTRAINT pk_inventory_adjustment_line_batches PRIMARY KEY (adjustment_line_id, batch_id);

-- Mandatory Inventory uniqueness from the approved relational/index catalogs.
ALTER TABLE public.serial_numbers
  ADD CONSTRAINT uq_serial_numbers__variant_serial UNIQUE (variant_id, serial_number);

ALTER TABLE public.batches
  ADD CONSTRAINT uq_batches__variant_batch UNIQUE (variant_id, batch_number);

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT uq_stock_transfers__branch_document UNIQUE (issuing_branch_id, document_number);

ALTER TABLE public.stock_transfer_lines
  ADD CONSTRAINT uq_stock_transfer_lines__transfer_variant UNIQUE (transfer_id, variant_id);

ALTER TABLE public.stocktake_sessions
  ADD CONSTRAINT uq_stocktake_sessions__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.stocktake_lines
  ADD CONSTRAINT uq_stocktake_lines__session_variant UNIQUE (session_id, variant_id);

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT uq_inventory_adjustments__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.inventory_adjustment_lines
  ADD CONSTRAINT uq_inventory_adjustment_lines__adjustment_variant UNIQUE (adjustment_id, variant_id);

-- Historical/master references. Inventory history defaults to RESTRICT.
ALTER TABLE public.serial_numbers
  ADD CONSTRAINT fk_serial_numbers__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_serial_numbers__current_warehouse
    FOREIGN KEY (current_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT;

ALTER TABLE public.batches
  ADD CONSTRAINT fk_batches__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT fk_inventory_movements__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_movements__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_movements__posting_batch
    FOREIGN KEY (posting_batch_id) REFERENCES public.posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_movements__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_movement_lines
  ADD CONSTRAINT fk_inventory_movement_lines__movement
    FOREIGN KEY (movement_id) REFERENCES public.inventory_movements(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_movement_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_line_serials
  ADD CONSTRAINT fk_inventory_line_serials__movement_line
    FOREIGN KEY (movement_line_id) REFERENCES public.inventory_movement_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_line_serials__serial
    FOREIGN KEY (serial_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_line_batches
  ADD CONSTRAINT fk_inventory_line_batches__movement_line
    FOREIGN KEY (movement_line_id) REFERENCES public.inventory_movement_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_line_batches__batch
    FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;

-- Rebuildable operational projections still keep restrictive master references so live lock rows
-- cannot disappear silently. They remain projections, never historical Sources of Truth.
ALTER TABLE public.inventory_stock_positions
  ADD CONSTRAINT fk_inventory_stock_positions__warehouse
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_stock_positions__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.variant_warehouse_cost_projection
  ADD CONSTRAINT fk_variant_warehouse_cost_projection__warehouse
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_variant_warehouse_cost_projection__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.batch_stock_positions
  ADD CONSTRAINT fk_batch_stock_positions__warehouse
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_batch_stock_positions__batch
    FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;

-- Sales-order references are intentionally deferred until the Sales constraint slice establishes
-- the target PK/composite context layer. Inventory-owned Warehouse/Variant references are closed now.
ALTER TABLE public.stock_reservations
  ADD CONSTRAINT fk_stock_reservations__warehouse
    FOREIGN KEY (warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_reservations__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT fk_stock_transfers__issuing_branch
    FOREIGN KEY (issuing_branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_transfers__from_warehouse_branch
    FOREIGN KEY (from_warehouse_id, issuing_branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_transfers__to_warehouse
    FOREIGN KEY (to_warehouse_id) REFERENCES public.warehouses(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_transfers__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.stock_transfer_lines
  ADD CONSTRAINT fk_stock_transfer_lines__transfer
    FOREIGN KEY (transfer_id) REFERENCES public.stock_transfers(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stock_transfer_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.stocktake_sessions
  ADD CONSTRAINT fk_stocktake_sessions__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_sessions__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_sessions__started_by
    FOREIGN KEY (started_by) REFERENCES public.users(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_sessions__approved_by
    FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.stocktake_lines
  ADD CONSTRAINT fk_stocktake_lines__session
    FOREIGN KEY (session_id) REFERENCES public.stocktake_sessions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.stocktake_line_serials
  ADD CONSTRAINT fk_stocktake_line_serials__line
    FOREIGN KEY (stocktake_line_id) REFERENCES public.stocktake_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_line_serials__serial
    FOREIGN KEY (serial_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;

ALTER TABLE public.stocktake_line_batches
  ADD CONSTRAINT fk_stocktake_line_batches__line
    FOREIGN KEY (stocktake_line_id) REFERENCES public.stocktake_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_stocktake_line_batches__batch
    FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT fk_inventory_adjustments__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustments__warehouse_branch
    FOREIGN KEY (warehouse_id, branch_id) REFERENCES public.warehouses(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustments__source_stocktake
    FOREIGN KEY (source_stocktake_id) REFERENCES public.stocktake_sessions(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustments__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_adjustment_lines
  ADD CONSTRAINT fk_inventory_adjustment_lines__adjustment
    FOREIGN KEY (adjustment_id) REFERENCES public.inventory_adjustments(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustment_lines__variant
    FOREIGN KEY (variant_id) REFERENCES public.product_variants(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_adjustment_line_serials
  ADD CONSTRAINT fk_inventory_adjustment_line_serials__line
    FOREIGN KEY (adjustment_line_id) REFERENCES public.inventory_adjustment_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustment_line_serials__serial
    FOREIGN KEY (serial_id) REFERENCES public.serial_numbers(id) ON DELETE RESTRICT;

ALTER TABLE public.inventory_adjustment_line_batches
  ADD CONSTRAINT fk_inventory_adjustment_line_batches__line
    FOREIGN KEY (adjustment_line_id) REFERENCES public.inventory_adjustment_lines(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_inventory_adjustment_line_batches__batch
    FOREIGN KEY (batch_id) REFERENCES public.batches(id) ON DELETE RESTRICT;

-- Closed-domain checks that are explicitly fixed by Architecture Baseline v1.7.
ALTER TABLE public.stock_reservations
  ADD CONSTRAINT ck_stock_reservations__status
    CHECK (status IN ('ACTIVE', 'PARTIALLY_CONSUMED', 'RELEASED', 'CONSUMED')),
  ADD CONSTRAINT ck_stock_reservations__quantity_positive CHECK (quantity > 0);

ALTER TABLE public.stocktake_sessions
  ADD CONSTRAINT ck_stocktake_sessions__status
    CHECK (status IN ('OPEN', 'COUNTED', 'APPROVED', 'CANCELLED'));

-- Numeric integrity. Negative On Hand is intentionally NOT prohibited because V1 supports
-- a permission-gated negative-stock policy. Only fields not designed to be signed are constrained.
ALTER TABLE public.inventory_movement_lines
  ADD CONSTRAINT ck_inventory_movement_lines__unit_cost_nonnegative CHECK (unit_cost >= 0),
  ADD CONSTRAINT ck_inventory_movement_lines__total_cost_nonnegative CHECK (total_cost >= 0);

ALTER TABLE public.inventory_line_batches
  ADD CONSTRAINT ck_inventory_line_batches__quantity_positive CHECK (quantity > 0);

ALTER TABLE public.inventory_stock_positions
  ADD CONSTRAINT ck_inventory_stock_positions__reserved_nonnegative CHECK (reserved >= 0),
  ADD CONSTRAINT ck_inventory_stock_positions__version_nonnegative CHECK (version >= 0);

ALTER TABLE public.variant_warehouse_cost_projection
  ADD CONSTRAINT ck_variant_warehouse_cost_projection__weighted_cost_nonnegative CHECK (weighted_average_cost >= 0),
  ADD CONSTRAINT ck_variant_warehouse_cost_projection__last_purchase_cost_nonnegative CHECK (last_purchase_cost >= 0);

ALTER TABLE public.batch_stock_positions
  ADD CONSTRAINT ck_batch_stock_positions__reserved_nonnegative CHECK (reserved >= 0),
  ADD CONSTRAINT ck_batch_stock_positions__version_nonnegative CHECK (version >= 0);

ALTER TABLE public.stock_transfers
  ADD CONSTRAINT ck_stock_transfers__different_warehouses CHECK (from_warehouse_id <> to_warehouse_id),
  ADD CONSTRAINT ck_stock_transfers__document_number_positive CHECK (document_number > 0);

ALTER TABLE public.stock_transfer_lines
  ADD CONSTRAINT ck_stock_transfer_lines__quantity_positive CHECK (quantity > 0);

ALTER TABLE public.stocktake_sessions
  ADD CONSTRAINT ck_stocktake_sessions__document_number_positive CHECK (document_number > 0);

ALTER TABLE public.stocktake_lines
  ADD CONSTRAINT ck_stocktake_lines__counted_quantity_nonnegative CHECK (counted_quantity >= 0),
  ADD CONSTRAINT ck_stocktake_lines__position_version_nonnegative CHECK (stock_position_version_at_count >= 0),
  ADD CONSTRAINT ck_stocktake_lines__difference_exact CHECK (difference = counted_quantity - book_quantity_at_count);

ALTER TABLE public.stocktake_line_batches
  ADD CONSTRAINT ck_stocktake_line_batches__quantity_nonnegative CHECK (quantity >= 0);

ALTER TABLE public.inventory_adjustments
  ADD CONSTRAINT ck_inventory_adjustments__document_number_positive CHECK (document_number > 0);

ALTER TABLE public.inventory_adjustment_lines
  ADD CONSTRAINT ck_inventory_adjustment_lines__unit_cost_nonnegative CHECK (unit_cost >= 0);

ALTER TABLE public.inventory_adjustment_line_batches
  ADD CONSTRAINT ck_inventory_adjustment_line_batches__quantity_nonnegative CHECK (quantity >= 0);
