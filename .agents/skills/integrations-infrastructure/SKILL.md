---
name: integrations-infrastructure
description: "H+ external service integrations: AI providers (Anthropic/OpenAI/Gemini), voice AI (ElevenLabs/Convai), Plaid, Google Maps, Document AI, Twilio, Resend, Replicate image gen, Sentry, PostHog, storage (R2/S3), and auth (Google OAuth). Load when adding or modifying any external service integration."
---

## AI Providers

Lazy-singleton factory pattern in `artifacts/api-server/src/ai/`.

**Anthropic Claude**
- Used for: premium exports, financial research, transaction categorization (USALI mapping)
- Primary model for market research agentic workflow: Claude 3.5 Sonnet

**OpenAI**
- Used for: general AI client, fallback for some research tasks

**Google Gemini**
- Used for: general AI, Marcela default LLM backend (Gemini 2.0 Flash via ElevenLabs)

All providers are admin-configurable via render settings / LLM config panel in the admin sidebar.

## Voice AI

**ElevenLabs + Convai**
- WebSocket streaming for real-time audio (Marcela voice interface)
- STT + TTS pipeline; knowledge base sync; signed URL generation
- Integration files: `artifacts/api-server/src/integrations/elevenlabs.ts`, `artifacts/api-server/src/integrations/elevenlabs-audio.ts`

## Financial Services

**Plaid**
- Bank account linking, transaction sync
- AI-powered USALI categorization: maps bank transactions to hospitality expense categories
- Integration files: `artifacts/api-server/src/integrations/plaid.ts`, `artifacts/api-server/src/integrations/plaid-categorization.ts`

## Geospatial

**Google Maps Platform**
- Geocoding, Places autocomplete for property search
- Nearby POI: airports, comparable hotels for competitive landscape
- Integration: `artifacts/api-server/src/integrations/geospatial.ts`

**MapLibre**
- 3D globe flyover on Map View page (client-side rendering)

## Document Intelligence

**Google Cloud Document AI**
- OCR extraction from PDFs/images for financial data
- Integration: `artifacts/api-server/src/integrations/document-ai.ts`

## Communication

**Twilio**
- SMS notifications for financial alerts (DSCR/occupancy breach thresholds)
- Integration: `artifacts/api-server/src/integrations/twilio.ts`

**Resend**
- Transactional email: welcome, password reset, report sharing
- Integration: `artifacts/api-server/src/integrations/resend.ts`

## Image Generation

**Replicate**
- Architectural renders: exterior, interior design, renovation concepts
- Model configs stored in DB (`render_settings` table); seeded from `server/replicate-models.json` on first boot
- Integration: `artifacts/api-server/src/integrations/replicate.ts`
- Route: `artifacts/api-server/src/routes/render-settings.ts`

## Observability

**Sentry**
- Error tracking and performance monitoring

**PostHog**
- Product analytics and event tracking

## Storage

- Object storage: R2 (Cloudflare) or S3-compatible via `STORAGE_PROVIDER` env var
- Provider abstraction: `artifacts/api-server/src/providers/storage/`
- Key patterns:
  - `slides/property-${id}.pptx`
  - `/objects/property-photos/<id>.png`

## Authentication

**Google OAuth 2.0**
- Primary user login flow
- Session-based auth with cookie management
- Route: `artifacts/api-server/src/routes/google-auth.ts`
- **Both** `GOOGLE_CLIENT_ID` **and** `GOOGLE_CLIENT_SECRET` **must be set in both Railway service variables AND Replit Repl secrets.** If either var is absent in an environment, `registerGoogleAuthRoutes()` silently returns without mounting the route — `GET /api/auth/google` returns 404 with no log warning visible to the user. This is the #1 cause of "Google login broken in preview / in production".
- Callback URL registered in Google Cloud Console must match `${BASE_URL}/api/auth/google/callback`. `BASE_URL` is resolved by `getBaseUrl()` in `google-auth.ts`: checks `process.env.BASE_URL` first, then `getAppUrl()` (APP_URL → REPLIT_DOMAINS), falls back to `https://h-analysis.com`. Ensure the Railway domain (e.g. `https://h-analysis.com`) is listed in Google Cloud Console → APIs & Services → Credentials → Authorized redirect URIs.

**Dev quick-login (logo click)**
- Route: `POST /api/auth/dev-login` — logs in as the first `super_admin` in `seed-users.json`
- Gated server-side by `isPublishedDeployment()` (returns 403 in production — `REPLIT_DEPLOYMENT` env var is set)
- The login page logo always fires this request unconditionally. Do not add client-side pre-checks that silently swallow errors — they break in iframe/canvas preview contexts.

## Integration Resilience Patterns

**Graceful degradation**
- All external service calls wrapped in try/catch; missing service returns empty/fallback

**Timeout guards**
- `fetchWithTimeout` wrapper for all external HTTP calls

**SSRF prevention**
- Allowlist for any server-side fetch of user-supplied URLs: `["objectstorage.replit.com", "replitusercontent.com", "storage.googleapis.com"]`

## Related Skills

- marcela-ai-system
- api-backend-contract
- hbg-business-model
