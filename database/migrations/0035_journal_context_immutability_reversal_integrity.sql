-- Phase 09.08 / ADR-0028: forward-only Journal integrity; no writer or Posting Rules.
-- Migrate only a verified EMPTY Journal history. Historical backfill is NOT authorized.
-- 0009 deferred balance trigger and 0019 / 0034 constraints remain untouched.
-- Migration role owns the seal and functions; application roles must not own them.

CREATE TABLE public.journal_entry_seals (
  entry_id uuid NOT NULL,
  line_count integer NOT NULL,
  line_snapshot jsonb NOT NULL,
  sealed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT pk_journal_entry_seals PRIMARY KEY (entry_id),
  CONSTRAINT fk_journal_entry_seals__entry FOREIGN KEY (entry_id)
    REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  CONSTRAINT ck_journal_entry_seals__nonempty CHECK (line_count > 0),
  CONSTRAINT ck_journal_entry_seals__snapshot CHECK (
    jsonb_typeof(line_snapshot) = 'array'
    AND jsonb_array_length(line_snapshot) = line_count
  )
);
REVOKE ALL ON TABLE public.journal_entry_seals FROM PUBLIC;

-- The array is ordered by immutable line ID. Exact NUMERIC(18,4) values are
-- rendered as text, not rounded JSON numbers. VOLATILE ensures a new READ
-- COMMITTED snapshot after any blocking row lock.
CREATE FUNCTION public.fn_journal_line_snapshot(p_entry uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_snapshot jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_array(l.id::text, l.gl_account_id::text,
                        l.debit::text, l.credit::text, l.counterparty_id::text)
      ORDER BY l.id
    ), '[]'::jsonb)
    INTO v_snapshot
    FROM public.journal_lines l
   WHERE l.journal_entry_id=p_entry;
  RETURN v_snapshot;
END;
$$;

-- A seal can be inserted only by a trusted migration-owned SECURITY DEFINER
-- trigger. Even an accidental ordinary-role INSERT grant is not sufficient.
-- Trusted owners/superusers can administer schema and are outside app threat model.
CREATE FUNCTION public.fn_journal_seal_write_guard()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF TG_OP <> 'INSERT'
    OR current_user <> pg_get_userbyid((
      SELECT c.relowner FROM pg_catalog.pg_class c
       WHERE c.oid='public.journal_entry_seals'::regclass
    )) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entry_seals__write_protected',
      MESSAGE='Journal commit seal is not directly mutable';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bt_journal_entry_seals__write_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.journal_entry_seals
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_seal_write_guard();

-- Parent Batch is locked before original Journal; these locks serialize
-- batch edits and two reversals of the same original under READ COMMITTED.
CREATE FUNCTION public.fn_journal_entry_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_batch public.posting_batches%ROWTYPE;
  v_original public.journal_entries%ROWTYPE;
  v_active boolean;
