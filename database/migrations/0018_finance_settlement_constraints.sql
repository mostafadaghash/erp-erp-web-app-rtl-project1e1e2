-- Phase 03.06 Finance / Treasury / Settlement constraints only.
-- Independent query/search/performance and partial/expression indexes remain deferred to Phase 03.07.
-- Over-allocation, Active Treasury validation, cheque double-settlement, installment settlement,
-- and deterministic treasury locking remain backend transaction rules implemented in later phases.
-- finance_categories.gl_account_id -> gl_accounts(id) is deliberately deferred until the Accounting
-- constraint slice establishes the canonical Accounting target key.

-- Canonical identities and ordinary uniqueness.
ALTER TABLE public.treasuries
  ADD CONSTRAINT pk_treasuries PRIMARY KEY (id),
  ADD CONSTRAINT uq_treasuries__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.receipts
  ADD CONSTRAINT pk_receipts PRIMARY KEY (id),
  ADD CONSTRAINT uq_receipts__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.disbursements
  ADD CONSTRAINT pk_disbursements PRIMARY KEY (id),
  ADD CONSTRAINT uq_disbursements__branch_document UNIQUE (branch_id, document_number);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT pk_finance_categories PRIMARY KEY (id);

ALTER TABLE public.treasury_transfers
  ADD CONSTRAINT pk_treasury_transfers PRIMARY KEY (id),
  ADD CONSTRAINT uq_treasury_transfers__branch_document UNIQUE (issuing_branch_id, document_number);

ALTER TABLE public.financial_movements
  ADD CONSTRAINT pk_financial_movements PRIMARY KEY (id),
  ADD CONSTRAINT uq_financial_movements__id_branch UNIQUE (id, branch_id);

ALTER TABLE public.treasury_balance_positions
  ADD CONSTRAINT pk_treasury_balance_positions PRIMARY KEY (treasury_id);

ALTER TABLE public.financial_allocations
  ADD CONSTRAINT pk_financial_allocations PRIMARY KEY (id),
  ADD CONSTRAINT uq_financial_allocations__source_target UNIQUE (
    financial_source_type, financial_source_id, target_type, target_id
  );

ALTER TABLE public.customer_advances
  ADD CONSTRAINT pk_customer_advances PRIMARY KEY (id),
  ADD CONSTRAINT uq_customer_advances__receipt UNIQUE (receipt_id);

ALTER TABLE public.advance_applications
  ADD CONSTRAINT pk_advance_applications PRIMARY KEY (id);

ALTER TABLE public.cheques
  ADD CONSTRAINT pk_cheques PRIMARY KEY (id);

ALTER TABLE public.installment_plans
  ADD CONSTRAINT pk_installment_plans PRIMARY KEY (id);

ALTER TABLE public.installments
  ADD CONSTRAINT pk_installments PRIMARY KEY (id);

-- Historical/master references default to RESTRICT. Composite FKs protect Branch + Treasury context.
ALTER TABLE public.treasuries
  ADD CONSTRAINT fk_treasuries__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT;

