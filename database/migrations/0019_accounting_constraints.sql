-- Phase 03.06 Accounting constraints only.
-- Independent Accounting query/search/performance indexes remain deferred to Phase 03.07.
-- Preserve the existing DEFERRABLE INITIALLY DEFERRED journal-balance constraint trigger from 0009.
-- Posting creation/reversal workflows remain later backend transaction responsibilities.

-- Canonical identities and approved ordinary uniqueness.
ALTER TABLE public.gl_accounts
  ADD CONSTRAINT pk_gl_accounts PRIMARY KEY (id),
  ADD CONSTRAINT uq_gl_accounts__company_code UNIQUE (company_id, code);

ALTER TABLE public.journal_entries
  ADD CONSTRAINT pk_journal_entries PRIMARY KEY (id);

ALTER TABLE public.journal_lines
  ADD CONSTRAINT pk_journal_lines PRIMARY KEY (id);

-- Historical/master Accounting references default to RESTRICT.
ALTER TABLE public.gl_accounts
  ADD CONSTRAINT fk_gl_accounts__company
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_gl_accounts__parent
    FOREIGN KEY (parent_id) REFERENCES public.gl_accounts(id) ON DELETE RESTRICT;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT fk_journal_entries__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_journal_entries__posting_batch
    FOREIGN KEY (posting_batch_id) REFERENCES public.posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_journal_entries__reversal_entry
    FOREIGN KEY (reversal_of_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_journal_entries__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.journal_lines
  ADD CONSTRAINT fk_journal_lines__journal_entry
    FOREIGN KEY (journal_entry_id) REFERENCES public.journal_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_journal_lines__gl_account
    FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_journal_lines__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT;

-- Close the Finance -> Accounting relationship deliberately deferred by migration 0018.
ALTER TABLE public.finance_categories
  ADD CONSTRAINT fk_finance_categories__gl_account
    FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id) ON DELETE RESTRICT;

-- Row-level debit / credit integrity. Full-entry balance remains the existing deferred constraint trigger.
ALTER TABLE public.journal_lines
  ADD CONSTRAINT ck_journal_lines__debit_nonnegative CHECK (debit >= 0),
  ADD CONSTRAINT ck_journal_lines__credit_nonnegative CHECK (credit >= 0),
  ADD CONSTRAINT ck_journal_lines__single_side CHECK (NOT (debit > 0 AND credit > 0));

-- No CHECK is introduced for gl_accounts.account_type because Baseline v1.7 does not define
-- a closed technical vocabulary for that field. No fake FK is introduced for journal source_type/source_id.
