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

### S9 — RAG / pgvector
- `server/ai/vector-store-service.ts` — service wrapper
- `server/ai/vector-indexing.ts` — indexing pipeline
- `server/storage/vector-store.ts` — storage facade
- `server/ai/knowledge-base.ts` + `server/ai/kb-content.ts` — KB loaders
- `server/ai/kb/` — 20 numbered markdown KB files. Drift risk:
  - `19-financial-formulas.md:32, 117, 118` — embeds "HVS 2024 Specialty Fee Survey" citations + `8.5%` / `12%` default fee values (re-indexed into pgvector on change)

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

### D-2: Citation drift (tasks #4, #8) — ✅ closed for exact-match sites (Phase 5A, `847e1f3a` + `0c3ebc1b`)
`citations.ts` promoted to `shared/citations.ts`; 9 client imports rewired to `@shared/citations`. Server-side exact-match sites adopted in `server/data/researchSeeds.ts` (capRate, costIT, saleCommission).

Remaining open sub-items (deferred to later handoffs):
- `server/seeds/hospitality-benchmarks.ts:134, 141` — short "HVS 2024" label, no exact CITATIONS match (Phase 5A-4 — needs product decision: add `CITATIONS.hvsShort` or upgrade to `hvsFeeSurvey`)
- `server/ai/ambient/fetchers.ts:93, 94` — same short "HVS 2024" label (Phase 5A-4)
- `server/ai/kb/19-financial-formulas.md:32, 117, 118` — KB markdown, requires pgvector re-indexing (Phase 5A-5 / 5B)
- `server/ai/research-prompt-builders.ts:83` — `RESEARCH_SOURCES` is its own registry (superset of CITATIONS, includes URLs/categories), intentionally separate
- `server/ai/research-tool-prompts.ts:21` — citations are prose inside LLM prompts, semantically distinct, leave as-is

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

---

## Phase 2 — drift repair (status)

### D-1 ✅ closed (commits `8f50224a`, `5d4b4111`)
All 5 true drift sites now import `DEFAULT_COMPANY_OPS_START_DATE`:
`shared/schema/config.ts`, `server/syncHelpers.ts`, `server/seeds/properties.ts`, `client/src/components/admin/model-defaults/CompanyTab.tsx`, `client/src/pages/checker-manual/sections/Section04GlobalAssumptions.tsx`. Remaining `"2026-06-01"` occurrences are different fields (`capitalRaise1Date`, `acquisitionDate`) — not task #6 drift.

