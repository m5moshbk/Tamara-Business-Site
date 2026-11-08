# BeeFitness Store — implementation notes

## Scope and safety boundary
This branch contains an Arabic RTL storefront, server-priced cart, optional PostgreSQL repository, payment-provider sandbox adapters, and signed-webhook handling. It does not deploy, run migrations, contact a database, register provider webhooks, or execute real provider calls during CI.

## Store and persistence
- Storefront: /.
- Catalog starts empty; no product, price, shipping fee, or policy is invented.
- Admin endpoints require the existing authenticated session: GET/POST/PATCH /api/admin/products.
- Public endpoints: GET /api/products, GET /api/categories, POST /api/cart/quote, POST /api/checkout.
- Prices are calculated from server-side catalog rows; browser-supplied totals are ignored.
- Checkout remains preview-only. It does not call either provider.
- PostgreSQL is opt-in only: both STORE_PERSISTENCE=postgres and DATABASE_URL are required. A DATABASE_URL by itself does not open a connection.
- The migration in migrations/0001_beefitness_store.sql is a proposal. It is never applied automatically. Applying it requires a separate approval and reviewed backup/rollback plan.
- PostgreSQL order creation uses a transaction and stores order items/payment attempts with an idempotency key. Preview checkout does not reserve/decrement stock; inventory reservation must be implemented before real payment is enabled.

## Payment adapters
- payments/tamara.js sends only to Tamara's documented sandbox host.
- payments/tabby.js sends only to the Saudi Tabby API host and extracts the installment checkout URL.
- Both adapters are unit-tested with mocked fetch responses; CI does not call either provider.
- Customer checkout still returns preview-only. A real sandbox session route is not enabled yet because the merchant must supply and approve shipping-address fields, redirect URLs, tax/shipping policy, and Tamara risk-assessment inputs. These must not be fabricated.
- Provider credentials belong only in a deployment secret manager; never commit them or expose them in logs or responses.

## Webhooks
- Tamara requires a valid HS256 notification JWT, sandbox mode, and persistent PostgreSQL storage before an event can update an order.
- Tabby requires the configured custom signing header, sandbox mode, and persistent PostgreSQL storage.
- Duplicate events are idempotent; payment state progression is monotonic and failed/captured/closed states cannot be downgraded.
- Unknown orders return a non-200 response so the provider can retry.
- No provider webhook registration is performed by this branch.

## Required merchant inputs before enabling sandbox checkout
- Approved product catalog, SKUs, prices, stock, and images.
- Shipping address schema, supported regions, shipping fees, and delivery policy.
- Approved tax treatment and refund/return policy.
- Canonical success, cancel, failure, and notification URLs.
- Tamara risk-assessment data requirements.
- Sandbox credentials, configured only in secret storage.
- Explicit approval before enabling STORE_PERSISTENCE=postgres, applying migrations, or making sandbox network calls.

© M5mOsH All Rights Reserved
