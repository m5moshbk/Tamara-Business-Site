import test, { after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { once } from "node:events";

process.env.NODE_ENV = "test";
process.env.PAYMENT_MODE = "preview";
delete process.env.ADMIN_USERNAME;
delete process.env.ADMIN_PASSWORD_HASH;
delete process.env.ADMIN_SESSION_SECRET;
delete process.env.TAMARA_NOTIFICATION_TOKEN;

const missingConfig = await import("../server.js?ci-missing-auth");
const missingServer = missingConfig.app.listen(0, "127.0.0.1");
await once(missingServer, "listening");
const missingBase = `http://127.0.0.1:${missingServer.address().port}`;

const salt = Buffer.from("ci-only-salt");
const passwordHash = crypto.scryptSync("ci-only-password", salt, 64, {
  N: 16384, r: 8, p: 1
}).toString("base64url");
process.env.ADMIN_USERNAME = "ci-admin";
process.env.ADMIN_PASSWORD_HASH =
  `scrypt$16384$8$1$${salt.toString("base64url")}$${passwordHash}`;
process.env.ADMIN_SESSION_SECRET = "ci-only-session-secret-long-enough-for-tests";

const validConfig = await import("../server.js?ci-valid-auth");
const validServer = validConfig.app.listen(0, "127.0.0.1");
await once(validServer, "listening");
const validBase = `http://127.0.0.1:${validServer.address().port}`;

async function postJson(base, path, body, headers = {}) {
  return fetch(base + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body)
  });
}

after(async () => {
  await Promise.all([missingServer, validServer].map(server =>
    new Promise(resolve => server.close(resolve))
  ));
});

test("missing admin-auth configuration rejects empty-secret session cookies", async () => {
  const payload = Buffer.from(JSON.stringify({
    u: "",
    exp: Date.now() + 60_000
  })).toString("base64url");
  const signature = crypto.createHmac("sha256", "").update(payload).digest("base64url");
  const response = await fetch(missingBase + "/api/stats", {
    headers: { Cookie: `bf_admin=${payload}.${signature}` }
  });
  assert.equal(response.status, 401);
});

test("unsigned Tabby webhook is rejected without changing preview order state", async () => {
  const checkout = await postJson(missingBase, "/api/checkout", {
    referenceId: "ci-tabby-preview-order",
    provider: "tabby",
    amount: 10,
    currency: "SAR",
    customer: {
      name: "CI Test",
      email: "ci@example.invalid",
      phone: "0500000000"
    },
    returnUrl: "https://beefitness.com.sa/thank-you"
  });
  assert.equal(checkout.status, 200);
  const order = await checkout.json();
  assert.equal(order.status, "preview_only");

  const webhook = await postJson(missingBase, "/webhooks/tabby", {
    event_type: "paid",
    order_reference_id: "ci-tabby-preview-order"
  });
  assert.equal(webhook.status, 503);
  assert.equal(
    (await webhook.json()).error,
    "WEBHOOK_SIGNATURE_VERIFICATION_NOT_CONFIGURED"
  );
  assert.equal(missingConfig.orders.get(order.orderId).status, "preview_only");
  assert.equal(missingConfig.stats().paidOrders, 0);
  assert.equal(missingConfig.stats().revenue, 0);
});

test("Tamara webhook continues to reject missing signatures", async () => {
  const response = await postJson(missingBase, "/webhooks/tamara", {
    event_type: "order_captured",
    order_reference_id: "ci-tamara-order"
  });
  assert.equal(response.status, 401);
});

test("configured administrator can still log in and access protected stats", async () => {
  const login = await postJson(validBase, "/api/admin/login", {
    username: "ci-admin",
    password: "ci-only-password"
  });
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.get("set-cookie");
  assert.ok(cookieHeader);
  const cookie = cookieHeader.split(";")[0];

  const denied = await fetch(validBase + "/api/stats");
  assert.equal(denied.status, 401);

  const allowed = await fetch(validBase + "/api/stats", {
    headers: { Cookie: cookie }
  });
  assert.equal(allowed.status, 200);
});
