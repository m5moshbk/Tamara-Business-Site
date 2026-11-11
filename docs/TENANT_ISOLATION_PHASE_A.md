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


## Phase B groundwork — tenant-scoped repository adapter

Added `platform/tenant-repository.js` as a separate PostgreSQL adapter. It provides tenant-bound product reads/writes, order creation and listing, tenant-scoped aggregates, and verified-webhook persistence whose tenant is derived from the matched stored order.

The adapter requires a valid UUID tenant ID for every tenant-owned operation and binds it as a SQL parameter. It does not trust webhook/request tenant IDs. The existing legacy repository and HTTP routes are intentionally unchanged: the new adapter is not wired into the running application until durable merchant identity, trusted storefront resolution, route-level authorization, and PostgreSQL integration tests are completed.

Automated mock-pool tests cover missing tenant context, tenant-bound product/order reads, tenant-bearing writes, and webhook tenant derivation. These tests verify SQL construction and adapter behavior; they are not a substitute for PostgreSQL integration or cross-tenant runtime tests.

**Important schema follow-up:** the original schema declares globally unique SKU, order reference, idempotency key, and provider event identifiers. Tenant-local uniqueness and safe legacy constraint migration must be reviewed before enabling multiple tenants with overlapping identifiers.
