# OrderConfirm Architecture Plan (2026-09-17)

Verified at build time:
- Shopify Admin API latest stable: **2026-07** (released July 1 2026, supported until July 16 2027 15:00 UTC) — from https://shopify.dev/release-notes/2026-07
- Meta Graph API / WhatsApp Cloud API latest: **v26.0** (released July 29 2026) — from https://developers.facebook.com/docs/graph-api/changelog/ . Previous stable v25.0 (Feb 18 2026), v24.0, v23.0 still supported. We will target v26.0 with fallback config.

## System Shape

Two deployable pieces:

### A) Backend API (Node.js / TypeScript / Express / Prisma / PostgreSQL)

Responsibilities:
- Auth (JWT access + refresh, org/shop multi-tenancy)
- Shopify OAuth (authorization_code flow, HMAC verification, webhook registration)
- Shopify webhooks receiver: orders/create -> idempotency -> COD detection -> WhatsApp send
- WhatsApp Cloud API: connection storage (encrypted token), template send, webhook receiver for delivery status + inbound replies (Confirm/Cancel)
- State machine for confirmation_requests
- Push notification dispatcher via Expo Push Service
- REST API for mobile app (authenticated, tenant-isolated)

Why backend-owned:
- Shopify and Meta need stable public HTTPS endpoints for webhooks / OAuth callbacks
- Secrets must never live on device
- Idempotency and state transitions must be auditable server-side

### B) Mobile App (React Native / Expo / TypeScript)

Responsibilities:
- Merchant UI only, talks to backend over HTTPS + Bearer token
- Secure token storage via expo-secure-store
- Push notifications via expo-notifications / FCM
- Deep linking: orderconfirm://order/:id and https://orderconfirm.app/order/:id
- Offline: cache last dashboard/orders in AsyncStorage, read-only banner
- Screens: Login, Onboarding, ConnectShopify (WebView/browser), ConnectWhatsApp (browser), Dashboard, Orders list, Order Detail (masked phone + reveal logged), Settings, Template status

## Core Flow (backend-owned)

