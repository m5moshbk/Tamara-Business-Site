-- BeeFitness Platform Foundation (design migration; not applied automatically).
-- Existing legacy catalog/order tables remain unchanged in this phase.
CREATE TABLE IF NOT EXISTS bf_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  business_type TEXT,
  country_code CHAR(2) NOT NULL DEFAULT 'SA',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bf_platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  platform_role TEXT CHECK (platform_role IN ('platform_owner', 'platform_admin', 'operations', 'support')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'locked', 'disabled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS bf_platform_users_email_lower_uq
  ON bf_platform_users (LOWER(email));

CREATE TABLE IF NOT EXISTS bf_tenant_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES bf_tenants(id) ON DELETE RESTRICT,
  user_id UUID NOT NULL REFERENCES bf_platform_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL
    CHECK (role IN ('merchant_owner', 'merchant_staff', 'viewer')),
  status TEXT NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'active', 'revoked')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX IF NOT EXISTS bf_tenant_memberships_user_idx
  ON bf_tenant_memberships (user_id, status);
CREATE INDEX IF NOT EXISTS bf_tenant_memberships_tenant_idx
  ON bf_tenant_memberships (tenant_id, status);

CREATE TABLE IF NOT EXISTS bf_auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES bf_platform_users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_seen_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS bf_auth_sessions_user_expiry_idx
  ON bf_auth_sessions (user_id, expires_at);

CREATE TABLE IF NOT EXISTS bf_audit_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES bf_tenants(id) ON DELETE RESTRICT,
  actor_user_id UUID REFERENCES bf_platform_users(id) ON DELETE SET NULL,
  actor_role TEXT,
  event_type TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  outcome TEXT NOT NULL DEFAULT 'success'
    CHECK (outcome IN ('success', 'denied', 'failure')),
  request_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS bf_audit_events_tenant_time_idx
  ON bf_audit_events (tenant_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS bf_audit_events_actor_time_idx
  ON bf_audit_events (actor_user_id, occurred_at DESC);

COMMENT ON TABLE bf_tenants IS 'Tenant boundary for merchant workspaces.';
COMMENT ON TABLE bf_tenant_memberships IS 'Role assignments scoped to a single tenant.';
COMMENT ON TABLE bf_auth_sessions IS 'Server-revocable sessions; token_hash stores only a one-way token digest.';
COMMENT ON TABLE bf_audit_events IS 'Append-oriented audit trail; never store passwords, tokens, or raw payment payloads in metadata.';

-- Row-level security is intentionally not enabled in this design-only migration.
-- Enable it only after every tenant-scoped DB operation sets and clears
-- app.tenant_id inside the same transaction and platform-admin access is tested.
