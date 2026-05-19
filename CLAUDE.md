# H+ Analytics — CLAUDE.md (Claude Code Agent Contract)

> **Canonical agent contract for Claude Code sessions in this repo.**
> Counterpart: `replit.md` (Replit Agent contract) — uses the **pointer model**: replit.md holds Replit-specific extras and a routing table; this file is the canonical source for all shared content. When touching either file, run a harmonization pass on the other before shipping (see § "Memory-file harmonization (mandatory shipping gate)" below).

These rules apply to every session, every agent, every plan and implementation unit.
They are non-negotiable. Skills (`no-magic-numbers`, `hplus-variable-taxonomy`) provide
full documentation; this file is the always-loaded enforcement reminder.

---


## 1. No Hardcoded Values — MANDATORY GATE

**Every implementation unit that touches any numeric literal MUST run:**

```
scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts
```

This is the hard gate. It must PASS before the unit is considered done.

**Numeric literal rule (one sentence):** Every numeric literal in source code must be either a named
constant, a math/physics derivation with its formula in a comment, a documented unit
conversion factor, or a structural index/length/clamp (`0`, `1`, `-1`). Anything else
is a violation.

**Integration identifier rule (one sentence):** LLM model names, API slugs, MCP slugs, and endpoint
URLs must never appear as TypeScript string literals or string constants anywhere in source code —
they live in `admin_resources` rows and are fetched at runtime. Wrapping a hardcoded string in a
`const` is the same violation with a disguise.

| Integration type | `admin_resources kind` | Runtime path |
|---|---|---|
| LLM models / providers | `model`, `llm_slot` | `GET /api/llm-providers` |
| External APIs (Exa, Perplexity, Tripadvisor…) | `api` | query by `config` flag |
| MCP servers | `mcp` | query filtered by `kind='mcp'` |
| Endpoint URLs | `config.endpoint` on the relevant row | read from the row |

**When to include in a plan's verification section:** Every unit. If the unit adds no
numeric literals or integration identifiers, the gate still runs to catch regressions.
There are no exceptions.

**Skill for full detail:** `.agents/skills/no-magic-numbers/SKILL.md`

---

## 2. Number Taxonomy — Category 2 is LEGACY DEBT (locked 2026-05-13; Cat 5 added 2026-05-18)

Every number falls into exactly one category. Never invent a sixth.

| Category | Name | Pattern |
|---|---|---|
| 1 | TRUE CONSTANTS | Math/physics only. `DAYS_PER_MONTH = 30.5 // 365/12` |
| 2 | DEFAULT VARIABLES | **LEGACY** — Do NOT create new ones. See rule below. |
| 3 | ASSUMPTION VARIABLES | Per-entity DB values. Read from DB — no `?? DEFAULT_*` |
| 4 | TABLE-SOURCED VALUES | Authority rates. `getMarketRate()` or `getFactoryNumber()` |
| 5 | STARTER-PORTFOLIO SEEDS | `SEED_*` calibrated bootstrap values in dedicated surfaces. See list below. |

**Category 2 superseding rule:** Business and financial values must NOT
exist as TypeScript constants — even named ones. `const BRACKET_DEFAULT_US_TERTIARY_EXIT_CAP = 0.0975`
is the same violation as writing `0.0975` inline — the name doesn't change
that it is hardcoded. These values belong in the database:
- `model_defaults` table — Layer-1 universal fallback (admin-editable in "Model Defaults" UI)
- `icp_brackets` rows — Layer-2 bracket overlay (applied at entity creation)
- `properties` / `companies` column — Layer-3 per-entity value (always populated by the three-layer resolver)

**The three-layer resolver guarantees Layer-3 is always set**, so engine code
reads `property.exitCapRate` directly — never `?? DEFAULT_EXIT_CAP_RATE`.

The DB schema enforces the invariant: new columns are added as
`NOT NULL DEFAULT <value>` in migration SQL. The literal in the SQL is
both the bootstrap value and the not-null enforcement — existing rows are
backfilled automatically by the DEFAULT clause. This makes TS fallback
constants structurally unnecessary, not just stylistically bad.

