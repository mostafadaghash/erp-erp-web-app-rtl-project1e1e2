-- Phase 09.08 / ADR-0027: System Account Mapping structural integrity only.
-- Adds no Journal writer, Posting Rules or unrelated query/performance indexes.
-- All existing migration definitions and original Accounting tables remain unchanged.

CREATE TABLE public.system_account_mappings (
  company_id uuid NOT NULL,
  scope_type text NOT NULL,
  scope_id uuid NOT NULL,
  role_key text NOT NULL,
  gl_account_id uuid NOT NULL,
  updated_by uuid NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT pk_system_account_mappings
    PRIMARY KEY (company_id, scope_type, scope_id, role_key),
  CONSTRAINT uq_system_account_mappings__role_target
    UNIQUE (company_id, scope_type, role_key, gl_account_id),
  CONSTRAINT ck_system_account_mappings__scope
    CHECK (scope_type IN ('COMPANY','TREASURY')),
  CONSTRAINT ck_system_account_mappings__role_format
    CHECK (role_key ~ '^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$'),
  CONSTRAINT fk_system_account_mappings__company
    FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE RESTRICT,
  CONSTRAINT fk_system_account_mappings__account
    FOREIGN KEY (gl_account_id) REFERENCES public.gl_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT fk_system_account_mappings__actor
    FOREIGN KEY (updated_by) REFERENCES public.users(id) ON DELETE RESTRICT
);

-- Role-scoped references are inherently polymorphic: scope_id is either the
-- Company or a Treasury. Resolve and lock actual parents rather than create a
-- misleading conventional FK to one of those two tables.
CREATE FUNCTION public.fn_gl_system_account_mapping_validate()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_company uuid;
  v_active boolean;
  v_branch_id uuid;
  v_treasury_company uuid;
