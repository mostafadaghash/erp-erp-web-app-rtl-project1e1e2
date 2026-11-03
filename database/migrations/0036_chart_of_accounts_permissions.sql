-- Phase 09.08-B: ADR-0029 accepted Chart of Accounts and mapping permissions.
-- Canonical permission rows plus default grants for EXISTING approved roles.
-- Fresh installations may have no roles during schema migration; RoleCatalogService
-- ensures exactly these defaults when creating roles later.
-- No new role is fabricated, no existing role/user permission is altered,
-- no user override is changed, no index/DDL, no business or Production data.
INSERT INTO public.permissions (id, permission_key, module, description_key)
VALUES
  ('09080000-0000-4000-8000-000000000101','accounting.chart.view','accounting','permissions.accounting.chart.view'),
  ('09080000-0000-4000-8000-000000000102','accounting.chart.manage','accounting','permissions.accounting.chart.manage'),
  ('09080000-0000-4000-8000-000000000103','accounting.mappings.view','accounting','permissions.accounting.mappings.view'),
  ('09080000-0000-4000-8000-000000000104','accounting.mappings.manage','accounting','permissions.accounting.mappings.manage');

INSERT INTO public.role_permissions (role_id, permission_id, is_allowed)
SELECT r.id, p.id, true
FROM public.roles r
CROSS JOIN public.permissions p
WHERE
  (r.role_key = 'SYSTEM_ADMIN' AND p.permission_key IN (
    'accounting.chart.view', 'accounting.chart.manage',
    'accounting.mappings.view', 'accounting.mappings.manage'
  ))
  OR (r.role_key = 'ACCOUNTANT' AND p.permission_key IN (
    'accounting.chart.view', 'accounting.mappings.view'
  ))
ORDER BY r.role_key, p.permission_key
ON CONFLICT (role_id, permission_id) DO NOTHING;
