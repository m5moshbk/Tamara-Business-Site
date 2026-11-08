import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { z } from "zod";
import { attachStoreRoutes } from "./store.js";
import { createStoreRepository } from "./database.js";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://beefitness.com.sa";
const MODE = process.env.PAYMENT_MODE || "preview";
const TAMARA_API_TOKEN = process.env.TAMARA_API_TOKEN || "";
const TAMARA_NOTIFICATION_TOKEN = process.env.TAMARA_NOTIFICATION_TOKEN || "";
const TAMARA_BASE_URL = MODE === "live" ? "https://api.tamara.co" : "https://api-sandbox.tamara.co";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
app.use(rateLimit({ windowMs: 60_000, max: 120, standardHeaders: true, legacyHeaders: false }));

const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "TOO_MANY_LOGIN_ATTEMPTS" }
});

app.get("/", (_req, res) => res.sendFile(process.cwd() + "/public/store.html"));
app.get("/admin/catalog", (req, res) => { if (!readSession(req)) return res.redirect("/login"); res.sendFile(process.cwd() + "/public/catalog-admin.html"); });
app.get("/login", (req, res) => {
  if (readSession(req)) return res.redirect("/dashboard");
  res.type("html").send('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BeeFitness Admin</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080808;color:#fff;font-family:system-ui}.box{width:min(420px,calc(100% - 32px));padding:28px;border:1px solid #292929;border-radius:20px;background:#151515}input{width:100%;box-sizing:border-box;margin:8px 0 14px;padding:13px;border-radius:10px;border:1px solid #333;background:#0b0b0b;color:#fff}button{width:100%;padding:13px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.muted{color:#999}.err{color:#ff8f8f;min-height:24px}</style></head><body><form class="box" id="f"><h1>BeeFitness</h1><p class="muted">دخول الإدارة — بوابة الدفع</p><label>اسم المستخدم</label><input id="u" autocomplete="username" required><label>كلمة المرور</label><input id="p" type="password" autocomplete="current-password" required><button>دخول آمن</button><div id="e" class="err"></div><small class="muted">لوحة الإدارة المحمية</small></form><script>f.onsubmit=async(e)=>{e.preventDefault();let r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u.value,password:p.value})});if(r.ok)location.href="/dashboard";else document.querySelector("#e").textContent="بيانات الدخول غير صحيحة أو تم تجاوز المحاولات.";}</script></body></html>');
});
app.get("/dashboard", (req, res) => { if (!readSession(req)) return res.redirect("/login"); res.sendFile(process.cwd() + "/public/index.html"); });
app.get("/index.html", (req, res) => res.redirect("/dashboard"));
app.use(express.static("public", { index: false }));
app.get("/dashboard", (req, res) => { if (!readSession(req)) return res.redirect("/"); res.sendFile(process.cwd() + "/public/index.html"); });
app.use(express.static("public"));

const repository = createStoreRepository();
const orders = repository.orders || new Map();
const events = new Map();

const orderSchema = z.object({
  referenceId: z.string().min(1).max(100),
  provider: z.enum(["tabby", "tamara"]),
  amount: z.number().positive(),
  currency: z.literal("SAR"),
  customer: z.object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(200),
    phone: z.string().min(8).max(30)
  }),
  returnUrl: z.string().url().max(500)
});

const id = (p) => p + "_" + crypto.randomBytes(10).toString("hex");

function safeEqual(a, b) {
  const aa = Buffer.from(a);
  const bb = Buffer.from(b);
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function verifyPassword(password, encoded) {
  try {
    const parts = encoded.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, n, r, p, salt64, hash64] = parts;
    const salt = Buffer.from(salt64, "base64url");
    const expected = Buffer.from(hash64, "base64url");
    const actual = crypto.scryptSync(password, salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p)
    });
    return safeEqual(actual, expected);
  } catch {
    return false;
  }
}

function signSession(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(body).digest("base64url");
  return body + "." + sig;
}