BEGIN
  IF TG_OP='UPDATE' AND (
      NEW.company_id IS DISTINCT FROM OLD.company_id
      OR NEW.scope_type IS DISTINCT FROM OLD.scope_type
      OR NEW.scope_id IS DISTINCT FROM OLD.scope_id
      OR NEW.role_key IS DISTINCT FROM OLD.role_key
  ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_system_account_mappings__identity',
      MESSAGE='mapping identity is immutable; delete and re-create under authorized administration';
  END IF;

  IF NEW.scope_type='COMPANY' THEN
    IF NEW.scope_id IS DISTINCT FROM NEW.company_id
       OR NEW.role_key='TREASURY_ASSET' THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_system_account_mappings__scope',
        MESSAGE='COMPANY mapping must reference own company and cannot use TREASURY_ASSET role';
    END IF;
  ELSIF NEW.scope_type='TREASURY' THEN
    IF NEW.role_key<>'TREASURY_ASSET' THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_system_account_mappings__scope',
        MESSAGE='TREASURY scope requires TREASURY_ASSET role';
    END IF;

    -- Lock Treasury before GL, preventing concurrent reassignment/deactivation.
    SELECT t.branch_id,t.is_active INTO v_branch_id,v_active
      FROM public.treasuries t WHERE t.id=NEW.scope_id FOR SHARE;
    IF NOT FOUND OR v_active IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_system_account_mappings__treasury',
        MESSAGE='mapping Treasury is missing or inactive';
    END IF;
    SELECT b.company_id INTO v_treasury_company
      FROM public.branches b WHERE b.id=v_branch_id FOR SHARE;
    IF v_treasury_company IS DISTINCT FROM NEW.company_id THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_system_account_mappings__company',
        MESSAGE='Treasury mapping must belong to the Treasury branch company';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_system_account_mappings__scope',
      MESSAGE='unsupported mapping scope';
  END IF;

  -- FOR SHARE, not KEY SHARE: non-key account deactivation must wait.
  SELECT a.company_id,a.is_active INTO v_company,v_active
    FROM public.gl_accounts a WHERE a.id=NEW.gl_account_id FOR SHARE;
  IF NOT FOUND OR v_company IS DISTINCT FROM NEW.company_id OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_system_account_mappings__account',
      MESSAGE='mapping GL Account must be active and owned by the same company';
  END IF;

  IF EXISTS (SELECT 1 FROM public.gl_accounts child
              WHERE child.parent_id=NEW.gl_account_id) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_system_account_mappings__leaf',
      MESSAGE='mapping must target a posting-eligible leaf GL Account';
  END IF;

  NEW.updated_at:=clock_timestamp();
  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_system_account_mappings__validate
BEFORE INSERT OR UPDATE ON public.system_account_mappings
FOR EACH ROW EXECUTE FUNCTION public.fn_gl_system_account_mapping_validate();

-- Keep GL hierarchy rooted inside a Company; prevent account-tree cycles and
-- turning an already mapped or historically posted leaf into a summary account.
CREATE FUNCTION public.fn_gl_account_hierarchy_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_parent_company uuid;
  v_parent_id uuid;
  v_seen uuid[] := ARRAY[NEW.id];
BEGIN
  IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_gl_accounts__company_immutable',
      MESSAGE='GL Account Company cannot change';
  END IF;

  IF NEW.parent_id IS NOT NULL
    AND (TG_OP='INSERT' OR NEW.parent_id IS DISTINCT FROM OLD.parent_id) THEN

    IF NEW.parent_id=NEW.id THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_gl_accounts__hierarchy',
        MESSAGE='GL Account cannot be its own parent';
    END IF;

    -- A parent update conflicts with this FOR UPDATE lock. It also conflicts
    -- with mapping resolution FOR SHARE and prevents creating a new child
    -- underneath a mapped account while that mapping is being inserted.
    SELECT p.company_id,p.parent_id INTO v_parent_company,v_parent_id
      FROM public.gl_accounts p WHERE p.id=NEW.parent_id FOR UPDATE;
    IF FOUND THEN
      IF v_parent_company IS DISTINCT FROM NEW.company_id THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          CONSTRAINT='ct_gl_accounts__hierarchy',
          MESSAGE='GL parent must belong to the same Company';
      END IF;

      IF EXISTS (
        SELECT 1 FROM public.system_account_mappings m
         WHERE m.gl_account_id=NEW.parent_id
      ) OR EXISTS (
        SELECT 1 FROM public.journal_lines l
         WHERE l.gl_account_id=NEW.parent_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE='23514',
          CONSTRAINT='ct_gl_accounts__posting_leaf',
          MESSAGE='cannot turn mapped or historically posted GL account into a summary';
      END IF;

      -- Walk ancestors to reject indirect cycles; baseline 0033 preflight
      -- already confirms there is no pre-existing corrupted cycle.
      v_seen := array_append(v_seen,NEW.parent_id);
      WHILE v_parent_id IS NOT NULL LOOP
        IF v_parent_id=ANY(v_seen) THEN
          RAISE EXCEPTION USING ERRCODE='23514',
            CONSTRAINT='ct_gl_accounts__hierarchy',
            MESSAGE='GL parent hierarchy contains a cycle';
        END IF;
        v_seen := array_append(v_seen,v_parent_id);
        SELECT parent_id INTO v_parent_id
          FROM public.gl_accounts WHERE id=v_parent_id;
      END LOOP;
    END IF;
  END IF;

  IF TG_OP='UPDATE' AND OLD.is_active IS TRUE AND NEW.is_active IS NOT TRUE
      AND EXISTS (
        SELECT 1 FROM public.system_account_mappings m WHERE m.gl_account_id=OLD.id
      ) THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_gl_accounts__mapped_active',
      MESSAGE='cannot deactivate GL Account used by System Account Mapping';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER bt_gl_accounts__hierarchy_guard
BEFORE INSERT OR UPDATE ON public.gl_accounts
FOR EACH ROW EXECUTE FUNCTION public.fn_gl_account_hierarchy_guard();

-- A mapped Treasury cannot silently move Branch or deactivate. A mapping
-- deletion must commit before a later Treasury administration operation.
CREATE FUNCTION public.fn_mapped_treasury_guard()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.system_account_mappings m
     WHERE m.scope_type='TREASURY' AND m.scope_id=OLD.id
  ) THEN
    IF TG_OP='DELETE'
       OR NEW.branch_id IS DISTINCT FROM OLD.branch_id
       OR NEW.is_active IS NOT TRUE THEN
      RAISE EXCEPTION USING ERRCODE='23514',
        CONSTRAINT='ct_treasuries__mapped_context',
        MESSAGE='mapped Treasury cannot be removed, deactivated or reassigned';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER bt_treasuries__mapped_context
BEFORE UPDATE OR DELETE ON public.treasuries
FOR EACH ROW EXECUTE FUNCTION public.fn_mapped_treasury_guard();

-- Company changes on a Branch would invalidate the historical Journal and
-- Finance context, not merely mappings. Disallow identity reassignment.
CREATE FUNCTION public.fn_branch_company_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    RAISE EXCEPTION USING ERRCODE='23514',
      CONSTRAINT='ct_branches__company_immutable',
      MESSAGE='Branch Company cannot be reassigned';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER bt_branches__company_immutable
BEFORE UPDATE OF company_id ON public.branches
FOR EACH ROW EXECUTE FUNCTION public.fn_branch_company_immutable();
