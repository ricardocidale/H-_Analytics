# H+ Analytics — Project Source of Truth

H+ Analytics is a hospitality-sector financial analytics platform. Asset managers use it to model scenarios, run portfolio projections, and generate property-level PPTX investor slide decks using the L+B template. Users are organised by organisation; access to scenarios and portfolios is governed by a share / permission model.

---

## Monorepo Structure

```
artifacts/
  hospitality-business-portal/   React + Vite frontend  (previewPath: /)
  api-server/                    Express 5 API          (previewPath: /api)
  mockup-sandbox/                Design sandbox         (previewPath: /__mockup/)
  property-slides/               Slide deck viewer      (previewPath: /property-slides/)
lib/
  shared/       Constants, types, Zod schemas shared across all packages
  db/           Drizzle ORM schema + migration runner
  engine/       Projection engine (pure; no Node I/O)
  calc/         Financial calculators
  analytics/    Analytics helpers
  domain/       Business-domain utilities
  api-spec/     OpenAPI spec + Orval codegen (hooks, Zod)
  api-client-react/  React Query wrappers generated from api-spec
  api-zod/      Zod schemas generated from api-spec
scripts/        Shared utility scripts (@workspace/scripts)
references/     ADRs and per-feature design notes
.local/tasks/   Task plans, audit documents, session notes
docs/solutions/ Documented solutions, organized by category with YAML frontmatter (module, tags, problem_type)
```

---

## Stack

| Layer | Technology |
|---|---|
| Monorepo | pnpm workspaces |
| Node | 24 |
| TypeScript | 5.9 |
| API | Express 5 |
| Database | PostgreSQL (Neon) + Drizzle ORM + pgvector |
| Validation | Zod (`zod/v4`), `drizzle-zod` |
| API codegen | Orval (from OpenAPI spec in `lib/api-spec`) |
| Frontend build | Vite |
| Backend build | esbuild (CJS bundle) |
| File storage | Cloudflare R2 |
| Auth | Replit Auth (OpenID Connect + PKCE) |
| AI providers | OpenAI, Anthropic, Gemini |
| Observability | Sentry |
| Project tracking | Linear (integration: `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG`) |

---

## Key Commands

```bash
pnpm run typecheck                              # full typecheck across all packages
pnpm run build                                 # typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen  # regenerate API hooks + Zod schemas
pnpm --filter @workspace/db run push           # push DB schema changes (dev only)
```

Health endpoint: `GET /api/health/live` (not `/api/healthz`).

---

## Environment Variables (api-server)

