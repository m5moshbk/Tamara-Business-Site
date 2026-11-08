# BeeFitness — Platform Implementation Specification

**Document:** Product, UX, application architecture and delivery specification  
**Version:** 1.0-draft  
**Owner:** M5mOsH  
**Date:** 2026-11-08  
**Target branch:** `feat/beefitness-full-store-20261108`  
**Status:** Implementation specification — review required before application-code changes

> This document defines the intended BeeFitness service platform. It does not claim that the described platform features are implemented. Existing storefront/payment-adapter code remains the current technical baseline until a separately reviewed implementation changes it.

## 1. Product definition

BeeFitness is a Saudi-market digital-commerce services platform. It helps merchants move from an idea or existing business to a technically prepared online store and supports the merchant through payment-provider readiness, integration, testing and ongoing support.

BeeFitness is a technical service provider and workflow manager. It is not a payment provider, lender, underwriting authority, or guarantor of merchant approval. Each payment provider independently determines eligibility, approval, fees, settlement terms and activation.

### Primary outcomes
1. Convert visitors into qualified service requests.
2. Capture merchant requirements once and reuse them across the delivery workflow.
3. Assess store and merchant readiness against explicit checklists.
4. Prepare provider-specific application packs and track their status.
5. Deliver store setup and approved technical integrations.
6. Maintain a traceable support and service history.

### Initial market and language
- Initial market: Saudi Arabia.
- Primary locale: Arabic (Saudi-friendly wording), right-to-left (RTL).
- Secondary locale: English, left-to-right (LTR).
- Currency display: SAR by default; do not hard-code financial-provider fees or merchant rates.

## 2. Brand and design system

### Brand direction
- Product name: BeeFitness.
- Positioning: Digital Commerce Solutions.
- Arabic message: «نبني متجرك، ونجهّز أعمالك للدفع الإلكتروني».
- Visual direction: premium, trustworthy, restrained, technology-oriented.
- Avoid visual claims implying official affiliation with any payment provider.

### Design tokens
| Token | Value | Use |
|---|---|---|
| `--bf-navy-900` | `#101B30` | Primary brand and dark surfaces |
| `--bf-navy-800` | `#182944` | Secondary dark surfaces |
| `--bf-gold-500` | `#C8A45D` | Primary accent and key actions |
| `--bf-gold-100` | `#F3EAD8` | Soft accent surfaces |
| `--bf-surface` | `#FFFFFF` | Cards and content surfaces |
| `--bf-background` | `#F5F6F8` | Application background |
| `--bf-text` | `#172033` | Primary text |
| `--bf-muted` | `#687386` | Secondary text |
| `--bf-border` | `#E3E7ED` | Dividers and borders |
| `--bf-danger` | `#B42318` | Errors and destructive warnings |
| `--bf-success` | `#16845B` | Verified success states |

Typography:
- Arabic headings: Cairo.
- Arabic body: IBM Plex Sans Arabic.
- Latin/technical labels: system sans-serif initially; avoid introducing a font dependency without checking licensing and performance.
- Base spacing unit: 4px; use a consistent 4/8/12/16/24/32 scale.
- Minimum interactive target: 44×44 CSS px.
- Provide visible keyboard focus, semantic labels, sufficient contrast, and reduced-motion support.

### UI behavior
- RTL is the default document direction; individual English fragments use correct LTR direction.
- Responsive breakpoints: 360px mobile baseline, 768px tablet, 1024px desktop.
- Forms show inline validation, preserve safe non-secret inputs after validation errors, and never echo credentials.
- Every asynchronous action has loading, success, empty and error states.
- Confirm before irreversible actions; record the actor and timestamp for administrative changes.
- Provider names/logos are displayed as independent service options, not as endorsements or official partnerships.

## 3. Information architecture

### Public website
1. Home — value proposition, services, process, trust information, primary CTA.
2. Store Creation — scope, deliverables, exclusions and request CTA.
3. Merchant Readiness — assessment overview and required information.
4. Payment Integration — provider-neutral explanation and supported-provider status.
5. Services & Packages — deliverables, assumptions, exclusions and quote/request CTA.
6. Work / Case Studies — publish only authorized, verifiable examples.
7. FAQ — process, eligibility, fees, approval boundaries and data handling.
8. About BeeFitness.
9. Contact.
10. Request a Service.
11. Privacy Notice, Terms, Service Scope, Cancellation/Refund policy.

