-- Phase 03.06 / Counterparties + Customer/Supplier Ledgers constraint slice.
-- 03.07 query/search indexes remain intentionally deferred.

-- Relation identities and mandatory mapping uniqueness.
ALTER TABLE counterparties
  ADD CONSTRAINT pk_counterparties PRIMARY KEY (id);

ALTER TABLE counterparty_roles
  ADD CONSTRAINT pk_counterparty_roles PRIMARY KEY (counterparty_id, role);

ALTER TABLE customer_profiles
  ADD CONSTRAINT pk_customer_profiles PRIMARY KEY (counterparty_id);

ALTER TABLE supplier_profiles
  ADD CONSTRAINT pk_supplier_profiles PRIMARY KEY (counterparty_id);

ALTER TABLE customer_ledger_entries
  ADD CONSTRAINT pk_customer_ledger_entries PRIMARY KEY (id);

ALTER TABLE supplier_ledger_entries
  ADD CONSTRAINT pk_supplier_ledger_entries PRIMARY KEY (id);

-- Closed domains and non-negative monetary values. Ledger direction remains expressed by entry_type;
-- this slice does not invent a new ledger entry_type vocabulary or a mutable balance rule.
ALTER TABLE counterparty_roles
  ADD CONSTRAINT ck_counterparty_roles__role
  CHECK (role IN ('CUSTOMER', 'SUPPLIER', 'OTHER'));

ALTER TABLE customer_profiles
  ADD CONSTRAINT ck_customer_profiles__credit_limit_nonnegative
  CHECK (credit_limit IS NULL OR credit_limit >= 0);

ALTER TABLE customer_ledger_entries
  ADD CONSTRAINT ck_customer_ledger_entries__amount_nonnegative
  CHECK (amount >= 0);

ALTER TABLE supplier_ledger_entries
  ADD CONSTRAINT ck_supplier_ledger_entries__amount_nonnegative
  CHECK (amount >= 0);

-- Pure child/configuration rows have no independent historical meaning, so they cascade with the
-- canonical counterparty. Historical ledger references are restrictive and must never disappear
-- because a parent row was deleted.
ALTER TABLE counterparty_roles
  ADD CONSTRAINT fk_counterparty_roles__counterparty
  FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;

ALTER TABLE customer_profiles
  ADD CONSTRAINT fk_customer_profiles__counterparty
  FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;

ALTER TABLE supplier_profiles
  ADD CONSTRAINT fk_supplier_profiles__counterparty
  FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE CASCADE;

ALTER TABLE customer_ledger_entries
  ADD CONSTRAINT fk_customer_ledger_entries__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_ledger_entries__branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_ledger_entries__posting_batch
    FOREIGN KEY (posting_batch_id) REFERENCES posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_customer_ledger_entries__created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE supplier_ledger_entries
  ADD CONSTRAINT fk_supplier_ledger_entries__counterparty
    FOREIGN KEY (counterparty_id) REFERENCES counterparties(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_supplier_ledger_entries__branch
    FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_supplier_ledger_entries__posting_batch
    FOREIGN KEY (posting_batch_id) REFERENCES posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_supplier_ledger_entries__created_by
    FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

-- customer_profiles.default_price_list_id targets price_lists, whose primary key is intentionally
-- owned by the later Product Catalog constraint slice. Do not pull that cross-domain FK forward.
-- normalized_phone search remains a non-unique 03.07 Index Catalog concern.
