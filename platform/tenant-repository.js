import crypto from "node:crypto";
import { tenantPredicate } from "./access-control.js";

const productFromRow = r => ({
  id: r.id, sku: r.sku || "", name: r.name, description: r.description || "",
  category: r.category_name || "", categoryId: r.category_id,
  priceHalalas: Number(r.price_halalas),
  compareAtHalalas: r.compare_at_halalas == null ? null : Number(r.compare_at_halalas),
  stock: Number(r.stock), imageUrl: r.image_url || null, active: Boolean(r.active),
  createdAt: r.created_at, updatedAt: r.updated_at
});

const orderFromRow = r => ({
  id: r.id, referenceId: r.reference_id, provider: r.provider || null,
  amount: Number(r.total_halalas) / 100, amountHalalas: Number(r.total_halalas),
  currency: r.currency, status: r.status,
  customer: { name: r.customer_name, email: r.customer_email, phone: r.customer_phone },
  createdAt: r.created_at, updatedAt: r.updated_at
});

const PRODUCT_SELECT = `
  SELECT p.*, c.name AS category_name
  FROM bf_products p
  LEFT JOIN bf_categories c ON c.id = p.category_id
`;

function scopedTenantId(tenantId) {
  // Reuse the central UUID validator; tenant IDs are always bound parameters.
  return tenantPredicate({ tenantId }).values[0];
}

async function transaction(pool, work) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch {}
    throw error;
  } finally {
    client.release();
  }
}

function categorySlug(value) {
  return value.toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    .slice(0, 100) || "category-" + crypto.randomBytes(3).toString("hex");
}

/**
 * Tenant-scoped PostgreSQL data access.
 *
 * The caller MUST resolve tenantId from a verified server-side session or a
 * trusted storefront-host mapping. Never pass a tenant ID supplied by a
 * request body or arbitrary header. This adapter is deliberately not wired
 * into legacy routes until identity and migration rollout are separately
 * completed and tested.
 */
