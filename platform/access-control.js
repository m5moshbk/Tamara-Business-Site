const ROLE_PERMISSIONS = Object.freeze({
  platform_owner: ["*"],
  platform_admin: [
    "tenants:read", "tenants:manage", "users:manage", "catalog:manage",
    "services:manage", "merchants:manage", "documents:manage", "audit:read"
  ],
  operations: [
    "tenants:read", "services:read", "services:manage", "merchants:read",
    "merchants:manage", "documents:read", "documents:manage", "audit:read"
  ],
  support: [
    "services:read", "services:update", "merchants:read",
    "documents:read", "support:manage"
  ],
  merchant_owner: [
    "tenant:read", "profile:manage", "services:create", "services:read",
    "documents:manage", "team:manage"
  ],
  merchant_staff: [
    "tenant:read", "profile:read", "services:create", "services:read",
    "documents:read", "documents:upload"
  ],
  viewer: [
    "tenant:read", "profile:read", "services:read", "documents:read"
  ]
});

const PLATFORM_ROLES = new Set(["platform_owner", "platform_admin"]);
const TENANT_ROLES = new Set(["merchant_owner", "merchant_staff", "viewer"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ROLE_NAMES = Object.freeze(Object.keys(ROLE_PERMISSIONS));

export function isKnownRole(role) {
  return Object.hasOwn(ROLE_PERMISSIONS, role);
}

export function hasPermission(role, permission) {
  if (!isKnownRole(role) || typeof permission !== "string" || !permission) return false;
  const grants = ROLE_PERMISSIONS[role];
  return grants.includes("*") || grants.includes(permission);
}

export function createPermissionMiddleware(readSession, permission) {
  if (typeof readSession !== "function") throw new TypeError("readSession must be a function");
  if (typeof permission !== "string" || !permission) throw new TypeError("permission is required");

  return function permissionMiddleware(req, res, next) {
    const session = readSession(req);
    if (!session) return res.status(401).json({ error: "AUTHENTICATION_REQUIRED" });
    if (!hasPermission(session.role, permission)) {
      return res.status(403).json({ error: "PERMISSION_DENIED" });
    }
    req.auth = session;
    return next();
  };
}

/**
 * Resolve tenant scope exclusively from a verified session and a route-level
 * tenant identifier. Never trust tenant IDs supplied in arbitrary headers.
 */
export function resolveTenantContext(session, requestedTenantId = null) {
  if (!session || !isKnownRole(session.role)) {
    throw Object.assign(new Error("AUTHENTICATION_REQUIRED"), { code: "AUTHENTICATION_REQUIRED" });
  }

  if (PLATFORM_ROLES.has(session.role)) {
    if (requestedTenantId == null) return { tenantId: null, platformWide: true };
    if (typeof requestedTenantId !== "string" || !UUID_PATTERN.test(requestedTenantId)) {
      throw Object.assign(new Error("INVALID_TENANT_ID"), { code: "INVALID_TENANT_ID" });
    }
    return { tenantId: requestedTenantId, platformWide: false };
  }

  if (!TENANT_ROLES.has(session.role) || typeof session.tenantId !== "string" || !UUID_PATTERN.test(session.tenantId)) {
    throw Object.assign(new Error("TENANT_CONTEXT_REQUIRED"), { code: "TENANT_CONTEXT_REQUIRED" });
  }
  if (requestedTenantId != null && requestedTenantId !== session.tenantId) {
    throw Object.assign(new Error("TENANT_ACCESS_DENIED"), { code: "TENANT_ACCESS_DENIED" });
  }
  return { tenantId: session.tenantId, platformWide: false };
}

/**
 * Build a parameterized SQL predicate. The column identifier is allow-listed
 * syntactically; tenantId remains a bound value and is never interpolated.
 */
export function tenantPredicate({ tenantId, column = "tenant_id", paramIndex = 1 }) {
  if (typeof tenantId !== "string" || !UUID_PATTERN.test(tenantId)) {
    throw new TypeError("A valid tenantId is required");
  }
  if (!/^[a-z_][a-z0-9_]*$/i.test(column)) throw new TypeError("Invalid SQL column");
  if (!Number.isInteger(paramIndex) || paramIndex < 1) throw new TypeError("Invalid SQL parameter index");
  return { clause: `"${column}" = $${paramIndex}`, values: [tenantId] };
}
