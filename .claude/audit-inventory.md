# Audit Dependency Inventory — Phase 1 (read-only map)

Scratchpad for the CompanyAssumptions refactor audit. Every fix in phases 2–6
must check each of these surfaces for drift. See the phase plan in session
memory for scope.

---

## Surface map (repo-confirmed paths)

### S1 — DB schema
`shared/schema/` — 19 files. Relevant to this audit:
- `config.ts` — global_assumptions table (has `companyOpsStartDate`, `savedTabs`, `capitalRaise*`, etc.)
- `services.ts` — `companyServiceTemplates` (target of Phase 6 description column)
- `properties.ts` — property defaults / acquisitionDate
- `scenarios.ts` — `ScenarioResponse.globalAssumptions` embeds `GlobalResponse`

### S2 — Sync helpers
`server/syncHelpers.ts` — production-seed fallback values. Has:
- Line 57: `capitalRaise1Date: "2026-06-01"`
- Line 63: `companyOpsStartDate: "2026-06-01"`

### S3 — Seed data
`server/seeds/` (13 files) + `server/seed.ts`:
- `properties.ts:70, 77` — hardcoded `"2026-06-01"`
- `property-data.ts:53, 366` — property `acquisitionDate` literals
- `hospitality-benchmarks.ts:134, 141` — `sourceName: "HVS 2024"` (citation drift)

### S4 — Client API types
`client/src/lib/api/types.ts`:
- `GlobalResponse` (154 lines, extended with `savedTabs: string[]` this session)
- `PropertyResponse`, `ScenarioResponse.globalAssumptions` — contract mirror of DB
- 50 call sites across client

### S5 — User manual
`client/src/pages/checker-manual/sections/` — 21 numbered sections:
- `Section04GlobalAssumptions.tsx:30, 58` — lists `"2026-06-01"` as documented default
- `Section17CompanyFormulas.tsx` — anchor `id="company-formulas"`
- `Section19InvestmentReturns.tsx` — anchor `id="investment-returns"`
- `Section20FundingFinancing.tsx` — anchor `id="funding-financing"`

### S6 — InfoTooltip (inline)
No central registry. Audited components reference 3 manual anchors:
`company-formulas`, `investment-returns`, `funding-financing` — all exist in S5.
Every tooltip with a `manualSection=` prop links into S5 → keep those stable.

### S7 — Help / admin copy
No dedicated `help-system/` directory. Admin copy is inline:
- `client/src/components/admin/model-defaults/CompanyTab.tsx:45` — duplicate UI fallback for `companyOpsStartDate`

### S8 — Rebecca
- `server/ai/rebecca-context-builder.ts` — context assembly
- `server/routes/rebecca.ts` — API route
- `server/migrations/rebecca-*` — 5 migrations (guardrails, KB, language, chat engine, opt-out)
- `global_assumptions.rebeccaSystemPrompt` — admin-configurable prompt (column, S1)

### S9 — RAG / Pinecone
- `server/ai/vector-store-service.ts` — service wrapper
- `server/ai/vector-indexing.ts` — indexing pipeline
- `server/storage/vector-store.ts` — storage facade
- `server/ai/knowledge-base.ts` + `server/ai/kb-content.ts` — KB loaders
- `server/ai/kb/` — 20 numbered markdown KB files. Drift risk:
  - `19-financial-formulas.md:32, 117, 118` — embeds "HVS 2024 Specialty Fee Survey" citations + `8.5%` / `12%` default fee values (re-indexed into Pinecone on change)

### S10 — Research prompts / tool schemas
- `server/ai/research-prompt-builders.ts:83` — cites "CBRE Cap Rate Survey"
- `server/ai/research-tool-prompts.ts:21` — cites CBRE, S&P Global, Damodaran
- `server/ai/aiResearch.ts` + `research-value-extractor.ts` — guidance extraction
- `server/ai/ambient/fetchers.ts:93, 94` — `source: "HVS 2024"` entries
- `server/data/researchSeeds.ts:343, 364` — seed citations (CBRE, NAR)
- `.claude/tools/` — 6 categories, 23 JSON schemas:
  - `research/` (11) — `compute-adr-projection`, `compute-cap-rate-valuation`, etc.
  - `validation/` (8) — `depreciation-checks`, `irr-npv-checks`, etc.
  - `financing/` — `calculate-dscr`, `calculate-debt-yield`, etc.
- `calc/` — 11 subdirs (analysis, financing, research, returns, services, validation, etc.)
- `calc/dispatch.ts` — tool registry (single source of truth per `.claude/rules/deterministic-tools.md`)

