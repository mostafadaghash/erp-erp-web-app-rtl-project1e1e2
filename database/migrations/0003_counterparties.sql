CREATE TABLE counterparties (
  id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  normalized_phone text,
  address text,
  notes text,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE counterparty_roles (
  counterparty_id uuid NOT NULL,
  role text NOT NULL
);

CREATE TABLE customer_profiles (
  counterparty_id uuid NOT NULL,
  default_price_list_id uuid,
  credit_limit numeric(18,4)
);

CREATE TABLE supplier_profiles (
  counterparty_id uuid NOT NULL,
  notes text
);

CREATE TABLE customer_ledger_entries (
  id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount numeric(18,4) NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_batch_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE supplier_ledger_entries (
  id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  entry_type text NOT NULL,
  amount numeric(18,4) NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_batch_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);
