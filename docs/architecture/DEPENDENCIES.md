# Dependencies — Complete Atlas

**Status:** Living document. Last audit: April 2026.
**Authority:** This is the canonical inventory of every external dependency. When adding, removing, or replacing a dependency, update this file in the same PR. If something is in the code but not in this file, the file is wrong.
**Audience:** Replit Agent, Claude Code, human contributors, new hires.

---

## How to read this document

Everything the app depends on is organized into 13 categories below. Each entry carries:

- **Name + version** (from `package.json` where applicable)
- **Purpose** — what this app uses it for
- **Files** — one or two representative locations
- **Env vars** — secrets that configure it
- **Cost** — pricing tier / license
- **Status** — `core` (load-bearing), `optional` (fallback/feature-gated), `dead` (referenced but unused)

Categories:

1. [Platform — Replit](#1-platform--replit)
2. [Database + ORM](#2-database--orm)
3. [Object storage](#3-object-storage)
4. [Authentication](#4-authentication)
5. [Backend runtime + Express](#5-backend-runtime--express)
6. [Frontend — React ecosystem](#6-frontend--react-ecosystem)
7. [LLM providers](#7-llm-providers)
8. [Vector store + retrieval](#8-vector-store--retrieval)
9. [AI infrastructure (SDKs + gateways)](#9-ai-infrastructure-sdks--gateways)
10. [Market-data + intelligence services](#10-market-data--intelligence-services)
11. [Image generation, photos, renders](#11-image-generation-photos-renders)
12. [Email, notifications, geospatial, docs](#12-email-notifications-geospatial-docs)
13. [Observability + analytics](#13-observability--analytics)
14. [Build + test tooling](#14-build--test-tooling)
15. [Export generation](#15-export-generation)
16. [Dead / unused / flagged for removal](#16-dead--unused--flagged-for-removal)

---

## 1. Platform — Replit

| Service | Where used | Env vars | Cost | Status |
|---|---|---|---|---|
| **Replit Deployments** (autoscale) | Production hosting | `REPLIT_DEPLOYMENT=1`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN` | Usage-based (CPU/memory) | core |
| **Replit Secrets** | All API keys, env config | n/a (platform-managed) | Included | core |
| **Replit Object Storage sidecar** | Photos, document uploads, render outputs | Sidecar at `127.0.0.1:1106`, `STORAGE_PROVIDER=replit` | Included | core |
| **Replit Database (Neon)** | Primary PostgreSQL | `DATABASE_URL` | Neon managed tier | core |
| **Replit Auth (OIDC)** | Primary auth provider | `AUTH_PROVIDER=replit`, `ISSUER_URL=https://replit.com/oidc` | Included | core |

**Nix channel:** `stable-24_05` — provides Chromium for Puppeteer-based exports + runtime libs.

**Vite plugins (dev-only):** `@replit/vite-plugin-cartographer`, `@replit/vite-plugin-dev-banner`, `@replit/vite-plugin-runtime-error-modal`. Stripped from prod builds.

---

## 2. Database + ORM

| Package | Version | Purpose | Files | License |
|---|---|---|---|---|
| `pg` | `^8.18.0` | PostgreSQL driver (raw pool) | `server/db.ts` | MIT |
| `drizzle-orm` | `^0.39.3` | TypeScript ORM / query builder | `shared/schema/`, `server/storage/*` | Apache-2.0 |
| `drizzle-zod` | `^0.7.1` | Auto-generate Zod schemas from Drizzle tables | `shared/schema/*.ts` | Apache-2.0 |
| `drizzle-kit` | `^0.31.4` (dev) | Schema migration CLI | `drizzle.config.ts`, `migrations/` | Apache-2.0 |
| `connect-pg-simple` | `^10.0.0` | Session store for `express-session` | `server/auth.ts` | MIT |
| `pgvector` (PG extension) | n/a | Vector similarity search inside Postgres | `server/ai/vector-store-service.ts`, migration `0012_pgvector_store.sql` | PostgreSQL license |

**Notable:** The app uses **pgvector** inside Postgres for RAG, NOT Pinecone. Embeddings: `text-embedding-3-small` at 1536 dimensions; HNSW index; cosine distance. `.claude/notes/analyst-architecture.md` has been corrected to reflect this.

**Seven pgvector namespaces:** `knowledge-base`, `research-history`, `comparables`, `assumption-guidance`, `documents`, `scenarios`, `properties`.

---

## 3. Object storage

| Provider | Purpose | Env vars | Status |
|---|---|---|---|
| **Replit Object Storage** (primary) | Photo uploads, rendered property images, document attachments | `STORAGE_PROVIDER=replit` (sidecar at `127.0.0.1:1106`) | core |
| **AWS S3** (fallback) | Same, if Replit sidecar unavailable | `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | optional |

Files: `server/providers/storage/replit-storage.ts`, `server/providers/storage/s3-storage.ts`.

Related package: `@google-cloud/storage` (`^7.18.0`) — used for Document AI output handling, **not** for primary storage.

---

## 4. Authentication

| Provider | Packages | Env vars | When used |
|---|---|---|---|
| **Replit Auth (OIDC)** | `openid-client` (`^6.8.2`), `passport` (`^0.7.0`) | `AUTH_PROVIDER=replit`, `ISSUER_URL=https://replit.com/oidc` | Production on Replit |
| **Local bcrypt + sessions** | `bcryptjs` (`^3.0.3`), `express-session` (`^1.19.0`) | `AUTH_PROVIDER=local`, `SESSION_SECRET` | Dev / offline fallback |
| Shared | `google-auth-library` (`^10.6.1`), `cookie-parser` (`^1.4.7`) | n/a | Both paths |

Files: `server/providers/auth/replit-auth.ts`, `server/providers/auth/local-auth.ts`, `server/auth.ts`.

Password hashing: bcrypt, 10 rounds. Session store: `connect-pg-simple` (shared Postgres).

---

## 5. Backend runtime + Express

| Package | Version | Purpose |
|---|---|---|
| `express` | `^5.0.1` | HTTP framework |
| `express-session` | `^1.19.0` | Session middleware |
| `compression` | `^1.8.1` | gzip/brotli response compression |
| `cookie-parser` | `^1.4.7` | Cookie parsing |
| `passport` | `^0.7.0` | Auth middleware |
| `ws` | `^8.18.0` | WebSocket server (SSE + realtime) |
| `bufferutil` | `^4.0.8` (optional) | Faster WebSocket frame encoding |
| `tsx` | `^4.20.5` (dev) | TypeScript direct execution (dev server) |
| `esbuild` | `^0.25.0` (dev) | Production backend bundler (→ `dist/index.cjs`) |

**Build flow:** dev → `tsx` live; production → `esbuild` bundles to `dist/index.cjs`, run via `node ./dist/index.cjs`.

**Route architecture:** `/api/*` under `server/routes/`. All mutations go through `IStorage` facade (`server/storage/`); no route imports `db` directly.

---

## 6. Frontend — React ecosystem

### Core

| Package | Version | Purpose |
|---|---|---|
| `react` | `^19.2.4` | UI framework |
| `react-dom` | `^19.2.4` | DOM renderer |
| `wouter` | `^3.3.5` | Client-side routing (~1.5 KB, alternative to React Router) |
| `@tanstack/react-query` | `^5.90.20` | Server state + caching |
| `@tanstack/react-table` | `^8.21.3` | Headless tables |
| `zustand` | `^5.0.10` | Client state (scenario, UI state) |
| `react-hook-form` | `^7.71.2` | Form state |
| `zod` | `^3.25.76` | Schema validation (client + server + shared) |
| `zod-validation-error` | `^3.5.4` | Human-readable Zod error messages |
| `superjson` | `^2.2.6` | JSON serialization of Date, BigInt, Map, etc. |

### UI primitives

| Package | Version | Purpose |
|---|---|---|
| `@radix-ui/react-*` | various | Unstyled accessible primitives (19 components: accordion, dialog, dropdown, select, tooltip, etc.) |
| `shadcn` | `^4.0.0` (dev) | CLI for Radix-based component library |
| `class-variance-authority` | `^0.7.1` | CVA-style variant composition |
| `tailwind-merge` | `^3.3.1` | Merge + dedupe Tailwind classes |
| `clsx` | `^2.1.1` | Conditional class joining |
| `tailwindcss` | `^4.1.14` (dev) | Utility-first CSS framework |
| `@tailwindcss/vite` | `^4.1.14` (dev) | Vite integration for Tailwind v4 |
| `tw-animate-css` | `^1.4.0` | Tailwind-compatible animate.css utilities |
| `autoprefixer` | `^10.4.24` (dev) | PostCSS vendor-prefixing |
| `postcss` | `^8.5.6` (dev) | CSS processor |

### Icons + imagery

| Package | Version | Purpose |
|---|---|---|
| `lucide-react` | `^0.545.0` | Primary icon set |
| `@phosphor-icons/react` | `^2.1.10` | Secondary icon set |
| `react-icons` | `^5.6.0` | Legacy multi-pack icon set |
| `react-image-crop` | `^11.0.10` | Photo crop UI for uploads |

### Animation + interaction

| Package | Version | Purpose |
|---|---|---|
| `framer-motion` | `^12.35.0` | Page transitions, staggered reveals, micro-interactions |
| `canvas-confetti` | `^1.9.4` | Celebratory UI effects |
| `sonner` | `^2.0.7` | Toast notifications |
| `cmdk` | `^1.1.1` | Command palette (⌘K) |
| `vaul` | `^1.1.2` | Mobile drawer/sheet |
| `embla-carousel-react` | `^8.6.0` | Carousels |
| `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`, `@dnd-kit/utilities` | various | Drag-and-drop |
| `react-day-picker` | `^9.14.0` | Date picker |

### Charts + visualization

| Package | Version | Purpose |
|---|---|---|
| `recharts` | `^2.15.4` | Primary chart library (Revenue, NOI, IRR, etc.) |
| `d3-array`, `d3-axis`, `d3-color`, `d3-interpolate`, `d3-scale`, `d3-selection` | various | Lower-level primitives for custom viz |
| `maplibre-gl` | `^5.19.0` | Map rendering for Property Finder / ICP |
| `supercluster` | `^8.0.1` | Point clustering on maps |
| `dom-to-image-more` | `^3.7.2` | DOM → PNG for export pipeline |

### Markdown + text

| Package | Version | Purpose |
|---|---|---|
| `react-markdown` | `^10.1.0` | Render Markdown (Rebecca chat, help content) |
| `remark-gfm` | `^4.0.1` | GitHub-flavored Markdown extension |
| `dompurify` | `^3.3.3` | HTML sanitization (user-generated content) |

---

## 7. LLM providers

| Provider | SDK package | Version | Models used | Env vars | Purpose |
|---|---|---|---|---|---|
| **Anthropic** | `@anthropic-ai/sdk` | `^0.85.0` | `claude-sonnet-4-5` (market panel), `claude-opus-4-6` (synthesis) | `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL` | Primary research synthesis, Analyst voice, Rebecca chat |
| **Google Gemini** | `@google/genai` | `^1.46.0` | `gemini-2.5-flash` (quantitative panel), `gemini-2.5-flash-image` (Nano Banana) | `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL` | Quantitative panel in Cognitive Engine, image fallback |
| **OpenAI** | `openai` | `^6.18.0` | `gpt-4.1`, `gpt-image-1`, `text-embedding-3-small` | `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL` | Embeddings (pgvector), image gen, GPT fallbacks |
| **Perplexity** | `@perplexity-ai/perplexity_ai` | `^0.26.2` | `sonar` | `PERPLEXITY_API_KEY` | Live web research with citations |

Files: `server/ai/clients.ts` (singleton factories), `server/ai/research-client.ts`, `server/ai/web-research.ts`, `server/services/GroundedResearchService.ts`.

**Cost profile:** All four are usage-based on provider pricing. Baseline ~$0.70 per "Consult the Analyst" click (Gemini + Sonnet + Opus combined). Embeddings at `$0.02/1M` tokens are negligible.

**In-flight migration (Phase OT-A):** these direct SDKs will be routed through the **Vercel AI SDK** and **Vercel AI Gateway** for unified billing, failover, and observability. BYOK — Anthropic/Gemini/OpenAI keys stay the same; Gateway takes zero markup. See `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md`.

---

## 8. Vector store + retrieval

| Layer | Technology | Purpose |
|---|---|---|
| Storage | **pgvector** inside Neon Postgres | Persistent vector index |
| Embeddings | `text-embedding-3-small` (OpenAI) | 1536-dim embeddings, cosine distance |
| Index | HNSW | Approximate nearest neighbor |
| Schema migration | `migrations/0012_pgvector_store.sql` | Adds `embedding VECTOR(1536)` columns |

**Seven namespaces:**

| Namespace | Indexes | Used by |
|---|---|---|
| `knowledge-base` | KB chunks from `server/ai/kb-content.ts` + `attached_assets/` | Rebecca RAG, research KB lookups |
| `research-history` | Past research runs | Orchestrator Phase 1 (similar prior research retrieval) |
| `comparables` | Hospitality benchmark snapshots | Cognitive Engine comparables relaxation |
| `assumption-guidance` | Per-property guidance rows | UI range badges, staleness detection |
| `documents` | Document-AI extracted content | Document search, Rebecca file context |
| `scenarios` | Scenario summaries | Scenario-similarity search |
| `properties` | Property profiles | Property Finder semantic search |

Files: `server/ai/vector-store-service.ts`, `server/storage/vector-store.ts`, `server/ai/vector-indexing.ts`, `server/ai/knowledge-base.ts`.

**Admin reindex endpoint:** `POST /api/admin/vector-store/reindex/:namespace` (deletes namespace, re-embeds, re-indexes).

---

## 9. AI infrastructure (SDKs + gateways)

**Current state (as of April 2026):** direct SDK calls per provider (`clients.ts`).

**Adopted / in-flight (Phase OT-A):**

| Tool | Package(s) | Purpose | Cost |
|---|---|---|---|
| **Vercel AI SDK** | `ai`, `@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai` | Unified provider interface, `generateObject` / `streamObject` for structured output | $0 (OSS) |
| **Vercel AI Gateway** | (hosted, no SDK) | Unified routing, failover, cost dashboards, BYOK at zero markup | $5/mo free credit, zero markup with BYOK |

Env var: `AI_GATEWAY_API_KEY` (in Replit Secrets).

See OT-A handoff for migration plan: `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md`.

**Not adopted (considered, deferred):**

- **Helicone** — proxy observability. Superseded by AI Gateway + Anthropic native prompt caching.
- **Mastra / LangGraph** — agent orchestration frameworks. Current `research-orchestrator.ts` is clean enough to not warrant migration; revisit in Phase 5 if multi-step agent workflows become needed.
- **Braintrust** — eval platform. Queued as OT-C (decision point after OT-A + OT-B data).
- **Promptfoo** — PR-gate eval. Queued as OT-B.

---

## 10. Market-data + intelligence services

These are the "ambient" data feeds The Analyst consults. Organized by status (core vs optional) and function.

### Core (load-bearing for Cognitive Engine research)

| Service | Purpose | Env vars | Cost | Files |
|---|---|---|---|---|
| **Tavily** | Factual web search with domain filtering (str.com, hvs.com, costar.com, etc.) | `TAVILY_API_KEY` | Free tier (1k req/mo), $30+/mo thereafter | `server/ai/web-research.ts`, `server/services/GroundedResearchService.ts` |
| **Apify** | Airbnb / VRBO / Booking / TripAdvisor STR scrapers | `APIFY_API_TOKEN` | Actor-based (pay per result) | `server/services/ApifyService.ts` |
| **RapidAPI** | Booking.com, Airbnb, Hotels.com parallel sources | `RAPIDAPI_KEY_2`, `RAPIDAPI_KEY_3` | Per-provider plans | `server/services/RapidApiHospitalityService.ts` |
| **Amadeus** | Live hotel rates, comp-set analysis | `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` | Free 2–10k req/mo, enterprise thereafter | `server/services/AmadeusService.ts` |
| **FRED** (Federal Reserve) | US treasury rates (SOFR, DGS2/5/10), CPI, DPRIME | `FRED_API_KEY` | Free | `server/services/FREDService.ts` |

### Optional (on-demand or fallback)

| Service | Purpose | Env vars | Status |
|---|---|---|---|
| **CoStar** | Commercial RE market data | `COSTAR_API_KEY`, `COSTAR_API_URL` | optional — premium feed |
| **S&P Global** | Moody's Analytics, commodities, credit | `SPGLOBAL_API_KEY`, `SPGLOBAL_API_URL` | optional |
| **Moody's** | Credit + economic data | `MOODYS_API_KEY`, `MOODYS_API_URL` | optional |
| **World Bank** | Economic indicators, country data | (none — public) | optional |
| **Walk Score** | Walkability, transit, bike scores | `WALK_SCORE_API_KEY` | optional (per-property, 30-day cache) |
| **OpenExchangeRates** | FX conversion | (env var in code) | optional |
| **AlphaVantage** | Financial data | (env var in code) | optional |
| **Xotelo** | Luxury rental analytics | (env var in code) | optional |
| **Weather API** | Location-based weather | (env var in code) | optional |

All services extend `server/services/BaseIntegrationService.ts`, which provides circuit breakers, retry logic, and timeout enforcement.

---

## 11. Image generation, photos, renders

| Provider | Purpose | Env vars | Files |
|---|---|---|---|
| **Replicate** | Property renders (architectural-exterior, interior-design, renovation-concept, photo-upscale, virtual-staging, background-remove, photo-to-render) | `REPLICATE_API_TOKEN` | `server/integrations/replicate.ts`, config at `server/replicate-models.json` |
| **OpenAI `gpt-image-1`** | Primary text-to-image fallback | `OPENAI_API_KEY` | `server/replit_integrations/image/client.ts` |
| **Google Gemini `gemini-2.5-flash-image`** ("Nano Banana") | Secondary fallback | `AI_INTEGRATIONS_GEMINI_API_KEY` | Same |

Supporting packages:

| Package | Version | Purpose |
|---|---|---|
| `sharp` | `^0.34.5` | Server-side image resize / format conversion |

---

## 12. Email, notifications, geospatial, docs

| Service | Purpose | Env vars | Status |
|---|---|---|---|
| **Resend** | Transactional email (welcome, invite, password reset, report share, scenario share) | `RESEND_API_KEY` | core |
| **Google Maps** | Geocoding, nearby POI search (hotel, airport, convention_center, tourist_attraction) | `GOOGLE_MAPS_API_KEY` | optional (Property Finder) |
| **Google Document AI** | Document extraction + table recognition | `GOOGLE_CLOUD_PROJECT`, `DOCUMENT_AI_PROCESSOR_ID`, `DOCUMENT_AI_LOCATION` | optional (document ingestion) |

Files: `server/integrations/resend.ts`, `server/integrations/geospatial.ts`, `server/integrations/document-ai.ts`.

Resend is the only notification channel. No Twilio SMS, no Slack integration at runtime (though Slack is in Replit Integrations, unused in app code).

---

## 13. Observability + analytics

| Tool | Package(s) | Purpose | Env vars | Status |
|---|---|---|---|---|
| **Sentry** | `@sentry/node`, `@sentry/react` (`^10.43.0`) | Error + performance monitoring | `SENTRY_DSN` | core |
| **PostHog** | `posthog-js` (`^1.360.1`) | Product analytics | `POSTHOG_KEY` | **partially wired** — CSP allows `posthog.com` + package installed, but runtime integration incomplete |

Files: `server/sentry.ts`, `client/src/lib/sentry.ts`.

**Sentry sample rates:** 20% in production (`REPLIT_DEPLOYMENT=1`), 100% in dev. Tags `FinancialCalculationError` separately for auditability.

**Logging:** structured format `[LEVEL] [domain] message` per `.claude/rules/error-handling.md`. No log-shipping SaaS (Datadog / Loggly / Papertrail) currently.

---

## 14. Build + test tooling

### Build

| Tool | Version | Purpose |
|---|---|---|
| `vite` | `^7.1.9` (dev) | Frontend dev server + bundler |
| `@vitejs/plugin-react` | `^5.1.3` (dev) | React plugin for Vite |
| `esbuild` | `^0.25.0` (dev) | Backend production bundler → `dist/index.cjs` |
| `typescript` | `5.6.3` (dev) | Type checker |
| `tsx` | `^4.20.5` (dev) | Runtime TS executor (dev + CI scripts) |

### Test

| Tool | Version | Purpose |
|---|---|---|
| `vitest` | `^4.0.18` (dev) | Unit + integration test runner (~4,191 tests) |
| `fast-check` | `^3.23.2` (dev) | Property-based testing |
| `happy-dom` | `^20.8.3` (dev) | DOM simulation for component tests |

### Lint + commit quality

| Tool | Version | Purpose |
|---|---|---|
| `eslint` | `^10.2.0` (dev) | Lint rules |
| `@typescript-eslint/eslint-plugin`, `@typescript-eslint/parser` | `^8.58.0` (dev) | TypeScript ESLint |
| `husky` | `^9.1.7` (dev) | Git hooks (pre-commit) |
| `lint-staged` | `^16.4.0` (dev) | Run linters on staged files only |

### Custom CI scripts

All under `script/`:
- `test-summary.ts` — aggregated test runner
- `verify-summary.ts` — the 15-phase proof pipeline (`npm run verify:summary`)
- `audit-quick.ts` — quick bug sweep
- `audit-deep.ts` — deep audit (forbidden patterns, decimal safety)
- `ci-hygiene.ts` — auto-fix ESLint + TypeScript + secret scanner false positives after external code pulls
- `cost-monitor.ts` — LLM cost tracking
- `parity-check.ts` — client/server calculation parity
- `health.ts` — startup health check
- `stats.ts` — repo stats

---

## 15. Export generation

| Package | Version | Format | Purpose |
|---|---|---|---|
| `@react-pdf/renderer` | `^4.3.2` | PDF | Premium multi-page investor reports |
| `jspdf` | `^4.2.1` | PDF | Simpler PDF generation (fallback, quick exports) |
| `jspdf-autotable` | `^5.0.7` | PDF | Table rendering for jsPDF |
| `pptxgenjs` | `^4.0.1` | PPTX | PowerPoint (16:9 slide decks) |
| `docx` | `^9.6.1` | DOCX | Microsoft Word export |
| `xlsx` | `^0.18.5` | XLSX | Multi-sheet Excel workbooks |
| `dom-to-image-more` | `^3.7.2` | PNG | DOM → PNG for chart rasterization |

Every financial data page exposes all 6 formats via a single `ExportMenu` in the tab bar. See `.claude/rules/exports.md`.

---

## 16. Dead / unused / flagged for removal

Env vars referenced in seeds or config but with **no matching code path** as of this audit:

| Env var | Suspected intent | Status |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek LLM provider | No code references — remove from seeds if not planned |
| `XAI_API_KEY` | xAI/Grok | No code references — remove |
| `META_API_KEY` | Meta (Instagram / WhatsApp?) | No code references — remove |
| `AIRDNA_API_KEY`, `AIRDNA_API_URL` | AirDNA STR data | No service file — either wire up or remove |
| `GOOGLE_SEARCH_API_KEY` | Google Custom Search | Superseded by Perplexity + Tavily |

**Action item:** next cleanup pass should `git grep` each of these keys, confirm zero consumers, and remove from any seed files / admin tables that claim they exist. Failure to remove leaves a false impression that the app can consult them.

---

## Appendix A — Env-var inventory (quick reference)

Grouped by category. Add to `.replit` secrets or local `.env` as applicable.

**Platform:**
- `DATABASE_URL` — Postgres (Neon)
- `REPLIT_DEPLOYMENT`, `REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN` — Replit platform

**Auth:**
- `AUTH_PROVIDER` (`replit` | `local`)
- `ISSUER_URL` (Replit OIDC)
- `SESSION_SECRET` (local fallback)

**LLM:**
- `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_ANTHROPIC_BASE_URL`
- `OPENAI_API_KEY`, `AI_INTEGRATIONS_OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `AI_INTEGRATIONS_OPENAI_BASE_URL`
- `AI_INTEGRATIONS_GEMINI_API_KEY`, `AI_INTEGRATIONS_GEMINI_BASE_URL`
- `PERPLEXITY_API_KEY`
- `AI_GATEWAY_API_KEY` (Vercel AI Gateway, OT-A)

**Market data:**
- `TAVILY_API_KEY`
- `APIFY_API_TOKEN`
- `RAPIDAPI_KEY_2`, `RAPIDAPI_KEY_3`
- `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET`
- `FRED_API_KEY`
- `COSTAR_API_KEY`, `COSTAR_API_URL`
- `SPGLOBAL_API_KEY`, `SPGLOBAL_API_URL`
- `MOODYS_API_KEY`, `MOODYS_API_URL`
- `WALK_SCORE_API_KEY`

**Image + photos:**
- `REPLICATE_API_TOKEN`

**Integrations:**
- `RESEND_API_KEY`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_CLOUD_PROJECT`, `DOCUMENT_AI_PROCESSOR_ID`, `DOCUMENT_AI_LOCATION`

**Object storage:**
- `STORAGE_PROVIDER` (`replit` | `s3`)
- `S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (fallback)

**Observability:**
- `SENTRY_DSN`
- `POSTHOG_KEY` (partial)

---

## Appendix B — Known documentation cleanup still to do

Stale Pinecone references and file-name references in skill files that pre-date the pgvector migration. Known-not-fixed in the current audit:

| File | Issue |
|---|---|
| `.claude/skills/rebecca-chatbot/SKILL.md` | ~15 mentions of Pinecone; references non-existent `server/ai/pinecone-service.ts` (now `vector-store-service.ts`); function-name references like `syncKBEntryToPinecone()` may be stale |
| `.claude/skills/research/SKILL.md` | ~6 mentions of Pinecone in orchestration description |
| `.claude/skills/product-vision/*.md` | Several Pinecone references in product-level descriptions |
| `.claude/skills/architecture/*.md` | Pinecone references in architecture descriptions |
| `.claude/archive/agents-skills-snapshot/pinecone-*/**` | Intentionally stale (archive); leave alone |
| `.claude/plans/**`, `.claude/replit-handoffs/**`, `.claude/replit-instructions/**` | Historical; leave alone |

These are known-stale and do not describe the current codebase. The authority is this file (`DEPENDENCIES.md`), `.claude/claude.md`, and `.claude/notes/analyst-architecture.md` (corrected April 19, 2026). The outdated skill files should get a full cleanup pass as a separate piece of work.

When updating the stale skill files: replace `Pinecone` → `pgvector`, `server/ai/pinecone-service.ts` → `server/ai/vector-store-service.ts`, `syncKBEntryToPinecone` → whatever the actual current function name is (grep the code), and verify namespace lists match the 7 documented here.

---

## Appendix C — When updating this document

1. **Add** a dependency → add a row in the relevant section + update `package.json` + env-var appendix.
2. **Remove** a dependency → delete its row here + update `package.json` + remove env vars from Replit Secrets.
3. **Upgrade** a dependency → bump version in `package.json`; update version column here if it's pinned material.
4. **Any change** → run five gates (`.claude/rules/pre-commit-verification.md`) before commit.

Every PR that modifies `package.json` should also modify this file. A PR that skips the doc update is incomplete.

---

## Appendix D — Related documentation

- `.claude/claude.md` — master doc; links to this file
- `.claude/skills/integrations/SKILL.md` — deeper dive on specific integrations
- `.claude/skills/architecture/SKILL.md` — system-level architecture
- `.claude/notes/analyst-architecture.md` — Cognitive Engine deep-dive. Pinecone references corrected to pgvector April 2026.
- `.claude/rules/financial-safety.md` — rules that constrain which packages are allowed in `calc/`
- `.claude/rules/deterministic-tools.md` — the 37-tool registry rule
- `docs/architecture/ANALYST.md` — The Analyst architecture spine
- `docs/operational-tooling/HANDOFF-replit-phase-OT-A.md` — in-flight Vercel AI SDK migration
- `replit.md` — platform-specific notes mirroring this file
