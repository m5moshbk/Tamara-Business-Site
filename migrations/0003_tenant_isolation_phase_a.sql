-- BeeFitness tenant-isolation phase A (additive, approval-gated).
-- This migration is a proposal only. Do NOT apply to any database without
-- separate approval, a verified backup, and a reviewed legacy-data ownership map.
--
-- Existing rows deliberately remain tenant_id = NULL. No tenant ownership is
-- inferred from historical data. The NOT VALID checks allow existing legacy
-- rows to remain readable for controlled backfill, but reject new NULL writes.

BEGIN;

ALTER TABLE bf_products
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE bf_orders
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE bf_order_items
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE bf_payment_attempts
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

ALTER TABLE bf_webhook_events
  ADD COLUMN IF NOT EXISTS tenant_id UUID;

-- Referenced composite keys make cross-tenant order-item/payment relationships
-- enforceable once tenant ownership has been assigned.
CREATE UNIQUE INDEX IF NOT EXISTS bf_products_id_tenant_uq
  ON bf_products (id, tenant_id);

CREATE UNIQUE INDEX IF NOT EXISTS bf_orders_id_tenant_uq
  ON bf_orders (id, tenant_id);

CREATE INDEX IF NOT EXISTS bf_products_tenant_active_created_idx
  ON bf_products (tenant_id, active, created_at DESC);

CREATE INDEX IF NOT EXISTS bf_orders_tenant_created_idx
  ON bf_orders (tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bf_order_items_tenant_order_idx
  ON bf_order_items (tenant_id, order_id);

CREATE INDEX IF NOT EXISTS bf_payment_attempts_tenant_order_idx
  ON bf_payment_attempts (tenant_id, order_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bf_webhook_events_tenant_received_idx
  ON bf_webhook_events (tenant_id, received_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_products_tenant_fk') THEN
    ALTER TABLE bf_products ADD CONSTRAINT bf_products_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES bf_tenants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_orders_tenant_fk') THEN
    ALTER TABLE bf_orders ADD CONSTRAINT bf_orders_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES bf_tenants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_order_items_tenant_fk') THEN
    ALTER TABLE bf_order_items ADD CONSTRAINT bf_order_items_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES bf_tenants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_order_items_order_tenant_fk') THEN
    ALTER TABLE bf_order_items ADD CONSTRAINT bf_order_items_order_tenant_fk
      FOREIGN KEY (order_id, tenant_id) REFERENCES bf_orders(id, tenant_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_order_items_product_tenant_fk') THEN
    ALTER TABLE bf_order_items ADD CONSTRAINT bf_order_items_product_tenant_fk
      FOREIGN KEY (product_id, tenant_id) REFERENCES bf_products(id, tenant_id)
      ON DELETE NO ACTION NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_payment_attempts_tenant_fk') THEN
    ALTER TABLE bf_payment_attempts ADD CONSTRAINT bf_payment_attempts_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES bf_tenants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_payment_attempts_order_tenant_fk') THEN
    ALTER TABLE bf_payment_attempts ADD CONSTRAINT bf_payment_attempts_order_tenant_fk
      FOREIGN KEY (order_id, tenant_id) REFERENCES bf_orders(id, tenant_id)
      ON DELETE RESTRICT NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bf_webhook_events_tenant_fk') THEN
    ALTER TABLE bf_webhook_events ADD CONSTRAINT bf_webhook_events_tenant_fk
      FOREIGN KEY (tenant_id) REFERENCES bf_tenants(id) ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;

-- Existing legacy rows are intentionally not backfilled here.
-- New writes must include tenant_id; validate these constraints only after
-- the application deployment supports tenant-scoped writes and backfill plan.
ALTER TABLE bf_products
  ADD CONSTRAINT bf_products_tenant_required CHECK (tenant_id IS NOT NULL) NOT VALID;
ALTER TABLE bf_orders
  ADD CONSTRAINT bf_orders_tenant_required CHECK (tenant_id IS NOT NULL) NOT VALID;
ALTER TABLE bf_order_items
  ADD CONSTRAINT bf_order_items_tenant_required CHECK (tenant_id IS NOT NULL) NOT VALID;
ALTER TABLE bf_payment_attempts
  ADD CONSTRAINT bf_payment_attempts_tenant_required CHECK (tenant_id IS NOT NULL) NOT VALID;
ALTER TABLE bf_webhook_events
  ADD CONSTRAINT bf_webhook_events_tenant_required CHECK (tenant_id IS NOT NULL) NOT VALID;

COMMENT ON COLUMN bf_products.tenant_id IS 'Owning merchant tenant; NULL only for pre-migration legacy rows awaiting reviewed backfill.';
COMMENT ON COLUMN bf_orders.tenant_id IS 'Owning merchant tenant; NULL only for pre-migration legacy rows awaiting reviewed backfill.';
COMMENT ON COLUMN bf_order_items.tenant_id IS 'Must match both the owning order and product tenant.';
COMMENT ON COLUMN bf_payment_attempts.tenant_id IS 'Must match the owning order tenant.';
COMMENT ON COLUMN bf_webhook_events.tenant_id IS 'Tenant scope derived from the verified payment attempt/order, never from webhook input.';

COMMIT;