function readSession(req) {
  // Fail closed when any required admin-auth setting is missing.
  if (!ADMIN_USERNAME || !ADMIN_PASSWORD_HASH || !ADMIN_SESSION_SECRET) return null;
  const raw = req.headers.cookie?.split(";").map(x => x.trim()).find(x => x.startsWith("bf_admin="))?.slice(9);
  if (!raw) return null;
  const [body, sig] = raw.split(".");
  if (!body || !sig) return null;
  const expected = crypto.createHmac("sha256", ADMIN_SESSION_SECRET).update(body).digest("base64url");
  if (!safeEqual(sig, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (data.exp < Date.now() || data.u !== ADMIN_USERNAME) return null;
    return data;
  } catch {
    return null;
  }
}

function requireAdmin(req, res, next) {
  if (!readSession(req)) return res.status(401).json({ error: "ADMIN_AUTH_REQUIRED" });
  next();
}

attachStoreRoutes(app, { requireAdmin, repository });

function verifyTamaraJwt(token, secret) {
  if (!token || !secret) return false;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const [headerPart, payloadPart, signaturePart] = parts;
    const header = JSON.parse(Buffer.from(headerPart, "base64url").toString("utf8"));
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
    if (header.alg !== "HS256") return false;

    const expected = crypto.createHmac("sha256", secret)
      .update(headerPart + "." + payloadPart).digest();
    const actual = Buffer.from(signaturePart, "base64url");
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;

    const now = Math.floor(Date.now() / 1000);
    if (!Number.isFinite(Number(payload.exp)) || now >= Number(payload.exp)) return false;
    if (payload.nbf != null && now < Number(payload.nbf)) return false;
    return true;
  } catch {
    return false;
  }
}

function getTamaraWebhookToken(req) {
  const queryToken = typeof req.query.tamaraToken === "string" ? req.query.tamaraToken : null;
  const auth = req.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  const headerToken = match ? match[1] : null;
  if (queryToken && headerToken && queryToken !== headerToken) return null;
  return queryToken || headerToken;
}

function stats() {
  const a = [...orders.values()];
  const p = a.filter(o => ["paid", "captured", "authorised"].includes(o.status));
  return {
    totalOrders: a.length,
    paidOrders: p.length,
    pending: a.filter(o => o.status === "pending").length,
    failed: a.filter(o => o.status === "failed").length,
    revenue: p.reduce((s, o) => s + o.amount, 0),
    providers: {
      tabby: a.filter(o => o.provider === "tabby").length,
      tamara: a.filter(o => o.provider === "tamara").length
    }
  };
}

app.get("/health", (req, res) =>
  res.json({ ok: true, service: "beefitness-payments", mode: MODE, storage: repository.mode, time: new Date().toISOString() })
);

/**
 * Read-only credential diagnostic. Requires an authenticated admin session.
 * A fixed, non-existent UUID is used only for GET; no order is created or changed.
 * Never returns or logs credential values.
 */
