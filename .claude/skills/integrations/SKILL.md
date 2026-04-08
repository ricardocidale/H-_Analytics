---
name: integrations
description: External service integrations for HBG Portal. Covers AI providers, financial services, geospatial, document intelligence, communication, image generation, observability, storage, and authentication. Use when working on integrations or external API calls.
---

# Integrations Infrastructure

Every external service the HBG Portal connects to, how it connects, and its boundaries. Covers AI providers, voice AI, financial services, geospatial, document intelligence, communication, image generation, observability, storage, and authentication. Use this skill when working on integrations, external API calls, or service configuration.

**Related skills:** `marcela-ai/` (AI agent using these services), `architecture/` (server routes that call services), `product-vision/` (future integration direction)

---

## AI Providers

All AI clients use a **lazy-singleton factory** pattern in `server/ai/clients.ts` — each client is created once on first use and reused for all subsequent calls.

### Anthropic (Claude 3.5 Sonnet)
| Aspect | Detail |
|--------|--------|
| **Use cases** | Premium exports, financial research (primary researcher), transaction categorization |
| **Env vars** | `ANTHROPIC_API_KEY` or `AI_INTEGRATIONS_ANTHROPIC_API_KEY` |
| **Base URL** | Optional override: `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` |
| **File** | `server/ai/clients.ts` → `getAnthropicClient()` |
| **Connector** | Replit AI Integration (javascript_anthropic_ai_integrations) |

### OpenAI
| Aspect | Detail |
|--------|--------|
| **Use cases** | General AI client |
| **Env vars** | `AI_INTEGRATIONS_OPENAI_API_KEY` |
| **Base URL** | Optional override: `AI_INTEGRATIONS_OPENAI_BASE_URL` |
| **File** | `server/ai/clients.ts` → `getOpenAIClient()` |
| **Connector** | Replit AI Integration (javascript_openai_ai_integrations) |

### Google Gemini
| Aspect | Detail |
|--------|--------|
| **Use cases** | General AI client, Marcela default LLM (via ElevenLabs) |
| **Env vars** | `AI_INTEGRATIONS_GEMINI_API_KEY` |
| **Base URL** | Optional override: `AI_INTEGRATIONS_GEMINI_BASE_URL` |
| **File** | `server/ai/clients.ts` → `getGeminiClient()` |
| **Connector** | Replit AI Integration (javascript_gemini_ai_integrations) |

**Admin configuration:** LLM provider selection is configurable via the admin panel — the system can switch which provider handles research, exports, or Marcela.

---

## Voice AI: ElevenLabs + Convai (Marcela)

| Aspect | Detail |
|--------|--------|
| **Use cases** | Real-time voice interaction with Marcela AI assistant |
| **Architecture** | WebSocket streaming for real-time audio STT + TTS pipeline |
| **Features** | Knowledge base sync, signed URL generation, agent configuration |
| **Env vars** | `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID` |
| **Files** | `server/integrations/elevenlabs.ts`, `server/integrations/elevenlabs-audio.ts` |
| **Connector** | Replit Integration (elevenlabs) |

See the `marcela-ai/` skill for the full Marcela architecture.

---

## Geospatial: Google Maps Platform

| Aspect | Detail |
|--------|--------|
| **Use cases** | Geocoding, Places autocomplete for property search, Nearby POI for competitive landscape (airports, comparable hotels) |
| **Additional** | MapLibre for 3D globe flyover visualization |
| **Env vars** | `GOOGLE_MAPS_API_KEY` |
| **Files** | `server/integrations/geospatial.ts` |
| **Routes** | `server/routes/geospatial.ts`, `server/routes/geo.ts` |

---

## Document Intelligence: Google Cloud Document AI

| Aspect | Detail |
|--------|--------|
| **Use cases** | OCR extraction from PDFs/images for financial data |
| **File** | `server/integrations/document-ai.ts` |
| **Routes** | `server/routes/documents.ts` |

---

## Communication

### Twilio (SMS)
| Aspect | Detail |
|--------|--------|
| **Use cases** | SMS notifications for financial alerts (DSCR breach, occupancy warnings) |
| **Env vars** | Via Replit Connector |
| **Files** | `server/integrations/twilio.ts` |
| **Routes** | `server/routes/twilio.ts` (HTTP + WebSocket) |
| **Connector** | Replit Integration (twilio) |