**The ONLY numbers allowed in TypeScript:**
- Category 1: math/physics absolutes (12, 365, 30.5, π, 86400, etc.)
- Structural clamps/indices: `0`, `1`, `-1`
- Algorithm calibration constants: non-financial, non-admin-configurable parameters (IRS/GAAP-derived engine parameters like `NOL_UTILIZATION_CAP = 0.8`; rule-ordering integers like `PRIORITY_* = 100`)
- **Starter-portfolio seeds** — `SEED_*` named constants (or inline literals with provenance comments) in dedicated bootstrap surfaces, calibrated values that populate the dev DB and the prod starter portfolio at first launch. Bootstrap-only, never imported by runtime engine/calc/route code. Mandatory provenance: each `SEED_*` constant carries a comment block citing the calibration source (date, target metric, runbook link). On prod-DB conflict (user/admin saved over the seed), the DB row wins via `onConflictDoNothing()` in the seed script. Allowed locations:
  - `artifacts/api-server/src/migrations/*.ts` — migration guards (existing)
  - `artifacts/api-server/src/seeds/**` — seed data files (entire subtree)
  - `artifacts/api-server/script/seed-*.ts` — seed scripts (outside scanner scope)
  - `artifacts/api-server/src/syncHelpers.ts` — one-shot sync payload constructor
  - `lib/shared/src/constants.ts` — cross-package `SEED_*` only (e.g., `SEED_EXIT_CAP_RATE_LUXURY`, `SEED_MEDELLIN_DUPLEX_START_ADR`)
- Test assertion / fixture values (`*.test.ts`, `*.spec.ts`) — checker skips these files entirely

**Canonical violation + fix** (additional patterns in skill):
```ts
// VIOLATION — named constant for financial value
export const DEFAULT_EXIT_CAP_RATE = 0.085;
const exitCap = property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE; // WRONG — name doesn't fix it

// CORRECT — engine reads from DB (three-layer resolver guarantees it's set)
const exitCap = property.exitCapRate;
```

Full taxonomy, recurring violations, and legacy migration path: `.agents/skills/hplus-variable-taxonomy/SKILL.md`.

---

## 3. Seed File Rule (updated 2026-05-13)

**Migration SQL is the canonical source for bootstrap values.** TypeScript seed scripts invoke the resolver flow (`POST /api/properties`) and receive DB-populated values — they MUST NOT carry financial literals or named constants.

```ts
// CORRECT — seed calls resolver; values come from icp_brackets Layer 2
await createProperty({ companyId, ...baseFields });

// VIOLATION — TS constant or raw literal in seed (both forms are wrong)
{ exitCapRate: 0.075 }
```

Per-entity confirmed overrides go through a SQL migration or one-off DB-writing script, never a TS constant.

---

## 4. ADR-007 — DI Discipline in Calc/Engine

`lib/calc/src/` and `lib/engine/src/` MUST NOT import storage, DB, or logger.
All rate resolution happens in the **route/service layer** and is passed as parameters
to pure calc functions.

```ts
// CORRECT — route resolves, passes in
const rate = await getMarketRate('transfer_tax_us');
computeExitScenarios({ transferTaxRates: { transfer_tax_us: rate.value / 100 } });

// VIOLATION — calc imports storage
import { getMarketRate } from '../../storage/market-rates';
```

---

## 5. Plan Verification Gate Checklist

Every implementation unit's Verification section must include:

