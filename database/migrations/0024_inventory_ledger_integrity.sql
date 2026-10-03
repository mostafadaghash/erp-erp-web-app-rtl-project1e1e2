-- Phase 08.01 — Inventory Ledger integrity.
-- Architecture Baseline v1.7 defines inventory_movements + lines as the
-- immutable Historical Source of Truth. Corrections/reversals append new
-- movements through new posting batches; committed history is never rewritten.

ALTER TABLE public.inventory_movements
  ADD CONSTRAINT ck_inventory_movements__movement_type
    CHECK (
      movement_type IN (
        'OPENING',
        'PURCHASE',
        'SALE',
        'SALES_RETURN',
        'PURCHASE_RETURN',
        'TRANSFER_OUT',
        'TRANSFER_IN',
        'ADJUSTMENT'
      )
    );

ALTER TABLE public.inventory_movement_lines
  ADD CONSTRAINT ck_inventory_movement_lines__quantity_nonzero
    CHECK (quantity_signed <> 0);

-- Tie every movement to the canonical PostingBatch trace.
-- Cross-branch stock transfer is the one intentional branch exception:
-- the PostingBatch belongs to the issuing/source branch while TRANSFER_IN
-- belongs to the target Warehouse's branch. Source identity, timestamp, and
-- posting actor must still match the shared PostingBatch.
CREATE FUNCTION public.fn_inventory_movement_posting_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_row public.posting_batches%ROWTYPE;
BEGIN
  SELECT *
    INTO batch_row
    FROM public.posting_batches
   WHERE id = NEW.posting_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'inventory movement posting batch does not exist';
  END IF;

  IF batch_row.source_type <> NEW.source_type
     OR batch_row.source_id <> NEW.source_id
     OR batch_row.created_by <> NEW.created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory movement posting context does not match posting batch';
  END IF;

  IF NEW.movement_type <> 'TRANSFER_IN'
     AND batch_row.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory movement branch does not match posting batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_inventory_movements__posting_context
BEFORE INSERT OR UPDATE ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_movement_posting_context_valid();

-- Direction is part of the frozen v1.7 movement vocabulary:
-- positive = stock IN, negative = stock OUT. ADJUSTMENT is intentionally
-- signed either way but zero is rejected by the CHECK above.
CREATE FUNCTION public.fn_inventory_movement_line_direction_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  movement_kind text;
BEGIN
  SELECT movement_type
    INTO movement_kind
    FROM public.inventory_movements
   WHERE id = NEW.movement_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF movement_kind IN ('OPENING','PURCHASE','SALES_RETURN','TRANSFER_IN')
     AND NEW.quantity_signed <= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory inbound movement quantity must be positive';
  END IF;

  IF movement_kind IN ('SALE','PURCHASE_RETURN','TRANSFER_OUT')
     AND NEW.quantity_signed >= 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'inventory outbound movement quantity must be negative';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_inventory_movement_lines__direction
BEFORE INSERT OR UPDATE ON public.inventory_movement_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_movement_line_direction_valid();

-- Posted Inventory Ledger history is immutable. Reversal/correction is a new
-- PostingBatch + new movement, never UPDATE/DELETE of the original effect.
CREATE FUNCTION public.fn_inventory_ledger_row_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23000',
    MESSAGE = 'inventory ledger rows are immutable; append reversal/correction instead';
END;
$$;

CREATE TRIGGER bt_inventory_movements__immutable
BEFORE UPDATE OR DELETE ON public.inventory_movements
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_ledger_row_immutable();

CREATE TRIGGER bt_inventory_movement_lines__immutable
BEFORE UPDATE OR DELETE ON public.inventory_movement_lines
FOR EACH ROW
EXECUTE FUNCTION public.fn_inventory_ledger_row_immutable();