| Variable | Notes |
|---|---|
| `POSTGRES_URL` / `DATABASE_URL` | Neon PostgreSQL connection string |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` | Cloudflare R2 |
| `STORAGE_PROVIDER` | Set to `r2` |
| `AUTH_PROVIDER` | Set to `replit` |
| `NODE_ENV` | Set to `production` in deployed env |
| `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY` | Auth / session signing |
| `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` | AI providers (Claude used for LB Slides vision text) |
| `FRED_API_KEY` | FRED economic data |
| `GITHUB_PAT` | GitHub integration |
| `GOOGLE_CLIENT_SECRET` | Google OAuth |
| `OPENAI_EMBEDDING_KEY` | Separate embedding key |

---

## Architecture Notes

### Import discipline

- `lib/db/src/index.ts` initialises a `pg` Pool at module load. Frontend code **must** import schema from `@workspace/db/schema` (the subpath export), never from `@workspace/db` directly, to avoid pulling Node-only `pg` into the browser bundle.
- `lib/engine` follows this pattern correctly and is a reference.
- `artifacts/hospitality-business-portal/vite.config.ts` excludes `drizzle-orm/node-postgres`, `drizzle-orm/postgres-js`, `pg`, `postgres`, and `postgres-bytea` from `optimizeDeps`.
- Frontend path aliases: `@engine/*` → `lib/engine/src/*`, `@calc/*` → `lib/calc/src/*`, `@shared/*` → `lib/shared/src/*`. Always use these aliases — never use deep relative paths (`../../../../engine/...`).

### Zod compatibility

- `zod-validation-error` v5 defaults to Zod v4 types. Always import from `"zod-validation-error/v3"` for Zod v3 compatibility.
- When passing a compiled `@workspace/db` schema type to a Zod function that expects `ZodTypeAny`, cast `as any` — the compiled `.d.ts` types don't satisfy the current Zod structural check.
- Cast `.error as any` when calling `fromZodError(...)` in route files to avoid the `ZodError<SpecificType>` not assignable to `ZodError` mismatch.

### AI assistant — Rebecca only

This app has exactly one AI assistant: **Rebecca** — a semantic KB-search chatbot backed by pgvector + OpenAI embeddings. Marcela (ElevenLabs / Convai voice assistant) was removed from this codebase (`migrations/drop-marcela-columns.ts`). **Do not add Marcela, Convai, or ElevenLabs integrations.** Use the `embedded-ai-agent` skill for any Rebecca extension work.

### Specialists

Specialists are **dev-defined only** — see `.claude/rules/specialists-are-dev-defined-only.md`. Admins are operators, not authors. No admin UI should expose specialist creation or editing.

### Roles and permissions

- `checker` and `investor` roles are still **live in the database** even though they have been removed from the `VALID_USER_ROLES` enum in code. Do not assume the enum is the full set of live roles.
- `canManageScenarios` is a boolean orthogonal to role — see the architecture audit at `.local/tasks/task-800.md`.
- Dual share tables exist: `scenario_access` (enforcement) and `scenario_shares` (admin tracking). Both must be kept in sync.

### LB Slides — per-property PPTX + image-PPTX generator

The "LB Slides" feature generates two formats of a 6-slide investor deck per property using the L+B PowerPoint template. Slide 7 ("The Ask") is always excluded.

**Two formats (Track 1 and Track 2):**
- **Track 1 — PPTX** (editable): Python `generate_property_slides.py` writes shapes into template slides. Must match the canonical template exactly — colors, fonts, layout. When data is missing, always derive (vision generator, renovation benchmarks, computed values) — never leave a placeholder blank.
- **Track 2 — Image-PPTX** (locked): Same 6 slides, but each slide contains one full-slide-size PNG as the only element (looks identical; immune to font/layout issues in PPTX viewers). PNG rendering uses **satori + @resvg/resvg-js** (JSX → SVG → PNG, zero native deps). **Never use Puppeteer, Playwright, or headless Chromium** — too heavy for Railway (~300MB). LibreOffice headless (`soffice --headless --convert-to png`) is an acceptable fallback if available.

**Pre-generation (critical):**
- Both formats are pre-generated at server startup for all properties that have no `ready` variant.
- Admin LB Slides page is **primarily a download page** — admins should not need to click "Generate" on first visit.
- Admin CAN trigger manual regeneration with a visible wait. Generation can be slow — quality over speed.

**DB schema:** `property_slide_deck_variants` table (replaces old `property_slide_decks`):
- Composite PK: `(property_id, format)` — `format IN ('pptx', 'image')`
- Columns: `property_id` FK→properties.id (cascade delete), `format`, `status` ('idle'|'generating'|'ready'|'error'), `r2_key`, `file_size_bytes`, `generated_at`, `triggered_by`, `error_message`, `updated_at`
- Migration: copy old `property_slide_decks` rows as `format='pptx'`, drop old table

**API routes:**
- `POST /api/properties/:id/slides/generate` — trigger generation (both formats)
- `GET /api/properties/:id/slides/status` — poll status per format
- `GET /api/properties/:id/slides?format=pptx` — download PPTX
- `GET /api/properties/:id/slides?format=image` — download image-PPTX
- Source: `artifacts/api-server/src/routes/property-slides.ts`
- Auth: `requireAuth` guard
- Finance: uses `recomputeSinglePropertyAndStamp` → `aggregateUnifiedByYear` (same path as finance.ts)
- Loan data: `calculateLoanParams` returns `LoanCalculation` — use `equityInvested`, `monthlyPayment * 12` (not `.ltv` or `.annualDebtService` — those fields don't exist)
- IRR: `computeIRR([-equity, ...annualFlows])` — first element must be the negative initial outlay
- Vision text: `artifacts/api-server/src/ai/property-vision.ts` — Claude claude-opus-4-6 with deterministic fallback by type (retreat / vrbo / hotel)
- Python subprocess: stdin JSON → stdout `{ path, slides }` → temp file streamed back, deleted in `finally`

**Python generator:** `scripts/src/generate_property_slides.py`
- Helpers: `scripts/src/slide_helpers.py`, `scripts/src/renovation_budget.py`
- Template: `attached_assets/L+B_Property_Slides_1777637870265.pptx` (slides 0–5, index 6 excluded)
- Runtime deps: `python-pptx`, `Pillow` (installed via `uv`, managed by the `python3` module)
- Quality requirement: shape mapping must follow `hplus-slide-mapping` skill exactly — all 6 slides, all shape names, all data fields

**Admin UI:** `artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx`
- Card grid per property with property photo background
- Two download buttons per ready card: **Download PPTX** (Track 1) + **Download Images** (Track 2)
- Regenerate button (Analyst-style) for manual re-run of both formats
- "View Slides" icon opens `/slides/?propertyId={id}` in new tab
- Queries `/api/properties` for the card grid
- `AdminSection` type includes `"slide-decks"`, nav group `id: "lb-slides"`, label `"LB Slides"`

**Skills:**
- `.agents/skills/hplus-pptx-generator/` — full architecture + extension guide
- `.agents/skills/hplus-slide-mapping/` — shape-name ↔ data-field mapping for all 6 slides
- `.agents/skills/hplus-renovation-benchmarks/` — deterministic renovation budget ranges
- `.agents/skills/hplus-vision-templates/` — deterministic vision text fallback templates

### `reference_brands` AI pipeline wiring

The `reference_brands` table is wired into three AI surfaces:
1. **Research orchestrator** — `get_reference_brands` tool (DI pattern on `handleToolCall`)
2. **Funding Specialist** — orientation-grade comp-set injected into the Prompt Engineer user prompt
3. **Rebecca KB** — brand summaries indexed at rebuild time via `buildReferenceBrandsKbDoc()`

ADR-007 §1 applies: prompt-builder and funding-builder layers are DB-import-free; the route layer does all fetching. Full pattern: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.

### Known issues to address

- **Email-existence leak** at `POST /api/scenarios/shares` — returns 404 "No user found with that email address", leaking whether an email exists. Should return a generic 404.
- DB audit (`.local/db-audit-phase-c-inventory.md`): 74 runtime migrations classified; 1 missing table (`cache_entries`), 17 missing indexes identified.
- `PROJECTION_YEARS` is exported from `lib/shared/src/constants.ts` as an alias of `DEFAULT_PROJECTION_YEARS`.

### Shared proxy routing

All traffic is routed by path through a shared reverse proxy. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.

---

## Canonical Page Archetypes

Two archetypes cover ~95% of app pages. Always read the relevant canonical page before building a new one.

| Archetype | Use when | Canonical file |
|---|---|---|
| **Report / Presentation** | Tabs + export actions, read-only data display | `artifacts/hospitality-business-portal/src/pages/PropertyDetail.tsx` |
| **Form / Editor** | Tabs + per-tab Save + AnalystButton, user edits structured data | `artifacts/hospitality-business-portal/src/pages/CompanyAssumptions.tsx` |

Use the `ui-page-patterns` skill before building or revising any page.

---

## Reference Documents

| Path | Contents |
|---|---|
| `references/openapi.md` | OpenAPI spec + codegen setup |
| `references/server.md` | Route conventions, logging, tips |
| `references/db.md` | Schema additions + migration runbook |
| `.local/tasks/task-800.md` | Full architecture audit (scenarios, portfolios, sharing, roles) |
| `.local/db-audit-phase-c-inventory.md` | DB migration inventory (Phase C) |
| `.local/tasks/build-property-slides.md` | Property slide deck build plan |
| `.agents/skills/hplus-pptx-generator/SKILL.md` | LB Slides full architecture + extension guide |
| `.agents/skills/hplus-slide-mapping/SKILL.md` | Shape-name ↔ data-field mapping for all 6 slides |

---

## Agent & Skill System

Skills are reusable process documents that guide AI agents through complex tasks. They live in `.agents/skills/` and are invoked via the `Skill` tool (Claude Code) or by name in Replit.

### Directory layout

```
.agents/
  skills/              Individual skill directories (each has SKILL.md)
    ce-*/              Compound Engineering core loop skills
    norfolk-*/         Project-specific skills for this repo
    embedded-ai-agent/ Reusable: streaming AI chatbot pattern (the "Rebecca" pattern)
    ui-page-patterns/  Reusable: consistent UI page building for any React+Tailwind app
    brainstorming/     Reusable: collaborative design before implementation
    architecture-decision-records/  Reusable: writing ADRs
    replit-independence/ Reusable: keeping the codebase off-Replit-portable
    README.md          Full index of all available skills
  ce-agents/           Compound Engineering persona definitions
  COMPOUND-ENGINEERING.md  CE plugin documentation