- [ ] `pnpm run typecheck` (or scoped `tsc --noEmit`) — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts` — PASS (frontend units only; see §13)
- [ ] Relevant test suite — PASS

Units that modify DB schema or seed files also need:
- [ ] `pnpm --filter @workspace/scripts run check:migration-guards` — PASS

---

## 6. Institutional Knowledge Store

`docs/solutions/` contains documented solutions, architecture patterns, design decisions, and
workflow learnings accumulated across sessions. Search it before implementing features, debugging
issues, or making decisions in a documented area.

**Structure:** Organized by category subdirectory (`architecture-patterns/`, `design-patterns/`,
`best-practices/`, etc.). Each file has YAML frontmatter with searchable fields:
- `module` — the area affected (e.g., `rebecca-agent-native-architecture`, `admin-navigation`)
- `tags` — lowercase-hyphen keywords
- `problem_type` — category enum (`architecture_pattern`, `design_pattern`, `best_practice`, etc.)

**When to search:** Before starting any implementation unit, grep for relevant module names,
tags, or component names in `docs/solutions/`. Learnings may cover bugs, patterns, workflow
conventions, and architectural decisions that would otherwise be re-discovered.

---

## 7. Agent-Native Parity — Mandatory Discipline

Every UI action a user can take, Rebecca must be able to achieve through conversation.

**When adding any UI capability**, also add the corresponding Rebecca tool in the same PR
and update `docs/discipline/agent-native-parity-map.md`.

**Parity map status values:**
- ✅ Tool exists and is documented in Rebecca's system prompt
- ⚠️ UI action exists but no Rebecca tool — MUST be resolved before merging
- 🚫 N/A — user-only action (file picker, camera, biometric auth) or admin-only

**The parity audit skill:** run `/parity-audit` in any session to get a structured
gap analysis comparing the current UI action list against known Rebecca tools.

---

## 8. Market Rates Table — Admin Regenerates, Never Cell-Edits

The admin can only press the **Analyst button** to regenerate an entire table row.
Individual cell editing is not supported and must not be implemented. Tables show:
- Last-regenerated timestamp
- Freshness dot (green = fresh, yellow = aging, red = stale/overdue)

---

## 9. Financial Engine Authoring Authority — ONLY shell CC

**Only the Claude Code CLI session (shell CC) may edit code in the financial engine
surface.** Replit Agent, other AI agents, and execute-this-plan handoffs must NOT
touch this surface — neither directly nor via plan delegation.

**Protected surface:** `lib/engine/src/`, `lib/calc/src/`, `lib/shared/src/constants*.ts`,
`lib/db/src/constants*.ts`, `artifacts/api-server/src/finance/`,
`artifacts/api-server/src/report/`, `artifacts/api-server/src/tests/proof/`,
`artifacts/api-server/src/tests/engine/`. Schema columns that feed these are
protected at the column level, not just the read site.

**The discipline:** when handing a plan to a non-shell-CC agent, the plan's file scope MUST exclude every path above. Saying "do not touch the engine" is insufficient — exclude it from scope. If the plan needs an engine change, carve that unit out and execute it as shell CC.

**Skill for full detail:** `.agents/skills/financial-engine/SKILL.md` — "Critical Invariant: Authoring Authority".

---

## 10. Agentic Member Naming Convention

All agents, minions, and orchestrators in H+ Analytics use human first names from Brazilian or Italian naming traditions.

**Three roles — never conflate:**
- **Orchestrators** — route work across agents; never produce content directly
- **Agents** — do the substantive work (LLM or deterministic)
- **Minions** — deterministic helpers called by agents; no LLM, no judgment

**Name formats:**
- Swarm members (job-specific, single pipeline): `Name-NN` zero-padded (e.g., Sofia-01, Lorenzo-03)
- Cross-app specialists, orchestrators, minions: single name

**Every member declares three fields:** `role` (one-line title), `short_description` (1-2 sentences), `long_description` (capabilities, I/O, model tier).

**Canonical definitions of Agent / Minion / Specialist / Swarm, reserved names, and full inventory:** `.agents/skills/slide-factory/SKILL.md`. Never use: Sergio, Milton.

---

## 11. Frontend Design Standards — DESIGN GATE

Every frontend unit (any `.tsx`, `.jsx`, `.ts`/`.js` that renders UI, `.css`, `.scss`, `.html`) MUST invoke `/post-coding-design-review` before declaring done. A design finding is a build-failure-equivalent — fix before marking complete.

**Full principles:** `.agents/skills/ce-frontend-design/SKILL.md`

---

## 12. Model Cost Optimization — PRE-CODING SUGGESTION

Suggest a model switch before starting work when there's a cost win without quality loss. **Haiku** — single-file/mechanical. **Sonnet** — multi-file feature work. **Opus** — financial engine (§9), cross-cutting refactors, deep debugging. Never switch silently — the user controls the model.

---

## 13. UI Canonical Enforcement — MANDATORY GATE

**Every frontend unit (any `.tsx`/`.jsx` in `artifacts/hospitality-business-portal/src/`) MUST run:**

```
scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts
```

This is the hard gate. It must PASS before the unit is considered done. Zero tolerance — no baseline file.

**Rule A — canonical "Analyst" CTA (one sentence):** Every Analyst call-to-action in the portal reads exactly `Analyst` (or canonical suffix variant `Analyst — <Tab>`, or running-state `Studying…`); variants like `Ask Analyst` / `Ask The Analyst` / `onAskAnalyst` / `askAnalyst` / `askTheAnalyst` / `ASK_ANALYST_*` / `button-ask-analyst-*` are forbidden, and `<AnalystActionButton label="X">` where X ≠ `"Analyst"` is forbidden.

**Rule B — canonical horizontal tabs (one sentence):** Every horizontal menu in the portal renders through the canonical `<CurrentThemeTab>` wrapper from `@/components/ui/tabs`; direct imports of `TabsList` / `TabsTrigger` from `@/components/ui/tabs` outside `tabs.tsx` itself are forbidden, and hand-rolled `<button>` rows with `activeTab` toggle styling are forbidden.

**Canonical components:**
- Analyst CTAs: `AnalystButton` (`@/components/intelligence/AnalystButton`) — page headers, status bars, full-width primary CTAs.
- Analyst CTAs: `AnalystActionButton` (`@/components/analyst/AnalystActionButton`) — header/save-row/modal variants with cooldown support. Either is acceptable; the checker accepts both imports.
- Horizontal tabs: `CurrentThemeTab` (`@/components/ui/tabs`) — Radix-backed wrapper with `suffix`, `trailingIcon`, `disabled` + `tooltipTitle`, `responsive: { fallback: "select" }`, and `variant: "default" | "drawer"`. `TabsContent` for panel content remains permitted.

**Two canonical violations + fixes** (additional patterns in skills):
```tsx
// VIOLATION — Rule B import of bare primitives outside tabs.tsx
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"; // BANNED

