-- Phase 08.09 — explicit permissions required by Architecture Baseline v1.7
-- for exceptional Inventory Adjustment outcomes.
-- No Index Catalog change and no default role grant is invented.
INSERT INTO public.permissions
  (id, permission_key, module, description_key)
VALUES
  ('08090000-0000-4000-8000-000000000001',
   'inventory.allow_negative_stock',
   'inventory',
   'permissions.inventory.allowNegativeStock'),
  ('08090000-0000-4000-8000-000000000002',
   'inventory.set_adjustment_cost',
   'inventory',
   'permissions.inventory.setAdjustmentCost');
