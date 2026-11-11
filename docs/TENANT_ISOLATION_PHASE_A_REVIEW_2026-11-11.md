# BeeFitness Tenant Isolation — Phase A Code Review

Date: 2026-11-11
Branch: `fix/beefitness-tenant-isolation-phase-a-20261111`
Reviewed commit: `3bc92a918244597610435707074a91639bd7c41e`
Review mode: read-only source review; no database connection or migration execution.

## Verified state

- GitHub Actions run `42989403821` completed successfully.
- The `tests` job completed with conclusion `success`; dependency install, JavaScript syntax checks, and the security test command all completed.
- The tenant repository adapter uses parameterized SQL and applies `tenant_id` predicates to product, order, and aggregate queries.
- The migration adds tenant ownership columns and composite foreign-key relationships, while deliberately leaving legacy rows unassigned.
- The adapter is not wired into the legacy HTTP routes. No claim of active application-level tenant isolation is made.

## Blocking integration findings

1. **No merchant identity resolver is connected.** The current `server.js` login issues a single `platform_owner` session from environment credentials. It does not authenticate a platform-user record, verify an active tenant membership, or resolve a merchant tenant from a durable session.
2. **Legacy routes remain unscoped.** `store.js` calls the legacy repository without tenant context. The public catalog, admin catalog, checkout, order, and statistics paths therefore do not use the new tenant adapter.
3. **Repository contracts differ.** Legacy routes call methods such as `createProduct(data)`, `updateProduct(id, patch)`, and `createOrder(data)`; the new adapter requires explicit tenant-aware argument objects. It also does not currently implement the legacy `getCategories()` method. A direct repository swap is not safe.
4. **No PostgreSQL integration evidence exists.** Current tenant repository tests use a fake pool. They verify query construction and parameter binding, not PostgreSQL constraint behavior, transactions, concurrent writes, or real tenant isolation.
5. **Migration rollout is incomplete.** Existing records have `tenant_id = NULL` by design. No ownership mapping/backfill has been approved or executed, and the migration has not been applied to a database.
6. **Migration re-run behavior needs review.** Several `ADD CONSTRAINT` statements for tenant-required checks are not guarded against an already-existing constraint. The migration runner should guarantee one-time application, or the SQL should be made safely repeatable before relying on reruns.
7. **Shared category model needs an explicit product decision.** The adapter currently writes to the shared `bf_categories` table. Confirm whether categories are intentionally global taxonomy or should become tenant-owned before merchant-specific category management is exposed.

## Required next implementation sequence

1. Define the merchant login/session contract against `bf_platform_users`, `bf_tenant_memberships`, and `bf_auth_sessions`; require active user and membership states.
2. Add a server-side resolver that obtains tenant scope only from the verified durable session. Reject tenant IDs supplied by request bodies or arbitrary headers.
3. Introduce a route-compatible tenant-aware repository interface, including category behavior, and preserve the legacy repository behind an explicit compatibility boundary.
4. Add PostgreSQL integration tests against a disposable non-production database: cross-tenant reads/writes, order-item/product tenant FK enforcement, payment-attempt ownership, idempotency, webhook replay/collision, rollback, and concurrent checkout.
5. Review global unique constraints and category ownership against the intended multi-merchant behavior.
6. Prepare a separately reviewed legacy ownership/backfill plan and backup/restore rehearsal.
7. Only after the above evidence exists, request separate approval for migration application and any deployment.

## Explicit safety boundary

- Do not apply migration `0003` to production or any shared database.
- Do not connect the legacy routes to the new adapter until verified tenant identity and real PostgreSQL tests exist.
- No merge, deployment, production data changes, credential changes, or webhook activation is authorized by this review.

## Current conclusion

**Phase A adapter and CI: present. Application tenant isolation: not yet active. PostgreSQL integration: not tested. Migration: not applied.**

© M5mOsH All Rights Reserved
