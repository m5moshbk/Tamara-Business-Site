# BeeFitness — Tenant Isolation Phase A

**Status:** Draft implementation on an isolated branch  
**Date:** 2026-11-11  
**Policy:** Read-Only production / Approval-Gated changes  
**Base commit:** `e60a00bf6413b9d93746b4dd0ed127e994cd8dbe`

## Scope

This phase prepares the relational tenant boundary without changing the live database or enabling Row-Level Security.

Files introduced:
- `migrations/0003_tenant_isolation_phase_a.sql`

## Safety properties

1. Adds tenant ownership columns to products, orders, order items, payment attempts, and webhook events.
2. Adds composite foreign keys to prevent an order item from linking an order and product belonging to different tenants.
3. Adds tenant-oriented indexes for the expected access patterns.
4. Does not infer ownership for legacy records. Existing rows remain NULL until a separately reviewed mapping is approved.
5. Uses `NOT VALID` constraints so existing legacy rows are not silently rewritten; new rows must provide tenant IDs.
6. Does not enable RLS. RLS is deferred until every database operation is tenant-scoped and sets tenant context transaction-locally.

## Critical deployment warning

This migration is **not safe to apply to the current application version**. The current repository methods do not yet supply tenant IDs. Applying it before the tenant-aware repository and route changes would reject new writes.

Do not run this migration against production. Do not backfill using an assumed default tenant.

## Required next implementation steps

- Add tenant-aware repository methods; require a validated tenant UUID for merchant-scoped reads and writes.
- Resolve public storefront tenant from an allow-listed host/storefront mapping, not arbitrary headers or untrusted request body fields.
- Resolve merchant tenant from the verified session; platform roles must provide an explicit tenant scope for tenant data operations.
- Ensure order creation locks and reads products within the same tenant transaction.
- Derive webhook tenant from the matched payment attempt/order after signature verification; never trust webhook tenant IDs.
- Add PostgreSQL integration tests for tenant A/B isolation, cross-tenant order-item rejection, checkout idempotency, and webhook scope.
- Review and backfill legacy records only after an owner-confirmed mapping exists.
- Validate constraints, then consider RLS in a later phase.

## Acceptance criteria

- Tenant A cannot list, read, update, or purchase Tenant B products.
- Tenant A cannot read Tenant B orders or payment attempts.
- Cross-tenant order/product relationships fail at the database boundary.
- Missing tenant context fails closed on every merchant-scoped operation.
- Existing records are not assigned to a tenant without evidence and approval.
- No production database, deployment, secrets, or payment settings are changed by this phase.
