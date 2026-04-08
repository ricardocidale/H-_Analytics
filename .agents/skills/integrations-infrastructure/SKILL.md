---
name: integrations-infrastructure
description: Every external service the HBG Portal connects to, how it connects, and its boundaries. Covers AI providers, voice AI, financial services, geospatial, document intelligence, communication, image generation, observability, storage, authentication, and the card-based source management system. Use this skill when working on integrations, external API calls, or service configuration.
---

# Integrations Infrastructure

## AI Providers

All AI clients use a **lazy-singleton factory** pattern in `server/ai/clients.ts` — created once on first use, reused thereafter.

| Provider | Use Cases | Env Vars | File |
|----------|-----------|----------|------|
| **Anthropic** (Claude 3.5 Sonnet) | Premium exports, financial research, transaction categorization | `ANTHROPIC_API_KEY` or `AI_INTEGRATIONS_ANTHROPIC_API_KEY` | `server/ai/clients.ts` -> `getAnthropicClient()` |
| **OpenAI** | General AI client | `AI_INTEGRATIONS_OPENAI_API_KEY` | `server/ai/clients.ts` -> `getOpenAIClient()` |
| **Google Gemini** | General AI, Rebecca default LLM | `AI_INTEGRATIONS_GEMINI_API_KEY` | `server/ai/clients.ts` -> `getGeminiClient()` |

LLM provider selection is configurable via the admin panel.

## Voice AI: ElevenLabs + Convai

| Aspect | Detail |
|--------|--------|
| **Use cases** | Real-time voice interaction with Rebecca AI assistant |
| **Architecture** | WebSocket streaming for real-time audio STT + TTS pipeline |
| **Env vars** | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` |
| **Files** | `server/integrations/elevenlabs.ts`, `server/integrations/elevenlabs-audio.ts` |

## Geospatial: Google Maps Platform

| Aspect | Detail |
|--------|--------|
| **Use cases** | Geocoding, Places autocomplete, Nearby POI for competitive landscape |
| **Additional** | MapLibre for 3D globe flyover visualization |
| **Env vars** | `GOOGLE_MAPS_API_KEY` |
| **Files** | `server/integrations/geospatial.ts`, `server/routes/geospatial.ts` |

## Document Intelligence: Google Cloud Document AI

| Aspect | Detail |
|--------|--------|
| **Use cases** | OCR extraction from PDFs/images for financial data |
| **Files** | `server/integrations/document-ai.ts`, `server/routes/documents.ts` |

## Communication

| Service | Use Cases | Files |
|---------|-----------|-------|
| **Twilio** (SMS + Voice) | SMS notifications, phone voice via WebSocket | `server/integrations/twilio.ts`, `server/routes/twilio.ts` |
| **Resend** (Email) | Transactional email — welcome, password reset, report sharing | `server/integrations/resend.ts` |

## Image Generation & Enhancement: Replicate

| Aspect | Detail |
|--------|--------|
| **Use cases** | Architectural renders (exterior, interior concepts) AND hero photo AI enhancement |
| **Config** | Model configs in `server/config/replicate-models.json` |
| **Files** | `server/integrations/replicate.ts`, `server/image/pipeline.ts`, `server/routes/property-photos.ts` |

### AI Image Enhancement Pipeline

The enhancement pipeline uses Replicate's clarity-upscaler (photo-upscale model) to improve hero property photos:

| Step | Detail |
|------|--------|
| **Trigger** | User clicks Sparkles button on hero photo |
| **Model** | `clarity-upscaler` (photo-upscale category in replicate-models.json) |
| **Staging** | Enhanced image stored in server memory (`pendingEnhancements` Map), NOT in DB |
| **Preview** | `EnhancePreviewDialog` — side-by-side and slider comparison modes |
| **Accept** | `POST /enhance/accept` commits base64 to `enhancedImageData` column + regenerates variants via `processImage()` |
| **Reject** | `POST /enhance/reject` discards staged enhancement from server memory |
| **Revert** | `DELETE /enhanced` clears `enhancedImageData` from DB |
| **Security** | All 6 endpoints enforce `checkPropertyAccess` (prevents IDOR) |

### Enhancement Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/property-photos/:id/enhance` | Send to Replicate, stage result |
| GET | `/api/property-photos/:id/enhanced-image` | Serve enhanced image binary |
| POST | `/api/property-photos/:id/enhance/accept` | Commit to DB + regenerate variants |
| POST | `/api/property-photos/:id/enhance/reject` | Discard staged enhancement |
| DELETE | `/api/property-photos/:id/enhanced` | Revert to original |
| GET | `/api/property-photos/:id/enhance/status` | Check pending enhancement |

