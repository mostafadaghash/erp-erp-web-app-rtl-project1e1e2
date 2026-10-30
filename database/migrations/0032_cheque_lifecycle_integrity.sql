-- Phase 09.06 — Cheque lifecycle and settlement integrity.
-- No new business columns or indexes. The frozen Index Catalog remains unchanged.

CREATE OR REPLACE FUNCTION public.fn_financial_movement_posting_context_valid()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  batch_row public.posting_batches%ROWTYPE;
  transfer_row public.treasury_transfers%ROWTYPE;
  cheque_row public.cheques%ROWTYPE;
BEGIN
  SELECT * INTO batch_row
    FROM public.posting_batches
   WHERE id = NEW.posting_batch_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503',
      MESSAGE='financial movement posting batch does not exist';
  END IF;

  IF batch_row.source_type <> NEW.source_type
     OR batch_row.source_id <> NEW.source_id
     OR batch_row.created_by <> NEW.created_by THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='financial movement posting context does not match posting batch';
  END IF;

  IF batch_row.source_type = 'TREASURY_TRANSFER' THEN
    SELECT * INTO transfer_row
      FROM public.treasury_transfers
     WHERE id = NEW.source_id;

    IF NOT FOUND
       OR transfer_row.issuing_branch_id <> batch_row.branch_id THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='treasury transfer posting context does not match posting batch';
    END IF;

    IF (NEW.direction='OUT' AND NEW.treasury_id<>transfer_row.from_treasury_id)
       OR (NEW.direction='IN' AND NEW.treasury_id<>transfer_row.to_treasury_id) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='treasury transfer financial movement is attached to the wrong treasury';
    END IF;

  ELSIF batch_row.source_type = 'CHEQUE' THEN
    SELECT * INTO cheque_row
      FROM public.cheques
     WHERE id = NEW.source_id
     FOR UPDATE;

    IF NOT FOUND
       OR cheque_row.branch_id <> batch_row.branch_id
       OR NEW.branch_id <> cheque_row.branch_id
       OR NEW.counterparty_id IS DISTINCT FROM cheque_row.counterparty_id
       OR NEW.amount <> cheque_row.amount
       OR (cheque_row.direction='RECEIVABLE' AND NEW.direction<>'IN')
       OR (cheque_row.direction='PAYABLE' AND NEW.direction<>'OUT')
       OR cheque_row.status <> 'PENDING'
       OR cheque_row.settlement_financial_movement_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='cheque financial movement context mismatch';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.financial_movements fm
       WHERE fm.source_type='CHEQUE'
         AND fm.source_id=cheque_row.id
         AND fm.id<>NEW.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        MESSAGE='cheque already has a financial settlement movement';
    END IF;

  ELSIF batch_row.branch_id <> NEW.branch_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='financial movement posting context does not match posting batch';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cheque_lifecycle_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  movement_row public.financial_movements%ROWTYPE;
  expected_role text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='cheque lifecycle rows are immutable; use lifecycle commands';
  END IF;

  IF TG_OP='INSERT' THEN
    IF NEW.status<>'PENDING' OR NEW.settlement_financial_movement_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__initial_state',
        MESSAGE='new cheque must start PENDING without treasury settlement';
    END IF;

    expected_role := CASE NEW.direction
      WHEN 'RECEIVABLE' THEN 'CUSTOMER'
      WHEN 'PAYABLE' THEN 'SUPPLIER'
      ELSE NULL
    END;

    IF expected_role IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.counterparty_roles cr
       WHERE cr.counterparty_id=NEW.counterparty_id
         AND cr.role=expected_role
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__counterparty_role',
        MESSAGE='cheque counterparty role does not match direction';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.branch_id IS DISTINCT FROM OLD.branch_id
     OR NEW.counterparty_id IS DISTINCT FROM OLD.counterparty_id
     OR NEW.direction IS DISTINCT FROM OLD.direction
     OR NEW.cheque_number IS DISTINCT FROM OLD.cheque_number
     OR NEW.bank_name IS DISTINCT FROM OLD.bank_name
     OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW.due_date IS DISTINCT FROM OLD.due_date
     OR NEW.source_type IS DISTINCT FROM OLD.source_type
     OR NEW.source_id IS DISTINCT FROM OLD.source_id
     OR NEW.notes IS DISTINCT FROM OLD.notes
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='cheque identity/commercial fields are immutable';
  END IF;

  IF OLD.status<>'PENDING' THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='terminal cheque state is immutable';
  END IF;

  IF NEW.status NOT IN ('CLEARED','BOUNCED','CANCELLED') THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_cheques__lifecycle_transition',
      MESSAGE='invalid cheque lifecycle transition';
  END IF;

  IF NEW.status='CLEARED' THEN
    IF NEW.settlement_financial_movement_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__cleared_requires_movement',
        MESSAGE='cleared cheque requires settlement financial movement';
    END IF;

    SELECT * INTO movement_row
      FROM public.financial_movements
     WHERE id=NEW.settlement_financial_movement_id
     FOR KEY SHARE;

    IF NOT FOUND
       OR movement_row.branch_id<>NEW.branch_id
       OR movement_row.source_type<>'CHEQUE'
       OR movement_row.source_id<>NEW.id
       OR movement_row.counterparty_id IS DISTINCT FROM NEW.counterparty_id
       OR movement_row.amount<>NEW.amount
       OR (NEW.direction='RECEIVABLE' AND movement_row.direction<>'IN')
       OR (NEW.direction='PAYABLE' AND movement_row.direction<>'OUT') THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__settlement_context',
        MESSAGE='cheque settlement movement does not match cheque';
    END IF;
  ELSE
    IF NEW.settlement_financial_movement_id IS NOT NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__noncleared_no_movement',
        MESSAGE='non-cleared cheque cannot reference treasury settlement';
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.financial_movements fm
       WHERE fm.source_type='CHEQUE' AND fm.source_id=NEW.id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_cheques__terminal_without_cash',
        MESSAGE='bounced/cancelled cheque cannot have treasury settlement movement';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_cheque_movement_deferred_link()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  cheque_row public.cheques%ROWTYPE;
BEGIN
  SELECT * INTO cheque_row
    FROM public.cheques
   WHERE id=NEW.source_id;

  IF NOT FOUND
     OR cheque_row.status<>'CLEARED'
     OR cheque_row.settlement_financial_movement_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_movements__cheque_settlement_link',
      MESSAGE='cheque financial movement must be linked by the cleared cheque in the same transaction';
  END IF;

  RETURN NULL;
END;
$$;

CREATE TRIGGER bt_cheques__lifecycle
BEFORE INSERT OR UPDATE OR DELETE ON public.cheques
FOR EACH ROW EXECUTE FUNCTION public.fn_cheque_lifecycle_guard();

CREATE CONSTRAINT TRIGGER ct_financial_movements__cheque_settlement_link
AFTER INSERT ON public.financial_movements
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
WHEN (NEW.source_type='CHEQUE')
EXECUTE FUNCTION public.fn_cheque_movement_deferred_link();
