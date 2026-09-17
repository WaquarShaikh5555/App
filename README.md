# OrderConfirm — Production-ready mobile-first COD confirmation via WhatsApp

**Merchant-facing client is a real installable Android APK (Expo + EAS). Backend is a real Node/TypeScript server that owns Shopify webhooks, WhatsApp Cloud API, DB, and business logic.**

> Value prop: **"Confirm COD orders before you ship them."** We do NOT guarantee fewer returns. We measure confirmation rate / cancellation rate / no-response rate; merchant compares against own historical RTO.

Verified at build time (2026-09-17):
- Shopify Admin API latest stable: **2026-07** (released 2026-07-01, supported until 2027-07-16)
- Meta Graph API / WhatsApp Cloud API latest: **v26.0** (released 2026-07-29) — from https://developers.facebook.com/docs/graph-api/changelog/

---

## Architecture Overview

### Backend (Node/TypeScript/Express/Prisma/PostgreSQL)
- **Auth**: JWT access 15m + refresh 30d rotation, bcrypt, org/shop model, membership roles
- **Shopify OAuth**: `/api/shopify/auth?shop=...` → builds auth URL (scopes: `read_orders,write_orders,read_customers`) using Admin API 2026-07, callback `/api/shopify/callback` stores encrypted token (AES-256-GCM), registers `orders/create` webhook
- **WhatsApp Cloud API**: `/api/whatsapp/auth/start` → Meta Embedded Signup v4 (Graph API v26.0). Callback stores encrypted token, fetches templates. Manual connect endpoint for dev. Template status tracked, only APPROVED templates sent.
- **Webhooks**:
  - Shopify `orders/create`: HMAC-SHA256 verification, idempotency via `webhook_events.idempotency_key` (X-Shopify-Webhook-Id), COD detection, phone normalization (libphonenumber-js), creates order/customer/confirmation_request, sends WhatsApp template, push notification
  - WhatsApp: GET verification with `hub.verify_token`, POST with `X-Hub-Signature-256` HMAC, handles statuses (sent/delivered/read/failed) and inbound replies (Confirm/Cancel) → state transition → Shopify metafield update → push
- **State Machine**: `NEW → AWAITING_CONFIRMATION → CONFIRMED / CANCEL_REQUESTED → CANCELLED / EXPIRED / FAILED` with auditable transitions, duplicate webhooks never create duplicate sends
- **Push**: Expo Push Service via `expo-server-sdk`, tokens stored in `device_push_tokens`, sent on new order, confirmed, cancelled, send failure, disconnect
- **Security**: Helmet, CORS, rate-limit, zod validation, tenant isolation (every query WHERE org_id = token.org_id), IDOR tested, encrypted secrets, phone masking by default with reveal logged in audit_logs
- **Jobs**: expiration job every 5m marks expired requests

### Mobile App (React Native/Expo/TypeScript)
- **Auth**: token-based JWT in `expo-secure-store` (Keystore), no cookies, no CSRF, refresh interceptor
- **Push**: `expo-notifications` + FCM, channels, deep linking `orderconfirm://order/:id` → Order Detail
- **Offline**: AsyncStorage cache for dashboard/orders, banner "offline — showing cached data", read-only when offline, no writes queued
- **Screens**:
  - Login/Onboarding, Register
  - Connect Shopify (opens backend OAuth URL in WebBrowser, deep link back)
  - Connect WhatsApp (Embedded Signup flow or manual token for dev, template status view)
  - Dashboard: today's orders/COD/confirmed/awaiting/cancelled, rates, estimated RTO note
  - Orders list: filterable awaiting/confirmed/cancelled/failed/COD, search by order #, customer, phone, date range via query params, skeleton loaders
  - Order Detail: Shopify info, masked phone with reveal (logged), confirmation status, delivery status, timestamps, confirmation + audit history
  - Settings: connection status/reconnect/disconnect, rules (min/max COD value, ignore prepaid, send delay, reminder count/interval, expiration, cancellation approval)
  - Template management: view approved templates, status, never claim approved when Meta hasn't
- **Navigation**: respects Android back gesture, bottom tabs, native stack
- **Env separation**: `EXPO_PUBLIC_API_URL` via `app.config.js` + EAS build profiles, never hardcoded

