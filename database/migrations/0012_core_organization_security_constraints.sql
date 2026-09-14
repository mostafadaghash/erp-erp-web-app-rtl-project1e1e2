-- Phase 03.06 / Core-Organization-Security constraint slice.
-- 03.07 query/performance indexes remain intentionally deferred.

-- Pass 1: establish relation identities and ordinary uniqueness first so FK targets exist.
ALTER TABLE companies
  ADD CONSTRAINT pk_companies PRIMARY KEY (id);

ALTER TABLE company_phones
  ADD CONSTRAINT pk_company_phones PRIMARY KEY (id);

ALTER TABLE company_settings
  ADD CONSTRAINT pk_company_settings PRIMARY KEY (company_id);

ALTER TABLE branches
  ADD CONSTRAINT pk_branches PRIMARY KEY (id),
  ADD CONSTRAINT uq_branches__company_code UNIQUE (company_id, code);

ALTER TABLE branch_settings
  ADD CONSTRAINT pk_branch_settings PRIMARY KEY (branch_id);

ALTER TABLE warehouses
  ADD CONSTRAINT pk_warehouses PRIMARY KEY (id),
  ADD CONSTRAINT uq_warehouses__branch_code UNIQUE (branch_id, code);

ALTER TABLE users
  ADD CONSTRAINT pk_users PRIMARY KEY (id);

ALTER TABLE auth_sessions
  ADD CONSTRAINT pk_auth_sessions PRIMARY KEY (id),
  ADD CONSTRAINT uq_auth_sessions__refresh_token_hash UNIQUE (refresh_token_hash);

ALTER TABLE roles
  ADD CONSTRAINT pk_roles PRIMARY KEY (id),
  ADD CONSTRAINT uq_roles__role_key UNIQUE (role_key);

ALTER TABLE permissions
  ADD CONSTRAINT pk_permissions PRIMARY KEY (id),
  ADD CONSTRAINT uq_permissions__permission_key UNIQUE (permission_key);

ALTER TABLE role_permissions
  ADD CONSTRAINT pk_role_permissions PRIMARY KEY (role_id, permission_id);

ALTER TABLE user_permission_overrides
  ADD CONSTRAINT pk_user_permission_overrides PRIMARY KEY (user_id, permission_id);

ALTER TABLE user_branch_access
  ADD CONSTRAINT pk_user_branch_access PRIMARY KEY (user_id, branch_id);

ALTER TABLE document_sequences
  ADD CONSTRAINT pk_document_sequences PRIMARY KEY (id),
  ADD CONSTRAINT uq_document_sequences__branch_document_type UNIQUE (branch_id, document_type);

ALTER TABLE idempotency_keys
  ADD CONSTRAINT pk_idempotency_keys PRIMARY KEY (id),
  ADD CONSTRAINT uq_idempotency_keys__key UNIQUE (key);

ALTER TABLE posting_batches
  ADD CONSTRAINT pk_posting_batches PRIMARY KEY (id);

ALTER TABLE audit_logs
  ADD CONSTRAINT pk_audit_logs PRIMARY KEY (id);

ALTER TABLE outbox_events
  ADD CONSTRAINT pk_outbox_events PRIMARY KEY (id);

ALTER TABLE document_tombstones
  ADD CONSTRAINT pk_document_tombstones PRIMARY KEY (id),
  ADD CONSTRAINT uq_document_tombstones__branch_type_number UNIQUE (branch_id, document_type, document_number),
  ADD CONSTRAINT uq_document_tombstones__original_type UNIQUE (original_id, document_type);

-- Pass 2: row-level CHECK invariants owned by this slice.
ALTER TABLE company_phones
  ADD CONSTRAINT ck_company_phones__sort_order_nonnegative CHECK (sort_order >= 0);

ALTER TABLE users
  ADD CONSTRAINT ck_users__branch_scope_mode CHECK (branch_scope_mode IN ('SELECTED', 'ALL'));

ALTER TABLE user_permission_overrides
  ADD CONSTRAINT ck_user_permission_overrides__effect CHECK (effect IN ('ALLOW', 'DENY'));

ALTER TABLE document_sequences
  ADD CONSTRAINT ck_document_sequences__last_number_nonnegative CHECK (last_number >= 0);

ALTER TABLE posting_batches
  ADD CONSTRAINT ck_posting_batches__operation_type CHECK (operation_type IN ('POST', 'CORRECTION', 'REVERSAL', 'DELETE_REVERSAL')),
  ADD CONSTRAINT ck_posting_batches__document_version_nonnegative CHECK (document_version >= 0);

ALTER TABLE outbox_events
  ADD CONSTRAINT ck_outbox_events__retry_count_nonnegative CHECK (retry_count >= 0);

ALTER TABLE document_tombstones
  ADD CONSTRAINT ck_document_tombstones__document_number_nonnegative CHECK (document_number >= 0);

-- Pass 3: referential actions after every target key exists.
ALTER TABLE company_phones
  ADD CONSTRAINT fk_company_phones__company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;

ALTER TABLE company_settings
  ADD CONSTRAINT fk_company_settings__company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_company_settings__updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE branches
  ADD CONSTRAINT fk_branches__company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

