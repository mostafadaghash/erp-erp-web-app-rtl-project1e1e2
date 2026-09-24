-- Phase 08.06 — dedicated permission for expired Batch sale override.
-- No Index Catalog change and no default role grant is invented.
INSERT INTO public.permissions
  (id, permission_key, module, description_key)
VALUES
  ('08060000-0000-4000-8000-000000000001',
   'inventory.sell_expired_batch',
   'inventory',
   'permissions.inventory.sellExpiredBatch');
