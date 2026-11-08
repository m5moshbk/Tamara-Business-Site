const ALLOWED_FIELDS = Object.freeze([
  "eventType", "actorId", "role", "tenantId", "resourceType",
  "resourceId", "outcome", "requestId"
]);

const clean = (value, max = 160) => {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
};

export function createAuditLogger({ maxEntries = 1000, clock = () => new Date() } = {}) {
  if (!Number.isInteger(maxEntries) || maxEntries < 1 || maxEntries > 10000) {
    throw new RangeError("maxEntries must be between 1 and 10000");
  }
  const entries = [];

  return Object.freeze({
    storage: "volatile-memory",
    record(input = {}) {
      const eventType = clean(input.eventType, 100);
      if (!eventType || !/^[a-z0-9._-]+$/i.test(eventType)) {
        throw new TypeError("A valid eventType is required");
      }
      const entry = {
        id: crypto.randomUUID(),
        occurredAt: clock().toISOString(),
        eventType
      };
      for (const field of ALLOWED_FIELDS) {
        if (field === "eventType") continue;
        entry[field] = clean(input[field], field === "requestId" ? 100 : 160);
      }
      entries.push(Object.freeze(entry));
      if (entries.length > maxEntries) entries.splice(0, entries.length - maxEntries);
      return entry;
    },
    list({ limit = 100, tenantId = undefined } = {}) {
      const safeLimit = Math.max(1, Math.min(500, Number.isInteger(limit) ? limit : 100));
      return entries
        .filter(entry => tenantId === undefined || entry.tenantId === tenantId)
        .slice(-safeLimit)
        .reverse()
        .map(entry => ({ ...entry }));
    }
  });
}