### Authenticated customer portal
- Dashboard and request status.
- Business profile.
- Store project details.
- Readiness assessment and missing items.
- Provider applications and status history.
- Secure document upload and document status.
- Messages and support requests.
- Deliverables and handover.
- Profile, consent and account security settings.

### Internal operations console
- Overview.
- Customers and businesses.
- Service requests and projects.
- Readiness assessments.
- Provider applications.
- Document review queue.
- Tasks, deadlines and follow-ups.
- Support tickets.
- Service catalog and package definitions.
- Audit log.
- Role and access management.
- Operational reports.

## 4. User roles and authorization

| Role | Intended permissions |
|---|---|
| Visitor | Browse public pages and submit a minimal inquiry |
| Customer | Access only their own business, requests, files and messages |
| Operations | Review assigned requests, update workflow, request missing information |
| Technical | Manage store implementation tasks and technical test evidence |
| Reviewer | Review readiness and documents; cannot approve a provider on its behalf |
| Administrator | Manage users, service catalog, assignments and configuration |
| Auditor | Read-only access to permitted records and audit history |

Authorization rules:
- Deny by default; enforce authorization on the server for every object and action.
- Customer records are tenant-scoped using a server-derived customer/business identity, never a browser-supplied tenant ID alone.
- Staff access is role- and assignment-scoped.
- Sensitive document access uses short-lived authorized downloads; never expose public storage paths.
- Privileged actions require re-authentication or explicit confirmation where appropriate.
- Log access to sensitive records and all status/permission changes.

## 5. Core business workflows

### A. Service request
`draft → submitted → triage → awaiting_customer → qualified → quoted → accepted → in_progress → quality_review → delivered → closed`

Additional terminal/exception states: `rejected`, `cancelled`, `on_hold`.

Rules:
- Only valid transitions are accepted by the server.
- A customer can edit a draft; after submission, material changes become a tracked revision or require staff review.
- Every transition stores actor, timestamp, prior state, new state and optional reason.
- Do not mark a request delivered until handover evidence is recorded.

### B. Merchant readiness
`not_started → collecting_information → under_review → needs_information → ready_for_submission → submitted_by_merchant → provider_review → provider_decision`

Provider decision values: `approved`, `rejected`, `more_information_requested`, `withdrawn`, `unknown`.

- BeeFitness may set its own preparation/readiness status.
- Only a verified provider response or merchant-supplied evidence reviewed by staff may be recorded as a provider decision.
- Never infer approval from a successful API response or from a submitted application.
- Preserve evidence source, verification date and reviewer.

### C. Provider-specific application
Create one application record per business and provider. Track requirements, missing items, submission date, provider reference (if supplied), status, evidence and next action independently.

Initial provider directory (names are provisional until legal entity, product and integration method are verified):
- Tabby
- Tamara
- مدفوع (legal/provider identity and product to be confirmed)
- MisPay
- Emkan (exact service and integration route to be confirmed)

Provider configuration must be capability-driven: `application_supported`, `api_checkout_supported`, `webhook_supported`, `sandbox_available`, `verified_at`. Unknown capabilities remain false/unknown; do not assume all providers expose the same flow.

### D. Store project
`discovery → requirements → design → build → content_setup → internal_qa → customer_review → handover → maintenance`

Record scope, deliverables, acceptance criteria, exclusions, owner, due dates, repository/preview references and evidence. Production deployment is a separate approval-gated activity.

## 6. Functional requirements

### Public conversion
- Explain service outcomes, process, estimated timelines only when supported, and exclusions.
- Provide clear request-service and contact actions.
- Do not claim guaranteed provider acceptance, instant activation or fixed provider fees.
- Display provider marks only under applicable brand-use rules.

### Customer onboarding
- Capture contact and business information with data minimization.
- Explain why each requested field/document is needed.
- Support save-and-resume for longer forms.
- Record privacy notice version and consent timestamp where consent is required.
- Do not request bank-card numbers, CVV, online banking passwords or provider API secrets.

### Readiness assessment
- Version each checklist by provider and effective date.
- Each requirement has: key, label, description, required/conditional flag, accepted evidence types, review state, reviewer note and source reference.
- Distinguish `missing`, `provided`, `under_review`, `accepted_for_pack`, `rejected`, `not_applicable`.
- Do not label a checklist as official unless verified against current provider documentation.

