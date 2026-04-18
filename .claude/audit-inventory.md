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

### S13 — Replit platform bindings (authoritative list from Replit Integrations page)

**Don't re-implement what Replit provides; don't break the declarative config
without coordination.** Source: Replit Integrations UI (user-provided April 2026).

#### A. Replit managed (built-in, auto-provisioned, always available)
| Service | Type | This repo |
|---|---|---|
| Replit Database | PostgreSQL | In use — Neon via `shared/db`, `.replit` module `postgresql-16` |
| Replit App Storage | Object Storage | In use — `server/replit_integrations/object_storage/objectStorage.ts` (sidecar `127.0.0.1:1106`) |
| Replit Auth | Authentication | **Not in use** — this repo has custom session auth (`server/auth.ts`); don't mix |
| Replit Domains | Domains | In use — `process.env.REPLIT_DOMAINS`, `REPLIT_DEV_DOMAIN` |

#### B. Connectors (first-party, sign-in once, available to the agent)
**Account status as of inventory:** 18 Active, 12 Sign-in-only, 1 Error.

Likely candidates to adopt if needed (no reinvention):
- **Resend** (Active) — email; currently used per architecture skill
- **Stripe** (Active) — payments; available if needed
- **Twilio** (Active) — SMS/voice
- **Slack** (Active) — team messaging
- **ElevenLabs** (Active) — voice AI
- **GitHub** (Active) — repo sync (Git provider, not agent-accessible)
- **Google Sheets / Docs / Drive / Calendar / Gmail** (Active)
- **HubSpot**, **Linear**, **Figma** (Active)
- **Discord**, **Dropbox**, **Todoist** (Active)
- **Microsoft OneDrive** (Error — reconnect needed)

Sign-in only (available but not connected): AgentMail, Asana, Box, Confluence, Jira, Outlook, Notion, RevenueCat, Sendgrid, SharePoint, Spotify, Zendesk.

**Audit rule:** before adding a new external integration, check this list first. If Replit provides it as a connector, use that path (OAuth handled, credentials managed by Replit) instead of embedding a direct API client with our own secrets.

#### C. MCP servers for Replit Agent (beta)
**Active:** Figma, Google Maps, Context7 MCP.  
**Available (not signed in):** Stripe, Linear, Notion, Sentry, Atlassian, Miro, PostHog, Amplitude, Granola, Razorpay, Sanity, Wistia, Squidler.

**Audit rule:** MCP tools are for the Replit Agent runtime, not direct app use. Don't bundle MCP servers into the app build.

#### D. Git providers
**Active:** GitHub. **Available:** Bitbucket, GitLab.

#### E. Platform infrastructure (non-integration)
| Surface | Where | Audit concern |
|---|---|---|
| `.replit` config | Root | modules, Nix packages, deployment target, workflows, env `PORT=5000` |
| Nix channel `stable-24_05` | `.replit` `[nix]` | Chromium + X libs for Puppeteer exports |
| Autoscale deployment | `.replit` `[deployment]` | Build cmd `npm run build`, run cmd `node ./dist/index.cjs` |
| Vite plugins (dev-only) | `package.json` | `@replit/vite-plugin-cartographer`, `dev-banner`, `runtime-error-modal` |

#### F. Audit invariants (apply before any dependency change)
1. **Use Replit-managed for Tier A services** (DB, Object Storage, Domains). Don't instantiate alternatives.
2. **Prefer Tier B connectors over raw API clients** for Stripe/Resend/Twilio/Slack/Google etc. — check this list first.
3. **Don't commit `.env` files** — use Replit Secrets (env vars).
4. **Don't override `PORT`** — read `process.env.PORT`.
5. **Don't download Chromium via `puppeteer`** — use `puppeteer-core` + Nix-provided Chromium path.
6. **Object Storage access goes through the sidecar** (`127.0.0.1:1106`). Direct GCS/S3 clients violate the pattern.
7. **Vite plugins stay dev-only** — `vite.config.ts` conditionally loads them.
8. **Any `.replit` or Nix package change = deployment-affecting** — flag explicitly in commit message.
9. **Replit Auth is not adopted** — don't mix it with the custom session auth here without migration plan.
10. **MCP servers are agent-runtime only** — don't bundle into app code.

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
