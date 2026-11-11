import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  new URL("../migrations/0003_tenant_isolation_phase_a.sql", import.meta.url),
  "utf8"
);

test("tenant migration adds tenant ownership to every core business table", () => {
  for (const table of [
    "bf_products",
    "bf_orders",
    "bf_order_items",
    "bf_payment_attempts",
    "bf_webhook_events"
  ]) {
    assert.match(
      migration,
      new RegExp("ALTER TABLE " + table + "[\\s\\S]*?ADD COLUMN IF NOT EXISTS tenant_id UUID", "i"),
      table + " must receive tenant_id"
    );
    assert.match(
      migration,
      new RegExp(table + "_tenant_required CHECK \\(tenant_id IS NOT NULL\\) NOT VALID", "i"),
      table + " must reject new unscoped rows while preserving legacy rows for backfill"
    );
  }
});

test("order items and payment attempts are constrained to the owning tenant order", () => {
  assert.ok(migration.includes("FOREIGN KEY (order_id, tenant_id) REFERENCES bf_orders(id, tenant_id)"));
  assert.ok(migration.includes("FOREIGN KEY (product_id, tenant_id) REFERENCES bf_products(id, tenant_id)"));
});

test("migration does not guess legacy ownership or enable RLS prematurely", () => {
  assert.doesNotMatch(
    migration,
    new RegExp(String.raw`UPDATE\\s+bf_(products|orders|order_items|payment_attempts|webhook_events)\\s+SET\\s+tenant_id`, "i")
  );
  assert.doesNotMatch(migration, new RegExp(String.raw`ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i"));
  assert.ok(migration.includes("Existing legacy rows are intentionally not backfilled"));
  assert.ok(migration.includes("NOT VALID"));
});
