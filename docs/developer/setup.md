# Local Development Setup

---

## Prerequisites

- **Node.js 20+** (LTS recommended)
- **PostgreSQL 16+** (local install or Docker) — or use [Neon](https://neon.tech) cloud PostgreSQL
- **npm 10+** (ships with Node.js 20)
- **Git**

---

## Clone and Install

```bash
git clone <repo-url>
cd H-Analytics
npm install
```

---

## Database Setup

### Option A: Neon Cloud (recommended for quick start)

1. Create a free project at [neon.tech](https://neon.tech)
2. Copy the connection string from the dashboard

### Option B: Local PostgreSQL

```bash
createdb hbg_portal
# Connection string: postgresql://your_user:your_password@localhost:5432/hbg_portal
```

### Option C: Docker

```bash
docker run -d --name hbg-postgres \
  -e POSTGRES_DB=hbg_portal \
  -e POSTGRES_PASSWORD=devpass \
  -p 5432:5432 postgres:16
# Connection string: postgresql://postgres:devpass@localhost:5432/hbg_portal
```

### Push Schema

```bash
npm run db:push
```

This uses Drizzle Kit to push the schema from `shared/schema.ts` to your database. The app also runs TypeScript startup migrations automatically on boot.

---

## Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Required
DATABASE_URL=postgresql://...        # Your PostgreSQL connection string
ADMIN_PASSWORD=your_admin_password   # For admin login
CHECKER_PASSWORD=your_checker_pass   # For checker/auditor login

# Server
NODE_ENV=development
PORT=5000

# AI Providers (at least one for market research)
AI_INTEGRATIONS_GEMINI_API_KEY=      # Primary research provider
AI_INTEGRATIONS_ANTHROPIC_API_KEY=   # Verification provider
AI_INTEGRATIONS_OPENAI_API_KEY=      # Optional

# Optional
# FRED_API_KEY=                      # Free at fred.stlouisfed.org — live interest rates, CPI
# RAPIDAPI_KEY=                      # Property search integration
```

---

## Complete Environment Variable Reference

All environment variables organized by the source registry categories. The app starts without optional vars but features degrade gracefully.

### Core (Required)

| Variable | Service | Purpose |
|----------|---------|---------|
| `DATABASE_URL` | PostgreSQL (Neon) | Database connection string |
| `ADMIN_PASSWORD` | Auth | Admin login credential |
| `CHECKER_PASSWORD` | Auth | Checker/auditor login credential |

### Server Configuration (Required)

| Variable | Default | Purpose |
|----------|---------|---------|
| `NODE_ENV` | `development` | Environment mode |
| `PORT` | `5000` | HTTP server port |
| `STORAGE_PROVIDER` | `replit` | File storage provider (`replit`, `s3`, or `local`) |
| `AUTH_PROVIDER` | `replit` | Authentication provider (`replit` or `local`) |

### AI Research Providers (at least one required)

| Variable | Service | Category | Required? |
|----------|---------|----------|-----------|
| `AI_INTEGRATIONS_GEMINI_API_KEY` | Google Gemini | ai_research | Recommended (primary) |
| `ANTHROPIC_API_KEY` | Anthropic Claude | ai_research | Optional (verification) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI | ai_research | Optional (cross-validation) |

### Web Research (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `PERPLEXITY_API_KEY` | Perplexity Sonar | web_research |
| `TAVILY_API_KEY` | Tavily Search | web_research |

### Macro Economic Data (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `FRED_API_KEY` | FRED API | macro_economic |

Note: Frankfurter ECB FX Rates and World Bank API require no API key.

### FX Rates (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `OPEN_EXCHANGE_RATES_APP_ID` | Open Exchange Rates | fx_rates |

### Market Data (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `RAPIDAPI_KEY` | RapidAPI Slot 1 | market_data |
| `RAPIDAPI_KEY_2` | RapidAPI Slot 2 | market_data |
| `RAPIDAPI_KEY_3` | RapidAPI Slot 3 | market_data |
| `COSTAR_API_KEY` | CoStar Analytics | market_data |

### Geospatial (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `GOOGLE_MAPS_API_KEY` | Google Maps | geospatial |
| `WALK_SCORE_API_KEY` | Walk Score | geospatial |

### Vector Search (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `DATABASE_URL` | Neon pgvector (`vector_chunks` table, 1536-dim cosine HNSW) | vector_search |
| `OPENAI_EMBEDDING_KEY` (or `OPENAI_API_KEY`) | OpenAI `text-embedding-3-small` for embeddings written to the vector store | embeddings |

### Communication (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `RESEND_API_KEY` | Resend Email | communication |

### Observability (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `SENTRY_DSN` | Sentry | observability |
| `POSTHOG_KEY` | PostHog | observability |

### Caching (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `UPSTASH_REDIS_REST_URL` | Upstash Redis | caching |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash Redis | caching |

### Image Generation (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `REPLICATE_API_TOKEN` | Replicate Images | image_gen |

### Web Scraping (Optional)

| Variable | Service | Category |
|----------|---------|----------|
| `APIFY_API_TOKEN` | Apify Scrapers | scraping |

**Total: 26 environment variables across 12 service categories.** The source registry in `server/seeds/source-registry.ts` maps each `apiKeyRef` to its 25 services. Health checks verify which keys are configured at runtime.

---

## Running the App

```bash
npm run dev
```

This starts the Express server with Vite dev server integration on port 5000. The app auto-seeds the database on first startup (admin user, checker user, sample properties, assumptions, market research).

Open [http://localhost:5000](http://localhost:5000) in your browser.

---

## Running Tests

```bash
# Run all tests
npm test

# Compact summary output
npm run test:summary

# Watch mode (re-runs on file changes)
npm run test:watch

# Single file
npm run test:file -- path/to/test.ts

# Full health check (tsc + tests + verification)
npm run health

# Financial proof system
npm run verify
npm run verify:summary
```

Tests use Vitest. Config is in `vitest.config.ts`. Test files live in `tests/` with path aliases (`@calc`, `@domain`, `@engine`, `@statements`, `@analytics`, `@/lib`, `@shared`).

---

## Other Useful Commands

| Command | Purpose |
|---------|---------|
| `npm run check` | TypeScript type checking (`tsc --noEmit`) |
| `npm run lint:summary` | Type check with compact output |
| `npm run build` | Production build |
| `npm start` | Run production build |
| `npm run stats` | Codebase metrics |
| `npm run audit:quick` | Code quality scan |
| `npm run exports:check` | Find unused exports |
| `npm run diff:summary` | Git diff statistics |
| `npm run parity:check` | Screen-to-export parity check |

---

## Common Tasks

### Add a new API route

1. Open `server/routes.ts`
2. Add your route handler (follows Express 5 patterns)
3. If it needs storage, use the `storage: IStorage` parameter — see `server/storage/` for available methods
4. Add authentication middleware as needed: `requireAuth`, `requireAdmin`, `requireChecker`

### Modify the financial engine

1. Edit `client/src/lib/financial/property-engine.ts` (property) or `company-engine.ts` (ManCo)
2. The server re-exports these via `server/finance/core/` — no duplication needed
3. Run related tests: `npm run test:file -- tests/engine/`
4. Run `npm run verify:summary` to check proof system status
5. Constants live in `shared/constants.ts` — never hardcode numbers

### Add a test

1. Create file in `tests/` following existing directory structure
2. Use Vitest (`describe`, `it`, `expect`)
3. Import from path aliases: `@calc/dispatch`, `@/lib/financial/property-engine`, etc.
4. For golden scenarios, see `.claude/skills/testing/golden-scenarios.md`

### Add a UI component

1. For shadcn primitives: use the shadcn CLI
2. For custom components: add to `client/src/components/` (shared) or `client/src/features/` (self-contained)
3. Follow the design system: `.claude/skills/design-system/SKILL.md`
4. Use existing components from `client/src/components/ui/` — see `.claude/skills/architecture/codebase.md` for the full catalog

---

## Troubleshooting

**Database connection fails**
- Verify `DATABASE_URL` in `.env` is correct
- For Neon: ensure the project is not suspended (free tier pauses after inactivity)
- For local: check PostgreSQL is running (`pg_isready`)
- Run `npm run db:push` if tables are missing

**AI research returns errors**
- At least one AI provider key is required for market research
- Gemini is the primary provider — set `AI_INTEGRATIONS_GEMINI_API_KEY` first
- Check rate limits if requests fail intermittently

**Build errors**
- Run `npm run check` to see TypeScript errors
- Delete `node_modules` and `npm install` for dependency issues
- Ensure Node.js 20+ (`node --version`)

**Tests fail on fresh checkout**
- Run `npm run db:push` first — some tests may need schema
- Check that path aliases resolve: see `vitest.config.ts` for alias mapping

---

## For AI-Assisted Development

The `.claude/skills/` directory contains 168 skill files organized by domain. These are the project's knowledge base for AI coding assistants. Start with:

- `.claude/skills/_index.md` — Master catalog of all skills
- `.claude/skills/context-loading/SKILL.md` — Which skills to load for which task type
- `.claude/skills/architecture/source-map.md` — Full file-by-file reference
