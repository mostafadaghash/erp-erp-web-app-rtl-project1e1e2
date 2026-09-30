-- Phase 09.02 — Financial Movement ledger integrity.
-- Financial Movements are immutable Historical Sources of Truth.
-- Treasury balance positions remain synchronous rebuildable projections.

CREATE FUNCTION public.fn_financial_movement_posting_context_valid()
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
      MESSAGE = 'financial movement posting batch does not exist';
  END IF;

  IF batch_row.branch_id <> NEW.branch_id
     OR batch_row.source_type <> NEW.source_type
     OR batch_row.source_id <> NEW.source_id
     OR batch_row.created_by <> NEW.created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial movement posting context does not match posting batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_financial_movements__posting_context
BEFORE INSERT OR UPDATE ON public.financial_movements
FOR EACH ROW
EXECUTE FUNCTION public.fn_financial_movement_posting_context_valid();

CREATE FUNCTION public.fn_financial_movement_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23000',
    MESSAGE = 'financial movements are immutable; append reversal/correction instead';
END;
$$;

CREATE TRIGGER bt_financial_movements__immutable
BEFORE UPDATE OR DELETE ON public.financial_movements
FOR EACH ROW
EXECUTE FUNCTION public.fn_financial_movement_immutable();
