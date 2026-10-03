-- Phase 09.04 — Treasury Transfer integrity and cross-branch support.
-- Source Treasury remains owned by issuing_branch_id.
-- Target Treasury may belong to another allowed branch.
-- No new index: the approved transfer-leg partial unique index already exists.

ALTER TABLE public.treasury_transfers
  DROP CONSTRAINT fk_treasury_transfers__to_treasury_branch;

ALTER TABLE public.treasury_transfers
  ADD CONSTRAINT fk_treasury_transfers__to_treasury
  FOREIGN KEY (to_treasury_id)
  REFERENCES public.treasuries(id)
  ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.fn_financial_movement_posting_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_row public.posting_batches%ROWTYPE;
  transfer_row public.treasury_transfers%ROWTYPE;
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

  IF batch_row.source_type <> NEW.source_type
     OR batch_row.source_id <> NEW.source_id
     OR batch_row.created_by <> NEW.created_by THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial movement posting context does not match posting batch';
  END IF;

  IF batch_row.source_type = 'TREASURY_TRANSFER' THEN
    SELECT *
      INTO transfer_row
      FROM public.treasury_transfers
     WHERE id = NEW.source_id;

    IF NOT FOUND
       OR transfer_row.issuing_branch_id <> batch_row.branch_id THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'treasury transfer posting context does not match posting batch';
    END IF;

    IF (NEW.direction = 'OUT' AND NEW.treasury_id <> transfer_row.from_treasury_id)
       OR (NEW.direction = 'IN' AND NEW.treasury_id <> transfer_row.to_treasury_id) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'treasury transfer financial movement is attached to the wrong treasury';
    END IF;
  ELSIF batch_row.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'financial movement posting context does not match posting batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_posted_treasury_transfer_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23000',
    MESSAGE = 'treasury transfer posted rows are immutable; use reversal/correction workflow';
END;
$$;

CREATE TRIGGER bt_treasury_transfers__immutable
BEFORE UPDATE OR DELETE ON public.treasury_transfers
FOR EACH ROW
EXECUTE FUNCTION public.fn_posted_treasury_transfer_immutable();
