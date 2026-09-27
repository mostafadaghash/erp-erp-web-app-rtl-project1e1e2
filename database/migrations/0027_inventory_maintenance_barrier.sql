-- Phase 08.10: a transaction-scoped database barrier shared by ALL stock,
-- cost, batch and reservation writers, including legacy commands.
-- Exclusive maintenance lock waits for active writers and blocks new ones.
-- Trigger obtains shared lock before any projection mutation. The maintenance
-- transaction itself can acquire a shared lock while holding exclusive.
CREATE FUNCTION public.fn_inventory_maintenance_writer_barrier()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock_shared(721017, 810);
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER bt_inventory_stock_positions__maintenance
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_stock_positions
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_variant_warehouse_cost_projection__maintenance
BEFORE INSERT OR UPDATE OR DELETE ON public.variant_warehouse_cost_projection
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_batch_stock_positions__maintenance
BEFORE INSERT OR UPDATE OR DELETE ON public.batch_stock_positions
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_stock_reservations__maintenance
BEFORE INSERT OR UPDATE OR DELETE ON public.stock_reservations
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_inventory_movements__maintenance
BEFORE INSERT ON public.inventory_movements
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_inventory_movement_lines__maintenance
BEFORE INSERT ON public.inventory_movement_lines
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_inventory_line_batches__maintenance
BEFORE INSERT ON public.inventory_line_batches
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();

CREATE TRIGGER bt_inventory_line_serials__maintenance
BEFORE INSERT ON public.inventory_line_serials
FOR EACH STATEMENT EXECUTE FUNCTION public.fn_inventory_maintenance_writer_barrier();
