-- Phase 09.03 — posted Receipt / Disbursement integrity.

CREATE FUNCTION public.fn_posted_cash_document_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23000',
    MESSAGE=TG_TABLE_NAME || ' posted rows are immutable; use reversal/correction workflow';
END;
$$;

CREATE TRIGGER bt_receipts__immutable
BEFORE UPDATE OR DELETE ON public.receipts
FOR EACH ROW EXECUTE FUNCTION public.fn_posted_cash_document_immutable();

CREATE TRIGGER bt_disbursements__immutable
BEFORE UPDATE OR DELETE ON public.disbursements
FOR EACH ROW EXECUTE FUNCTION public.fn_posted_cash_document_immutable();

CREATE FUNCTION public.fn_financial_movement_cash_source_singleton()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.source_type IN ('RECEIPT','DISBURSEMENT') AND EXISTS (
    SELECT 1 FROM public.financial_movements fm
    WHERE fm.source_type=NEW.source_type AND fm.source_id=NEW.source_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23505',
      MESSAGE='cash document already has a financial movement';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_financial_movements__cash_source_singleton
BEFORE INSERT ON public.financial_movements
FOR EACH ROW EXECUTE FUNCTION public.fn_financial_movement_cash_source_singleton();
