# H+ Analytics — Project Source of Truth

H+ Analytics is a hospitality-sector financial analytics platform. Asset managers use it to model scenarios, run portfolio projections, and generate property-level investor slide decks (HTML → PDF via Playwright, matched to the canonical L+B 6-slide design). Users are organised by organisation; access to scenarios and portfolios is governed by a share / permission model.

---

## Monorepo Structure

```
artifacts/
  hospitality-business-portal/   React + Vite frontend  (previewPath: /)
  api-server/                    Express 5 API          (previewPath: /api)
  mockup-sandbox/                Design sandbox         (previewPath: /__mockup/)
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
| Backend build | esbuild (ESM bundle, `dist/index.mjs`) |
| File storage | Cloudflare R2 |
| Auth | Two parallel sign-in paths: (1) `AUTH_PROVIDER` adapter in `artifacts/api-server/src/providers/auth/` selects `replit` (Replit OIDC, default) or `local` (email + password); (2) Google OAuth routes at `/api/auth/google` + `/api/auth/google/callback` (`artifacts/api-server/src/routes/google-auth.ts`) run alongside whichever provider is selected. Production users sign in with Google. |
| AI providers | OpenAI, Anthropic, Gemini (all called via direct SDKs with first-party API keys — not via a Replit broker) |
| Observability | Sentry |
| Project tracking | Linear (integration: `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG`) |
| Hosting (production) | **Railway** via `Dockerfile` + `railway.toml` — see "Production Deployment" below |
| Hosting (dev preview) | Replit Workspace (workflows + shared proxy on `localhost:80`) — **preview only**, not used to publish |

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
| `GOOGLE_CLIENT_ID` | Google OAuth client ID — **must be present in both Railway AND Replit secrets**; absence silently disables the `/api/auth/google` route (404) in whichever environment is missing it |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret — same dual-env requirement as above |
| `OPENAI_EMBEDDING_KEY` | Separate embedding key |

---

## Production Deployment

**Production runs on Railway, not on Replit.** Replit Publish (both `autoscale` and Reserved VM) failed for this app — see Task #942 history and `docs/solutions/integration-issues/dev-login-empty-body-edge-proxy-2026-05-02.md` for the edge-proxy / bundle-size root causes that pushed us off Replit Publish for good.

**Wiring (already in repo, do not duplicate):**

| File | Purpose |
|---|---|
| `Dockerfile` | Two-stage Node 20 + pnpm build. Builds all packages, ships the api-server bundle plus the two SPAs (H+ Analytics at `dist/public`, mockup-sandbox at `dist/mockup-sandbox`), runs `node artifacts/api-server/dist/index.mjs`. |
| `railway.toml` | `builder = "dockerfile"`, `healthcheckPath = "/api/health/live"`, `healthcheckTimeout = 300`, `restartPolicyType = "ON_FAILURE"`. |
| `artifacts/api-server/build.mjs` | Externalises heavy deps (AI SDKs, doc/media libs, country-state-city, Sentry, google-auth-library) so the bundle stays ~7.5 MB and pnpm installs the rest in the runtime container. |

**Single-container model:** the api-server serves `/api/*` plus both SPAs from one process on one port (`$PORT`). The Dockerfile builds every frontend and copies them next to the api-server bundle; `artifacts/api-server/src/static.ts` mounts them at:

- `/` → `artifacts/api-server/dist/public` (H+ Analytics — `hospitality-business-portal`)
- `/__mockup/` → `artifacts/api-server/dist/mockup-sandbox`

One Railway service, no separate frontend deployments.

**Required production env vars on Railway** — every value must be set as a Railway service variable (no Replit-managed broker is reachable in production):

`POSTGRES_URL` (Neon), `SESSION_SECRET`, `TOKEN_ENCRYPTION_KEY`, `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` / `R2_PUBLIC_URL` (Cloudflare R2), `STORAGE_PROVIDER=r2`, `AUTH_PROVIDER` set to `replit` or `local` (the only two values the adapter accepts — see `artifacts/api-server/src/providers/auth/index.ts`; setting it to anything else throws at boot), `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET` (Google OAuth — production users sign in here, mounted at `/api/auth/google`), `OPENAI_API_KEY` + `OPENAI_EMBEDDING_KEY` (OpenAI), `ANTHROPIC_API_KEY` (Anthropic), `AI_INTEGRATIONS_GEMINI_API_KEY` (Gemini), `FRED_API_KEY` (FRED), `RESEND_API_KEY` (email), `SENTRY_DSN` (Sentry), `NODE_ENV=production`. The `PASSWORD_*` fallbacks are optional dev shortcuts and should be **omitted** in production.

**External services this app depends on** (all owned by the user, all reachable from Railway with the secrets above — none are Replit-managed):

| Concern | Service | Secrets |
|---|---|---|
| Primary database + pgvector | **Neon Postgres** | `POSTGRES_URL` |
| Object storage (uploads, generated PPTX, photo assets) | **Cloudflare R2** | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` |
| User auth | **Google OAuth** (primary), Replit OIDC (legacy / dev) | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| LLMs | **OpenAI, Anthropic, Gemini** (direct SDKs) | `OPENAI_API_KEY`, `OPENAI_EMBEDDING_KEY`, `ANTHROPIC_API_KEY`, `AI_INTEGRATIONS_GEMINI_API_KEY` |
| Macro economic data | **FRED (St. Louis Fed)** | `FRED_API_KEY` |
| Transactional email | **Resend** | `RESEND_API_KEY` |
| Error monitoring | **Sentry** | `SENTRY_DSN` |
| Project / issue tracking | **Linear** | `conn_linear_01KN0GFMPXYQYH0QYYEXNKZ0GG` (Replit connector — broker only, falls back to plain env vars) |
| Source control / API | **GitHub** | `GITHUB_PAT` |
| Hosting | **Railway** (Docker) | configured via `railway.toml` |

**Rule of thumb:** every infrastructure dependency this app uses is an **external service the user already pays for**. Do not provision Replit-managed equivalents (Replit Database, Replit Object Storage, Replit Auth) — they would split the source of truth from production and break Railway. Use the `prefer-external-dependencies` skill before reaching for any Replit setup tool.

**Replit's role going forward:** dev workspace and code-review surface only. Do **not** rely on `.replit` `[deployment]`, `artifact.toml [services.production]`, or `suggest_deploy()` for shipping. Those blocks may stay in the repo for the workflow tooling, but production ships through `git push` → Railway build via the `Dockerfile`.

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

### LB Slides — investor PDF decks (Playwright HTML→PDF)

The "LB Slides" feature generates a 6-slide investor deck per property as a single PDF. Slide 7 ("The Ask") is always excluded. The output must match the canonical L+B reference deck (`attached_assets/L+B_Property_6-Slide_Cannonical_1777775653617.pdf`) — colors, fonts, layout, photo placement.

**One pipeline (HTML → PDF):**
- React deck pages live in `artifacts/hospitality-business-portal/src/features/internal-deck/` (`slides.tsx`, `theme.ts`, `helpers.tsx`, `fonts.css`) and are mounted at `/internal/deck/:propertyId` via `pages/InternalDeck.tsx`.
- `artifacts/api-server/src/routes/property-deck-pdf.ts` opens that page in headless Chromium (Playwright) with an internal token, prints to PDF, uploads to R2, and serves it back. Source files: `internal-deck-payload.ts`, `pdf-html-templates.ts`, `premium-pdf-pipeline.ts`, `slides/playwright-browser.ts`, `slides/internal-token.ts`.
- The legacy Python + `python-pptx` track and the satori image-PPTX track are removed. Do **not** add Puppeteer; Playwright is the single supported renderer (Chromium installed at build time into `.cache/ms-playwright/`).

**DB schema:** `property_slide_deck_variants` table holds only `format='pdf'` rows (migration 0042 dropped `'pptx'` and `'image'`):
- Composite PK: `(property_id, format)` with `format = 'pdf'`
- Columns: `property_id` FK→properties.id (cascade delete), `format`, `status` ('idle'|'generating'|'ready'|'error'), `r2_key`, `file_size_bytes`, `generated_at`, `triggered_by`, `error_message`, `updated_at`

**Active API routes** (`artifacts/api-server/src/routes/property-deck-pdf.ts`):
- `GET /api/properties/:id/deck.pdf` — render or serve cached deck
- `GET /api/slides/status` — admin: PDF variant status rows (in `property-slides.ts`, the legacy file kept only for the status feed + hero-image ZIP)
- Auth: `requireAuth` guard; internal page load uses a short-lived signed token from `slides/internal-token.ts`
- Finance: uses `recomputeSinglePropertyAndStamp` → `aggregateUnifiedByYear` (same path as finance.ts)
- Loan data: `calculateLoanParams` returns `LoanCalculation` — use `equityInvested`, `monthlyPayment * 12` (not `.ltv` or `.annualDebtService` — those fields don't exist)
- IRR: `computeIRR([-equity, ...annualFlows])` — first element must be the negative initial outlay
- Slot drafting: `artifacts/api-server/src/routes/property-deck-payload.ts` — slot-specific LLM helpers (`draftHeaderSubtitle`, `draftVisionBullets`) with inline fallbacks; no separate vision module

**Visual spec source-of-truth:**
- Canonical reference deck: `attached_assets/L+B_Property_6-Slide_Cannonical_1777775653617.pdf`
- **Canonical PNGs (pixel-authoritative):** `attached_assets/L+B_Property_6-Slide_Cannonical_Page_{1..6}_*.png` — also uploaded to R2 at `canonical/lb-6-slide/slides/slide-{1..6}.png`. Every rendered slide must be compared against the corresponding PNG before delivery. Use the `lb-slides-canonical-pngs` skill for comparison checklist and re-upload workflow. PNG wins over JSON spec when they disagree.
- Machine-readable layout extract: `attached_assets/slide_analysis_agent_report.precise_1777824741855.json`
- Per-slide briefs (full structural extraction): `attached_assets/Pasted-SLIDE-1-Sul-Monte-…txt`, `Pasted-SLIDE-2-Hazelnis-Retreat-…txt`, `Pasted-SLIDE-3-Cartagena-Duplex-…txt`
- Generation workflow and comparison steps: `docs/slide-system/canonical/coding-agent-instructions.md` (Section 15 = mandatory canonical PNG comparison)
- Text-field char limits and source priority: `hplus-vision-templates` skill
- Budget realism for transformation copy: `hplus-renovation-benchmarks` skill

**Admin UI:** `artifacts/hospitality-business-portal/src/components/admin/SlideDecksTab.tsx` — card grid per property; one "Download PDF" action per ready card; Analyst-style regenerate button.

**Skills (only those present on disk):**
- `.agents/skills/hplus-vision-templates/` — text generation pipeline + char-limit enforcement
- `.agents/skills/hplus-renovation-benchmarks/` — per-key cost ranges, transformation cost lines

### `reference_brands` AI pipeline wiring

The `reference_brands` table is wired into three AI surfaces:
1. **Research orchestrator** — `get_reference_brands` tool (DI pattern on `handleToolCall`)
2. **Funding Specialist** — orientation-grade comp-set injected into the Prompt Engineer user prompt
3. **Rebecca KB** — brand summaries indexed at rebuild time via `buildReferenceBrandsKbDoc()`

ADR-007 §1 applies: prompt-builder and funding-builder layers are DB-import-free; the route layer does all fetching. Full pattern: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.

### Inviolable login / auth rules

1. **Railway ↔ Replit secrets must stay in parity.** Any env var the api-server reads at runtime must exist in *both* Railway service variables *and* Replit Repl secrets. Absence in either environment silently disables the dependent feature (Google auth 404, AI routes dead, etc.). After adding a var to Railway, add it to Replit secrets immediately in the same session.

2. **Never gate UI behaviour on a silent async fetch.** The `devLoginAvailable` pattern — where a `useState(false)` flag only flips to `true` if a fire-and-forget `fetch()` succeeds — is banned. Silent `.catch(() => {})` means any network hiccup (iframe context, canvas preview, proxy quirk) leaves the feature permanently disabled with no visible error. **Rule: the server is the authority; the client should always attempt the action and surface server-returned errors as toasts.** The logo quick-login on the login page was fixed 2026-05-04 by removing the fetch gate.

3. **Dev-login is dev-only by server gate, not client gate.** `/api/auth/dev-login` is blocked by `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT` env var). The client does not need to pre-check availability — clicking the logo always fires the request, and the server returns a 403 with a clear error if called in production.

4. **All auth navigations must escape the iframe with `window.top`.** The Replit preview pane is an iframe. Any `window.location.href/replace` in auth flows navigates only the iframe. Google OAuth additionally blocks iframes with `X-Frame-Options: DENY`. Rule: **every** post-auth redirect must use `(window.top || window).location.*` — this applies to Google OAuth redirect, login success (`→ /`), and logout (`→ /login`). Fixed 2026-05-04 across `Login.tsx` (Google button + dev-login success) and `lib/auth.tsx` (logout `onSuccess`).

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
| `attached_assets/L+B_Property_6-Slide_Cannonical_1777775653617.pdf` | Canonical visual reference for all 6 LB slides — every rebuild must pixel-match this |
| `attached_assets/slide_analysis_agent_report.precise_1777824741855.json` | **Machine-readable layout extract of the canonical deck** (PyMuPDF, 960×540 pt coords, ~650 KB, 6 pages). Per-span bbox / font / size / color and per-image bbox for every native element. Authoritative for text positions, fonts, colors. **Not authoritative** for: card chrome and band backgrounds (rasterized — sample from rendered PNG), z-order (use `paint_operation_log`), page backgrounds on pages 1–3 (PDF paint is `#FFFFFF`; the cream is baked into the page-background image), and image pixel data (bbox + digest only). Slides 1–3 each use a different sample property (Belleayre/Sul Monte body, Hazelnis, Cartagena); slides 4–6 are property-agnostic. |
| `attached_assets/Pasted-SLIDE-1-Sul-Monte-Investment-Spotlight-0-Slide-Level-Me_1777741401797.txt` | Slide 1 full structural brief (coords, fonts, copy) |
| `attached_assets/Pasted-SLIDE-2-Hazelnis-Retreat-Investment-Spotlight-0-Slide-L_1777741586519.txt` | Slide 2 full structural brief |
| `attached_assets/Pasted-SLIDE-3-Cartagena-Duplex-Satellite-Expansion-0-Slide-Le_1777741627557.txt` | Slide 3 full structural brief |
| `.agents/skills/hplus-vision-templates/SKILL.md` | Slide-text source-priority pipeline + char limits |
| `.agents/skills/hplus-renovation-benchmarks/SKILL.md` | Per-key reno cost ranges + transformation cost lines |
| `.agents/skills/lb-slides-canonical-pngs/SKILL.md` | Canonical PNG registry — R2 keys, local paths, per-slide content reference, comparison checklist, re-upload workflow |
| `.agents/skills/lb-slides-renderer/SKILL.md` | Slide renderer contract — spec_skeleton_v4, PALETTE, FONTS, bb() helpers, v_canonical_png validation rule |
| `docs/slide-system/canonical/coding-agent-instructions.md` | Agent generation workflow for slide content — §15 = mandatory canonical PNG comparison (Step 0: load PNG; PNG wins over JSON spec) |

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
| 4 | `ce-code-review` / `nai-code-review` | Review before merging |
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
| `prefer-external-dependencies` | Before any infrastructure-shaped tool call — the project uses Neon Postgres, Cloudflare R2, Google OAuth, direct OpenAI/Anthropic/Gemini SDKs; never provision Replit-managed equivalents |
| `nai-code-review` | Before opening a PR — wraps `ce-code-review` with hospitality/Drizzle personas |
| `architecture-decision-records` | Any irreversible technical decision future contributors might re-litigate |
| `hplus-vision-templates` | Filling in any slide text field — sourcing pipeline (DB → benchmarks → LLM with web research → templates), per-field char-limit enforcement, and budget-realism guardrails for transformation proposals |
| `hplus-renovation-benchmarks` | Per-key cost ranges and transformation cost lines used by the budget-realism check above |
| `hplus-admin-nav-ia` | Placing data sources, APIs, Specialists, LLMs, or AI agents in the Admin / AI Intelligence sidebar |
| `lb-slides-canonical-pngs` | Comparing any rendered slide output against the pixel-authoritative canonical PNGs — R2 keys, local paths, per-slide comparison checklist, re-upload workflow |
| `agent-memory-files` | Editing `claude.md` or `replit.md` — keep them harmonized |

### How to invoke

**Claude Code:** Use the `Skill` tool with the skill name. Example: `Skill("ui-page-patterns")`.

**Replit Agent:** Type the skill name as a command. Example: `use the ui-page-patterns skill`.

**Full index:** See `.agents/skills/README.md`.

---

## Recent Significant Changes

| Date | Change |
|---|---|
| 2026-05-04 | **Google OAuth iframe fix.** `Login.tsx` Google button changed from `window.location.href` to `(window.top \|\| window).location.href` — Google's sign-in page sends `X-Frame-Options: DENY` and refuses to render inside the Replit preview iframe; navigating `window.top` escapes the iframe before the OAuth redirect. Rule 4 added to both memory files and `integrations-infrastructure` skill. |
| 2026-05-04 | **Auth hardening — login always works in preview.** `GOOGLE_CLIENT_ID` documented as required in both Railway AND Replit secrets (was missing from Replit, silently disabling `/api/auth/google`). Login logo quick-login fixed: removed the `devLoginAvailable` async-fetch gate that silently failed in iframe/canvas contexts, making the logo a no-op. Logo now always fires `POST /api/auth/dev-login`; server blocks it in production via `isPublishedDeployment()`. Three inviolable auth rules added to `claude.md` and `replit.md`. |
| 2026-05-04 | **Canonical slide PNGs registered in R2 + skill infrastructure.** All 6 L+B canonical slide PNGs uploaded to `canonical/lb-6-slide/slides/slide-{1..6}.png` (source: `attached_assets/L+B_Property_6-Slide_Cannonical_Page_N_*.png`). New `lb-slides-canonical-pngs` skill documents R2 keys, local paths, per-slide content reference, and the 7-point comparison checklist. `lb-slides-renderer` skill updated with mandatory `v_canonical_png` validation rule. `coding-agent-instructions.md` Section 15 added — "Step 0: load canonical PNG"; PNG wins over JSON spec when they disagree. Magic number constants (`VISION_DRAFT_MAX_TOKENS`, `VISION_BADGE_MAX_CHARS`, `VISION_BULLET_MAX_CHARS`, `VISION_PARAGRAPH_MAX_CHARS`, `RETREAT_GUESTS_PER_KEY_MIN/MAX`, `VRBO_GUESTS_PER_KEY`) moved from inline in `property-vision.ts` to `lib/shared/src/constants-benchmarks.ts` + api-server mirror; baseline re-locked (`check:magic-numbers` PASS, 9 improvements). Slide2/Slide3/Slide5 editor panels now have "Draft via Analyst" buttons for all slots. |
| 2026-05-03 | **Property nicknames clarified** (user-confirmed): canonical "Sul Monte" / "Su Monte" is the **owner's nickname for Belleayre Mountain** — same property, not throwaway filler. The canonical Sul Monte / Galli-Curci copy is therefore valid Belleayre source material (voice, tone, narrative arc); we still bind structured fields (price, key count, region) to the seed so every numeric flows from the engine (decision #6 unchanged). **Likely-but-not-yet-confirmed parallels**: "Hazelnis Retreat" matches Loch Sheldrake's street address (59 Hazelnis Drive); "Cartagena Duplex" matches San Diego's location (Cartagena, Colombia) — treat as probable owner/location nicknames pending user confirmation. **Supersedes** the "Sul Monte/Hazelnis/Cartagena are filler, discard" claim in the prior LB Slides entry. |
| 2026-05-03 | **Property DB IDs corrected** (verified via SQL against the dev Neon DB): Slide 1 Belleayre Mountain = id **52** (was incorrectly recorded as 32). Slide 2 Loch Sheldrake = id **51** (was 43). Slide 3 San Diego = id **55** (was 41). The seed file array order ≠ DB primary key — always query `SELECT id, name FROM properties WHERE name ILIKE '%…%'` before minting deck tokens. Mint tokens with: `node -e "const c=require('crypto'); const pid=52, exp=Date.now()+30*60*1000; console.log(pid+'.'+exp+'.'+c.createHmac('sha256',Buffer.from(process.env.TOKEN_ENCRYPTION_KEY,'utf8')).update(pid+':'+exp).digest('base64url'))"`. The deck-payload endpoint takes ~18s to respond (6 MB JSON with base64 photo embeds), so the screenshot tool times out before render — preview decks via the cached `/api/properties/:id/deck.pdf` route or by warming `/api/internal/deck-payload/:id` first. |
| 2026-05-03 | **LB Slides rebuild canon locked** (six-slide deck rebuild, scope decisions persisted): (1) Treat the canonical PDF as a pure visual spec (positions, fonts, colors, card geometry); body text comes from each slide's assigned property in seed/engine. (2) Page 6 Pro Forma is text-dense by design — prioritize spreadsheet-like readability; do not reproduce canonical's `######` overflow cells; pull every numeric from the engine. (3) Font policy: be consistent; canonical font exceptions may be intentional (human-designed) — for any deviation from a single global font stack, evaluate the design + padding intent with the strongest available reasoning model (Opus/GPT-5) before deciding. (4) Page background: CSS `#FFFFFF` (canonical PDF paint is white; the cream tone visible in renders is baked into a full-page raster image — most of the slide canvas is covered by element chrome anyway, so CSS white is faithful enough for v1). (5) **Multi-property scope**: each slide binds to a different property (slides 1–3); slides 4–6 are property-agnostic. **Provisional** until user previews v1 and confirms — these 6 slides are part of a much larger deck. (6) All numbers — every $ / % / count on every slide — sourced from app/seed financial data; canonical numbers are reference only. **Property mapping** (DB-verified, see "Property DB IDs corrected" entry above): Slide 1 = `Belleayre Mountain` (DB id 52, Western Catskills NY, owner-nicknamed "Sul Monte"). Slide 2 = `Loch Sheldrake` (DB id 51, Sullivan County NY, canonical alias "Hazelnis Retreat" matches its 59 Hazelnis Drive address). Slide 3 = `San Diego` (DB id 55, Barrio San Diego, Cartagena, Colombia, canonical alias "Cartagena Duplex"). Seed-canonical names remain the IDs of record. |
| 2026-05-03 | **`claude.md` and `replit.md` re-harmonized** per the `agent-memory-files` skill. Identity updated (PDF, not PPTX). LB Slides section rewritten to reflect the Playwright HTML→PDF pipeline. Removed routing entries for skills that don't exist on disk (`hplus-pptx-generator`, `hplus-slide-mapping`, `hplus-canonical-slide-1`, `hplus-canonical-slide-2`, `norfolk-code-review`). Skill table mirrored identically across both files. SPA count corrected from 3 → 2 (the `property-slides` SPA never shipped). |
| 2026-05-03 | **Investor deck pipeline migrated to Playwright HTML→PDF.** Python + `python-pptx` track and satori image-PPTX track are removed. New flow: React deck pages in `internal-deck/` → `GET /api/properties/:id/deck.pdf` (`property-deck-pdf.ts`) prints to PDF via headless Chromium and caches to R2. `property_slide_deck_variants.format` is now `'pdf'`-only (migration 0042). |
| 2026-05-03 | **Dockerfile migrations fix** (commit b91ca7c5) unblocked Railway deploys. |
| 2026-05-03 | **One-command Railway data sync** — `pnpm sync-db-to-railway` (Task #978) mirrors the dev Neon DB to the Railway production DB for parity testing. |
| 2026-05-03 | **Sensitivity heatmap now reports Equity Multiple correctly** (Task #967). Added `equityMultipleValue` to `SensitivityScenarioResult` (shared + api-server mirror); server `runScenario` uses `computeEquityMultiple`; client fallback mirrored; HeatMapSection re-labelled "Equity Multiple" with `${v.toFixed(2)}x`, breakeven 1.0, "—" for v ≤ 0. |
| 2026-05-03 | **Spinner / icon contrast guard wired into CI** (Task #922). `.github/workflows/contrast-guard.yml` runs `check-spinner-contrast` on every PR + push to main. |
| 2026-05-03 | **Better DB error logs on auth failures** (Task #968). `formatError()` in `artifacts/api-server/src/logger.ts` now surfaces Postgres `code`, `column`, `table`, `constraint`, etc. |
| 2026-05-02 | **Production hosting moved to Railway.** Replit Publish (both autoscale and Reserved VM) repeatedly failed; the project now ships via `Dockerfile` + `railway.toml` (single container, healthcheck `/api/health/live`). All infra is external (Neon Postgres, Cloudflare R2, Google OAuth, direct OpenAI/Anthropic/Gemini SDKs). Replit Workspace is dev-preview only. |
| 2026-05-02 | api-server bundle reduced from ~32 MB → ~7.5 MB by externalising AI SDKs, doc/media libs, country-state-city, Sentry, and google-auth-library in `build.mjs` (Tasks #942, #948). |
| 2026-05-02 | `reference_brands` table wired into research orchestrator (tool DI), Funding Specialist PE prompt, and Rebecca KB. |
| 2026-05-02 | Marcela removed from codebase. Rebecca is the only AI assistant. |
