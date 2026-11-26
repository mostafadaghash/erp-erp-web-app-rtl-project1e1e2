-- Lab candidate only. Serialise preflight with writers through trigger installation.
LOCK TABLE public.gl_accounts, public.finance_categories, public.journal_lines,
    public.system_account_mappings IN SHARE ROW EXCLUSIVE MODE;
DO $$
BEGIN
    IF EXISTS (
        SELECT FROM public.gl_accounts a WHERE NOT a.is_active AND (
            EXISTS (SELECT FROM public.journal_lines WHERE gl_account_id = a.id)
            OR EXISTS (SELECT FROM public.system_account_mappings WHERE gl_account_id = a.id)
            OR EXISTS (SELECT FROM public.finance_categories WHERE gl_account_id = a.id AND is_active)
            OR EXISTS (SELECT FROM public.gl_accounts WHERE parent_id = a.id AND is_active)
        )
    ) THEN
        RAISE EXCEPTION 'Inconsistent account state; review the lab preflight before continuing';
    END IF;
END
$$;

CREATE FUNCTION public.guard_gl_lifecycle_0037() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
DECLARE
    protected_fields_changed boolean;
    deactivating boolean;
BEGIN
    IF NEW.is_active AND NEW.parent_id IS NOT NULL THEN
        PERFORM FROM public.gl_accounts WHERE id = NEW.parent_id AND is_active FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='ct_gl_active_parent',
                MESSAGE='Active account requires an active parent';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' THEN RETURN NEW; END IF;
    IF (NEW.id, NEW.is_system) IS DISTINCT FROM (OLD.id, OLD.is_system) THEN
        RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='ct_gl_identity',
            MESSAGE='Account identity and system status are immutable';
    END IF;
    protected_fields_changed := (NEW.code, NEW.account_type, NEW.parent_id)
        IS DISTINCT FROM (OLD.code, OLD.account_type, OLD.parent_id);
    deactivating := OLD.is_active AND NOT NEW.is_active;
    IF NOT (deactivating OR protected_fields_changed) THEN RETURN NEW; END IF;
    IF EXISTS (SELECT FROM public.journal_lines WHERE gl_account_id = OLD.id)
       OR EXISTS (SELECT FROM public.finance_categories WHERE gl_account_id = OLD.id
                  AND (is_active OR protected_fields_changed))
       OR EXISTS (SELECT FROM public.system_account_mappings WHERE gl_account_id = OLD.id)
       OR (deactivating AND EXISTS (SELECT FROM public.gl_accounts WHERE parent_id = OLD.id AND is_active))
    THEN
        RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='ct_gl_protected_use',
            MESSAGE='Account change conflicts with accounting history or dependent records';
    END IF;
    RETURN NEW;
END
$$;

CREATE FUNCTION public.guard_category_gl_0037() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
    IF NEW.is_active THEN
        PERFORM FROM public.gl_accounts WHERE id = NEW.gl_account_id AND is_active FOR SHARE;
        IF NOT FOUND THEN
            RAISE EXCEPTION USING ERRCODE='23514', CONSTRAINT='ct_category_active_gl',
                MESSAGE='Active category requires an active account';
        END IF;
    END IF;
    RETURN NEW;
END
$$;

CREATE TRIGGER bt_gl_accounts__lifecycle_guard BEFORE INSERT OR UPDATE ON public.gl_accounts
FOR EACH ROW EXECUTE FUNCTION public.guard_gl_lifecycle_0037();
CREATE TRIGGER bt_finance_categories__active_gl BEFORE INSERT OR UPDATE OF is_active, gl_account_id
ON public.finance_categories FOR EACH ROW EXECUTE FUNCTION public.guard_category_gl_0037();
REVOKE ALL ON FUNCTION public.guard_gl_lifecycle_0037(), public.guard_category_gl_0037() FROM PUBLIC;