export function createTenantScopedRepository({ pool } = {}) {
  if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
    throw new TypeError("A PostgreSQL pool is required");
  }

  return Object.freeze({
    mode: "postgres-tenant-scoped",

    async listProducts({ tenantId, admin = false, q = "", category = "" } = {}) {
      const tenant = scopedTenantId(tenantId);
      const values = [tenant];
      const where = ["p.tenant_id = $1"];
      if (!admin) where.push("p.active = TRUE AND p.stock > 0");
      if (category) {
        values.push(category);
        where.push("c.name = $" + values.length);
      }
      if (q) {
        values.push("%" + String(q).replace(/[\\%_]/g, "\\$&") + "%");
        where.push("(p.name ILIKE $" + values.length +
          " OR p.description ILIKE $" + values.length +
          " OR COALESCE(p.sku, '') ILIKE $" + values.length + ")");
      }
      const result = await pool.query(
        PRODUCT_SELECT + " WHERE " + where.join(" AND ") + " ORDER BY p.created_at DESC",
        values
      );
      return result.rows.map(productFromRow);
    },

    async getProduct({ tenantId, productId } = {}) {
      const tenant = scopedTenantId(tenantId);
      const result = await pool.query(
        PRODUCT_SELECT + " WHERE p.id = $1 AND p.tenant_id = $2",
        [productId, tenant]
      );
      return result.rowCount ? productFromRow(result.rows[0]) : null;
    },

    async createProduct({ tenantId, data } = {}) {
      const tenant = scopedTenantId(tenantId);
      return transaction(pool, async client => {
        const slug = categorySlug(data.category);
        const category = await client.query(
          "INSERT INTO bf_categories(name, slug) VALUES($1, $2) " +
          "ON CONFLICT(name) DO UPDATE SET name = EXCLUDED.name RETURNING id, name",
          [data.category, slug]
        );
        const result = await client.query(
          "INSERT INTO bf_products(tenant_id, sku, name, description, category_id, price_halalas, compare_at_halalas, stock, image_url, active) " +
          "VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
          [tenant, data.sku || null, data.name, data.description || "",
            category.rows[0].id, data.priceHalalas, data.compareAtHalalas ?? null,
            data.stock ?? 0, data.imageUrl ?? null, data.active ?? true]
        );
        return productFromRow({ ...result.rows[0], category_name: category.rows[0].name });
      });
    },

    async updateProduct({ tenantId, productId, patch } = {}) {
      const tenant = scopedTenantId(tenantId);
      return transaction(pool, async client => {
        const found = await client.query(
          PRODUCT_SELECT + " WHERE p.id = $1 AND p.tenant_id = $2 FOR UPDATE OF p",
          [productId, tenant]
        );
        if (!found.rowCount) return null;
        const current = productFromRow(found.rows[0]);
        const next = { ...current, ...patch };
        let categoryId = current.categoryId;
        if (patch.category) {
          const category = await client.query(
            "INSERT INTO bf_categories(name, slug) VALUES($1, $2) " +
            "ON CONFLICT(name) DO UPDATE SET name = EXCLUDED.name RETURNING id",
            [patch.category, categorySlug(patch.category)]
          );
          categoryId = category.rows[0].id;
        }
        const updated = await client.query(
          "UPDATE bf_products SET sku=$3, name=$4, description=$5, category_id=$6, " +
          "price_halalas=$7, compare_at_halalas=$8, stock=$9, image_url=$10, active=$11, updated_at=NOW() " +
          "WHERE id=$1 AND tenant_id=$2 RETURNING *",
          [productId, tenant, next.sku || null, next.name, next.description,
            categoryId, next.priceHalalas, next.compareAtHalalas ?? null,
            next.stock, next.imageUrl ?? null, next.active]
        );
        return updated.rowCount
          ? productFromRow({ ...updated.rows[0], category_name: next.category })
          : null;
      });
    },

    async createOrder({ tenantId, provider, items, customer, idempotencyKey } = {}) {
      const tenant = scopedTenantId(tenantId);
      const requestHash = crypto.createHash("sha256")
        .update(JSON.stringify({ provider, items, customer })).digest("hex");
      return transaction(pool, async client => {
        const existing = await client.query(
          "SELECT o.*, pa.provider, pa.request_hash FROM bf_payment_attempts pa " +
          "JOIN bf_orders o ON o.id = pa.order_id AND o.tenant_id = pa.tenant_id " +
          "WHERE pa.tenant_id = $1 AND pa.idempotency_key = $2 FOR UPDATE OF pa, o",
          [tenant, idempotencyKey]
        );
        if (existing.rowCount) {
          if (existing.rows[0].request_hash !== requestHash) {
            throw Object.assign(new Error("IDEMPOTENCY_KEY_REUSED"), { code: "IDEMPOTENCY_KEY_REUSED" });
          }
          return orderFromRow(existing.rows[0]);
        }

        const lines = [];
        for (const item of items) {
          const result = await client.query(
            "SELECT id, sku, name, price_halalas, stock, active FROM bf_products " +
            "WHERE id = $1 AND tenant_id = $2 FOR UPDATE",
            [item.productId, tenant]
          );
          const product = result.rows[0];
          if (!product || !product.active) {
            throw Object.assign(new Error("PRODUCT_UNAVAILABLE"), { code: "PRODUCT_UNAVAILABLE", productId: item.productId });
          }
          if (item.quantity > Number(product.stock)) {
            throw Object.assign(new Error("INSUFFICIENT_STOCK"), { code: "INSUFFICIENT_STOCK", productId: item.productId });
          }
          lines.push({
            productId: product.id, name: product.name, sku: product.sku,
            quantity: item.quantity, unitPriceHalalas: Number(product.price_halalas),
            lineTotalHalalas: Number(product.price_halalas) * item.quantity
          });
        }

        const total = lines.reduce((sum, line) => sum + line.lineTotalHalalas, 0);
        const referenceId = "BF-" + crypto.randomBytes(6).toString("hex").toUpperCase();
        const inserted = await client.query(
          "INSERT INTO bf_orders(tenant_id, reference_id, customer_name, customer_email, customer_phone, subtotal_halalas, shipping_halalas, total_halalas, status) " +
          "VALUES($1,$2,$3,$4,$5,$6,0,$6,'preview_only') RETURNING *",
          [tenant, referenceId, customer.name, customer.email, customer.phone, total]
        );
        const order = orderFromRow({ ...inserted.rows[0], provider });
        for (const line of lines) {
          await client.query(
            "INSERT INTO bf_order_items(tenant_id, order_id, product_id, product_name_snapshot, sku_snapshot, quantity, unit_price_halalas, line_total_halalas) " +
            "VALUES($1,$2,$3,$4,$5,$6,$7,$8)",
            [tenant, order.id, line.productId, line.name, line.sku,
              line.quantity, line.unitPriceHalalas, line.lineTotalHalalas]
          );
        }
        await client.query(
          "INSERT INTO bf_payment_attempts(tenant_id, order_id, provider, status, idempotency_key, request_hash) " +
          "VALUES($1,$2,$3,'preview_only',$4,$5)",
          [tenant, order.id, provider, idempotencyKey, requestHash]
        );
        return { ...order, provider, items: lines };
      });
    },

    async listOrders({ tenantId, limit = 100 } = {}) {
      const tenant = scopedTenantId(tenantId);
      const safeLimit = Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : 100));
      const result = await pool.query(
        "SELECT o.*, pa.provider FROM bf_orders o " +
        "LEFT JOIN LATERAL (SELECT provider FROM bf_payment_attempts " +
        "WHERE order_id = o.id AND tenant_id = o.tenant_id ORDER BY created_at DESC LIMIT 1) pa ON TRUE " +
        "WHERE o.tenant_id = $1 ORDER BY o.created_at DESC LIMIT $2",
        [tenant, safeLimit]
      );
      return result.rows.map(orderFromRow);
    },

    async stats({ tenantId } = {}) {
      const tenant = scopedTenantId(tenantId);
      const totals = await pool.query(
        "SELECT COUNT(*)::int total_orders, " +
        "COUNT(*) FILTER(WHERE status IN ('captured','closed'))::int paid_orders, " +
        "COUNT(*) FILTER(WHERE status IN ('pending','preview_only'))::int pending, " +
        "COUNT(*) FILTER(WHERE status='failed')::int failed, " +
        "COALESCE(SUM(total_halalas) FILTER(WHERE status IN ('captured','closed')),0)::bigint revenue " +
        "FROM bf_orders WHERE tenant_id = $1",
        [tenant]
      );
      const providers = await pool.query(
        "SELECT provider, COUNT(*)::int count FROM bf_payment_attempts WHERE tenant_id = $1 GROUP BY provider",
        [tenant]
      );
      const providerCounts = { tabby: 0, tamara: 0 };
      for (const row of providers.rows) providerCounts[row.provider] = row.count;
      const row = totals.rows[0];
      return {
        totalOrders: row.total_orders, paidOrders: row.paid_orders,
        pending: row.pending, failed: row.failed,
        revenue: Number(row.revenue) / 100, providers: providerCounts
      };
    },

    // Call only after provider signature/authentication has been verified.
    // Tenant scope is derived from the matched stored order, never webhook input.
    async recordVerifiedWebhook({ provider, eventId, eventType, payload, referenceId, status, providerOrderId, providerPaymentId } = {}) {
      return transaction(pool, async client => {
        const found = await client.query(
          "SELECT o.id, o.status, o.tenant_id, pa.id AS attempt_id FROM bf_orders o " +
          "JOIN bf_payment_attempts pa ON pa.order_id = o.id AND pa.tenant_id = o.tenant_id " +
          "WHERE o.reference_id = $1 AND pa.provider = $2 FOR UPDATE OF o, pa",
          [referenceId, provider]
        );
        if (!found.rowCount) return { duplicate: false, found: false };
        const order = found.rows[0];
        const tenant = scopedTenantId(order.tenant_id);
        const inserted = await client.query(
          "INSERT INTO bf_webhook_events(tenant_id, provider, provider_event_id, event_type, signature_verified, payload) " +
          "VALUES($1,$2,$3,$4,TRUE,$5::jsonb) ON CONFLICT(provider, provider_event_id) DO NOTHING RETURNING id",
          [tenant, provider, eventId, eventType, JSON.stringify(payload ?? {})]
        );
        if (!inserted.rowCount) return { duplicate: true, found: true, status: order.status };
        await client.query(
          "UPDATE bf_payment_attempts SET provider_order_id=COALESCE($3,provider_order_id), " +
          "provider_payment_id=COALESCE($4,provider_payment_id), status=$5, updated_at=NOW() " +
          "WHERE id=$1 AND tenant_id=$2",
          [order.attempt_id, tenant, providerOrderId ?? null, providerPaymentId ?? null, status]
        );
        const rank = { preview_only: -1, pending: 0, approved: 1, authorised: 2, captured: 3, closed: 4, failed: -2 };
        const currentRank = rank[order.status] ?? -1;
        const nextRank = rank[status] ?? -1;
        const mayAdvance = order.status !== "failed" &&
          (status === "failed" ? currentRank < 2 : nextRank > currentRank);
        if (mayAdvance) {
          await client.query(
            "UPDATE bf_orders SET status=$3, updated_at=NOW() WHERE id=$1 AND tenant_id=$2",
            [order.id, tenant, status]
          );
        }
        return { duplicate: false, found: true, status: mayAdvance ? status : order.status, tenantId: tenant };
      });
    }
  });
}
