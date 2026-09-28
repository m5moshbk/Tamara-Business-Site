import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import crypto from "node:crypto";
import { z } from "zod";

const app = express();
const PORT = Number(process.env.PORT || 10000);
const ORIGIN = process.env.ALLOWED_ORIGIN || "https://beefitness.com.sa";
const MODE = process.env.PAYMENT_MODE || "preview";
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "";
const ADMIN_PASSWORD_HASH = process.env.ADMIN_PASSWORD_HASH || "";
const ADMIN_SESSION_SECRET = process.env.ADMIN_SESSION_SECRET || "";

app.set("trust proxy", 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "256kb" }));
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", ORIGIN);
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
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

app.get("/", (req, res) => { if (readSession(req)) return res.sendFile(process.cwd() + "/public/index.html"); res.type("html").send('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>BeeFitness Admin</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#080808;color:#fff;font-family:system-ui}.box{width:min(420px,calc(100% - 32px));padding:28px;border:1px solid #292929;border-radius:20px;background:#151515}input{width:100%;box-sizing:border-box;margin:8px 0 14px;padding:13px;border-radius:10px;border:1px solid #333;background:#0b0b0b;color:#fff}button{width:100%;padding:13px;border:0;border-radius:10px;font-weight:800;cursor:pointer}.muted{color:#999}.err{color:#ff8f8f;min-height:24px}</style></head><body><form class="box" id="f"><h1>BeeFitness</h1><p class="muted">دخول الإدارة — بوابة الدفع</p><label>اسم المستخدم</label><input id="u" autocomplete="username" required><label>كلمة المرور</label><input id="p" type="password" autocomplete="current-password" required><button>دخول آمن</button><div id="e" class="err"></div><small class="muted">المالك: Ahmed jafari — تلفون: 0173266999</small></form><script>f.onsubmit=async(e)=>{e.preventDefault();let r=await fetch("/api/admin/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({username:u.value,password:p.value})});if(r.ok)location.href="/dashboard";else document.querySelector("#e").textContent="بيانات الدخول غير صحيحة أو تم تجاوز المحاولات.";}</script></body></html>'); });
app.get("/dashboard", (req, res) => { if (!readSession(req)) return res.redirect("/"); res.sendFile(process.cwd() + "/public/index.html"); });
app.use(express.static("public"));

const orders = new Map();
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
  res.json({ ok: true, service: "beefitness-payments", mode: MODE, time: new Date().toISOString() })
);

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

app.get("/api/stats", requireAdmin, (req, res) => res.json(stats()));
app.get("/api/orders", requireAdmin, (req, res) =>
  res.json([...orders.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100))
);

app.post("/api/checkout", (req, res) => {
  const parsed = orderSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "INVALID_ORDER", details: parsed.error.issues });

  const data = parsed.data;
  const order = {
    id: id("ord"), ...data, status: "pending",
    createdAt: new Date().toISOString(), providerOrderId: null
  };
  orders.set(order.id, order);

  if (MODE !== "live") {
    order.providerOrderId = id(data.provider);
    order.status = "paid";
    order.checkoutUrl = data.returnUrl + "?payment=preview&order=" + encodeURIComponent(order.id);
    orders.set(order.id, order);
    return res.json({ orderId: order.id, checkoutUrl: order.checkoutUrl, status: order.status, preview: true });
  }

  return res.status(501).json({
    error: "LIVE_PROVIDER_NOT_CONFIGURED",
    message: "Configure verified provider adapters and merchant credentials before enabling live mode."
  });
});

function recordWebhook(provider, req, res) {
  const eventId = req.get("x-event-id") || req.get("x-webhook-id") ||
    crypto.createHash("sha256").update(JSON.stringify(req.body)).digest("hex");
  if (events.has(eventId)) return res.status(200).json({ ok: true, idempotent: true });
  events.set(eventId, { provider, receivedAt: new Date().toISOString() });

  const b = req.body || {};
  const ref = b.order_reference_id || b.reference_id || b.order_reference || b.order_id;
  const order = [...orders.values()].find(o =>
    o.referenceId === ref || o.providerOrderId === ref || o.id === ref
  );

  if (order) {
    const e = String(b.event_type || b.event || b.status || "").toLowerCase();
    if (/declin|fail|cancel|expire/.test(e)) order.status = "failed";
    else if (/captur/.test(e)) order.status = "captured";
    else if (/author|approv|paid/.test(e)) order.status = "paid";
    orders.set(order.id, order);
  }
  res.status(200).json({ ok: true });
}

app.post("/webhooks/tamara", (req, res) => recordWebhook("tamara", req, res));
app.post("/webhooks/tabby", (req, res) => recordWebhook("tabby", req, res));

app.use((req, res) => res.sendFile(process.cwd() + "/public/index.html"));
app.listen(PORT, () => console.log("BeeFitness payment gateway listening on " + PORT));
