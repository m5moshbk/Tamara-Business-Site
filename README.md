# BeeFitness Payments Gateway

Production-oriented gateway scaffold for BeeFitness on Base44, with Tabby/Tamara adapters to be enabled after merchant credentials and exact production configuration are supplied.

## Architecture
Base44 checkout -> server-side gateway -> Tabby/Tamara -> HTTPS webhooks -> idempotent state updates -> dashboard.

## Current launch mode
Preview mode is intentionally enabled. It exercises the order/state/dashboard flow without sending real payment requests.

## Security
- Provider secrets are server-side only.
- CORS is restricted by ALLOWED_ORIGIN.
- Helmet and rate limiting enabled.
- Input validated with Zod.
- Webhooks are idempotency-aware.
- Do not mark a live order paid from frontend redirect alone; rely on verified provider events/API state.

## Before production
1. Obtain Tabby sandbox/production keys from the merchant dashboard.
2. Obtain Tamara API token, notification token and public key.
3. Confirm exact webhook authentication/signature requirements for the merchant accounts.
4. Configure HTTPS webhook URLs.
5. Run sandbox test cases: approved, declined, authorized, captured, cancelled, refunded, expired.
6. Only then set PAYMENT_MODE=live and deploy the provider adapters.

## Flexbox
تذكير: واجهة لوحة التحكم تستخدم Flexbox في الشريط العلوي، مع Grid لبطاقات المؤشرات.

المالك: Ahmed jafari — تلفون: 0173266999