1. Merchant sign-up in app -> POST /auth/register -> creates user, organization, membership (owner)
2. Login -> JWT access (15m) + refresh (30d) stored in SecureStore
3. Connect Shopify: app opens backend /shopify/auth?shop=xxx.myshopify.com in browser (expo-web-browser). Backend completes OAuth, stores shopify_connections encrypted, registers webhook orders/create via Admin API 2026-07, returns deep link to app.
4. Connect WhatsApp: app opens backend /whatsapp/auth/start (Embedded Signup v4 flow). Merchant completes Meta Embedded Signup, backend exchanges code for access_token, stores whatsapp_connections encrypted, validates template status.
5. Shopify orders/create webhook -> backend:
   - verify X-Shopify-Hmac-Sha256
   - check webhook_events.idempotency_key (X-Shopify-Webhook-Id or order id + topic)
   - load shop -> org -> check COD rules (min/max, prepaid ignore)
   - COD detection: gateway contains cod, manual, cash, or financial_status=pending + payment_gateway_names includes COD variants, or tags. Conservative: if contains "cash on delivery", "cod", "manual" => COD
   - normalize phone to E.164 (libphonenumber-js), validate consent (store consent flag, don't assume)
   - create orders, customers, confirmation_requests NEW -> AWAITING_CONFIRMATION
   - send WhatsApp template via Graph API v26.0 POST /{phone_number_id}/messages
   - record message_attempts, update state, push notification to merchant
6. Customer taps Confirm/Cancel in WhatsApp -> WhatsApp webhook -> backend verifies X-Hub-Signature-256 -> maps to confirmation_request -> state transition -> updates Shopify metafield/order note via Admin API -> pushes notification to merchant app
7. No response: background job marks EXPIRED after configurable timeout, reminder job sends max N reminders

## State Machine

NEW → AWAITING_CONFIRMATION → CONFIRMED / CANCEL_REQUESTED → CANCELLED / EXPIRED / FAILED

Transitions controlled in service with audit_logs. Duplicate webhooks blocked by idempotency keys.

## Database (PostgreSQL + Prisma)

Core tables:
- users (id uuid, email, password_hash, created_at)
- organizations (id, name)
- memberships (user_id, org_id, role owner/admin/member)
- shops (id, org_id, domain, name)
- shopify_connections (id, shop_id, org_id, shop_domain, access_token_encrypted, scopes, status connected/disconnected, webhook_id)
- whatsapp_connections (id, org_id, shop_id nullable, waba_id, phone_number_id, display_phone_number, access_token_encrypted, status, template_status)
- customers (id, org_id, shop_id, shopify_customer_id, phone_e164, phone_masked, name, email, consent, last_order_at)
- orders (id, org_id, shop_id, shopify_order_id, order_number, name, financial_status, fulfillment_status, total_price, currency, payment_gateway, is_cod, confirmation_status, customer_id, raw_payload, created_at_shopify)
- confirmation_requests (id, order_id, org_id, status NEW/AWAITING/CONFIRMED/CANCEL_REQUESTED/CANCELLED/EXPIRED/FAILED, expires_at, confirmed_at, cancelled_at, audit)
- message_attempts (id, confirmation_request_id, template_name, to_phone, status SENT/DELIVERED/READ/FAILED, wa_message_id, error_code, error_message, sent_at)
- message_templates (id, org_id, waba_id, name, language, category UTILITY, status PENDING/APPROVED/REJECTED, components json, meta_template_id)
- webhook_events (id, source shopify/whatsapp, topic, shopify_webhook_id, payload, hmac_valid, processed, idempotency_key unique, created_at)
- audit_logs (id, org_id, actor_type user/system/webhook, actor_id, action, entity_type, entity_id, metadata, created_at)
- notification_settings (org_id, enable_push, rules json)
- device_push_tokens (id, user_id, org_id, expo_push_token, platform, last_active)
- subscriptions (future, stub)
- usage_records (future, stub)

Indexes: org_id on all tenant tables, shopify_order_id unique per shop, idempotency_key unique, phone lookups.

## Security

- HTTPS only, Helmet, CORS limited to app
- JWT: access 15m, refresh 30d rotation, stored SecureStore, never logged
- Server-side authz: middleware loads org from token, every query WHERE org_id = token.org_id -> IDOR tested
- Webhook HMAC: Shopify HMAC-SHA256 with api secret, WhatsApp X-Hub-Signature-256 with app secret
- Rate limiting: express-rate-limit per IP + per org
- Input validation: zod
- Encrypted secrets: AES-256-GCM for tokens at rest, key from env ENCRYPTION_KEY
- Phone masking: UI shows +91****1234 by default, reveal requires POST /orders/:id/reveal + audit log
- No raw card data

## WhatsApp/Shopify Rules

- Official APIs only: Graph API v26.0 for WhatsApp Cloud, Admin API 2026-07 for Shopify
- Only approved templates: send only if template status APPROVED, otherwise show UI warning
- Consent: store customer consent, don't assume every phone can be messaged
- No guarantee claims: UI copy "Confirm COD orders before you ship them" + show confirmation rate, not RTO guarantee

## APK Build

- Expo SDK 52 (or latest stable at build), app.json with package com.orderconfirm.merchant, versionCode incremental
- Permissions: INTERNET, POST_NOTIFICATIONS, USE_BIOMETRIC optional, no extra
- eas.json: preview profile => distribution internal, android buildType apk, env EXPO_PUBLIC_API_URL
- Env separation: backend .env (DATABASE_URL, JWT_SECRET, ENCRYPTION_KEY, SHOPIFY_API_KEY/SECRET, WHATSAPP_APP_SECRET, etc), mobile via EAS env + app.config.js reading EXPO_PUBLIC_API_URL
- Commands documented in README

## MVP Scope

Implemented now:
1. Backend auth + org/shop model
2. Shopify OAuth + orders/create webhook + COD detection
3. WhatsApp Cloud API connection + one approved template + send/confirm/cancel
4. Push notification on order status change
5. RN app: login, connect Shopify/WhatsApp, dashboard, orders, detail, settings
6. EAS preview APK

Future (not now): admin panel, billing, multi-template, advanced analytics, multi-store franchise.

## Testing

Backend:
- webhook HMAC verification (unit)
- duplicate webhook idempotency (integration)
- COD detection (unit with fixtures)
- phone normalization (unit)
- tenant isolation/IDOR (integration test trying to access other org's order)
- state transitions valid/invalid (unit)
- WhatsApp send failure + retry (mock adapter)

Mobile:
- auth token refresh (manual + unit)
- deep link from push opens correct order (Expo linking test)
- offline read-only state (simulate airplane)
- reconnect flows when disconnected (mock backend disconnect)
