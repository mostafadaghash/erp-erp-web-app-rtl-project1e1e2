CREATE TABLE treasuries (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  is_active boolean NOT NULL,
  notes text,
  created_at timestamptz NOT NULL
);

CREATE TABLE receipts (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  treasury_id uuid NOT NULL,
  counterparty_id uuid,
  amount numeric(18,4) NOT NULL,
  category_id uuid,
  reference text,
  notes text,
  occurred_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE disbursements (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  treasury_id uuid NOT NULL,
  counterparty_id uuid,
  amount numeric(18,4) NOT NULL,
  category_id uuid,
  reference text,
  notes text,
  occurred_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE finance_categories (
  id uuid NOT NULL,
  name text NOT NULL,
  category_type text NOT NULL,
  gl_account_id uuid NOT NULL,
  is_active boolean NOT NULL
);

CREATE TABLE treasury_transfers (
  id uuid NOT NULL,
  issuing_branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  from_treasury_id uuid NOT NULL,
  to_treasury_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL,
  reference text,
  notes text,
  occurred_at timestamptz NOT NULL,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE financial_movements (
  id uuid NOT NULL,
  treasury_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  direction text NOT NULL,
  amount numeric(18,4) NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  posting_batch_id uuid NOT NULL,
  counterparty_id uuid,
  occurred_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE treasury_balance_positions (
  treasury_id uuid NOT NULL,
  current_balance numeric(18,4) NOT NULL,
  version integer NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE financial_allocations (
  id uuid NOT NULL,
  financial_source_type text NOT NULL,
  financial_source_id uuid NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE customer_advances (
  id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  sales_order_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  original_amount numeric(18,4) NOT NULL,
  remaining_amount_projection numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE advance_applications (
  id uuid NOT NULL,
  advance_id uuid NOT NULL,
  sales_invoice_id uuid NOT NULL,
  amount numeric(18,4) NOT NULL,
  applied_at timestamptz NOT NULL
);

CREATE TABLE cheques (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  direction text NOT NULL,
  cheque_number text NOT NULL,
  bank_name text NOT NULL,
  amount numeric(18,4) NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  settlement_financial_movement_id uuid,
  notes text,
  created_at timestamptz NOT NULL
);

CREATE TABLE installment_plans (
  id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  total_amount numeric(18,4) NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE installments (
  id uuid NOT NULL,
  plan_id uuid NOT NULL,
  due_date date NOT NULL,
  amount numeric(18,4) NOT NULL,
  paid_amount_projection numeric(18,4) NOT NULL,
  status text NOT NULL
);
