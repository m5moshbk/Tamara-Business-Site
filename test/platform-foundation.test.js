import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_NAMES, isKnownRole, hasPermission, resolveTenantContext, tenantPredicate, createPermissionMiddleware
} from "../platform/access-control.js";
import { createAuditLogger } from "../platform/audit-log.js";

const tenantA = "11111111-1111-4111-8111-111111111111";
const tenantB = "22222222-2222-4222-8222-222222222222";

test("role registry is explicit and unknown roles fail closed", () => {
  assert.ok(ROLE_NAMES.includes("platform_owner"));
  assert.ok(isKnownRole("merchant_owner"));
  assert.equal(isKnownRole("superuser"), false);
  assert.equal(hasPermission("superuser", "*"), false);
});

test("least-privilege role matrix separates platform and merchant capabilities", () => {
  assert.equal(hasPermission("platform_owner", "audit:read"), true);
  assert.equal(hasPermission("support", "catalog:manage"), false);
  assert.equal(hasPermission("merchant_owner", "team:manage"), true);
  assert.equal(hasPermission("merchant_staff", "team:manage"), false);
  assert.equal(hasPermission("viewer", "documents:manage"), false);
});

test("merchant tenant scope comes only from the verified session", () => {
  assert.deepEqual(
    resolveTenantContext({ role: "merchant_owner", tenantId: tenantA }),
    { tenantId: tenantA, platformWide: false }
  );
  assert.throws(
    () => resolveTenantContext({ role: "merchant_owner", tenantId: tenantA }, tenantB),
    error => error.code === "TENANT_ACCESS_DENIED"
  );
  assert.throws(
    () => resolveTenantContext({ role: "merchant_owner", tenantId: null }),
    error => error.code === "TENANT_CONTEXT_REQUIRED"
  );
});

test("platform roles may scope an explicit tenant but never accept malformed IDs", () => {
  assert.deepEqual(
    resolveTenantContext({ role: "platform_admin" }, tenantB),
    { tenantId: tenantB, platformWide: false }
  );
  assert.throws(
    () => resolveTenantContext({ role: "platform_admin" }, "tenantB"),
    error => error.code === "INVALID_TENANT_ID"
  );
});

test("tenant SQL predicate binds the tenant ID and rejects unsafe identifiers", () => {
  assert.deepEqual(tenantPredicate({ tenantId: tenantA, column: "tenant_id", paramIndex: 3 }), {
    clause: '"tenant_id" = $3',
    values: [tenantA]
  });
  assert.throws(
    () => tenantPredicate({ tenantId: tenantA, column: 'tenant_id" OR 1=1 --' }),
    /Invalid SQL column/
  );
});

test("audit log allow-lists fields, bounds retention, and omits secrets and arbitrary payloads", () => {
  let tick = 0;
  const log = createAuditLogger({ maxEntries: 2, clock: () => new Date(1700000000000 + tick++ * 1000) });
  log.record({
    eventType: "auth.login.succeeded", actorId: "admin-1", role: "platform_owner",
    password: "must-not-be-stored", metadata: { token: "must-not-be-stored" }
  });
  log.record({ eventType: "catalog.product.created", resourceId: "p-1" });
  log.record({ eventType: "catalog.product.updated", resourceId: "p-1" });
  const events = log.list({ limit: 10 });
  assert.equal(events.length, 2);
  assert.equal(events[0].eventType, "catalog.product.updated");
  assert.equal(Object.hasOwn(events[1], "password"), false);
  assert.equal(Object.hasOwn(events[1], "metadata"), false);
  assert.equal(log.storage, "volatile-memory");
});

test("permission middleware authenticates first and rejects insufficient roles", () => {
  const middleware = createPermissionMiddleware(
    req => req.session || null,
    "catalog:manage"
  );
  const invoke = session => {
    const result = { statusCode: 200, body: null, auth: null, nextCalled: false };
    const res = {
      status(code) { result.statusCode = code; return this; },
      json(body) { result.body = body; return this; }
    };
    middleware({ session, auth: null }, res, () => { result.nextCalled = true; });
    return result;
  };
  assert.equal(invoke(null).statusCode, 401);
  assert.equal(invoke({ role: "support" }).statusCode, 403);
  const allowed = invoke({ role: "platform_owner" });
  assert.equal(allowed.nextCalled, true);
});

test("audit log tenant filter returns only matching tenant events", () => {
  const log = createAuditLogger();
  log.record({ eventType: "tenant.updated", tenantId: tenantA });
  log.record({ eventType: "tenant.updated", tenantId: tenantB });
  assert.deepEqual(log.list({ tenantId: tenantA }).map(event => event.tenantId), [tenantA]);
});