### Resend (Email)
| Aspect | Detail |
|--------|--------|
| **Use cases** | Transactional email — welcome, password reset, report sharing |
| **Env vars** | `RESEND_API_KEY` |
| **File** | `server/integrations/resend.ts` |

---

## Image Generation: Replicate

| Aspect | Detail |
|--------|--------|
| **Use cases** | Architectural renders — exterior, interior design, renovation concepts |
| **Configuration** | Model configs in `server/replicate-models.json` |
| **File** | `server/integrations/replicate.ts` |
| **Pipeline** | `server/image/pipeline.ts` |

---

## Observability

### Sentry
| Aspect | Detail |
|--------|--------|
| **Use cases** | Error tracking, performance monitoring |
| **File** | `client/src/lib/sentry.ts` |

### PostHog
| Aspect | Detail |
|--------|--------|
| **Use cases** | Product analytics, event tracking |
| **File** | `client/src/lib/analytics.ts` |

---

## Storage

### Replit Object Storage
| Aspect | Detail |
|--------|--------|
| **Use cases** | Uploaded documents, property photos, generated assets |
| **Connector** | Replit Integration (javascript_object_storage) |
| **Routes** | `server/replit_integrations/object_storage.ts` |

### PostgreSQL (Drizzle ORM)
| Aspect | Detail |
|--------|--------|
| **Use cases** | Primary data persistence for all entities |
| **Connector** | Replit Integration (javascript_database) |
| **File** | `server/db.ts` |

---

## Authentication

### Google OAuth 2.0
| Aspect | Detail |
|--------|--------|
| **Use cases** | User login via Google account |
| **Routes** | `server/routes/google-auth.ts` |

### Session-Based Auth
| Aspect | Detail |
|--------|--------|
| **Architecture** | Database-stored sessions, HTTP-only cookie, 7-day expiry |
| **File** | `server/auth.ts` |

### Replit Auth OIDC
| Aspect | Detail |
|--------|--------|
| **Status** | Installed; OIDC integration not yet wired into the application |
| **Connector** | Replit Integration (javascript_log_in_with_replit) |

---

## Integration Resilience Patterns

### Graceful Degradation
- If an AI provider is unavailable, the system should surface a clear error rather than silently falling back
- Research generation retries with exponential backoff

### Error Boundaries
- Each integration file wraps API calls in try/catch
- Errors are logged via the structured logger (`server/logger.ts`)
- User-facing errors provide actionable messages (not raw API errors)

### Rate Limiting
- AI research calls: rate-limited per user within a 1-minute sliding window
- Login attempts: 5 attempts per IP, 15-minute lockout
- External API calls: respect provider rate limits with appropriate spacing

---

## Integration File Map

| Integration | Server File | Route File | Env Var / Config |
|------------|-------------|------------|-----------------|
| Anthropic | `server/ai/clients.ts` | `server/routes/research.ts` | `ANTHROPIC_API_KEY` |
| OpenAI | `server/ai/clients.ts` | `server/routes/ai.ts` | `AI_INTEGRATIONS_OPENAI_API_KEY` |
| Gemini | `server/ai/clients.ts` | `server/routes/ai.ts` | `AI_INTEGRATIONS_GEMINI_API_KEY` |
| ElevenLabs | `server/integrations/elevenlabs.ts` | `server/routes/admin/marcela.ts` | `ELEVENLABS_API_KEY` |
| Google Maps | `server/integrations/geospatial.ts` | `server/routes/geospatial.ts` | `GOOGLE_MAPS_API_KEY` |
| Document AI | `server/integrations/document-ai.ts` | `server/routes/documents.ts` | Google Cloud credentials |
| Twilio | `server/integrations/twilio.ts` | `server/routes/twilio.ts` | Replit Connector |
| Resend | `server/integrations/resend.ts` | — | `RESEND_API_KEY` |
| Replicate | `server/integrations/replicate.ts` | — | `REPLICATE_API_TOKEN` |
| Sentry | `client/src/lib/sentry.ts` | — | `SENTRY_DSN` |
| PostHog | `client/src/lib/analytics.ts` | — | `POSTHOG_KEY` |
| Stripe | — | — | Replit Connector (installed) |
| Google Sheets | — | — | Replit Connector (installed) |
| Google Drive | — | — | Replit Connector (installed) |