app.get("/api/admin/tamara/credentials-check", requireAdmin, async (req, res) => {
  const result = {
    mode: MODE,
    apiToken: TAMARA_API_TOKEN ? "configured_not_exposed" : "missing",
    notificationToken: TAMARA_NOTIFICATION_TOKEN ? "configured_not_exposed" : "missing",
    apiValidation: "not_tested",
    notificationValidation: "cannot_confirm_without_Tamara_signed_notification"
  };

  if (TAMARA_API_TOKEN) {
    try {
      const response = await fetch(
        TAMARA_BASE_URL + "/orders/00000000-0000-4000-8000-000000000000",
        {
          method: "GET",
          headers: {
            "Authorization": "Bearer " + TAMARA_API_TOKEN,
            "Accept": "application/json"
          },
          signal: AbortSignal.timeout(10000)
        }
      );

      if (response.status === 200) {
        result.apiValidation = "accepted_by_Tamara";
      } else if (response.status === 401 || response.status === 403) {
        result.apiValidation = "rejected_by_Tamara";
      } else if (response.status === 404) {
        result.apiValidation = "likely_accepted_order_not_found";
      } else {
        result.apiValidation = "inconclusive_http_" + response.status;
      }
    } catch (error) {
      result.apiValidation = error?.name === "TimeoutError"
        ? "timeout"
        : "network_error";
    }
  }

  res.setHeader("Cache-Control", "no-store");
  res.json(result);
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  const schema = z.object({
    username: z.string().min(1).max(100),
    password: z.string().min(1).max(200)
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_LOGIN" });

  const ok = ADMIN_USERNAME &&
    ADMIN_PASSWORD_HASH &&
    ADMIN_SESSION_SECRET &&
    safeEqual(parsed.data.username, ADMIN_USERNAME) &&
    verifyPassword(parsed.data.password, ADMIN_PASSWORD_HASH);

  if (!ok) return res.status(401).json({ error: "INVALID_CREDENTIALS" });

  const token = signSession({ u: ADMIN_USERNAME, iat: Date.now(), exp: Date.now() + 8 * 60 * 60_000 });
  res.setHeader("Set-Cookie",
    "bf_admin=" + token + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=28800");
  res.json({ ok: true, user: ADMIN_USERNAME, expiresIn: 28800 });
});

app.post("/api/admin/logout", (req, res) => {
  res.setHeader("Set-Cookie", "bf_admin=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
  res.json({ ok: true });
});

app.get("/api/admin/session", (req, res) => {
  const session = readSession(req);
  if (!session) return res.status(401).json({ authenticated: false });
  res.json({ authenticated: true, user: session.u, expiresAt: session.exp });
});

app.get("/api/stats", requireAdmin, async (req, res, next) => { try { res.json(await repository.stats()); } catch (e) { next(e); } });
app.get("/api/orders", requireAdmin, async (req, res, next) => { try { res.json(await repository.listOrders(100)); } catch (e) { next(e); } });


function recordWebhook(provider, req, res) {
  // Fail closed until this provider has documented, verified signature handling.
  return res.status(503).json({
    error: "WEBHOOK_SIGNATURE_VERIFICATION_NOT_CONFIGURED",
    provider,
    message: "Webhook processing is disabled until official signature verification is configured."
  });
}

app.post("/webhooks/tamara", async (req, res, next) => {
  const token = getTamaraWebhookToken(req);
  if (!token || !TAMARA_NOTIFICATION_TOKEN || !verifyTamaraJwt(token, TAMARA_NOTIFICATION_TOKEN)) {
    return res.status(401).json({ error: "INVALID_TAMARA_WEBHOOK_SIGNATURE" });
  }
  if (repository.mode !== "postgres") {
    return res.status(503).json({ error: "PERSISTENT_STORAGE_REQUIRED_FOR_WEBHOOKS" });
  }
  const body=req.body||{},referenceId=typeof body.order_reference_id==="string"?body.order_reference_id:null;
  const providerOrderId=typeof body.order_id==="string"?body.order_id:null;
  const eventType=String(body.event_type||"").toLowerCase();
  const statusByEvent={
    order_approved:"approved",order_authorised:"authorised",order_authorized:"authorised",
    order_captured:"captured",order_declined:"failed",order_canceled:"failed",
    order_cancelled:"failed",order_expired:"failed"
  };
  const nextStatus=statusByEvent[eventType];
  if(!referenceId||!providerOrderId||!nextStatus)return res.status(400).json({error:"INVALID_TAMARA_EVENT"});
  const eventId=req.get("x-event-id")||req.get("x-webhook-id")||
    crypto.createHash("sha256").update(JSON.stringify(body)).digest("hex");
  try {
    const result=await repository.recordWebhook({
      provider:"tamara",eventId,eventType,payload:body,referenceId,status:nextStatus,providerOrderId
    });
    if(!result.found)return res.status(404).json({error:"ORDER_NOT_FOUND"});
    return res.status(200).json({ok:true,duplicate:Boolean(result.duplicate),status:result.status});
  } catch(error) { return next(error); }
});
app.post("/webhooks/tabby", (req, res) => recordWebhook("tabby", req, res));

app.use((req, res) => res.sendFile(process.cwd() + "/public/index.html"));
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => console.log("BeeFitness payment gateway listening on " + PORT));
}

export { app, orders, stats };
