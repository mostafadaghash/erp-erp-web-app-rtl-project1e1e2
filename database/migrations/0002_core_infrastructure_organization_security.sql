CREATE TABLE companies (
  id uuid NOT NULL,
  name text NOT NULL,
  short_name text,
  legal_name text,
  commercial_registration text,
  tax_number text,
  address text,
  logo_path text,
  base_currency_code text NOT NULL,
  default_language text NOT NULL,
  timezone text NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE company_phones (
  id uuid NOT NULL,
  company_id uuid NOT NULL,
  phone text NOT NULL,
  sort_order integer NOT NULL
);

CREATE TABLE company_settings (
  company_id uuid NOT NULL,
  settings_json jsonb NOT NULL,
  updated_by uuid,
  updated_at timestamptz NOT NULL
);

CREATE TABLE branches (
  id uuid NOT NULL,
  company_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE branch_settings (
  branch_id uuid NOT NULL,
  default_warehouse_id uuid,
  default_price_list_id uuid,
  default_sales_print_template_id uuid,
  default_purchase_print_template_id uuid,
  settings_json jsonb NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE warehouses (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  name text NOT NULL,
  code text NOT NULL,
  is_active boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE users (
  id uuid NOT NULL,
  name text NOT NULL,
  username text NOT NULL,
  email text,
  password_hash text NOT NULL,
  role_id uuid NOT NULL,
  default_branch_id uuid NOT NULL,
  branch_scope_mode text NOT NULL,
  preferred_language text NOT NULL,
  is_active boolean NOT NULL,
  last_login_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE auth_sessions (
  id uuid NOT NULL,
  user_id uuid NOT NULL,
  refresh_token_hash text NOT NULL,
  device_name text,
  ip_address inet,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE roles (
  id uuid NOT NULL,
  role_key text NOT NULL,
  display_name_key text NOT NULL,
  is_system boolean NOT NULL
);

CREATE TABLE permissions (
  id uuid NOT NULL,
  permission_key text NOT NULL,
  module text NOT NULL,
  description_key text NOT NULL
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  is_allowed boolean NOT NULL
);

CREATE TABLE user_permission_overrides (
  user_id uuid NOT NULL,
  permission_id uuid NOT NULL,
  effect text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL
);

CREATE TABLE user_branch_access (
  user_id uuid NOT NULL,
  branch_id uuid NOT NULL
);

CREATE TABLE document_sequences (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_type text NOT NULL,
  last_number bigint NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE idempotency_keys (
  id uuid NOT NULL,
  key text NOT NULL,
  user_id uuid NOT NULL,
  operation_type text NOT NULL,
  request_hash text NOT NULL,
  result_reference text,
  created_at timestamptz NOT NULL,
  completed_at timestamptz,
  expires_at timestamptz NOT NULL
);

CREATE TABLE posting_batches (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  operation_type text NOT NULL,
  document_version integer NOT NULL,
  reverses_posting_batch_id uuid,
  posted_at timestamptz NOT NULL,
  created_by uuid NOT NULL
);

CREATE TABLE audit_logs (
  id uuid NOT NULL,
  company_id uuid NOT NULL,
  branch_id uuid,
  user_id uuid,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  reason text,
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz NOT NULL
);

CREATE TABLE outbox_events (
  id uuid NOT NULL,
  event_type text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload_json jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  processed_at timestamptz,
  retry_count integer NOT NULL
);

CREATE TABLE document_tombstones (
  id uuid NOT NULL,
  document_type text NOT NULL,
  original_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  deleted_by uuid NOT NULL,
  delete_reason text NOT NULL,
  deleted_at timestamptz NOT NULL
);