vendor/
  compound-engineering-plugin/  CE plugin source (v3.2.0) — see its README.md
```

### Core workflow (Compound Engineering loop)

| Step | Skill | Purpose |
|---|---|---|
| 1 | `ce-brainstorm` | Explore requirements, produce a requirements doc |
| 2 | `ce-plan` | Break the requirements doc into an implementation plan |
| 3 | `ce-work` | Execute the plan step-by-step |
| 4 | `ce-code-review` / `norfolk-code-review` | Review before merging |
| 5 | `ce-compound` | Capture new knowledge as a skill or ADR |

### CC / Replit lane split

| Work type | Owner | Notes |
|---|---|---|
| DB migrations | Claude Code | Use `apply-0029.mjs` pattern (pg client, idempotent SQL) |
| UI pages / components | Replit Agent | Use `ui-page-patterns` skill |
| AI/chatbot features | Either | Use `embedded-ai-agent` skill |
| Architecture decisions | Claude Code | Use `architecture-decision-records` skill |

### Key project-specific skills

> Wording in this table is mirrored in `replit.md` § "Key skills". Keep them identical — drift here is a bug per the `agent-memory-files` skill.

| Skill | When to use |
|---|---|
| `ui-page-patterns` | Building or fixing any UI page — enforces canonical archetypes, loading/empty/error states, action-button discipline, tab URL sync |
| `embedded-ai-agent` | Adding or extending Rebecca (the only AI assistant in this app) |
| `replit-independence` | Adding any dependency, env var, or deployment-affecting change |
| `norfolk-code-review` | Before opening a PR — wraps `ce-code-review` with hospitality/Drizzle personas |
| `architecture-decision-records` | Any irreversible technical decision future contributors might re-litigate |
| `hplus-pptx-generator` | Extending or debugging the LB Slides PPTX generator |
| `hplus-slide-mapping` | Shape-name ↔ data-field mapping for all 6 LB Slides template slides |
| `agent-memory-files` | Editing `claude.md` or `replit.md` — keep them harmonized |

### How to invoke

**Claude Code:** Use the `Skill` tool with the skill name. Example: `Skill("ui-page-patterns")`.

**Replit Agent:** Type the skill name as a command. Example: `use the ui-page-patterns skill`.

**Full index:** See `.agents/skills/README.md`.

---

## Recent Significant Changes

| Date | Change |
|---|---|
| 2026-05-02 | Autoscale startup probe path corrected from `/api/healthz` (404, no such route) to `/api/health/live` in `artifacts/api-server/.replit-artifact/artifact.toml` — fixed the silent-fail republish loop. |
| 2026-05-02 | `claude.md` and `replit.md` harmonized per the `agent-memory-files` skill. Property-slides previewPath corrected from stale `/slides` to canonical `/property-slides/`. |
| 2026-05-02 | `reference_brands` table wired into research orchestrator (tool DI), Funding Specialist PE prompt, and Rebecca KB. See solution doc. |
| 2026-05-02 | `property_slide_deck_variants` table added (replaces `property_slide_decks`); dual-format generation — Track 1 PPTX + Track 2 image-PPTX via satori. |
| 2026-05-02 | Marcela removed from codebase. Rebecca is the only AI assistant. Gap 4 permanently closed. |