### Database (PostgreSQL + Prisma)
See `backend/prisma/schema.prisma` — entities: users, organizations, memberships, shops, shopify_connections, whatsapp_connections, orders, customers, confirmation_requests, message_attempts, message_templates, webhook_events, audit_logs, notification_settings, device_push_tokens, subscriptions (stub), usage_records (stub). UUIDs, indexes, UTC timestamps, org_id on all tenant tables.

---

## Environment Variables

### Backend (`backend/.env`)
```
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/orderconfirm?schema=public
JWT_SECRET=change-me-super-secret-32chars-min
JWT_REFRESH_SECRET=change-me-refresh-secret-32chars-min
ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef # 64 hex = 32 bytes AES-256
SHOPIFY_API_KEY=your_shopify_api_key
SHOPIFY_API_SECRET=your_shopify_api_secret
SHOPIFY_APP_URL=https://your-backend.ngrok.io
SHOPIFY_API_VERSION=2026-07
WHATSAPP_APP_ID=your_meta_app_id
WHATSAPP_APP_SECRET=your_meta_app_secret
WHATSAPP_API_VERSION=v26.0
WHATSAPP_VERIFY_TOKEN=your_webhook_verify_token_random
BACKEND_URL=https://your-backend.ngrok.io
FRONTEND_URL=exp://192.168.1.2:19000
EXPO_ACCESS_TOKEN=optional-for-push
MOCK_MODE=true # false in production, enables mock adapters for local dev without credentials
```

### Mobile (EAS + local)
- `EXPO_PUBLIC_API_URL` — backend base URL, per build profile
  - dev: `https://your-dev-backend.ngrok.io`
  - preview: `https://your-staging-backend.com`
  - production: `https://api.orderconfirm.app`
- `app.json` extra.apiUrl fallback
- `eas.json` env per profile

---

## Database Setup

1. Install Postgres 14+
2. Create DB: `createdb orderconfirm`
3. Copy `backend/.env.example` → `backend/.env`, set `DATABASE_URL`
4. Install deps: `cd backend && npm install`
5. Generate client: `npx prisma generate`
6. Migrate: `npx prisma migrate dev --name init` (creates tables)
7. (Optional) Studio: `npx prisma studio`
8. For local dev without Postgres, set `MOCK_MODE=true` and leave `DATABASE_URL` empty — backend uses in-memory mock store (NOT for production, clearly isolated in `lib/prisma.ts` mock adapters, never mixed into prod code path when `DATABASE_URL` present and `MOCK_MODE=false`)

---

## Shopify App Setup

1. Go to https://partners.shopify.com → Create app → Custom app or Public
2. App URL: `https://your-backend.ngrok.io`
3. Redirect URL: `https://your-backend.ngrok.io/api/shopify/callback`
4. Scopes (minimal, listed explicitly):
   - `read_orders` — read new orders from webhook + list
   - `write_orders` — update metafield `orderconfirm.confirmation_status` and add note
   - `read_customers` — get customer phone/name (order already contains, but for enrichment)
5. No other scopes needed for MVP. Do NOT request `read_products`, `write_products`, etc unless needed.
6. Webhook: Backend auto-registers `orders/create` → `https://your-backend.ngrok.io/api/webhooks/shopify/orders-create` via Admin API 2026-07. Verify in Shopify Partners dashboard.
7. Install on dev store: open in mobile app Connect Shopify screen, enter `myshop.myshopify.com`, tap Connect — opens browser to Shopify OAuth.

---

## Meta WhatsApp Business Setup

1. Go to https://developers.facebook.com → Create App → Business → Add WhatsApp product
2. Note App ID, App Secret → set in backend `.env`
3. Configure webhook:
   - URL: `https://your-backend.ngrok.io/api/webhooks/whatsapp`
   - Verify Token: same as `WHATSAPP_VERIFY_TOKEN` env
   - Subscribe to: `messages`, `message_status`, `message_template_status`
4. Create message template (Utility category) for COD confirmation:
   - Name: `order_confirm_cod`
   - Language: `en_US`
   - Category: `UTILITY`
   - Body: `Hi {{1}}, please confirm your COD order {{2}} worth {{3}}. Tap Confirm to proceed or Cancel if you want to cancel.`
   - Buttons: Quick Reply `Confirm`, Quick Reply `Cancel`
   - Submit for approval — approval can take hours to days. UI shows real status from Meta API, never claims approved when not.
