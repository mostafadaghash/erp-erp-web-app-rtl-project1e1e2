-- Phase 09.07 — Installment schedule/settlement integrity.
-- ADR-0017 + ADR-0026 are authoritative. No new business columns or indexes.

CREATE OR REPLACE FUNCTION public.fn_installment_projected_status(
  p_amount numeric,
  p_paid numeric,
  p_due_date date,
  p_business_date date
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_paid >= p_amount THEN 'PAID'
    WHEN p_business_date > p_due_date THEN 'OVERDUE'
    WHEN p_paid > 0 THEN 'PARTIAL'
    WHEN p_business_date = p_due_date THEN 'DUE'
    ELSE 'UPCOMING'
  END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_effective_paid(p_installment_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(SUM(fa.amount),0)::numeric(18,4)
    FROM public.financial_allocations fa
   WHERE fa.target_type='INSTALLMENT'
     AND fa.target_id=p_installment_id;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_business_date(p_plan_id uuid)
RETURNS date
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  plan_row public.installment_plans%ROWTYPE;
  tz text;
BEGIN
  SELECT * INTO plan_row
    FROM public.installment_plans
   WHERE id=p_plan_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23503',
      MESSAGE='installment plan does not exist';
  END IF;

  IF plan_row.source_type='SALES_INVOICE' THEN
    SELECT c.timezone INTO tz
      FROM public.sales_invoices si
      JOIN public.branches b ON b.id=si.branch_id
      JOIN public.companies c ON c.id=b.company_id
     WHERE si.id=plan_row.source_id
       AND si.deleted_at IS NULL;
  ELSIF plan_row.source_type='PURCHASE_INVOICE' THEN
    SELECT c.timezone INTO tz
      FROM public.purchase_invoices pi
      JOIN public.branches b ON b.id=pi.branch_id
      JOIN public.companies c ON c.id=b.company_id
     WHERE pi.id=plan_row.source_id
       AND pi.deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='unsupported installment plan source type';
  END IF;

  IF tz IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='installment plan source context is unavailable';
  END IF;

  RETURN (CURRENT_TIMESTAMP AT TIME ZONE tz)::date;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_plan_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  source_counterparty uuid;
  source_due numeric(18,4);
  source_deleted timestamptz;
  expected_role text;
BEGIN
  IF TG_OP<>'INSERT' THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='installment plan history is immutable';
  END IF;

  IF NEW.source_type='SALES_INVOICE' THEN
    SELECT si.counterparty_id,si.due_total,si.deleted_at
      INTO source_counterparty,source_due,source_deleted
      FROM public.sales_invoices si
     WHERE si.id=NEW.source_id
     FOR UPDATE;
    expected_role:='CUSTOMER';
  ELSIF NEW.source_type='PURCHASE_INVOICE' THEN
    SELECT pi.counterparty_id,pi.due_total,pi.deleted_at
      INTO source_counterparty,source_due,source_deleted
      FROM public.purchase_invoices pi
     WHERE pi.id=NEW.source_id
     FOR UPDATE;
    expected_role:='SUPPLIER';
  ELSE
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__source_type',
      MESSAGE='unsupported installment plan source type';
  END IF;

  IF source_counterparty IS NULL
     OR source_deleted IS NOT NULL
     OR source_due IS NULL
     OR source_due<=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__source_context',
      MESSAGE='installment plan source is missing, deleted, fully settled, or has no account';
  END IF;

  IF NEW.counterparty_id<>source_counterparty THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__counterparty_context',
      MESSAGE='installment plan counterparty does not match source';
  END IF;

  IF NEW.total_amount<>source_due THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__total_context',
      MESSAGE='installment plan total must equal source due amount';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.counterparty_roles cr
     WHERE cr.counterparty_id=NEW.counterparty_id
       AND cr.role=expected_role
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__counterparty_role',
      MESSAGE='installment plan counterparty role does not match source type';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM public.installment_plans p
     WHERE p.counterparty_id=NEW.counterparty_id
       AND p.source_type=NEW.source_type
       AND p.source_id=NEW.source_id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__single_source_plan',
      MESSAGE='installment plan already exists for source';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_row_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  effective_paid numeric(18,4);
  business_date date;
  expected_status text;
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='installment schedule rows are immutable';
  END IF;

  IF TG_OP='UPDATE' AND (
    NEW.plan_id IS DISTINCT FROM OLD.plan_id
    OR NEW.due_date IS DISTINCT FROM OLD.due_date
    OR NEW.amount IS DISTINCT FROM OLD.amount
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23000',
      MESSAGE='installment schedule identity is immutable';
  END IF;

  business_date:=public.fn_installment_business_date(NEW.plan_id);

  IF TG_OP='INSERT' THEN
    effective_paid:=0;
  ELSE
    effective_paid:=public.fn_installment_effective_paid(NEW.id);
  END IF;

  expected_status:=public.fn_installment_projected_status(
    NEW.amount,
    effective_paid,
    NEW.due_date,
    business_date
  );

  IF NEW.paid_amount_projection<>effective_paid
     OR NEW.status<>expected_status THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installments__projection',
      MESSAGE='installment paid/status projection does not match allocation history and business date';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_schedule_total_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  target_plan_id uuid;
  planned numeric(18,4);
  scheduled numeric(18,4);
BEGIN
  IF TG_TABLE_NAME='installment_plans' THEN
    target_plan_id:=NEW.id;
  ELSE
    target_plan_id:=NEW.plan_id;
  END IF;

  SELECT total_amount INTO planned
    FROM public.installment_plans
   WHERE id=target_plan_id;

  IF planned IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(SUM(amount),0)::numeric(18,4) INTO scheduled
    FROM public.installments
   WHERE plan_id=target_plan_id;

  IF scheduled<>planned THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_installment_plans__schedule_total',
      MESSAGE='installment schedule total must equal plan total';
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_allocation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  inst_amount numeric(18,4);
  plan_counterparty uuid;
  plan_source_type text;
  plan_source_id uuid;
  source_branch uuid;
  expected_financial_source text;
  cash_branch uuid;
  cash_counterparty uuid;
  cash_amount numeric(18,4);
  cash_movement_count integer;
  target_allocated numeric(18,4);
  source_allocated numeric(18,4);
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    IF OLD.target_type='INSTALLMENT'
       OR (TG_OP='UPDATE' AND NEW.target_type='INSTALLMENT') THEN
      RAISE EXCEPTION USING ERRCODE='23000',
        MESSAGE='installment financial allocation history is immutable';
    END IF;
    RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF NEW.target_type<>'INSTALLMENT' THEN
    RETURN NEW;
  END IF;

  SELECT i.amount,p.counterparty_id,p.source_type,p.source_id
    INTO inst_amount,plan_counterparty,plan_source_type,plan_source_id
    FROM public.installments i
    JOIN public.installment_plans p ON p.id=i.plan_id
   WHERE i.id=NEW.target_id
   FOR UPDATE OF i;

  IF inst_amount IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='23503',
      MESSAGE='installment allocation target does not exist';
  END IF;

  IF plan_source_type='SALES_INVOICE' THEN
    expected_financial_source:='RECEIPT';
    SELECT branch_id INTO source_branch
      FROM public.sales_invoices
     WHERE id=plan_source_id AND deleted_at IS NULL;
  ELSIF plan_source_type='PURCHASE_INVOICE' THEN
    expected_financial_source:='DISBURSEMENT';
    SELECT branch_id INTO source_branch
      FROM public.purchase_invoices
     WHERE id=plan_source_id AND deleted_at IS NULL;
  ELSE
    RAISE EXCEPTION USING ERRCODE='23514',
      MESSAGE='unsupported installment plan source type';
  END IF;

  IF NEW.financial_source_type<>expected_financial_source THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_allocations__installment_source_direction',
      MESSAGE='installment allocation cash direction does not match plan source';
  END IF;

  IF NEW.financial_source_type='RECEIPT' THEN
    SELECT r.branch_id,r.counterparty_id,r.amount
      INTO cash_branch,cash_counterparty,cash_amount
      FROM public.receipts r
     WHERE r.id=NEW.financial_source_id;
  ELSE
    SELECT d.branch_id,d.counterparty_id,d.amount
      INTO cash_branch,cash_counterparty,cash_amount
      FROM public.disbursements d
     WHERE d.id=NEW.financial_source_id;
  END IF;

  IF cash_amount IS NULL
     OR cash_branch<>source_branch
     OR cash_counterparty IS DISTINCT FROM plan_counterparty THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_allocations__installment_context',
      MESSAGE='installment allocation cash source context mismatch';
  END IF;

  SELECT COUNT(*)::integer INTO cash_movement_count
    FROM public.financial_movements fm
   WHERE fm.source_type=NEW.financial_source_type
     AND fm.source_id=NEW.financial_source_id
     AND fm.branch_id=cash_branch
     AND fm.counterparty_id IS NOT DISTINCT FROM plan_counterparty;

  IF cash_movement_count<>1 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_allocations__installment_cash_movement',
      MESSAGE='installment allocation requires exactly one posted cash movement';
  END IF;

  SELECT COALESCE(SUM(amount),0)::numeric(18,4) INTO target_allocated
    FROM public.financial_allocations
   WHERE target_type='INSTALLMENT'
     AND target_id=NEW.target_id;

  IF target_allocated+NEW.amount>inst_amount THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_allocations__installment_remaining',
      MESSAGE='installment allocation exceeds remaining amount';
  END IF;

  SELECT COALESCE(SUM(amount),0)::numeric(18,4) INTO source_allocated
    FROM public.financial_allocations
   WHERE financial_source_type=NEW.financial_source_type
     AND financial_source_id=NEW.financial_source_id;

  IF source_allocated+NEW.amount>cash_amount THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_financial_allocations__source_amount',
      MESSAGE='financial allocations exceed cash source amount';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_installment_allocation_refresh()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  paid numeric(18,4);
  business_date date;
  target_amount numeric(18,4);
  target_due date;
BEGIN
  IF NEW.target_type<>'INSTALLMENT' THEN
    RETURN NULL;
  END IF;

  SELECT amount,due_date INTO target_amount,target_due
    FROM public.installments
   WHERE id=NEW.target_id;

  paid:=public.fn_installment_effective_paid(NEW.target_id);
  business_date:=(
    SELECT public.fn_installment_business_date(plan_id)
      FROM public.installments
     WHERE id=NEW.target_id
  );

  UPDATE public.installments
     SET paid_amount_projection=paid,
         status=public.fn_installment_projected_status(
           target_amount,paid,target_due,business_date
         )
   WHERE id=NEW.target_id;

  RETURN NULL;
END;
$$;

CREATE TRIGGER bt_installment_plans__guard
BEFORE INSERT OR UPDATE OR DELETE ON public.installment_plans
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_plan_guard();

CREATE TRIGGER bt_installments__guard
BEFORE INSERT OR UPDATE OR DELETE ON public.installments
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_row_guard();

CREATE CONSTRAINT TRIGGER ct_installment_plans__schedule_total
AFTER INSERT ON public.installment_plans
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_schedule_total_guard();

CREATE CONSTRAINT TRIGGER ct_installments__schedule_total
AFTER INSERT ON public.installments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_schedule_total_guard();

CREATE TRIGGER bt_financial_allocations__installment_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.financial_allocations
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_allocation_guard();

CREATE TRIGGER at_financial_allocations__installment_refresh
AFTER INSERT ON public.financial_allocations
FOR EACH ROW EXECUTE FUNCTION public.fn_installment_allocation_refresh();