### D-1-B: capitalRaise{1,2}Date drift ✅ closed (commit `6a18d8cf`)
Added `DEFAULT_CAPITAL_RAISE_1_DATE` (`"2026-06-01"`) and `DEFAULT_CAPITAL_RAISE_2_DATE` (`"2027-04-01"`) to `shared/constants.ts`. Adopted across 4 files (8 literal substitutions):
`shared/schema/config.ts` (column defaults), `server/syncHelpers.ts` (sync fallback), `server/seeds/properties.ts` (dev seed), `client/src/pages/checker-manual/sections/Section04GlobalAssumptions.tsx` (user-manual row).
Out of scope (intentionally retained): `seed-manifest.json` (JSON, can't import TS), `script/seed-production.sql` + `script/manual-sync/*.sql` (SQL), `server/seeds/property-data.ts` `acquisitionDate` (per-property, not a default), test fixtures (intentional inputs), `server/ai/kb/19-financial-formulas.md` (Phase 5B).

### D-3 ✅ verified safe (no code change)
`tests/e2e` + `tests/` sweep finds 0 references to the removed `button-save-incentive` testid. Task #1 rewire caused no test orphaning.

### D-4 ✅ verified safe (no code change)
`savedTabs` contract round-trip verified:
- `server/routes/global-assumptions.ts:193-199` — unions/removes correctly, filters to valid tab keys.
- `server/storage/financial.ts:479, 487-490` — scenario load spreads `gaData` into target row; savedTabs preserved.
- `tests/client/assumptions-gate.test.ts` — existing coverage for missing/invalid/partial cases.
- `SEED_GLOBAL_ASSUMPTIONS` omits `savedTabs`; DB column `.default([])` handles it.

### D-2 ⚠️ deferred — not drift I created
Server-side citation strings (`HVS 2024`, `CBRE Cap Rate Survey`, `NAR transaction data`) live in multiple server surfaces that predate my client-side `citations.ts`:
- `server/seeds/hospitality-benchmarks.ts:134, 141` — seed data rows
- `server/ai/kb/19-financial-formulas.md` — Rebecca RAG (3 occurrences)
- `server/ai/ambient/fetchers.ts:93, 94`
- `server/ai/research-prompt-builders.ts:83`
- `server/ai/research-tool-prompts.ts:21`
- `server/data/researchSeeds.ts:343, 364`

These are existing cross-layer divergence, not drift introduced by my prior audit commits. A proper fix requires promoting `citations.ts` to `shared/citations.ts` and reconciling the full citation set (server has additional sources like "S&P Global", "Damodaran" not in client set). Tracked as a Phase 5 refactor candidate; product decision (E.1) should inform the approach.

### KB content note (separate from D-2)
`server/ai/kb/19-financial-formulas.md:117, 118` embeds numeric defaults (`8.5%`, `12%`) that should be templated. Requires either (a) KB re-indexing on constant change, or (b) admin workflow to edit KB markdown. **Not a code-path fix** — a content/process decision. Route to product as part of E.3.

---

## Phase 2 complete — 2 commits (`8f50224a`, `5d4b4111`). Next: Phase 3 (audit sweep of 16 remaining files).

---

## Phase 3 — audit sweep (complete, 0 commits)

**Files audited (16):** all 10 un-audited + 6 partially-audited sub-sections.

**8 findings → tasks #9–#16:**
- #9 (P1) — `EditableValue.tsx` declares `step` as required but destructure omits it — callers pass it, it's silently ignored.
- #10 (P1) — `CateringSection.tsx` is dead code (not imported, not exported from barrel).
- #11 (P2) — `ServiceTemplateDialog.tsx` `emptyForm` hardcodes markup/rate literals that should use `DEFAULT_SERVICE_MARKUP`.
- #12 (P2) — `CompensationSection.tsx` tier fallbacks hardcode 3/2.5/6/4.5/7.0; should use `STAFFING_TIERS`.
- #13 (P2) — `index.ts` barrel docstring still references "SAFE tranches" (field is `capitalRaise*` now).
- #14 (P2) — `SummaryFooter.tsx` missing last-chance `DEFAULT_FIXED_COST_ESCALATION_RATE` fallback.
- #15 (P3) — `PropertyFeeSummaryTable.tsx` uses `any[]` — should be `PortfolioPropertySummary[]` + `FeeCategoryResponse[]`.
- #16 (P3) — `CompensationSection.tsx` tooltip line 40 embeds "AHLA Lodging Industry Survey 2024" + specific $ figures that drift.

**Clean files (no findings):** `TabActions`, `RangePillsLayer`, `ServiceResearchPanel`, `FixedOverheadSection`, `VariableCostsSection`, `PropertyExpenseRatesSection`, `PartnerCompSection`, `CostOfEquityCard`, `index.ts` (except docstring — task #13).

---

## Phase 4 — split workflow decision (new rule)

**Workflow change (April 18, 2026):** UI and database tasks now go to Replit Agent for execution; Claude Code handles docs, architecture, and pure refactors. Handoff files live in `.claude/replit-handoffs/`. See that directory's `README.md`.

- Task #13 (docstring-only, no UI/DB) → completed by Claude Code this session.
- Tasks #9–#12, #14–#16 → handed off to Replit Agent via `.claude/replit-handoffs/phase-4-pending-ui-tasks.md`.
- Phase 2 shipped commits to be verified by Replit via `.claude/replit-handoffs/phase-2-verification.md`.

---

## Phase 4 — complete ✅ (Replit, April 18)

8 commits shipped (`1a131949`, `5bde2ca3`, `f19800eb`, `ea395e51`, `fd05ea59`, `623f324a`, `d5555e43`, `c34fb96f`, docs `806dfe87`). Verification green (TS 0 / Lint 0 / vocab 11/11 / test:summary PASS / Verify UNQUALIFIED / Parity UNQUALIFIED); architect review PASS, no P1/P2. Handoff #9 deviated (EditableValue `step` made optional rather than removed — TS rejected extraneous props on typed component; correct future handoffs of that shape). Task #15 surfaced a real contract bug: `PortfolioPropertySummary` was missing `isActive` while `PropertyFeeSummaryTable` rendered an "Excluded" badge from it.

---

## Phase 5A — complete ✅ (Replit, April 18)

D-2 closed for exact-match sites. 2 substantive commits + 1 docs commit:
- `847e1f3a` — moved `client/src/components/company-assumptions/citations.ts` → `shared/citations.ts`; rewired 9 client imports to `@shared/citations`.
- `0c3ebc1b` — adopted `CITATIONS` in `server/data/researchSeeds.ts` (3 lines: capRate → cbreCapRateSurvey, costIT → hftpTechnologySurvey, saleCommission → narTransactionData).
- `c58517e9` — docs.

Verification green after each substantive commit.

### D-2 still-open sub-items

1. **Short "HVS 2024" label** in `server/seeds/hospitality-benchmarks.ts:134, 141` + `server/ai/ambient/fetchers.ts:93, 94`. Not an exact match for `CITATIONS.hvsFeeSurvey` (`"HVS 2024 Fee Survey"`). Needs product decision: add `CITATIONS.hvsShort` entry, or upgrade seed rows to use the longer label.
2. ~~**KB markdown** (`server/ai/kb/19-financial-formulas.md`)~~ — closed in Phase 5B; the entire orphan directory was deleted (never wired into RAG pipeline). See D-2-B below.
3. **`RESEARCH_SOURCES` registry** in `server/ai/research-prompt-builders.ts:81-88` — superset of client CITATIONS (includes URLs + categories). Intentionally kept separate; different purpose (prompt-building vs badge display).

### D-2-B: KB orphan cleanup ✅ closed (commits `f2c90e04`, `5dd1a5f4`)
Phase 5B discovered the entire `server/ai/kb/` directory (19 markdown files added in `640e889f`) was orphaned — never read by `server/ai/knowledge-base.ts`, which only loads from `kb-content.ts` + `attached_assets/`. The "drift" worry from D-2 sub-item 2 was therefore moot — nothing read those files.
- `f2c90e04` — ported 4 high-value chunks (Founder Background, International Depreciation, Research Workflow, Governed Model Constants) into `server/ai/kb-content.ts` with vocabulary cleanup.
- `5dd1a5f4` — `rm -rf server/ai/kb/` (19 files, ~900 lines). Zero application-code references remain.
- Runtime KB re-index (Task 5B-3) **pending** — requires admin session; Replit Agent cannot trigger from CLI. User needs to hit **Admin → System Intelligence → Reindex** for the `knowledge-base` namespace. Expected: `chunksIndexed` increases by ~4.

---

## Phase 5B — Rebecca KB templating (decision taken, handoff pending)

**Decision (April 18, user):** **Option 1 — remove baked defaults from KB; Rebecca queries API for live values when asked.**

Rationale: KB should teach Rebecca formula *structure* and concepts, not source-of-truth numeric values. Rebecca's chat route already has `globalAssumptions` loaded (see `server/routes/chat.ts:142-143`); live values propagate without re-indexing.

Scope (to be drafted in `phase-5b-kb-templating.md`):
- Edit `server/ai/kb/19-financial-formulas.md` — strip baked `%` defaults + citation strings from formulas (lines 32, 33, 37, 51, 66) and from the "Key Constants" block (lines 115–124).
- Keep the two immutable constants (Depreciation 39, Days/month 30.5).
- Replace "Key Constants" block with a "Where Live Values Live" block that lists field paths (`globalAssumptions.baseManagementFee`, `property.taxRate`, etc.).
- Verify Rebecca's context injection already surfaces the live values she'd need to answer range questions.
- Re-index KB into pgvector.

Owner: Replit Agent (KB markdown edit + pgvector re-index runs in the live environment).

---

## Phase 5C — capital-raise-date drift (handoff drafted, awaiting execution)

Handoff: `.claude/replit-handoffs/phase-5c-capital-raise-date-drift.md`.

Scope: Add `DEFAULT_CAPITAL_RAISE_1_DATE` + `DEFAULT_CAPITAL_RAISE_2_DATE` to `shared/constants.ts`; adopt across `shared/schema/config.ts:121, 123`, `server/syncHelpers.ts:58, 60`, `server/seeds/properties.ts:78, 80`, and `Section04GlobalAssumptions.tsx:60, 62`. Single commit. SQL files, `seed-manifest.json`, and test fixtures explicitly out of scope.

Owner: Replit Agent (touches seed-runtime path + UI manual page).

---

## Current state (as of April 18, 2026)

| Phase | Status | Owner |
|---|---|---|
| 1 — inventory | ✅ complete | Claude |
| 2 — drift repair (D-1/D-3/D-4) | ✅ complete | Claude |
| 3 — audit sweep (16 files) | ✅ complete | Claude |
| 4 — findings #9–#16 | ✅ complete | Replit |
| 5A — citations promotion | ✅ complete | Replit |
| 5B — KB orphan cleanup | ✅ complete (commits, code) — re-index pending user action | Replit |
| 5C — capital-raise-date drift | ✅ complete | Replit |
| 6 — DB migration (service description column) | ⏸ not started | Replit (future) |
| 7–8 | ⏸ not scoped yet | TBD |

Next actions: (a) Replit executes Phase 5C handoff; (b) Claude Code drafts Phase 5B handoff. Both can run in parallel.