5. For local dev without Meta approval, backend `MOCK_MODE=true` auto-creates approved mock template and simulates send.
6. Phone Number: add test number in Meta dashboard, or use your WABA number. Get `phone_number_id` and `waba_id` from dashboard.
7. Embedded Signup v4: configure in App Dashboard → WhatsApp → Embedded Signup, set redirect to `https://your-backend.ngrok.io/api/whatsapp/callback`

---

## Local Dev Instructions

### Backend
```bash
cd backend
cp .env.example .env
# edit .env, set MOCK_MODE=true for no credentials
npm install
npx prisma generate
# if you have Postgres:
npx prisma migrate dev
npm run dev
# health check
curl http://localhost:3000/health
```

### Mobile
```bash
cd mobile
npm install
# set API URL for local dev (Android emulator uses 10.0.2.2 for host localhost)
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000 npx expo start
# or
npx expo start --tunnel # for physical device
# Run on Android
npx expo run:android
# or
npx expo start, then press 'a' for Android
```

Push notifications require physical device + `expo-notifications` permissions.

---

## EAS Build — Exact Commands for APK

We use Expo EAS Build with `preview` profile that outputs directly-installable APK (not AAB).

1. Install EAS CLI: `npm install -g eas-cli`
2. Login: `eas login`
3. Configure project: `cd mobile && eas build:configure` (creates projectId in app.json if not set)
4. Set env: ensure `eas.json` has `preview` profile with `android.buildType: apk` and `EXPO_PUBLIC_API_URL` pointing to your staging backend
5. Build preview APK:
```bash
cd mobile
eas build -p android --profile preview
```
6. Wait for build to finish — EAS will give a URL like `https://expo.dev/accounts/.../builds/...`
7. Download APK: from EAS dashboard or via CLI `eas build:list` then download link
8. Where APK lands: EAS cloud build artifact, downloadable via Expo dashboard → Builds → preview → Download. Locally, if you run `eas build -p android --profile preview --local`, APK will be in current dir or `build-*.apk`.
9. Sideload/install for testing:
   - Enable Developer Options + USB debugging or Allow Unknown Sources
   - `adb install path/to/app.apk` or transfer APK to device and tap to install
   - On device: open APK, allow install from unknown sources, install
10. Test deep linking: `adb shell am start -a android.intent.action.VIEW -d "orderconfirm://order/123"`

**Production AAB**: `eas build -p android --profile production` → produces AAB for Play Store.

**Permissions in app.json**: only `INTERNET` and `POST_NOTIFICATIONS`, nothing beyond what's used.

---

## Testing Instructions

### Backend Unit/Integration
```bash
cd backend
npm test
```
Tests included:
- `codDetection.test.ts`: COD detection with fixtures (cod gateway, manual+pending, prepaid razorpay, tags)
- `phone.test.ts`: normalization to E.164, Indian 10-digit, invalid handling
- `confirmationService.test.ts`: state transitions valid/invalid
- Manual tests:
  - Webhook HMAC: send fake webhook without valid HMAC → 401; with valid HMAC (computed with SHOPIFY_API_SECRET) → 200
  - Duplicate webhook idempotency: send same `X-Shopify-Webhook-Id` twice → second returns duplicate ignored, no second WhatsApp send
  - Tenant isolation/IDOR: create two orgs, try to fetch order from other org via `/api/orders/:id` → 404
  - WhatsApp send failure + retry: set invalid token, trigger order, check `message_attempts` status FAILED, push notification sent

### Mobile
- Auth token refresh: login, wait 15m or manually expire token, make API call → interceptor refreshes via `/auth/refresh`, succeeds; if refresh fails, tokens cleared
- Deep link from push: send push with data `{orderId: xyz}`, tap notification → app opens Order Detail for xyz (via `App.tsx` response listener + Linking)
- Offline read-only: enable airplane mode, open Dashboard/Orders → shows cached data + banner "offline — showing cached data", no write buttons enabled (or they show offline error)
- Reconnect flows: disconnect Shopify/WhatsApp via Settings → status shows disconnected → Connect screens allow reconnect, status refreshes

