CREATE TABLE gl_accounts (
  id uuid NOT NULL,
  company_id uuid NOT NULL,
  code text NOT NULL,
  name text NOT NULL,
  account_type text NOT NULL,
  parent_id uuid,
  is_system boolean NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE journal_entries (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_batch_id uuid NOT NULL,
  reversal_of_entry_id uuid,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL,
  description text
);

CREATE TABLE journal_lines (
  id uuid NOT NULL,
  journal_entry_id uuid NOT NULL,
  gl_account_id uuid NOT NULL,
  debit numeric(18,4) NOT NULL,
  credit numeric(18,4) NOT NULL,
  counterparty_id uuid
);

CREATE FUNCTION fn_journal_entries_balanced_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_debit numeric;
  v_credit numeric;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO v_debit, v_credit
      FROM journal_lines
     WHERE journal_entry_id = NEW.journal_entry_id;

    IF v_debit <> v_credit THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_journal_entries__balanced_at_commit',
        MESSAGE = format(
          'journal entry %s is unbalanced at commit: debit=%s credit=%s',
          NEW.journal_entry_id,
          v_debit,
          v_credit
        );
    END IF;
  END IF;

  IF TG_OP = 'DELETE'
     OR (TG_OP = 'UPDATE' AND OLD.journal_entry_id IS DISTINCT FROM NEW.journal_entry_id) THEN
    SELECT COALESCE(SUM(debit), 0), COALESCE(SUM(credit), 0)
      INTO v_debit, v_credit
      FROM journal_lines
     WHERE journal_entry_id = OLD.journal_entry_id;

    IF v_debit <> v_credit THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        CONSTRAINT = 'ct_journal_entries__balanced_at_commit',
        MESSAGE = format(
          'journal entry %s is unbalanced at commit: debit=%s credit=%s',
          OLD.journal_entry_id,
          v_debit,
          v_credit
        );
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_journal_entries__balanced_at_commit
AFTER INSERT OR UPDATE OR DELETE ON journal_lines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_journal_entries_balanced_at_commit();