ALTER TABLE public.receipts
  ADD CONSTRAINT fk_receipts__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_receipts__treasury_branch
    FOREIGN KEY (treasury_id, branch_id) REFERENCES public.treasuries(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_receipts__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_receipts__category
    FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_receipts__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.disbursements
  ADD CONSTRAINT fk_disbursements__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disbursements__treasury_branch
    FOREIGN KEY (treasury_id, branch_id) REFERENCES public.treasuries(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disbursements__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disbursements__category
    FOREIGN KEY (category_id) REFERENCES public.finance_categories(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_disbursements__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.treasury_transfers
  ADD CONSTRAINT fk_treasury_transfers__issuing_branch
    FOREIGN KEY (issuing_branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_treasury_transfers__from_treasury_branch
    FOREIGN KEY (from_treasury_id, issuing_branch_id) REFERENCES public.treasuries(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_treasury_transfers__to_treasury_branch
    FOREIGN KEY (to_treasury_id, issuing_branch_id) REFERENCES public.treasuries(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_treasury_transfers__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.financial_movements
  ADD CONSTRAINT fk_financial_movements__treasury_branch
    FOREIGN KEY (treasury_id, branch_id) REFERENCES public.treasuries(id, branch_id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_financial_movements__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_financial_movements__posting_batch
    FOREIGN KEY (posting_batch_id) REFERENCES public.posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_financial_movements__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_financial_movements__created_by
    FOREIGN KEY (created_by) REFERENCES public.users(id) ON DELETE RESTRICT;

ALTER TABLE public.treasury_balance_positions
  ADD CONSTRAINT fk_treasury_balance_positions__treasury
    FOREIGN KEY (treasury_id) REFERENCES public.treasuries(id) ON DELETE RESTRICT;

-- financial_allocations uses polymorphic source/target pairs by design.
-- Do not add fake conventional FKs for financial_source_* or target_*.

ALTER TABLE public.customer_advances
  ADD CONSTRAINT fk_customer_advances__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_advances__sales_order
    FOREIGN KEY (sales_order_id) REFERENCES public.sales_orders(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_advances__receipt
    FOREIGN KEY (receipt_id) REFERENCES public.receipts(id) ON DELETE RESTRICT;

ALTER TABLE public.advance_applications
  ADD CONSTRAINT fk_advance_applications__advance
    FOREIGN KEY (advance_id) REFERENCES public.customer_advances(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_advance_applications__sales_invoice
    FOREIGN KEY (sales_invoice_id) REFERENCES public.sales_invoices(id) ON DELETE RESTRICT;

ALTER TABLE public.cheques
  ADD CONSTRAINT fk_cheques__branch
    FOREIGN KEY (branch_id) REFERENCES public.branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_cheques__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_cheques__settlement_movement_branch
    FOREIGN KEY (settlement_financial_movement_id, branch_id)
    REFERENCES public.financial_movements(id, branch_id) ON DELETE RESTRICT;

ALTER TABLE public.installment_plans
  ADD CONSTRAINT fk_installment_plans__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES public.counterparties(id) ON DELETE RESTRICT;

ALTER TABLE public.installments
  ADD CONSTRAINT fk_installments__plan
    FOREIGN KEY (plan_id) REFERENCES public.installment_plans(id) ON DELETE RESTRICT;

-- Numeric and closed-domain integrity.
ALTER TABLE public.receipts
  ADD CONSTRAINT ck_receipts__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_receipts__amount_positive CHECK (amount > 0);

ALTER TABLE public.disbursements
  ADD CONSTRAINT ck_disbursements__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_disbursements__amount_positive CHECK (amount > 0);

ALTER TABLE public.finance_categories
  ADD CONSTRAINT ck_finance_categories__category_type CHECK (category_type IN ('INCOME', 'EXPENSE'));

ALTER TABLE public.treasury_transfers
  ADD CONSTRAINT ck_treasury_transfers__document_number_positive CHECK (document_number > 0),
  ADD CONSTRAINT ck_treasury_transfers__amount_positive CHECK (amount > 0),
  ADD CONSTRAINT ck_treasury_transfers__different_treasuries CHECK (from_treasury_id <> to_treasury_id);

ALTER TABLE public.financial_movements
  ADD CONSTRAINT ck_financial_movements__direction CHECK (direction IN ('IN', 'OUT')),
  ADD CONSTRAINT ck_financial_movements__amount_positive CHECK (amount > 0);

ALTER TABLE public.treasury_balance_positions
  ADD CONSTRAINT ck_treasury_balance_positions__version_nonnegative CHECK (version >= 0);

ALTER TABLE public.financial_allocations
  ADD CONSTRAINT ck_financial_allocations__amount_positive CHECK (amount > 0);

ALTER TABLE public.customer_advances
  ADD CONSTRAINT ck_customer_advances__original_amount_positive CHECK (original_amount > 0),
  ADD CONSTRAINT ck_customer_advances__remaining_projection_range CHECK (
    remaining_amount_projection >= 0 AND remaining_amount_projection <= original_amount
  );

ALTER TABLE public.advance_applications
  ADD CONSTRAINT ck_advance_applications__amount_positive CHECK (amount > 0);

ALTER TABLE public.cheques
  ADD CONSTRAINT ck_cheques__direction CHECK (direction IN ('RECEIVABLE', 'PAYABLE')),
  ADD CONSTRAINT ck_cheques__status CHECK (status IN ('PENDING', 'CLEARED', 'BOUNCED', 'CANCELLED')),
  ADD CONSTRAINT ck_cheques__amount_positive CHECK (amount > 0);

ALTER TABLE public.installment_plans
  ADD CONSTRAINT ck_installment_plans__total_amount_positive CHECK (total_amount > 0);

ALTER TABLE public.installments
  ADD CONSTRAINT ck_installments__amount_positive CHECK (amount > 0),
  ADD CONSTRAINT ck_installments__paid_projection_range CHECK (
    paid_amount_projection >= 0 AND paid_amount_projection <= amount
  ),
  ADD CONSTRAINT ck_installments__status CHECK (
    status IN ('UPCOMING', 'DUE', 'PARTIAL', 'PAID', 'OVERDUE')
  );