### End-to-end local (mock mode)
1. Backend `MOCK_MODE=true`, no DB needed
2. Register user via app
3. Connect Shopify via mock (enter any shop domain, OAuth will use mock token)
4. Connect WhatsApp via mock-connect page (auto-approved template)
5. Simulate Shopify order webhook:
```bash
curl -X POST http://localhost:3000/api/webhooks/shopify/orders-create \
  -H "X-Shopify-Hmac-Sha256: $(echo -n '{"id":12345,"name":"#1001","gateway":"cash on delivery","financial_status":"pending","payment_gateway_names":["cash on delivery"],"total_price":"999.00","currency":"INR","customer":{"first_name":"Test","last_name":"User","phone":"+919876543210"},"phone":"+919876543210"}' | openssl dgst -sha256 -hmac $SHOPIFY_API_SECRET -binary | base64)" \
  -H "X-Shopify-Shop-Domain: test.myshopify.com" \
  -H "X-Shopify-Topic: orders/create" \
  -H "X-Shopify-Webhook-Id: test-webhook-123" \
  -H "Content-Type: application/json" \
  -d '{"id":12345,"name":"#1001","order_number":1001,"gateway":"cash on delivery","financial_status":"pending","payment_gateway_names":["cash on delivery"],"total_price":"999.00","currency":"INR","customer":{"id":1,"first_name":"Test","last_name":"User","phone":"+919876543210"},"phone":"+919876543210","shipping_address":{"phone":"+919876543210"}}'
```
6. Check Orders list in app → new COD order awaiting confirmation
7. Simulate WhatsApp reply:
```bash
curl -X POST http://localhost:3000/api/webhooks/whatsapp \
  -H "X-Hub-Signature-256: sha256=$(echo -n '{"entry":[{"changes":[{"value":{"messages":[{"from":"919876543210","id":"wamid.test","type":"button","button":{"text":"Confirm"}}]}}]}]}' | openssl dgst -sha256 -hmac $WHATSAPP_APP_SECRET -hex | cut -d' ' -f2 | sed 's/^/sha256=/')" \
  -H "Content-Type: application/json" \
  -d '{"entry":[{"id":"123","changes":[{"value":{"metadata":{"phone_number_id":"mock"},"messages":[{"from":"919876543210","id":"wamid.test","type":"button","button":{"text":"Confirm"}}]}}]}]}'
```
8. Order should transition to CONFIRMED, push notification sent

---

## Known Limitations

- Push notification delivery isn't instant — depends on Expo Push Service + FCM, can take seconds to minutes, may be delayed by OS battery optimization
- WhatsApp template approval can take time (hours to days) — UI shows real status from Meta, does not claim approved when pending/rejected; in mock mode we simulate approved
- Phone number consent: we store consent flag but do not enforce full opt-in flow for MVP — merchant must ensure customer consent per WhatsApp policy
- No billing/subscriptions in MVP — stub models exist but not implemented
- No multi-store franchise support — one shop per org in MVP
- No admin panel — future work
- Offline is read-only — we cache last dashboard/orders, show banner, queue no writes offline (as required)
- Certificate pinning optional, not implemented for MVP
- Shopify webhook HMAC uses SHA256 (current), RSA rollout mentioned in changelog Q3 2026 — we verify SHA256, will need RSA update when enforced
- Graph API v26.0 used — if Meta deprecates, update `WHATSAPP_API_VERSION` env
- Expo SDK 52 used — update as needed

---

## Future Work (not implemented now)

- Admin panel, billing/subscriptions (Stripe), usage metering
- Multi-template management (create/edit via API)
- Advanced analytics beyond basic counts (RTO trend, cohort)
- Franchise/multi-store support
- Reminder job with configurable intervals (currently expiration only, reminder stub)
- Shopify Functions for COD fee
- Biometric auth on device

---

## Security Notes

- All secrets encrypted at rest (AES-256-GCM)
- JWT short-lived access + refresh rotation, stored in SecureStore
- No tokens in logs or crash reports
- Server-side authorization on every endpoint — IDOR tested
- Phone masking by default, reveal logged
- HTTPS-only backend (enforce via reverse proxy / ngrok)
- No raw card data ever

---

## Deliverables Checklist

- [x] Backend API service (real server, not on phone)
- [x] React Native Android app (Expo, TypeScript) with APK via EAS preview
- [x] Shopify OAuth + webhook + COD detection
- [x] WhatsApp Cloud API connection + template + send/confirm/cancel
- [x] Push notifications
- [x] Deep linking
- [x] Offline handling
- [x] Loading/empty/error states
- [x] State machine + idempotency
- [x] Database with required entities
- [x] Security measures
- [x] Mock adapters isolated for local dev only
- [x] Tests
- [x] Documentation

