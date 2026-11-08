# BeeFitness — Platform Acceptance Checklist

**Version:** 1.0-draft  
**Status:** Planned checks; none are claimed as passed by this document.  
**Related specification:** `docs/BEEFITNESS_PLATFORM_SPEC.md`

## Product and UX
- [ ] Arabic RTL is the default and English LTR is supported.
- [ ] Navy/gold design tokens are centralized and consistent.
- [ ] Public pages explain scope, exclusions and provider-approval boundaries.
- [ ] Mobile layouts work at 360px and larger breakpoints.
- [ ] Forms provide accessible labels, validation, focus and error states.
- [ ] Empty, loading, success and failure states are implemented.

## Identity and access
- [ ] Customer can access only their own business and service records.
- [ ] Staff roles are enforced server-side.
- [ ] Privileged actions are auditable.
- [ ] Session cookies are secure and state-changing requests have CSRF protection.
- [ ] Rate limits cover authentication, inquiries and uploads.

## Service workflow
- [ ] Request lifecycle transitions are validated server-side.
- [ ] Every transition records actor, timestamp, old state and new state.
- [ ] Customer-facing status is distinct from internal notes.
- [ ] Quotes preserve version, validity, currency, assumptions and exclusions.
- [ ] Handover evidence is required before delivery completion.

## Merchant readiness and providers
- [ ] Checklists are versioned and have evidence sources.
- [ ] Missing/accepted/rejected/not-applicable requirements are distinct.
- [ ] Provider applications are independent per business and provider.
- [ ] Provider decision is not inferred from BeeFitness readiness.
- [ ] Unverified provider identity/capabilities remain marked unknown.
- [ ] No approval or activation guarantee appears in marketing copy.

## Documents and privacy
- [ ] Upload type, signature and size are validated.
- [ ] Files are stored privately and malware-scanned.
- [ ] Download authorization is checked on every access.
- [ ] Retention and deletion policy is documented.
- [ ] Logs redact tokens, cookies, personal documents and unnecessary PII.

## Engineering quality
- [ ] Unit and integration tests cover workflow transitions.
- [ ] Cross-tenant isolation tests pass.
- [ ] API input validation and error envelopes are consistent.
- [ ] Idempotency protects retryable create/submit operations.
- [ ] CI passes on the feature branch.
- [ ] Setup, test and operational documentation is current.

## Explicitly out of scope until separate approval
- [ ] No production database connection or migration.
- [ ] No real payment or live provider API call.
- [ ] No merchant application submission or webhook registration.
- [ ] No secrets added to Git.
- [ ] No merge to main, deployment, production change, deletion or restart.

**© M5mOsH All Rights Reserved**