## URL Validation Service

| Aspect | Detail |
|--------|--------|
| **Use cases** | Validate user-provided property URLs, auto-tag hospitality domain relevance |
| **Endpoint** | `POST /api/properties/:id/urls/validate` |
| **Method** | HEAD requests with 5-second timeout per URL |
| **Files** | `server/routes/properties.ts`, `server/storage/property-urls.ts` |

### SSRF Protection

The URL validation endpoint includes comprehensive SSRF guards:
- Localhost variants (127.0.0.1, 0.0.0.0, ::1)
- RFC1918 private ranges (10.x, 172.16-31.x, 192.168.x)
- Cloud metadata IPs (169.254.169.254, metadata.google.internal)
- Internal TLDs (.local, .internal)
- DNS resolution guard (resolve hostname → check resolved IPs against private ranges)

### Relevance Auto-Tagging

Known hospitality domains are auto-tagged as "relevant" during validation:
- OTA platforms: Airbnb, VRBO, Booking.com, Expedia, Hotels.com
- Review sites: TripAdvisor, Google Reviews
- Industry: STR, HVS, CBRE

## Observability

| Service | Use Cases | File |
|---------|-----------|------|
| **Sentry** | Error tracking, performance monitoring | `client/src/lib/sentry.ts` |
| **PostHog** | Product analytics, event tracking | `client/src/lib/analytics.ts` |

## Storage

| Service | Use Cases | Files |
|---------|-----------|-------|
| **Replit Object Storage** | Uploaded documents, property photos, generated assets | `server/replit_integrations/object_storage/` |
| **PostgreSQL** (Drizzle ORM) | Primary data persistence | `server/db.ts` |

## Authentication

| Method | Detail |
|--------|--------|
| **Google OAuth 2.0** | User login via Google account. `server/routes/google-auth.ts` |
| **Session-Based Auth** | Database-stored sessions, HTTP-only cookie, 7-day expiry. `server/auth.ts` |
| **Replit Auth OIDC** | Installed; OIDC integration not yet wired |

## Data Source Management (Card-Based System)

External data sources are managed through a **card-based admin UI** that replaced the previous list-based approach. Each source is represented as a "report card" showing health metrics, configuration, and available actions.

### Source Registry

All external data sources are tracked in the `source_registry` table:

| Field | Purpose |
|-------|---------|
| `serviceKey` | Unique identifier (e.g., "fred-api") |
| `name` | Display name |
| `category` | Tab grouping: `apis`, `scrapers`, `sources`, `models` |
| `sourceType` | Type within category (e.g., "api", "rest", "llm") |
| `endpoint` | API endpoint URL |
| `apiKeyRef` | Env var name for credentials (never the secret itself) |
| `successRate` | 0–100% health metric |
| `avgLatencyMs` | Performance metric |
| `isActive` | Toggle on/off |
| `dataProvided` | Tags array (e.g., ["SOFR", "CPI"]) |

### Source Categories

| Category | Tab | Icon | Source Types |
|----------|-----|------|-------------|
| APIs | APIs | Globe | api, rest, graphql |
| Scrapers | Scrapers | Research | scraper, crawler, extractor |
| Sources | Sources | Activity | report, survey, publication, database |
| Models | Models | Brain | llm, embedding, vision |

### Card Health Badges

