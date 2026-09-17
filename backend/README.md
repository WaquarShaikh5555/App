# OrderConfirm Backend

See root README.md for full instructions.

## Quick start (mock mode, no DB)
```bash
cp .env.example .env
# set MOCK_MODE=true, leave DATABASE_URL empty
npm install
npm run dev
```

## With Postgres
```bash
cp .env.example .env
# set DATABASE_URL
npx prisma migrate dev
npm run dev
```

## API versions
- Shopify Admin API: 2026-07 (latest stable verified 2026-09-17)
- WhatsApp Cloud API: Graph API v26.0 (latest verified 2026-09-17)

## Endpoints
- POST /api/auth/register, /api/auth/login, /api/auth/refresh
- GET /api/shopify/auth?shop=..., /api/shopify/callback, /api/shopify/status
- GET /api/whatsapp/auth/start, /api/whatsapp/callback, /api/whatsapp/status
- POST /api/webhooks/shopify/orders-create (HMAC verified)
- GET+POST /api/webhooks/whatsapp (signature verified)
- GET /api/dashboard
- GET /api/orders, GET /api/orders/:id, POST /api/orders/:id/reveal-phone, confirm, cancel
- GET /api/settings, PUT /api/settings
- GET /api/templates
- POST /api/push/register

## Security
- JWT access 15m + refresh 30d
- AES-256-GCM for tokens at rest
- HMAC verification for webhooks
- Tenant isolation via orgId
- Phone masking + audit log
```