### Document management
- Allow only an explicit allowlist of file types and safe size limits.
- Validate MIME type and file signature; scan uploads before staff access.
- Store privately; encrypt in transit and at rest through the selected storage provider.
- Use opaque object keys; do not trust user-provided filenames as storage paths.
- Record uploader, business, purpose, checksum, version, review state and retention deadline.
- Define deletion/retention policy before launch; legal review required.

### Service catalog and quotations
- Admin-managed service definitions and package inclusions.
- Quote records include currency, line items, validity, assumptions, exclusions, tax treatment and status.
- Prices are not invented in code. No price is public until approved by the business owner.
- Customer acceptance is recorded with timestamp and version of the quote.

### Support
- Customer-visible ticket ID, category, priority, status, messages and attachments.
- Internal notes are never exposed to customers.
- Define response targets only after operational capacity is approved.

## 7. Proposed application architecture

### Current technical baseline
The repository currently contains a Node.js/Express application, static public HTML, store/payment-adapter modules and tests. The current checkout is preview-only; payment adapters are mock-tested. This specification does not imply that a customer portal, CRM, document vault or service workflow already exists.

### Recommended first implementation
Use a modular monolith to keep initial operations understandable and deployment cost controlled:
- Web presentation: existing static assets and modular browser JavaScript initially.
- API: existing Express application, separated into route/controller/service/repository layers.
- Domain modules: identity, customers, businesses, service_requests, readiness, providers, documents, projects, support, audit.
- Persistence: PostgreSQL only after a separately approved schema review, backup/rollback plan and explicit activation approval.
- File storage: private object storage selected later; no public bucket by default.
- Background work: defer queues until there is a concrete workload and operational requirement.
- Observability: structured redacted logs, request IDs, health/readiness endpoints and error tracking without secrets or document contents.

Do not introduce React/Vite, a second backend, a queue, or additional paid infrastructure without a measured need and a separate implementation decision.

### Proposed source layout
```text
public/
  index.html
  pages/
  assets/
    css/
    js/
src/
  modules/
    auth/
    customers/
    businesses/
    service-requests/
    readiness/
    providers/
    documents/
    projects/
    support/
    audit/
  middleware/
  shared/
  app.js
docs/
  BEEFITNESS_PLATFORM_SPEC.md
  BEEFITNESS_ACCEPTANCE_CHECKLIST.md
test/
  unit/
  integration/
```

This is a target layout, not a statement about existing files. Refactor incrementally; do not move or delete existing files without reviewing their current consumers and tests.

## 8. Proposed API contract

Prefix: `/api/v1`. All routes below are proposed and must be implemented with schema validation, authorization, rate limits and consistent error handling.

### Public
- `GET /services`
- `GET /providers` — only verified public capabilities and descriptions.
- `POST /inquiries`
- `POST /service-requests` — authenticated or verified contact flow with anti-abuse controls.

### Customer
- `GET /me`
- `GET /me/businesses`
- `POST /me/businesses`
- `GET /me/service-requests`
- `POST /me/service-requests`
- `GET /me/service-requests/:id`
- `POST /me/service-requests/:id/documents`
- `GET /me/provider-applications`
- `POST /me/support-tickets`

### Internal
- `GET /admin/service-requests`
- `PATCH /admin/service-requests/:id/status`
- `POST /admin/service-requests/:id/assignments`
- `GET /admin/readiness-assessments`
- `PATCH /admin/readiness-assessments/:id/items/:itemId`
- `POST /admin/provider-applications/:id/evidence`
- `PATCH /admin/provider-applications/:id/status`
- `GET /admin/audit-events`

### API conventions
- JSON request/response; UTF-8.
- Stable error envelope: `{ "error": { "code": "...", "message": "...", "request_id": "..." } }`.
- Pagination uses bounded `limit` and opaque cursor; maximum page size 100.
- Use idempotency keys for create/submit operations that may be retried.
- Use optimistic concurrency/version fields for state-changing records.
- Return no stack traces, secrets, internal storage keys or cross-tenant existence hints.
- Validate all inputs on the server; browser validation is supplementary only.

## 9. Proposed logical data model