| Status | Threshold | Color |
|--------|-----------|-------|
| Healthy | successRate ≥ 90% | Emerald |
| Degraded | 80–89% | Amber |
| Unreliable | < 80% | Red |
| Inactive | isActive = false | Gray |

### CRUD Operations

| Action | Endpoint | Notes |
|--------|----------|-------|
| List all | `GET /api/admin/source-registry` | Filtered by category tab on frontend |
| Create | `POST /api/admin/source-registry` | ConfigureDialog in create mode |
| Update | `PATCH /api/admin/source-registry/:id` | ConfigureDialog in edit mode |
| Toggle | `PATCH /api/admin/source-registry/:id/toggle` | Switch on card header |
| Delete | `DELETE /api/admin/source-registry/:id` | Cascades to call logs |
| Test | `POST /api/admin/source-registry/:id/test` | SSRF-protected connectivity check |
| Logs | `GET /api/admin/source-registry/:id/logs` | Last 50 call log entries |

### Call Logging

Test connectivity checks and source health updates are logged in `source_call_logs`:
- `httpStatus`, `latencyMs`, `success`, `errorMessage`, `timestamp`
- Cascading delete: removing a source deletes all its logs
- Viewable in a side-sheet panel from each card's "Logs" button

### SSRF Protection

The test endpoint includes comprehensive SSRF guards:
- RFC1918 private IP blocking
- Cloud metadata IP blocking (169.254.169.254)
- `.local`/`.internal` TLD blocking
- DNS resolution guard (resolve hostname → validate resolved IPs)

### Key Files

| File | Purpose |
|------|---------|
| `client/src/components/admin/intelligence/DataSourcesTab.tsx` | Card grid UI, CRUD dialogs, logs panel |
| `server/routes/admin/intelligence.ts` | Source registry API routes |
| `server/storage/intelligence-v2.ts` | Storage methods for source registry and call logs |

For full card anatomy, design patterns, and extension guide, see `.agents/skills/data-source-cards/SKILL.md`.

## Integration Resilience Patterns

- **Graceful Degradation** — Clear error surfacing, no silent fallbacks. Research generation retries with exponential backoff.
- **Error Boundaries** — Each integration file wraps API calls in try/catch. Errors logged via `server/logger.ts`.
- **Rate Limiting** — AI research: per-user 1-minute window. Login: 5 attempts per IP, 15-minute lockout.

## Integration File Map

| Integration | Server File | Route File | Env Var |
|------------|-------------|------------|---------|
| Anthropic | `server/ai/clients.ts` | `server/routes/research.ts` | `ANTHROPIC_API_KEY` |
| OpenAI | `server/ai/clients.ts` | `server/routes/ai.ts` | `AI_INTEGRATIONS_OPENAI_API_KEY` |
| Gemini | `server/ai/clients.ts` | `server/routes/ai.ts` | `AI_INTEGRATIONS_GEMINI_API_KEY` |
| ElevenLabs | `server/integrations/elevenlabs.ts` | `server/routes/admin/rebecca.ts` | `ELEVENLABS_API_KEY` |
| Google Maps | `server/integrations/geospatial.ts` | `server/routes/geospatial.ts` | `GOOGLE_MAPS_API_KEY` |
| Document AI | `server/integrations/document-ai.ts` | `server/routes/documents.ts` | Google Cloud credentials |
| Twilio | `server/integrations/twilio.ts` | `server/routes/twilio.ts` | Replit Connector |
| Resend | `server/integrations/resend.ts` | — | `RESEND_API_KEY` |
| Replicate (renders) | `server/integrations/replicate.ts` | — | `REPLICATE_API_TOKEN` |
| Replicate (enhance) | `server/integrations/replicate.ts` | `server/routes/property-photos.ts` | `REPLICATE_API_TOKEN` |
| URL Validation | `server/routes/properties.ts` | `server/routes/properties.ts` | — (outbound HEAD) |
| Sentry | `client/src/lib/sentry.ts` | — | `SENTRY_DSN` |
| PostHog | `client/src/lib/analytics.ts` | — | `POSTHOG_KEY` |
| Stripe | — | — | Replit Connector (installed) |