// CORRECT — use the wrapper
import { Tabs, TabsContent, CurrentThemeTab, type CurrentThemeTabItem } from "@/components/ui/tabs";
<CurrentThemeTab tabs={items} activeTab={tab} onTabChange={setTab} />

// VIOLATION — Rule A masking-literal anti-pattern
export const ASK_ANALYST_CTA = "Ask The Analyst"; // BANNED

// CORRECT — use the canonical component
import { AnalystButton } from "@/components/intelligence/AnalystButton";
<AnalystButton onClick={onAnalystClick} />
```

**When to include in a plan's verification section:** Every frontend unit. If the unit adds no UI surface, the gate still runs to catch regressions. There are no exceptions.

**Relationship to §1 and §11:** §13 is mechanical (CI-enforced, no judgment), §11 is qualitative (`/post-coding-design-review` design pass), §1 is structural (numeric / integration identifiers). They run independently and do not substitute for each other.

**Skills for full detail:** `.agents/skills/analyst-research-buttons/SKILL.md` (Rule A), `.agents/skills/ui-page-patterns/SKILL.md` (Rule B). Convention doc with mechanical-enforcement section: `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md`.

---

## 14. Retirement Campaign Discipline — MANDATORY (locked 2026-05-18)

**The rule (one sentence):** Never delete a TypeScript constant, string identifier, or any other named source-code symbol that participates in an active retirement campaign until (a) its replacement destination is wired and reading green in the same PR, and (b) every CI ratchet the symbol touches has been re-run and re-baselined at ≤ current count.

**Why this rule exists:** Session 20 (2026-05-18) deleted `DEFAULT_ADR_GROWTH_RATE` before `computePropertyDefaults` was wired to read from `model_defaults`. The retirement looked clean locally, but inline `0.03` literals leaked into `lib/engine/` and `lib/calc/`, breaking typecheck and regressing the `check-magic-numbers` ratchet 15→17. The fix required a full revert. The same failure mode applies to every retirement campaign in this repo — §1 numeric literals → `model_defaults`, §1 integration identifiers → `admin_resources`, §13 UI canonical migrations, future schema/auth/agent slug retirements.

**The two pre-conditions before any retirement PR is mergeable:**

1. **Destination is wired AND reading.** The replacement source (DB column, `model_defaults` row, `admin_resources` row, canonical component, etc.) must be populated AND the code that previously read the symbol must already read from the new source in the same PR. "I'll wire it next" is the failure pattern.
2. **Ratchets are re-baselined at ≤ current.** Run every CI gate the retirement touches (`check-magic-numbers`, `check-ui-canonical`, `check-migration-guards`, `typecheck`) and confirm no count went up. If a count went up, the retirement is leaking — stop and find the leak before merging.

**Applies to every retirement campaign, not just §2.** Same shape of failure across categories:
- §2 numeric `DEFAULT_*` → `model_defaults` / `properties` / `companies` column
- §1 integration identifiers (model names, API slugs, MCP slugs) → `admin_resources`
- §13 `Ask Analyst` / bare `TabsList` → canonical `AnalystButton` / `CurrentThemeTab`
- Future: agent slug renames, schema column drops, auth provider swaps

**Plan-level discipline:** Any plan unit whose scope includes a deletion (`Remove X`, `Drop column Y`, `Retire constant Z`) MUST include both pre-conditions in its Verification section. A plan unit that only says "delete and run typecheck" is incomplete and will reproduce the session-20 failure mode.

**Skill for full discipline:** `.agents/skills/hplus-variable-taxonomy/SKILL.md` (§2 specifics + retirement workflow); this §14 codifies the general rule across all campaigns.

---

## Project Reference

Full project description, monorepo structure, stack, and key commands: `docs/reference/project-overview.md`.

---

## Environment & Production Deployment

Env vars (api-server), Railway production wiring, single-container model, secrets parity rule: `docs/reference/deployment-and-env.md`.

---

## Architecture Notes

Full narrative for each topic lives in `docs/architecture/architecture-notes.md`. Inline 1-line pointers below — always-loaded sessions still see the rule; the doc carries the prose.

- **Import discipline** — Frontend imports `@workspace/db/schema` (subpath export), never `@workspace/db` directly, to keep Node-only `pg` out of the browser bundle. Use `@engine/*` / `@calc/*` / `@shared/*` aliases, never deep relative paths.
- **Zod compatibility** — Import from `"zod-validation-error/v3"` for Zod v3; cast `as any` when handing `@workspace/db` schemas or `.error` to Zod helpers.
- **AI assistant — Rebecca only** — Rebecca is the only AI assistant (semantic KB-search via pgvector + OpenAI embeddings). **No voice agents, no Convai, no ElevenLabs.** Skill: `embedded-ai-agent`.
- **Specialists** — Dev-defined only; no admin UI for creation or editing. Detail: `.claude/rules/specialists-are-dev-defined-only.md`.
- **Costantino — Data Custodian (Step 0)** — Periodic agentic health-audit loop for `admin_resources` rows with `config.healthProbe`. Skill: `costantino-data-custodian`.
- **Intelligence Display — specialist-sourced UI affordances** — Every range badge, tip, severity signal, or suggestion comes **100% from specialist/research-engine output**. Canonical: `AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog`. Severity palette: ok=emerald, advisory=sky, warning=amber, block=red. Skill: `analyst-intelligence-display`.
- **Roles and permissions** — `checker` and `investor` roles still **live in the DB** despite removal from `VALID_USER_ROLES`. `canManageScenarios` is orthogonal to role. Dual share tables `scenario_access` (enforcement) + `scenario_shares` (tracking) must stay in sync. Detail: `.local/tasks/task-800.md`.
- **Number taxonomy — see §2** — Full enforcement rule is §2 above. Skill: `hplus-variable-taxonomy`. Slide Deck Factory consumer-only rule: see linked doc.
- **Inflation policy (USD-base)** — All engine calculations use the **US inflation rate** for every property; country tables are display-only. Engine cascade always passes `'US'` to `getFactoryNumber`. Skill: `inflation-cascade`.
- **LB Slides — investor PDF decks** — 6-slide deck via React → headless Chromium (Playwright) → PDF → R2. **Playwright only — never Puppeteer.** Detail: `docs/slide-system/lb-slides-implementation-reference.md`.
- **`reference_brands` AI pipeline — DI pattern** — Route layer fetches; calc/engine DB-import-free. Detail: `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md`.
- **Known issues** — See `docs/issues/known-issues.md`.
- **Migration system architecture** — Three folders (`lib/db/migrations/` Drizzle output, `artifacts/api-server/migrations/` boot-read with drifted slots past 0052, `artifacts/api-server/src/migrations/*.ts` idempotent runtime guards). Schema changes use `pnpm --filter @workspace/db run generate`. Full topology: `docs/runbooks/schema-migrations.md`.
- **Shared proxy routing** — All traffic routes by path through `localhost:80/<path>`. Never call service ports directly.

---

## Inviolable Login / Auth Rules

_Gate-equivalent: these 5 rules carry the same authority as §1–§14 and are protected by §14 retirement discipline. Do not delete or weaken without a same-PR replacement and re-baselined ratchets._

1. **Railway ↔ Replit secrets must stay in parity.** Any env var the api-server reads must exist in *both* Railway service variables *and* Replit secrets. Absence in either silently disables the feature (`GOOGLE_CLIENT_ID` missing → Google auth 404). After adding a var to Railway, add it to Replit secrets immediately.

2. **Never gate UI behaviour on a silent async fetch.** `useState(false)` flags flipped by fire-and-forget fetches are banned — any network hiccup leaves the feature permanently disabled with no visible error. The server is the authority; the client always attempts and surfaces server errors as toasts.

3. **Dev-login is dev-only by server gate, not client gate.** `/api/auth/dev-login` is blocked by `isPublishedDeployment()` (checks `REPLIT_DEPLOYMENT`). The client never pre-checks — the server returns 403 in production.

4. **Auth navigations must use `window.location`, never `window.top`.** `window.top` is cross-origin in the Replit canvas iframe. Use `window.location.href` / `window.location.replace()`. Google OAuth uses `window.open("/api/auth/google", "_blank")` (Google pages send `X-Frame-Options: DENY`); poll `refetch()` until session is established.

5. **`DEV_SKIP_AUTH` must remain `false`.** Never edit `artifacts/api-server/src/dev-flags.ts`. Real auth is always active in development.

---

## Canonical Page Archetypes

Two archetypes cover ~95% of pages: **Report/Presentation** (read-only, tabs + export — canonical `PropertyDetail.tsx`) and **Form/Editor** (tabs + per-tab Save + AnalystButton — canonical `CompanyAssumptions.tsx`). Read the canonical page before building. Full conventions: `ui-page-patterns` skill.

---

## Reference Documents

| Path | Contents |
|---|---|
| `references/openapi.md`, `references/server.md` | OpenAPI codegen + route conventions |
| `docs/reference/project-overview.md` | Project source of truth — monorepo structure, stack, key commands |
| `docs/reference/deployment-and-env.md` | Environment variables (api-server) + production deployment wiring (Railway, Dockerfile, single-container model) |
| `docs/architecture/architecture-notes.md` | Architecture-notes details (import discipline, Zod compat, Rebecca-only, Specialists, intelligence display, migration system, shared proxy, etc.) — Inviolable Login/Auth Rules stay inline above |
| `docs/changelog/cc-recent-changes.md` | Full CC changelog (older entries; CLAUDE.md keeps ≤ 3 most recent inline) |
| `docs/plans/open-todos-cc.md` | Full CC TODO list (CLAUDE.md keeps a 1-line pointer inline) |
| `docs/runbooks/schema-migrations.md` | Schema + migration + seed runbook (three-folder topology, runtime guards, drift recovery) |
| `docs/concepts/numeric-values-explained.md` | Readable explainer for the five-category numeric rule (§1–§5) — start here when onboarding to the rule |
| `docs/brainstorms/numeric-architecture-requirements.md` | Numeric architecture brainstorm — three-pillar model, Phase 2 design decisions D1–D5 |
| `.local/tasks/task-800.md` | Architecture audit (scenarios, portfolios, sharing, roles) |
| `attached_assets/canonical/pdf/L+B_Property_6-Slide_Cannonical_1777859377769.pdf` | LB slides canonical visual — every rebuild must pixel-match |
| `attached_assets/canonical/json/slide_analysis_agent_report.precise_1777824741855.json` | LB slides layout extract — text/fonts/colors authoritative; chrome/z-order not |
| `docs/slide-system/lb-slides-implementation-reference.md` | LB Slides full reference (routes, schema, finance, slots, Admin UI) |
| `docs/slide-system/canonical/coding-agent-instructions.md` | Slide agent workflow — §15 mandates canonical PNG comparison (PNG > JSON) |
| `.agents/status/cc.md` | CC current session status (active branch, owned files, handoff notes) |
| `.agents/status/replit.md` | Replit current session status (active branch, owned files, handoff notes) |

---

## Agent & Skill System

Full directory layout, core workflow (brainstorm → plan → work → review → compound), CC/Replit lane split, and key skill index: see `replit.md` § "Pointers" (skill routing table). Full index: `.agents/skills/README.md`.

**Invocation:** `Skill("skill-name")` in Claude Code; type the skill name as a command in Replit.

### CC branch hygiene — Replit agent staging risk

Replit Agent commits to whatever branch is checked out in the shared workspace, so CC PR branches left open during CI often accumulate unrelated Replit commits. **Before merging any CC PR**, run `git log origin/main..origin/<branch> --oneline` and `git diff origin/main...origin/<branch> --name-only` to verify every commit and file matches the stated scope. If Replit commits are mixed in, cherry-pick the CC-only commits onto a fresh branch off `origin/main` and re-open the PR from there. Full recovery workflow: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`.

---

### Agent coordination — CC ↔ Replit (mandatory session gate)

Two status files prevent work collisions: `.agents/status/cc.md` (CC is sole writer; Replit reads) and `.agents/status/replit.md` (Replit is sole writer; CC reads). At session start, read the counterpart's file and update your own (`Status: active`, branch, `Updated` timestamp). At session end, set `Status: idle` (or `handoff-pending`), fill the Handoff section if applicable, and commit. Staleness: if `Updated` is >24h old, treat as `idle` regardless of `Status`. Full protocol, format spec, and surface restrictions: `agent-collab-status` skill.

---

### Memory-file harmonization (mandatory shipping gate)

`CLAUDE.md` and `replit.md` are dual memory files covering identical ground for two different agents. They drift by default. **Every session that modifies either file must harmonize the other before shipping.** This applies equally when `ce-work` ships code that affects `CLAUDE.md` content (architecture rules, skill routing, known issues, recent changes).

Rule: **if you touch `CLAUDE.md`, scan `replit.md` for related content and sync it. If you touch `replit.md`, do the same to `CLAUDE.md`.** Use the `agent-memory-files` skill for the full discipline (drift inventory, mirror-not-fork, per-session harmonize pass, TODO list format and cadence). Shared sections (architecture rules, inviolable rules, vocabulary, skill table) must have identical wording in both files. File-specific extras (Replit environment overrides, CC-specific tooling) stay only in their respective file.

---

## Open TODOs — CC

<!-- Discipline: agent-memory-files skill → "TODO Lists" section -->
Full list: `docs/plans/open-todos-cc.md`

---

## Recent Significant Changes

<!-- keep ≤ 3 entries; remove oldest when adding new ones -->
| Date | Change |
|---|---|
| 2026-05-18 | **§14 Retirement Campaign Discipline locked (session 21).** New inviolable rule in CLAUDE.md: never delete a TS constant or named source-code symbol participating in an active retirement campaign until (a) its replacement destination is wired and reading green in the same PR, and (b) every CI ratchet the symbol touches has been re-baselined at ≤ current count. Generalizes the session-20 failure mode (DEFAULT_ADR_GROWTH_RATE deleted before `computePropertyDefaults` was wired → inline 0.03 leaked into engine/calc → typecheck broken, ratchet regressed 15→17, full revert). Applies to every retirement campaign: §2 numeric, §1 integration IDs, §13 UI canonical, future schema/auth/agent slug retirements. Plan units with deletion scope must include both pre-conditions in Verification. Companion explainer for non-engineers at `docs/concepts/numeric-values-explained.md` (session 21, earlier). Master plan T1-4 status note updated; replit.md harmonized. |
| 2026-05-18 | **Category 5 — Starter-Portfolio Seeds carve-out shipped + 11 DEFAULT_* constants retired (T1-4 Phase 2).** CLAUDE.md §2 extended with Category 5 codifying calibrated `SEED_*` constants and inline bootstrap literals in dedicated surfaces (`artifacts/api-server/src/{migrations,seeds}/**`, `syncHelpers.ts`, cross-package `SEED_*` in `lib/shared/src/constants.ts`). Mandatory `SEED_` prefix + source-citation comment + no runtime imports + prod-DB-wins via `onConflictDoNothing()`. Checker (`scripts/src/check-magic-numbers.ts`) gained `"seeds"` in `SERVER_EXCLUDE_DIRS` + new `SKIP_REL_PATHS`; baseline went 144→119 suspects. 11 `DEFAULT_*` retirements: `MAX_STALENESS_HOURS`, `REINVESTMENT_RATE`, `OCCUPANCY_GROWTH_STEP`, `AR_DAYS`+`AP_DAYS`, `PROPERTY_INFLATION_RATE`+`COMPANY_INFLATION_RATE`, `OFFICE_LEASE_START`+`PROFESSIONAL_SERVICES_START`+`TECH_INFRA_START`+`BUSINESS_INSURANCE_START`. Plan docs written for the two cross-cutting deferred refactors (`PROPERTY_INCOME_TAX_RATE`, `LAND_VALUE_PERCENT`). T2-7 audit doc shipped (12 in-scope pages, `CompanyAssumptions` confirmed in scope). Convention doc at `docs/solutions/conventions/category-5-starter-portfolio-seeds-carve-out-2026-05-18.md`. |
| 2026-05-17 | **UI canonical enforcement gate shipped (Plan 2026-05-16-004; CLAUDE.md §13).** Zero-tolerance mechanical gate at `scripts/src/check-ui-canonical.ts` covering Rule A (canonical `Analyst` CTA — banned `Ask (the) Analyst` text, banned `onAskAnalyst`/`askTheAnalyst`/`ASK_ANALYST_*`/`button-ask-analyst-*` identifiers, banned `<AnalystActionButton label="X">` where X ≠ `"Analyst"` with multi-line JSX buffer) and Rule B (canonical `<CurrentThemeTab>` wrapper — bare `TabsList`/`TabsTrigger` imports outside `tabs.tsx` forbidden, hand-rolled `<button>+activeTab===` heuristic). Cleanup: 5 Rule A files + 12 Rule B files. `CurrentThemeTab` rebuilt on Radix internals — gains `role="tab"`/`aria-selected`/arrow-key nav plus new affordances (`suffix`, `trailingIcon`, `disabled`+`tooltipTitle`, `responsive: { fallback: "select" }`, `variant: "default" \| "drawer"`). Meta-checker `check:gate-health` asserts file-exists / CI-wired / effective per registered gate. CI wired in `.github/workflows/ci.yml`. |

Older entries: `docs/changelog/cc-recent-changes.md`.