### S11 — Tests
`tests/` — 21+ subdirs. Relevant:
- `proof/` — invariant enforcement; always run
- `engine/` — golden scenarios; ~40 files
- `calc/` — tool I/O tests; must match tool schemas (S10)
- `golden/` — reference snapshots
- Tests reference `incentiveManagementFee` widely; no references to the deleted `button-save-incentive` testid (task #1 rewire caused no test orphaning).

### S12 — Rules / skill docs
- `.claude/claude.md` — master doc (always loaded)
- `.claude/session-memory.md` — this session log
- `.claude/rules/*.md` — 25 binding rules
- `.claude/skills/**` — 178 skills across 19 domains. Relevant:
  - `ui/company-assumptions-sections.md` (audit target)
  - `finance/constants-and-config.md` (touched by DEFAULT_* additions)
  - `database/SKILL.md` (touched by schema changes)

### S13 — Replit platform bindings
Replit-provided infrastructure and config. **Do not re-implement what Replit
provides; do not break the declarative config without coordination.**

| Replit service | This repo's use | Key file |
|---|---|---|
| Object Storage (sidecar) | Photo binary + export blobs | `server/replit_integrations/object_storage/objectStorage.ts` (sidecar at `127.0.0.1:1106`) |
| Neon PostgreSQL (managed) | All DB state | `.replit` modules `postgresql-16`; shared/schema uses Neon serverless client |
| Secrets (env vars) | `REPLIT_DEPLOYMENT`, `REPLIT_DEV_DOMAIN`, `REPLIT_DOMAINS` + app secrets | `process.env.*` (never `.env` committed) |
| Autoscale deployment | Prod hosting | `.replit` `[deployment] deploymentTarget = "autoscale"` |
| Nix package system | Chromium + X libs for Puppeteer exports | `.replit` `[nix] packages = [...]`, channel `stable-24_05` |
| Workflows (Project runner) | Start app + parity + typecheck + lint tasks | `.replit` `[[workflows.workflow]]` |
| Vite plugins (dev-only) | cartographer / dev-banner / runtime-error-modal | `package.json` — dev deps only, must not bundle to prod |
| PORT convention | Must bind to `PORT=5000` | `.replit` `[env] PORT = "5000"` |

**Audit invariants for S13:**
1. Don't add `puppeteer` with its own Chromium download — Chromium comes from Nix. Use `puppeteer-core` + `executablePath: "/usr/bin/chromium"` (or similar Nix path).
2. Don't commit `.env` files — use Replit Secrets.
3. Don't override `PORT` in server code — read from `process.env.PORT`.
4. Don't add a second DB client or connection pool — `shared/db` is the single Drizzle pool.
5. Any `.replit` / `replit.nix` change = deployment-affecting; flag in commit message.
6. Object Storage access must go through the sidecar endpoint; direct GCS/S3 clients violate the Replit pattern.
7. Vite plugins stay dev-only (`vite.config.ts` conditionally loads them).

---

## Drift confirmed from prior audit commits

### D-1: `DEFAULT_COMPANY_OPS_START_DATE` drift (task #6)
13 occurrences of `"2026-06-01"` remain across the repo. Should import the constant added in `shared/constants.ts:220`.

Known drift sites (subset):
| Site | Surface | Line |
|---|---|---|
| `shared/schema/config.ts` | S1 | 101, 120 |
| `server/syncHelpers.ts` | S2 | 57, 63 |
| `server/seeds/properties.ts` | S3 | 70, 77 |
| `server/seeds/property-data.ts` | S3 | 53, 366 |
| `client/src/lib/store.ts` | — | 145 |
| `client/src/components/admin/model-defaults/CompanyTab.tsx` | S7 | 45 |
| `client/src/pages/checker-manual/sections/Section04GlobalAssumptions.tsx` | S5 | 30, 58 |

### D-2: Citation drift (tasks #4, #8)
`citations.ts` centralizes UI badge strings, but the same citations appear in server-side surfaces:
- `server/seeds/hospitality-benchmarks.ts:134, 141` — "HVS 2024"
- `server/ai/kb/19-financial-formulas.md:32, 117, 118` — "HVS 2024" in Rebecca's KB (RAG)
- `server/ai/ambient/fetchers.ts:93, 94` — "HVS 2024"
- `server/ai/research-prompt-builders.ts:83` — "CBRE Cap Rate Survey"
- `server/ai/research-tool-prompts.ts:21` — "CBRE Cap Rate Survey" + others
- `server/data/researchSeeds.ts:343, 364` — CBRE, NAR

Conclusion: `citations.ts` was a client-only fix. The server-side citation strings still live as literals. Phase 2 should decide: extend `citations.ts` to `shared/`, or accept that server research-seeded citations live where the research layer reads them.

### D-3: `button-save-incentive` orphan check (task #1)
No test references found. Safe.

### D-4: `savedTabs` contract (task #5 page fix)
Client type extended. Not yet verified on server persistence path or scenario load.

---

## Content still hardcoded in Rebecca KB (S9)

`server/ai/kb/19-financial-formulas.md:117, 118` embeds these numeric defaults:
- `Default Base Management Fee: 8.5%`
- `Default Incentive Management Fee: 12%`

These are user-facing numbers baked into Rebecca's responses. If admin changes `DEFAULT_BASE_MANAGEMENT_FEE_RATE` or `DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE` in `shared/constants.ts`, Rebecca will still quote the old figure until the KB is re-indexed. Phase 2 should decide whether to template these or accept that KB updates require manual sync.

---

## Phase 1 complete — 0 commits. Next: Phase 2 (drift repair).
