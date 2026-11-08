# BeeFitness Store — implementation notes

## Scope
This branch adds an Arabic RTL storefront, server-priced cart/preview checkout, admin product endpoints, and an initial PostgreSQL schema. It does not activate live payments, connect to a database, deploy, or alter production.

## Current behavior
- Storefront: /.
- Catalog starts empty; no products, prices, shipping fees, or policies are invented.
- Admin endpoints require the existing authenticated admin session: GET /api/admin/products, POST /api/admin/products, PATCH /api/admin/products/:id.
- Public endpoints: GET /api/products, GET /api/categories, POST /api/cart/quote, POST /api/checkout.
- Checkout derives amounts from server catalog data; client-supplied totals are not accepted.
- Checkout is preview-only. It creates an in-memory preview order and does not call Tamara or Tabby.
- Products and orders are in process memory until separately approved PostgreSQL integration; a service restart loses them.
- Shipping is unspecified and must not be represented as a final quote.

## PostgreSQL
migrations/0001_beefitness_store.sql is a schema proposal only. Do not apply it to any database without separate explicit approval and a reviewed backup/rollback plan.

## Payment providers
Tamara and Tabby remain preview-only. Provider API adapters, webhook signature verification/reconciliation, persistent idempotency, capture/refund handling, and sandbox tests remain outstanding. Never enable live mode before separate security review.

## Merchant inputs required
Approved catalog/SKUs/prices/stock/images; shipping regions and fees; delivery/returns/refund policy; customer support details; legal/privacy/terms; sandbox merchant credentials stored only in deployment secret storage.

© M5mOsH All Rights Reserved