BEGIN
  SELECT * INTO v_batch FROM public.posting_batches
   WHERE id=NEW.posting_batch_id FOR SHARE;
  IF NOT FOUND OR NEW.branch_id IS DISTINCT FROM v_batch.branch_id
    OR NEW.source_type IS DISTINCT FROM v_batch.source_type
    OR NEW.source_id IS DISTINCT FROM v_batch.source_id
    OR NEW.created_by IS DISTINCT FROM v_batch.created_by
    OR NEW.posted_at IS DISTINCT FROM v_batch.posted_at THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__batch_context',
      MESSAGE='Journal header must exactly match its PostingBatch';
  END IF;

  SELECT b.is_active INTO v_active FROM public.branches b
   WHERE b.id=NEW.branch_id FOR SHARE;
  IF NOT FOUND OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__active_branch',
      MESSAGE='Journal posting requires an active branch';
  END IF;

  IF v_batch.operation_type IN ('REVERSAL','DELETE_REVERSAL') THEN
    IF NEW.reversal_of_entry_id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__reversal_context',
        MESSAGE='Reversal Journal must reference an original entry';
    END IF;

    SELECT * INTO v_original FROM public.journal_entries
     WHERE id=NEW.reversal_of_entry_id FOR UPDATE;
    IF NOT FOUND OR v_original.id=NEW.id
      OR v_original.reversal_of_entry_id IS NOT NULL
      OR v_original.branch_id IS DISTINCT FROM NEW.branch_id
      OR v_original.source_type IS DISTINCT FROM NEW.source_type
      OR v_original.source_id IS DISTINCT FROM NEW.source_id
      OR v_batch.reverses_posting_batch_id IS DISTINCT FROM v_original.posting_batch_id
      OR NEW.posted_at <= v_original.posted_at THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__reversal_context',
        MESSAGE='Reversal must target an earlier original in the same source and Branch';
    END IF;
    -- Fresh read AFTER the original FOR UPDATE lock; the losing writer observes
    -- the committed winner. No unique posting_batch_id or extra index required.
    IF EXISTS (
      SELECT 1 FROM public.journal_entries r
       WHERE r.reversal_of_entry_id=NEW.reversal_of_entry_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__already_reversed',
        MESSAGE='Journal original has already been reversed';
    END IF;
  ELSIF NEW.reversal_of_entry_id IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__reversal_context',
      MESSAGE='Only a REVERSAL batch may reverse a Journal entry';
  END IF;

  RETURN NEW;
END;
$$;
CREATE TRIGGER bt_journal_entries__insert_context
BEFORE INSERT ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_entry_insert_guard();

-- No draft/edit phase exists for Journal history. Even in-transaction edits
-- must be expressed as fresh inserted lines before the first seal.
CREATE FUNCTION public.fn_journal_history_immutable()
RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION USING ERRCODE='23514',
    CONSTRAINT='ct_journal_history__immutable',
    MESSAGE='Journal history is append-only; use a reversal or correction';
END;
$$;
-- TRUNCATE skips row triggers: explicitly protect the historical tables and
-- integrity seal, including attempts using TRUNCATE ... CASCADE.
CREATE TRIGGER bt_journal_entries__truncate_guard
BEFORE TRUNCATE ON public.journal_entries
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_journal_history_immutable();
CREATE TRIGGER bt_journal_lines__truncate_guard
BEFORE TRUNCATE ON public.journal_lines
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_journal_history_immutable();
CREATE TRIGGER bt_journal_entry_seals__truncate_guard
BEFORE TRUNCATE ON public.journal_entry_seals
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_journal_history_immutable();
CREATE TRIGGER bt_posting_batches__truncate_guard
BEFORE TRUNCATE ON public.posting_batches
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_journal_history_immutable();

CREATE TRIGGER bt_journal_entries__immutable
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_history_immutable();
CREATE TRIGGER bt_journal_lines__immutable
BEFORE UPDATE OR DELETE ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_history_immutable();

CREATE FUNCTION public.fn_journal_batch_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.journal_entries e WHERE e.posting_batch_id=OLD.id
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_posting_batches__journal_immutable',
      MESSAGE='PostingBatch referenced by Journal history cannot change';
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER bt_posting_batches__journal_immutable
BEFORE UPDATE OR DELETE ON public.posting_batches
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_batch_immutable();

CREATE FUNCTION public.fn_journal_line_insert_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_branch uuid;
  v_company uuid;
  v_active boolean;
  v_account_company uuid;
  v_account_active boolean;
BEGIN
  -- The entry row is the per-Journal lock row. No transaction may append
  -- while another is creating the seal, even for balanced new lines.
  SELECT e.branch_id INTO v_branch FROM public.journal_entries e
   WHERE e.id=NEW.journal_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__entry_context',
      MESSAGE='JournalLine requires a valid JournalEntry';
  END IF;

  IF EXISTS (SELECT 1 FROM public.journal_entry_seals s
              WHERE s.entry_id=NEW.journal_entry_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__sealed_entry',
      MESSAGE='Cannot append lines to a durably sealed Journal';
  END IF;

  SELECT b.company_id,b.is_active INTO v_company,v_active
    FROM public.branches b WHERE b.id=v_branch FOR SHARE;
  IF NOT FOUND OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__branch_context',
      MESSAGE='JournalLine requires an active Branch';
  END IF;
  SELECT g.company_id,g.is_active INTO v_account_company,v_account_active
    FROM public.gl_accounts g WHERE g.id=NEW.gl_account_id FOR SHARE;
  IF NOT FOUND OR v_account_company IS DISTINCT FROM v_company
    OR v_account_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__account_context',
      MESSAGE='JournalLine GL Account must be active and owned by the Branch Company';
  END IF;
  IF EXISTS (SELECT 1 FROM public.gl_accounts child
              WHERE child.parent_id=NEW.gl_account_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__posting_leaf',
      MESSAGE='JournalLine GL Account must be a leaf';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bt_journal_lines__insert_context
BEFORE INSERT ON public.journal_lines
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_line_insert_guard();

-- New entry seal is created at deferred constraint evaluation (normally
-- COMMIT). SET CONSTRAINTS IMMEDIATE may seal early: all later inserts then
-- fail, rather than letting early evaluation bypass protection.
CREATE FUNCTION public.fn_journal_entry_seal_at_commit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_count integer;
  v_debit numeric;
  v_credit numeric;
  v_snapshot jsonb;
  v_stored public.journal_entry_seals%ROWTYPE;
  v_original_id uuid;
  v_expected jsonb;
  v_actual jsonb;
BEGIN
  PERFORM 1 FROM public.journal_entries e WHERE e.id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__missing_header',
      MESSAGE='Cannot seal a missing JournalEntry';
  END IF;

  SELECT count(*)::integer, COALESCE(sum(l.debit),0), COALESCE(sum(l.credit),0)
    INTO v_count,v_debit,v_credit FROM public.journal_lines l
   WHERE l.journal_entry_id=NEW.id;
  IF v_count=0 THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__nonempty',
      MESSAGE='A committed JournalEntry must contain at least one line';
  END IF;
  IF v_debit<>v_credit THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_entries__commit_balance',
      MESSAGE='JournalEntry lines must balance at commit';
  END IF;

  v_snapshot:=public.fn_journal_line_snapshot(NEW.id);

  IF NEW.reversal_of_entry_id IS NOT NULL THEN
    v_original_id:=NEW.reversal_of_entry_id;
    IF NOT EXISTS (
      SELECT 1 FROM public.journal_entry_seals s WHERE s.entry_id=v_original_id
    ) THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__original_unsealed',
        MESSAGE='Cannot reverse an unsealed original Journal';
    END IF;

    -- Exact MULTISETS, including duplicates and legal 0/0 lines. New line
    -- IDs are unrelated to original IDs; GL/counterparty and amounts match.
    SELECT COALESCE(jsonb_agg(t.payload ORDER BY t.payload),'[]'::jsonb)
      INTO v_expected
      FROM (
        SELECT jsonb_build_array(l.gl_account_id::text,
                                 l.credit::text,l.debit::text,l.counterparty_id::text) AS payload
          FROM public.journal_lines l WHERE l.journal_entry_id=v_original_id
      ) t;
    SELECT COALESCE(jsonb_agg(t.payload ORDER BY t.payload),'[]'::jsonb)
      INTO v_actual
      FROM (
        SELECT jsonb_build_array(l.gl_account_id::text,
                                 l.debit::text,l.credit::text,l.counterparty_id::text) AS payload
          FROM public.journal_lines l WHERE l.journal_entry_id=NEW.id
      ) t;
    IF v_actual IS DISTINCT FROM v_expected THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__reversal_exact',
        MESSAGE='Reversal JournalLines must exactly compensate the original multiset';
    END IF;
  END IF;

  SELECT * INTO v_stored FROM public.journal_entry_seals
   WHERE entry_id=NEW.id FOR UPDATE;
  IF FOUND THEN
    IF v_stored.line_count<>v_count OR v_stored.line_snapshot IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_journal_entries__sealed_contents',
        MESSAGE='Journal content differs from its immutable commit seal';
    END IF;
  ELSE
    INSERT INTO public.journal_entry_seals(entry_id,line_count,line_snapshot)
    VALUES (NEW.id,v_count,v_snapshot);
  END IF;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_journal_entry_seal_at_commit() FROM PUBLIC;
CREATE CONSTRAINT TRIGGER ct_journal_entries__seal_at_commit
AFTER INSERT ON public.journal_entries
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_entry_seal_at_commit();

-- Independent line-level deferred validation must reject a stale/missing seal.
-- It deliberately cannot create a seal for a previously committed header.
CREATE FUNCTION public.fn_journal_line_seal_validate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE v_count integer; v_snapshot jsonb; v_stored public.journal_entry_seals%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.journal_entries e
   WHERE e.id=NEW.journal_entry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__entry_context',
      MESSAGE='Cannot validate line without Journal header';
  END IF;
  SELECT * INTO v_stored FROM public.journal_entry_seals
   WHERE entry_id=NEW.journal_entry_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__missing_seal',
      MESSAGE='JournalLine validation requires a durable header seal';
  END IF;
  SELECT count(*)::integer INTO v_count FROM public.journal_lines
   WHERE journal_entry_id=NEW.journal_entry_id;
  v_snapshot:=public.fn_journal_line_snapshot(NEW.journal_entry_id);
  IF v_stored.line_count<>v_count OR v_stored.line_snapshot IS DISTINCT FROM v_snapshot THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_journal_lines__seal_mismatch',
      MESSAGE='JournalLines differ from the final committed seal';
  END IF;
  RETURN NULL;
END;
$$;
CREATE CONSTRAINT TRIGGER ct_journal_lines__seal_validate
AFTER INSERT ON public.journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.fn_journal_line_seal_validate();

REVOKE ALL ON FUNCTION public.fn_journal_line_snapshot(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_seal_write_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_entry_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_history_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_batch_immutable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_line_insert_guard() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_journal_line_seal_validate() FROM PUBLIC;