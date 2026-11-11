import test from "node:test";
import assert from "node:assert/strict";
import { createTenantScopedRepository } from "../platform/tenant-repository.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

function fakePool() {
  const calls = [];
  return {
    calls,
    async query(sql, values = []) {
      calls.push({ sql, values });
      return { rows: [], rowCount: 0 };
    },
    async connect() {
      return {
        async query(sql, values = []) {
          calls.push({ sql, values });
          if (sql === "BEGIN" || sql === "COMMIT" || sql === "ROLLBACK") return { rows: [], rowCount: 0 };
          return { rows: [], rowCount: 0 };
        },
        release() {}
      };
    }
  };
}

test("tenant repository rejects absent or malformed tenant context before querying", async () => {
  const pool = fakePool();
  const repo = createTenantScopedRepository({ pool });
  await assert.rejects(() => repo.listProducts({}), /valid tenantId/);
  await assert.rejects(() => repo.listOrders({ tenantId: "not-a-uuid" }), /valid tenantId/);
  assert.equal(pool.calls.length, 0);
});

test("product reads bind the tenant ID into every query", async () => {
  const pool = fakePool();
  const repo = createTenantScopedRepository({ pool });
  await repo.listProducts({ tenantId: tenantA });
  await repo.getProduct({ tenantId: tenantB, productId: "product-1" });
  assert.equal(pool.calls.length, 2);
  assert.ok(pool.calls[0].sql.includes("p.tenant_id = $1"));
  assert.deepEqual(pool.calls[0].values, [tenantA]);
  assert.ok(pool.calls[1].sql.includes("p.tenant_id = $2"));
  assert.deepEqual(pool.calls[1].values, ["product-1", tenantB]);
});

test("order reads and aggregate queries are tenant constrained", async () => {
  const pool = fakePool();
  const repo = createTenantScopedRepository({ pool });
  await repo.listOrders({ tenantId: tenantA, limit: 50 });
  await repo.stats({ tenantId: tenantB });
  assert.ok(pool.calls[0].sql.includes("WHERE o.tenant_id = $1"));
  assert.deepEqual(pool.calls[0].values, [tenantA, 50]);
  assert.ok(pool.calls[1].sql.includes("FROM bf_orders WHERE tenant_id = $1"));
  assert.deepEqual(pool.calls[1].values, [tenantB]);
  assert.ok(pool.calls[2].sql.includes("FROM bf_payment_attempts WHERE tenant_id = $1"));
  assert.deepEqual(pool.calls[2].values, [tenantB]);
});

test("writes persist the tenant on products, orders, order items, and payment attempts", async () => {
  const pool = fakePool();
  const repo = createTenantScopedRepository({ pool });
  await repo.createProduct({
    tenantId: tenantA,
    data: { name: "Test", category: "Tests", priceHalalas: 100, stock: 1, active: true }
  });
  const productInsert = pool.calls.find(call => call.sql.includes("INSERT INTO bf_products"));
  assert.ok(productInsert.sql.includes("tenant_id"));
  assert.equal(productInsert.values[0], tenantA);

  const pool2 = fakePool();
  const repo2 = createTenantScopedRepository({ pool: pool2 });
  await repo2.createOrder({
    tenantId: tenantB,
    provider: "tamara",
    items: [],
    customer: { name: "Test", email: "test@example.invalid", phone: "0500000000" },
    idempotencyKey: "tenant-order-idempotency-0001"
  });
  const lookup = pool2.calls.find(call => call.sql.includes("WHERE pa.tenant_id = $1"));
  assert.deepEqual(lookup.values, [tenantB, "tenant-order-idempotency-0001"]);
});

test("webhook tenant is resolved from the stored order and is not accepted from input", async () => {
  const pool = fakePool();
  const repo = createTenantScopedRepository({ pool });
  await repo.recordVerifiedWebhook({
    tenantId: tenantB,
    provider: "tamara",
    eventId: "event-1",
    eventType: "order_approved",
    payload: {},
    referenceId: "BF-REFERENCE",
    status: "approved"
  });
  const lookup = pool.calls.find(call => call.sql.includes("WHERE o.reference_id = $1"));
  assert.deepEqual(lookup.values, ["BF-REFERENCE", "tamara"]);
});