ALTER TABLE branch_settings
  ADD CONSTRAINT fk_branch_settings__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_branch_settings__default_warehouse FOREIGN KEY (default_warehouse_id) REFERENCES warehouses(id) ON DELETE RESTRICT;

ALTER TABLE warehouses
  ADD CONSTRAINT fk_warehouses__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE users
  ADD CONSTRAINT fk_users__role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_users__default_branch FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE auth_sessions
  ADD CONSTRAINT fk_auth_sessions__user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

ALTER TABLE role_permissions
  ADD CONSTRAINT fk_role_permissions__role FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_role_permissions__permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE;

ALTER TABLE user_permission_overrides
  ADD CONSTRAINT fk_user_permission_overrides__user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_user_permission_overrides__permission FOREIGN KEY (permission_id) REFERENCES permissions(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_user_permission_overrides__changed_by FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE user_branch_access
  ADD CONSTRAINT fk_user_branch_access__user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ADD CONSTRAINT fk_user_branch_access__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE;

ALTER TABLE document_sequences
  ADD CONSTRAINT fk_document_sequences__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT;

ALTER TABLE idempotency_keys
  ADD CONSTRAINT fk_idempotency_keys__user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE posting_batches
  ADD CONSTRAINT fk_posting_batches__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_posting_batches__reverses FOREIGN KEY (reverses_posting_batch_id) REFERENCES posting_batches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_posting_batches__created_by FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE audit_logs
  ADD CONSTRAINT fk_audit_logs__company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_audit_logs__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_audit_logs__user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

ALTER TABLE document_tombstones
  ADD CONSTRAINT fk_document_tombstones__branch FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE RESTRICT,
  ADD CONSTRAINT fk_document_tombstones__deleted_by FOREIGN KEY (deleted_by) REFERENCES users(id) ON DELETE RESTRICT;

-- branch_settings.default_warehouse_id is the only Warehouse Default source of truth.
-- The ordinary FK proves existence; deferred constraint triggers prove same-branch + active semantics.
CREATE FUNCTION fn_branch_settings_default_warehouse_valid_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_branch_id uuid;
  v_is_active boolean;
BEGIN
  IF NEW.default_warehouse_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT branch_id, is_active
    INTO v_branch_id, v_is_active
    FROM warehouses
   WHERE id = NEW.default_warehouse_id;

  IF NOT FOUND OR v_branch_id IS DISTINCT FROM NEW.branch_id OR v_is_active IS NOT TRUE THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_branch_settings__default_warehouse_valid_at_commit',
      MESSAGE = format(
        'default warehouse %s must be active and belong to branch %s',
        NEW.default_warehouse_id,
        NEW.branch_id
      );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_branch_settings__default_warehouse_valid_at_commit
AFTER INSERT OR UPDATE ON branch_settings
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_branch_settings_default_warehouse_valid_at_commit();

CREATE FUNCTION fn_warehouses_preserve_default_reference_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM branch_settings bs
     WHERE bs.default_warehouse_id = NEW.id
       AND (bs.branch_id IS DISTINCT FROM NEW.branch_id OR NEW.is_active IS NOT TRUE)
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_warehouses__preserve_default_reference_at_commit',
      MESSAGE = format(
        'warehouse %s cannot be inactive or move branches while it is a branch default',
        NEW.id
      );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_warehouses__preserve_default_reference_at_commit
AFTER UPDATE ON warehouses
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_warehouses_preserve_default_reference_at_commit();

-- SELECTED scope users must keep their default branch inside effective branch access.
-- Deferred validation allows user + access rows to be created in either order inside one transaction.
CREATE FUNCTION fn_users_default_branch_access_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.branch_scope_mode = 'SELECTED'
     AND NOT EXISTS (
       SELECT 1
         FROM user_branch_access uba
        WHERE uba.user_id = NEW.id
          AND uba.branch_id = NEW.default_branch_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_users__default_branch_access_at_commit',
      MESSAGE = format(
        'selected-scope user %s must have access to default branch %s',
        NEW.id,
        NEW.default_branch_id
      );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_users__default_branch_access_at_commit
AFTER INSERT OR UPDATE ON users
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_users_default_branch_access_at_commit();

CREATE FUNCTION fn_user_branch_access_preserves_default_at_commit()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_default_branch_id uuid;
  v_scope text;
BEGIN
  SELECT default_branch_id, branch_scope_mode
    INTO v_default_branch_id, v_scope
    FROM users
   WHERE id = OLD.user_id;

  IF FOUND
     AND v_scope = 'SELECTED'
     AND NOT EXISTS (
       SELECT 1
         FROM user_branch_access uba
        WHERE uba.user_id = OLD.user_id
          AND uba.branch_id = v_default_branch_id
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      CONSTRAINT = 'ct_user_branch_access__preserves_default_at_commit',
      MESSAGE = format(
        'cannot remove default-branch access for selected-scope user %s',
        OLD.user_id
      );
  END IF;

  RETURN NULL;
END;
$$;

CREATE CONSTRAINT TRIGGER ct_user_branch_access__preserves_default_at_commit
AFTER DELETE OR UPDATE ON user_branch_access
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION fn_user_branch_access_preserves_default_at_commit();
