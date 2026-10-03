CREATE TABLE repair_orders (
  id uuid NOT NULL,
  branch_id uuid NOT NULL,
  document_number bigint NOT NULL,
  counterparty_id uuid NOT NULL,
  device_description text NOT NULL,
  device_serial text,
  reported_problem text NOT NULL,
  status text NOT NULL,
  current_technician_id uuid,
  received_at timestamptz NOT NULL,
  completed_at timestamptz,
  delivered_at timestamptz,
  version integer NOT NULL,
  customer_notes text,
  internal_notes text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE repair_status_history (
  id uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid NOT NULL,
  reason text,
  changed_at timestamptz NOT NULL
);

CREATE TABLE repair_assignments (
  id uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  assigned_at timestamptz NOT NULL,
  received_by_technician_at timestamptz,
  ended_at timestamptz,
  assigned_by uuid NOT NULL
);

CREATE TABLE repair_issue_reports (
  id uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  technician_id uuid NOT NULL,
  problem_report text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE repair_customer_decisions (
  id uuid NOT NULL,
  repair_issue_report_id uuid NOT NULL,
  decision text NOT NULL,
  notes text,
  recorded_by uuid NOT NULL,
  recorded_at timestamptz NOT NULL
);

CREATE TABLE repair_tracking_tokens (
  id uuid NOT NULL,
  repair_order_id uuid NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL
);

CREATE TABLE customer_followups (
  id uuid NOT NULL,
  counterparty_id uuid NOT NULL,
  branch_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid,
  source_event_id uuid,
  followup_type text NOT NULL,
  required_action text NOT NULL,
  priority text NOT NULL,
  assigned_user_id uuid NOT NULL,
  status text NOT NULL,
  due_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  completed_at timestamptz
);

CREATE TABLE followup_actions (
  id uuid NOT NULL,
  followup_id uuid NOT NULL,
  action_type text NOT NULL,
  result text,
  notes text,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE followup_status_history (
  id uuid NOT NULL,
  followup_id uuid NOT NULL,
  from_status text,
  to_status text NOT NULL,
  changed_by uuid NOT NULL,
  changed_at timestamptz NOT NULL
);

CREATE TABLE message_templates (
  id uuid NOT NULL,
  event_key text NOT NULL,
  language text NOT NULL,
  template_text text NOT NULL,
  is_active boolean NOT NULL,
  updated_at timestamptz NOT NULL
);

CREATE TABLE notifications (
  id uuid NOT NULL,
  event_type text NOT NULL,
  notification_type text NOT NULL,
  branch_id uuid NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  outbox_event_id uuid,
  title_key text NOT NULL,
  message_key text NOT NULL,
  message_params_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE TABLE notification_recipients (
  notification_id uuid NOT NULL,
  user_id uuid NOT NULL,
  seen_at timestamptz,
  read_at timestamptz
);
