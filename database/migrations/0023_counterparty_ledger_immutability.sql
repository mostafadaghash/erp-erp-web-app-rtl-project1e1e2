-- Phase 06.03 — Customer/Supplier Ledger immutability.
-- Architecture Baseline v1.7 requires posted ledger entries to be historical
-- immutable Sources of Truth. Corrections/reversals append new rows through
-- new posting batches instead of UPDATE/DELETE of committed history.

CREATE FUNCTION public.fn_counterparty_ledger_entry_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = '23000',
    MESSAGE = 'counterparty ledger entries are immutable; append reversal/correction instead';
END;
$$;

CREATE TRIGGER bt_customer_ledger_entries__immutable
BEFORE UPDATE OR DELETE ON public.customer_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_counterparty_ledger_entry_immutable();

CREATE TRIGGER bt_supplier_ledger_entries__immutable
BEFORE UPDATE OR DELETE ON public.supplier_ledger_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_counterparty_ledger_entry_immutable();
