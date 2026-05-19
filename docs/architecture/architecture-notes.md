# H+ Analytics — Architecture Notes

Canonical home for the architectural notes that used to live under `CLAUDE.md` § "Architecture Notes". Each subsection retains its original wording; CLAUDE.md now carries a 1-line pointer per topic. Inviolable login/auth rules are NOT in this doc — they stay inline in CLAUDE.md (gate-equivalent, elevated to their own H2) per the trim plan.

---

## Import discipline

- `lib/db/src/index.ts` initialises a `pg` Pool at module load. Frontend code **must** import schema from `@workspace/db/schema` (the subpath export), never from `@workspace/db` directly, to avoid pulling Node-only `pg` into the browser bundle.
- `lib/engine` follows this pattern correctly and is a reference.
- `artifacts/hospitality-business-portal/vite.config.ts` excludes `drizzle-orm/node-postgres`, `drizzle-orm/postgres-js`, `pg`, `postgres`, and `postgres-bytea` from `optimizeDeps`.
- Frontend path aliases: `@engine/*` → `lib/engine/src/*`, `@calc/*` → `lib/calc/src/*`, `@shared/*` → `lib/shared/src/*`. Always use these aliases — never use deep relative paths (`../../../../engine/...`).

---

## Zod compatibility

- `zod-validation-error` v5 defaults to Zod v4 types. Always import from `"zod-validation-error/v3"` for Zod v3 compatibility.
- When passing a compiled `@workspace/db` schema type to a Zod function that expects `ZodTypeAny`, cast `as any` — the compiled `.d.ts` types don't satisfy the current Zod structural check.
- Cast `.error as any` when calling `fromZodError(...)` in route files to avoid the `ZodError<SpecificType>` not assignable to `ZodError` mismatch.

---

## AI assistant — Rebecca only

This app has exactly one AI assistant: **Rebecca** — a semantic KB-search chatbot backed by pgvector + OpenAI embeddings. **Do not add voice agents, Convai, or ElevenLabs integrations.** Use the `embedded-ai-agent` skill for any Rebecca extension work.

---

## Specialists

Specialists are **dev-defined only** — see `.claude/rules/specialists-are-dev-defined-only.md`. Admins are operators, not authors. No admin UI should expose specialist creation or editing.

---

## Costantino — Data Custodian (Step 0)

Periodic agentic health-audit loop for `admin_resources` rows with `config.healthProbe`. Full contract: `.agents/skills/costantino-data-custodian/SKILL.md`.

---

## Intelligence Display — specialist-sourced UI affordances

Every range badge, tip, severity signal, or suggestion must originate **100% from specialist/research-engine output** — no component may hard-code a range or derive a suggestion locally. Canonical components: `AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog`. Severity palette: ok=emerald, advisory=sky, warning=amber, block=red — no new levels. Full contract: `.agents/skills/analyst-intelligence-display/SKILL.md`.

---

## Roles and permissions

- `checker` and `investor` roles are still **live in the database** even though they have been removed from the `VALID_USER_ROLES` enum in code. Do not assume the enum is the full set of live roles.
- `canManageScenarios` is a boolean orthogonal to role — see the architecture audit at `.local/tasks/task-800.md`.
- Dual share tables exist: `scenario_access` (enforcement) and `scenario_shares` (admin tracking). Both must be kept in sync.

---

## Number taxonomy — see CLAUDE.md §2

Full enforcement rule is CLAUDE.md §2. Recurring violations, migration patterns, and confirmed exceptions: `.agents/skills/hplus-variable-taxonomy/SKILL.md`. Slide Deck Factory rule: `artifacts/api-server/src/slides/` is a pure consumer — sources every assumption from `storage.getGlobalAssumptions()`, never defines local constants.

---

## Inflation policy (USD-base calculations)

All H+ engine calculations use the **US inflation rate** for every property. Country-level inflation tables are display-only. Engine cascade always passes `'US'` to `getFactoryNumber`. Full policy: `.agents/skills/inflation-cascade/SKILL.md`.

---

## LB Slides — investor PDF decks (Playwright HTML→PDF)

6-slide property deck (slide 7 "The Ask" always excluded). Pipeline: React pages at `features/internal-deck/` → headless Chromium (Playwright) → PDF → R2 → `GET /api/properties/:id/deck.pdf`. **Playwright is the only renderer — do not add Puppeteer.** Full reference: `docs/slide-system/lb-slides-implementation-reference.md`.

---

## `reference_brands` AI pipeline — DI pattern

Route layer fetches; calc/engine DB-import-free. Full doc: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.

---

## Known issues to address

See `docs/issues/known-issues.md`.

---

## Migration system architecture

Three folders: `lib/db/migrations/` (Drizzle-generate output target), `artifacts/api-server/migrations/` (what the api-server reads at boot; slots past 0052 have drifted — new migrations need non-colliding slot numbers), `artifacts/api-server/src/migrations/*.ts` (runtime guards that re-apply idempotent `IF NOT EXISTS` DDL on every boot). Schema changes use `pnpm --filter @workspace/db run generate` — never hand-craft SQL except complex backfills. Full topology + workflow: `docs/runbooks/schema-migrations.md`.

---

## Shared proxy routing

All traffic is routed by path through a shared reverse proxy. Services must handle their full base path. Never call service ports directly in application code or curl — always go through `localhost:80/<path>`.