Logical entities (not an applied database schema):
- `users`, `roles`, `user_role_assignments`
- `businesses`, `business_memberships`
- `service_catalog`, `service_packages`
- `service_requests`, `request_events`, `quotes`
- `store_projects`, `project_tasks`, `deliverables`
- `provider_directory`, `provider_requirements`
- `provider_applications`, `provider_application_events`
- `documents`, `document_reviews`
- `support_tickets`, `support_messages`
- `audit_events`, `consent_records`

Every tenant-owned record must include a business/tenant scope and appropriate foreign keys. Add indexes for tenant scope, status, assigned owner and created/updated timestamps. Define retention and deletion semantics before finalizing migrations. Never store payment card data or provider secrets in these business tables.

## 10. Security and privacy baseline

- Authentication: secure, HTTP-only, Secure and SameSite cookies; rotate sessions; protect state-changing requests against CSRF.
- Passwords: use a modern password-hashing algorithm and safe reset flow; never store plaintext passwords.
- Authorization: server-side role and tenant checks on every request.
- Input: schema validation, output encoding, safe file parsing, request size limits.
- Abuse controls: rate limits on login, inquiry, upload and sensitive workflows.
- Secrets: environment secret manager only; never commit secrets or print them.
- Logging: redact authorization headers, cookies, tokens, document contents and personal data not needed for diagnostics.
- Dependencies: lockfile, vulnerability checks and supported Node.js version.
- Audit: append-only event records for sensitive business actions; restrict audit access.
- Backups and recovery: define RPO/RTO and test restoration before production.
- Privacy: collect only necessary data; document purpose, retention, access and deletion.

## 11. Integration boundaries

### Payment-provider readiness
Provider application status and API checkout status are separate concepts. A merchant may be preparing or applying without any API integration being enabled.

### Technical integration
- Implement each provider behind a provider-specific adapter.
- Keep credentials in a secret manager.
- Validate webhook signatures against official current specifications.
- Verify event authenticity, idempotency, replay protection and monotonic state transitions.
- Use provider sandbox only after explicit approval and approved merchant inputs.
- No live payment, merchant onboarding submission or webhook registration is part of this specification.

### Existing BeeFitness store code
The existing product catalog and preview checkout may be retained as a future optional service/demo project, but must not define the main BeeFitness service-platform data model. Decide whether it becomes a showcase tenant/project only after reviewing product direction.

## 12. Delivery phases and gates

**Phase 0 — Specification (this document):** product boundaries, roles, workflows, information architecture, APIs, data model and security.

**Phase 1 — Read-only repository audit:** inspect current routes, auth, assets, tests, dependencies and deployment assumptions; produce a gap matrix. No writes.

**Phase 2 — UI foundation:** design tokens, shared layout, navigation, responsive shell and public service pages. Isolated feature branch; automated checks.

**Phase 3 — Service-request MVP:** customer inquiry, request intake, internal queue and event history using test fixtures or an isolated test database only.

**Phase 4 — Customer portal and readiness:** tenant-scoped access, checklist engine, provider-specific application tracking and secure document workflow.

**Phase 5 — Store-project operations:** tasks, quotes, deliverables, handover and support.

**Phase 6 — Provider integrations:** only after provider identity, requirements, merchant accounts, sandbox credentials and test callbacks are verified.

**Phase 7 — Release readiness:** security review, accessibility, backup/restore, operational runbooks, acceptance evidence and a separate explicit deployment approval.

### Approval gates
Each of the following requires separate explicit approval:
- Any change to application code beyond the currently authorized documentation work.
- Any schema migration or database connection.
- Any external provider network call or webhook registration.
- Any secret/account configuration.
- Any production deployment, merge, release, deletion or restart.

## 13. Definition of Done for the platform MVP

- Public service pages are responsive and accessible.
- Customer can submit and track their own service request.
- Staff can triage, assign and update requests with an event history.
- Cross-tenant access tests prove isolation.
- Readiness checklist is versioned and does not imply provider approval.
- Provider applications have independent statuses and evidence.
- Uploads are private, validated and access-controlled.
- Audit events exist for sensitive changes.
- API validation, authorization, rate-limit and error-path tests pass.
- No secrets or personal documents appear in logs or Git.
- Documentation, setup instructions and rollback/recovery assumptions are reviewed.
- CI passes on the feature branch.
- No production action is implied by test success.

---

**© M5mOsH All Rights Reserved**
