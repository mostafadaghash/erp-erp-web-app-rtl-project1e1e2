-- Phase 09.05 Customer Advance integrity. No new business column/index.
CREATE OR REPLACE FUNCTION public.fn_customer_advance_effective_applied(p_advance_id uuid)
RETURNS numeric(18,4) LANGUAGE sql STABLE AS $$
WITH pair_state AS (
 SELECT sales_invoice_id,count(*)::bigint AS history_count,
        (array_agg(amount ORDER BY applied_at DESC,id DESC))[1] AS latest_amount
 FROM public.advance_applications WHERE advance_id=p_advance_id GROUP BY sales_invoice_id
)
SELECT COALESCE(sum(CASE WHEN (history_count % 2)=1 THEN latest_amount ELSE 0::numeric END),0::numeric)::numeric(18,4)
FROM pair_state
$$;

CREATE OR REPLACE FUNCTION public.fn_customer_advance_context_valid() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE order_row record; receipt_row record;
BEGIN
 SELECT branch_id,counterparty_id INTO order_row FROM public.sales_orders WHERE id=NEW.sales_order_id;
 SELECT branch_id,counterparty_id,amount INTO receipt_row FROM public.receipts WHERE id=NEW.receipt_id;
 IF order_row IS NULL OR receipt_row IS NULL THEN RETURN NEW; END IF;
 IF receipt_row.counterparty_id IS NULL OR order_row.counterparty_id<>NEW.counterparty_id OR receipt_row.counterparty_id<>NEW.counterparty_id OR receipt_row.branch_id<>order_row.branch_id OR receipt_row.amount<>NEW.original_amount THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ct_customer_advances__source_context',MESSAGE='customer advance source context mismatch';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_customer_advance_projection_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE expected numeric(18,4);
BEGIN
 IF NEW.remaining_amount_projection<0 OR NEW.remaining_amount_projection>NEW.original_amount THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN expected:=NEW.original_amount; ELSE expected:=OLD.original_amount-public.fn_customer_advance_effective_applied(OLD.id); END IF;
 IF NEW.remaining_amount_projection<>expected THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ct_customer_advances__projection_exact',MESSAGE='customer advance projection mismatch';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_customer_advance_identity_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='customer advance identity/history is immutable'; END IF;
 IF NEW.counterparty_id IS DISTINCT FROM OLD.counterparty_id OR NEW.sales_order_id IS DISTINCT FROM OLD.sales_order_id OR NEW.receipt_id IS DISTINCT FROM OLD.receipt_id OR NEW.original_amount IS DISTINCT FROM OLD.original_amount OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
  RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='customer advance identity/history is immutable';
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_advance_application_insert_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE advance_row record; invoice_row record; history_count bigint; latest_amount numeric(18,4); used_amount numeric(18,4);
BEGIN
 SELECT id,counterparty_id,sales_order_id,original_amount INTO advance_row FROM public.customer_advances WHERE id=NEW.advance_id FOR UPDATE;
 IF advance_row IS NULL THEN RETURN NEW; END IF;
 SELECT id,branch_id,counterparty_id,source_sales_order_id INTO invoice_row FROM public.sales_invoices WHERE id=NEW.sales_invoice_id FOR KEY SHARE;
 IF invoice_row IS NULL THEN RETURN NEW; END IF;
 IF invoice_row.counterparty_id IS NULL OR invoice_row.counterparty_id<>advance_row.counterparty_id OR invoice_row.source_sales_order_id IS NULL OR invoice_row.source_sales_order_id<>advance_row.sales_order_id THEN
  RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ct_advance_applications__invoice_context',MESSAGE='advance application invoice context mismatch';
 END IF;
 SELECT count(*)::bigint,(array_agg(amount ORDER BY applied_at DESC,id DESC))[1] INTO history_count,latest_amount FROM public.advance_applications WHERE advance_id=NEW.advance_id AND sales_invoice_id=NEW.sales_invoice_id;
 IF (history_count % 2)=0 THEN
  used_amount:=public.fn_customer_advance_effective_applied(NEW.advance_id);
  IF used_amount+NEW.amount>advance_row.original_amount THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ct_advance_applications__remaining',MESSAGE='advance application exceeds remaining balance'; END IF;
 ELSE
  IF latest_amount IS NULL OR NEW.amount<>latest_amount THEN RAISE EXCEPTION USING ERRCODE='23514',CONSTRAINT='ct_advance_applications__reversal_amount',MESSAGE='advance reversal amount mismatch'; END IF;
 END IF;
 NEW.applied_at:=clock_timestamp();RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.fn_advance_application_refresh_projection() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE public.customer_advances SET remaining_amount_projection=original_amount-public.fn_customer_advance_effective_applied(NEW.advance_id) WHERE id=NEW.advance_id;
 RETURN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.fn_advance_application_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION USING ERRCODE='23000',MESSAGE='advance application history is immutable; append reversal history'; END $$;

UPDATE public.customer_advances ca SET remaining_amount_projection=ca.original_amount-public.fn_customer_advance_effective_applied(ca.id);

CREATE TRIGGER bt_customer_advances__context BEFORE INSERT OR UPDATE OF counterparty_id,sales_order_id,receipt_id,original_amount ON public.customer_advances FOR EACH ROW EXECUTE FUNCTION public.fn_customer_advance_context_valid();
CREATE TRIGGER bt_customer_advances__projection_guard BEFORE INSERT OR UPDATE OF remaining_amount_projection ON public.customer_advances FOR EACH ROW EXECUTE FUNCTION public.fn_customer_advance_projection_guard();
CREATE TRIGGER bt_customer_advances__identity_immutable BEFORE UPDATE OR DELETE ON public.customer_advances FOR EACH ROW EXECUTE FUNCTION public.fn_customer_advance_identity_immutable();
CREATE TRIGGER bt_advance_applications__insert_guard BEFORE INSERT ON public.advance_applications FOR EACH ROW EXECUTE FUNCTION public.fn_advance_application_insert_guard();
CREATE TRIGGER at_advance_applications__refresh_projection AFTER INSERT ON public.advance_applications FOR EACH ROW EXECUTE FUNCTION public.fn_advance_application_refresh_projection();
CREATE TRIGGER bt_advance_applications__immutable BEFORE UPDATE OR DELETE ON public.advance_applications FOR EACH ROW EXECUTE FUNCTION public.fn_advance_application_immutable();
