CREATE TABLE print_templates (
  id uuid NOT NULL,
  document_type text NOT NULL,
  name text NOT NULL,
  paper_size text NOT NULL,
  template_code text NOT NULL,
  template_config_json jsonb NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE branch_print_defaults (
  branch_id uuid NOT NULL,
  document_type text NOT NULL,
  print_template_id uuid NOT NULL
);

CREATE TABLE reporting_daily_branch_metrics (
  branch_id uuid NOT NULL,
  date date NOT NULL,
  sales_net numeric(18,4) NOT NULL,
  sales_returns numeric(18,4) NOT NULL,
  cogs numeric(18,4) NOT NULL,
  gross_profit numeric(18,4) NOT NULL,
  purchases_net numeric(18,4) NOT NULL,
  expenses numeric(18,4) NOT NULL,
  other_income numeric(18,4) NOT NULL
);

CREATE TABLE reporting_inventory_balances (
  branch_id uuid NOT NULL,
  warehouse_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  on_hand numeric(18,6) NOT NULL,
  available numeric(18,6) NOT NULL,
  weighted_cost numeric(18,4) NOT NULL,
  inventory_value numeric(18,4) NOT NULL
);

CREATE TABLE reporting_counterparty_balances (
  counterparty_id uuid NOT NULL,
  customer_balance numeric(18,4) NOT NULL,
  supplier_balance numeric(18,4) NOT NULL,
  net_balance numeric(18,4) NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE reporting_treasury_balances (
  treasury_id uuid NOT NULL,
  balance numeric(18,4) NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE reporting_followup_metrics (
  branch_id uuid NOT NULL,
  date date NOT NULL,
  source_type text NOT NULL,
  created_count bigint NOT NULL,
  completed_count bigint NOT NULL,
  overdue_count bigint NOT NULL
);
