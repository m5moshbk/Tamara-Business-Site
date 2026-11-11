# BeeFitness ↔ Merchant CRM Integration Contract

**Status:** Architecture proposal — not an enabled integration  
**Version:** 0.1  
**Date:** 2026-11-11  
**Policy:** Independent applications, independent data stores, authenticated API boundary

## 1. System ownership

| Domain | System of record | BeeFitness responsibility | Merchant CRM responsibility |
|---|---|---|---|
| Merchant lifecycle | Merchant CRM | Enforce verified eligibility/status for its own tenant | Onboarding, KYC status, activation, suspension, closure |
| Storefront and catalog | BeeFitness | Products, categories, storefront configuration | Storefront reference and high-level status only |
| Orders and payments | BeeFitness | Order lifecycle, payment attempts, verified provider events | Read-only operational summaries; no payment credentials |
| Merchant contacts and follow-up | Merchant CRM | No duplicate CRM profile store | Contacts, tasks, notes, service history, lifecycle timeline |

Neither application may query or mutate the other application's database. Each keeps its own authentication, authorization, migrations, backups, and release lifecycle.

## 2. Stable identity mapping

- Merchant CRM owns its immutable merchant reference (merchantRef).
- BeeFitness owns its internal tenant UUID (tenantId).
- A provisioning workflow stores a one-to-one mapping between merchantRef and tenantId in a dedicated integration mapping table.
- The mapping is created only after authenticated provisioning and explicit tenant approval.
- Neither system accepts tenantId from an arbitrary client request, webhook body, or unsigned header.
- A merchant suspension signal is advisory until BeeFitness verifies the authenticated source, mapping, event freshness, and allowed state transition.

## 3. API boundary

Proposed versioned API namespace: /integrations/v1.

Proposed CRM → BeeFitness operations:
- Provision a merchant workspace using an immutable merchantRef.
- Publish lifecycle state changes: pending, active, suspended, closed.
- Request a read-only workspace status summary.

Proposed BeeFitness → CRM events:
- beefitness.workspace.provisioned
- beefitness.workspace.status_changed
- beefitness.order.created
- beefitness.payment.status_changed

Events carry only the minimum operational fields: eventId, eventType, schemaVersion, occurredAt, merchantRef, correlationId, and the event-specific non-sensitive summary. Customer name, email, phone, addresses, payment tokens, provider secrets, and raw webhook payloads are excluded by default.

## 4. Authentication and event integrity

- Use dedicated service identities per environment; never reuse a human admin session.
- Prefer OAuth 2.0 client credentials with narrow scopes, or mTLS where supported.
- Sign outbound events and verify signatures, timestamp tolerance, and key identifiers on receipt.
- Support key rotation with overlapping active key IDs.
- Enforce TLS, request-size limits, rate limits, and allow-listed event types.
- Use an idempotency key for commands and immutable event IDs for delivery.
- Reject stale, replayed, malformed, unsigned, or unmapped merchant events.
- Keep secrets in environment/secret storage; never commit credentials.

## 5. Delivery and consistency

- Use an asynchronous transactional outbox in the source application so business writes and event creation commit atomically.
- Deliver at least once; consumers must be idempotent.
- Retry transient failures with bounded exponential backoff and a dead-letter state.
- Record delivery attempts, response class, event ID, correlation ID, and timestamps without storing sensitive payloads.
- Do not claim cross-system atomic transactions. Reconciliation is required for delayed or failed delivery.

## 6. Isolation and failure behavior

- BeeFitness remains available for already-authorized tenant-scoped reads when CRM is temporarily unavailable, subject to a locally verified lifecycle snapshot and a defined freshness window.
- New provisioning and lifecycle-changing actions fail closed when the authoritative CRM state cannot be verified.
- A CRM outage must not grant broader BeeFitness access.
- A BeeFitness outage must not corrupt CRM lifecycle records.
- Cross-tenant identifiers must never be resolved without the authenticated mapping.
- Platform operators require explicit tenant scope for tenant data operations; platform-wide access must be a separately audited capability.

## 7. Rollout gates

1. Confirm the actual Merchant CRM repository and its current branch/commit.
2. Implement and test BeeFitness tenant identity and authorization.
3. Implement durable merchant mapping and outbox/inbox tables.
4. Publish OpenAPI schemas and event JSON schemas with compatibility rules.
5. Add contract tests and negative tests for cross-tenant access, replay, signature failure, duplicate delivery, and stale lifecycle events.
6. Test against isolated staging databases and non-production credentials.
7. Obtain separate approval before production secrets, databases, DNS, webhooks, or deployments are changed.

## 8. Explicit non-goals

This document does not create a live API, connect databases, provision merchants, enable event delivery, configure payment providers, or change production. It is a versioned design contract for the two independently deployable projects.
