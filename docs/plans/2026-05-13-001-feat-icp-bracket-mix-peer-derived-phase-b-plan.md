---
title: "feat: ICP bracket-mix peer-derived rebuild — Phase B"
type: feat
status: active
date: 2026-05-13
origin: docs/brainstorms/2026-05-13-icp-bracket-mix-peer-derived-phase-b-requirements.md
---

# feat: ICP bracket-mix peer-derived rebuild — Phase B

## Summary

Wire the Phase A peer registry into the engine path: extend each peer row with a brand-level archetype split, build a deterministic aggregator that combines those splits into a single global default bracket mix, expose a per-Mgmt-Co override that runs the same Specialist against the company's own comps, and run the new path side-by-side with the legacy property-level derivation behind a feature flag while a diff log captures both values for cutover review.

---

## Problem Frame

The 2026-05-13 origin doc establishes the product behavior; the planning problem is the *implementation shape*: where the override lives in a schema whose `bracket_mix` column already exists on `global_assumptions`, how the Specialist and aggregator slot into the existing `ai/ambient/minions/` pattern when no `ai/ambient/specialists/` directory exists yet, how the dual-run diff log records two values for the same point in time, how Costantino's per-peer freshness probe attaches to the existing source-registry surface, and how the four new Rebecca tools register against the parity map. None of these are product decisions — they are shape choices the plan must commit to before implementation can proceed without inventing structure.

---

## Requirements

Carried verbatim from origin (`docs/brainstorms/2026-05-13-icp-bracket-mix-peer-derived-phase-b-requirements.md`); R-IDs preserved 1:1 — implementation units cite them directly.

- R1. Single-pass per-peer Specialist emits brand-level archetype split + roster-size estimate + 5–10 property sample + citations.
- R2. Specialist grounds via existing Tavily-backed `GroundedResearchService`; no new external feed.
- R3. Aggregator minion is deterministic — same peer-split input → byte-identical output.
- R4. Cold-start (zero researched peers) → equal-weight mix across active brackets, with provisional flag in transit.
- R5. Specialist + minion named per `slide-factory` SKILL.md (Brazilian/Italian first names, no `Name-NN`, not on reserved list).
- R6. Aggregated global default writes to existing `global_assumptions.bracket_mix`; no parallel global storage.
- R7. Per-Mgmt-Co override is a complete bracket mix on the existing company storage shape.
- R8. Override is unset-able to "follow global default", durable across global recomputes.
- R9. When override exists, override is the value; no blending.
- R10. Each Specialist run records own provenance (target id, model, sources, run timestamp, run id) shown in admin Evidence panel.
- R11. Legacy property-level path runs in parallel; both values recorded per recompute in dedicated diff log; no alert thresholds in v1.
- R12. Behavior gated by feature flag whose default may flip per environment; flag-off restores legacy as source of truth.
- R13. Costantino gains per-peer freshness probe with configurable threshold + cadence (no inline literals).
- R14. Peer registry, per-peer Evidence panel, global Analyst button stay under Admin → AI → Intelligence → Knowledge & Resources.
- R15. Front-of-app Mgmt Co bracket-mix surface shows active value, override-vs-default indicator, provisional badge, and per-company Analyst button.
- R16. Per-peer Analyst refreshes only that peer; global Analyst refreshes the aggregate (and may fan out to stale peers per R3 / R13).
- R17. Rebecca exposes 4 function-calling tools mirroring the new UI actions; registered in parity map.

**Origin actors:** A1 (Bracket-Mix Specialist), A2 (Aggregator Minion), A3 (Costantino), A4 (Admin operator), A5 (Mgmt Co user), A6 (Rebecca).
**Origin flows:** F1 (per-peer research run), F2 (global default recompute), F3 (per-Mgmt-Co override Specialist run), F4 (cold-start render), F5 (override clear).
**Origin acceptance examples:** AE1 (covers R4, R12), AE2 (covers R8, R9), AE3 (covers R8, R9), AE4 (covers R3), AE5 (covers R11, R12), AE6 (covers R13).

---

## Scope Boundaries

Carried from origin's Scope Boundaries section (single-list shape — origin is Standard tier):

- Legacy property-level derivation path is not removed in Phase B — runs in parallel only.
- The four legacy ICP client pages (`Icp.tsx`, `IcpStudio.tsx`, `CompanyIcpDefinition.tsx`, the four `pages/icp/` tabs) are untouched.
- Vendor pass-through cost and Mgmt Co markup factor national tables are not populated by Phase B.
- Per-property roster fetch (architect's Option B; no `icp_peer_properties` table).
- Admin self-service to add/remove peer-registry brands from front-of-app excluded.
- Third-bracket-type for serviced apartments / condotels excluded.
- Markup-factor representation choice excluded (deferred to whichever future task populates the markup table).
- Per-run cost/pricing dashboards for the Specialist excluded — Costantino monitors success/failure only.
- Property-classifier ML model excluded.

### Deferred to Follow-Up Work

- **Phase C teardown** (separate plan): retire the legacy property-level derivation path once the dual-run diff log produces stable, explainable diffs.
- **Per-Mgmt-Co override UI on front-of-app for non-admin users**: F3 in this plan ships the API + admin-side trigger; if the front-of-app surface needs a different UX shape (e.g. Mgmt Co user clicks Analyst from the company assumptions page), confirm against the eventual multi-tenant Mgmt Co rollout and ship as a follow-up. U6 ships the admin-side flow; the front-of-app component is in scope only to the extent that the existing Mgmt Co assumptions page already renders bracket-mix today.

---

## Context & Research

### Relevant Code and Patterns

- **Bracket-mix storage:** `lib/db/src/schema/config.ts` line 97 (`globalAssumptions = pgTable("global_assumptions", …)`), `bracket_mix jsonb` column on that table per migration `0057_icp_bracket_mix` (`artifacts/api-server/src/migrations/migration-guards.json:232`). Type lives at `lib/db/src/schema/types/jsonb-shapes.ts` line 222 (`BracketMixData`). `globalAssumptions` is the Mgmt Co's company-wide assumptions table (holds `companyTaxRate`, `costOfEquity`, `bracketMix`, etc.) — in the current single-tenant shape it IS the Mgmt Co row.
- **Engine consumer:** `lib/engine/src/company/company-engine.ts` lines 59, 78–178 (reads `bracketMix` + `brackets`, drives `computeServiceConsumptionScalars`); `lib/engine/src/company/bracket-service-consumption.ts` (deterministic STR/hotel scalar math); `lib/engine/src/helpers/normalize-bracket-mix.ts` (shape normalization). **CLAUDE.md §156 restricts financial-engine edits to the shell CC session** — see Risks below.
- **Phase A peer registry:** `docs/brainstorms/icp-simplification/requirements.md` and the brainstorm progress notes reference `icp_peer_companies` (16 brands seeded with `niche_tags`, `is_active`, `source_url`, `last_researched_at`) but the schema is **not present on `feat/coderabbit-loop-clean`** at planning time — confirm the Phase A merge is in the implementation branch before U1 runs (see Open Questions → Resolved During Planning).
- **Minion pattern (deterministic helper):** `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts` (Renato) and `artifacts/api-server/src/ai/ambient/minions/vendor-passthrough-costs.ts` (Gaetano) — single-file modules exporting a `MinionResult`, gracefully skip when API key absent, idempotent upsert.
- **Specialist pattern (LLM agent across surfaces):** No `ai/ambient/specialists/` dir exists today; specialists currently route through `artifacts/api-server/src/ai/specialist-llm-resolver.ts` for model selection. U3 creates the directory and slots Tiago in alongside that resolver.
- **Grounded research:** `artifacts/api-server/src/services/GroundedResearchService.ts` (Tavily wiring) — Tiago's only external dependency.
- **Source registry (Costantino's surface):** `artifacts/api-server/src/seeds/source-registry.ts` — per-source rows with `serviceKey`, `category`, `endpoint`, `apiKeyRef`, `rateLimitPerMin`, `isActive`, `description`. Costantino reads this to know what to probe; U7 adds per-peer freshness config to the existing admin_resources / source-registry shape (no inline literals).
- **Reserved agent name list:** `slide-factory` SKILL.md and `CLAUDE.md` § 10. Used: Marco, Lorenzo, Sofia, Bianca, Chiara, Dario, Elisa, Felix, Lucca, Maya, Aldo, Bruno, Carlo, Dino, Enzo, Franco, Gaetano, Renato, Ana, Bia, Cecília, Daniela, Eloá, Fernanda, Giovanna, Helena, Isabela, Júlia, Larissa, Fabio. Excluded: Sergio, Milton.

### Institutional Learnings

- **Migration guards required.** Per `replit.md` §Gotchas and `docs/runbooks/schema-migrations.md`, every new migration needs a `migration-guards.json` entry; the U1 / U2 migrations follow the existing 0056 / 0057 guarded-DDL pattern.
- **Number-taxonomy / no-magic-numbers rule** (CLAUDE.md §1, `no-magic-numbers` skill): Costantino's freshness threshold + cadence (R13) come from DB config rows, not TypeScript literals. The cold-start equal-weight value (R4) is computed from `1 / activeBrackets.length` — a derived constant, not a literal.
- **Agent parity is mandatory** (CLAUDE.md §7, `parity-audit` skill): every UI mutation introduced in U6 must have a matching Rebecca tool registered before merge.
- **Admin / front-of-app isolation** (`hplus-admin-nav-ia` and `front-of-app-admin-isolation` skills): the peer registry, Evidence panel, per-peer Analyst, global Analyst all live under `Admin → AI → Intelligence → Knowledge & Resources`; no peer-list / Tables / APIs surface leaks to the front of the app. The front-of-app Mgmt Co bracket-mix card (R15) shows only the active value, the override indicator, the provisional badge, and the company-scoped Analyst button.
- **Range-quality contract** (the `analyst-intelligence-display` SUPERSEDING block, 2026-05-11): the bracket-mix card on R15's surface uses Fabio's range-quality dot for any displayed weight, and "out of range" chips per the new contract — not the deprecated `Outside suggested range · ● Med` composition.

### External References

- None — the work uses existing internal services (`GroundedResearchService`, `specialist-llm-resolver`, source-registry/admin-resources, Costantino) and is well-patterned in repo. No external docs research warranted (per ce-plan §1.2 "Skip when local patterns are strong").

---

## Key Technical Decisions

- **Override storage = a new `bracket_mix_override_run_id integer` (nullable FK to `bracket_mix_runs`) on `global_assumptions`, while the existing `bracket_mix jsonb` column carries the *effective* value (override if set, otherwise mirror of global default).** Resolves R7 deferred-to-planning. Rationale: the existing column already feeds the engine — moving the read path would touch `lib/engine/src/company/company-engine.ts`, which CLAUDE.md §156 restricts. Sentinel column makes "is overridden?" cheap and deletable. The "global default" value (the aggregator's pure output) is stored separately in a new `bracket_mix_runs` row tagged `target_kind='global_default'`, so override-clear can re-mirror the latest one without re-running the aggregator.
- **Provenance lives in a separate `bracket_mix_runs` audit table, not embedded JSONB on the peer row.** Resolves R10 deferred-to-planning. Embedded JSONB loses history (Costantino re-runs would overwrite); separate table preserves audit trail and is the natural FK target for both `peer_id` and `global_assumptions.bracket_mix_override_run_id`.
- **Dual-run diff log is a new `bracket_mix_dual_run_diffs` table.** Resolves R11 deferred-to-planning. Extending an existing audit table would couple the Phase B / legacy comparison to unrelated audit semantics; a dedicated 2-row-per-recompute log is purpose-built and cheap to drop in Phase C teardown.
- **Specialist name = Tiago; aggregator minion name = Hugo.** Resolves R5 deferred-to-planning. Both Brazilian/Italian first names, both unused in the SKILL.md roster, neither on the reserved-exclusion list (Sergio, Milton). Specialist single-name (no `Name-NN`) per slide-factory specialist convention.
- **Costantino freshness threshold + cadence default = 90 days stale / weekly recheck, stored as a per-peer `costantino_config` jsonb on the peer row OR on the existing source-registry/admin-resources row for `icp_peer_companies`.** Resolves R13 deferred-to-planning. 90 days matches the existing 90-day rolling usage log (`replit.md` K&R contract entry); weekly cadence keeps Tavily call volume bounded (~16 peers / week).
- **Feature flag default at merge time = on in dev + staging, off in prod.** Resolves R12 deferred-to-planning. Lets the dual-run diff log accumulate data in lower environments before the prod flip; matches CLAUDE.md plan-verification posture.
- **Four Rebecca tools, registered in the parity map:** `regenerate_global_bracket_mix`, `refresh_peer_bracket_mix`, `set_company_bracket_mix_override`, `clear_company_bracket_mix_override`. Resolves R17 deferred-to-planning. Names mirror the four admin / Mgmt-Co UI actions added in U6 (per the `parity-audit` skill's "every UI mutation has a tool" rule).
- **Cold-start equal-weight is computed at aggregator-call time, not stored.** Keeps R4's "provisional" semantics honest: zero researched peers → no row written → `effectiveBracketMix()` derives `1 / activeBrackets.length` per slug at read time and tags the result `provisional: true`. First successful per-peer run flips the next aggregate to a stored value.

---

## Open Questions

### Resolved During Planning

- **Q: Where does Phase A's `icp_peer_companies` schema live, and is it on this branch?** Resolution: Phase A merged to `main` previously per session progress notes; the schema and seed are not present on `feat/coderabbit-loop-clean` at plan-write time. Implementation runs on a branch that contains Phase A — implementer rebases / merges Phase A in before U1.
- **Q: Is `globalAssumptions` per-Mgmt-Co or singleton?** Resolution: in the current single-tenant shape it holds the Mgmt Co's company-wide defaults (`companyTaxRate`, `costOfEquity`, `bracketMix`). Phase B treats it as the Mgmt Co row for the override store. If multi-tenancy lands later, the override columns scale with the table.
- **Q: Does the Specialist need a new model-resolver entry, or does it route through `specialist-llm-resolver.ts`?** Resolution: routes through the existing resolver — Tiago is a Specialist (per `slide-factory` taxonomy) and inherits model selection from the same surface as Lucca and Maya. No new resolver code.
- **Q: Where do the Costantino freshness defaults live?** Resolution: per-peer `costantino_config` jsonb on the peer row, with a fallback default in the source-registry / admin-resources entry for `icp_peer_companies` (so all peers inherit the same 90-day / weekly settings unless overridden per peer).

### Deferred to Implementation

- Final SQL column types and exact migration body for the new tables and columns — implementer follows the 0056 / 0057 guarded-DO pattern verbatim.
- Exact Tavily query template Tiago uses per peer / per Mgmt-Co comp set — depends on what the live Tavily endpoint returns for hospitality brand queries; iterate at implementation time.
- Whether Hugo's aggregation needs to round-trip through `normalize-bracket-mix.ts` or can write `BracketMixData` directly — depends on whether the engine's normalize path is idempotent on already-normalized input (likely yes, but verify).
- The exact threshold under which the dual-run diff is "explainable" enough to flip the prod flag on — operator judgment after first cycle of data.

---

## Implementation Units

- U1. **Extend Phase A peer registry with Specialist output columns**

**Goal:** Add the columns Tiago writes to per peer row.

**Requirements:** R1, R10.

**Dependencies:** Phase A (`icp_peer_companies` table exists in the implementation branch).

**Files:**
- Modify: `lib/db/src/schema/icp-peer-companies.ts` (add `brand_archetype_split jsonb`, `roster_size_estimate integer`, `split_evidence jsonb`, `last_research_run_id integer`, `costantino_config jsonb` — all nullable).
- Create: `artifacts/api-server/src/migrations/icp-peer-companies-002.ts` (guarded `ADD COLUMN IF NOT EXISTS` block matching the 0057 pattern).
- Modify: `artifacts/api-server/src/migrations/migration-guards.json` (new entry for the migration).
- Test: `lib/db/src/schema/__tests__/icp-peer-companies.schema.test.ts` (verify Drizzle types compile, columns nullable).

**Approach:**
- Mirror the 0057 guarded-DDL shape: single `DO` block, `ADD COLUMN IF NOT EXISTS` for each column, idempotent across re-runs.
- `brand_archetype_split` and `split_evidence` typed via new shapes in `lib/db/src/schema/types/jsonb-shapes.ts` (Specialist output schema).

**Patterns to follow:** `artifacts/api-server/src/migrations/icp-brackets-001.ts` (guarded ADD COLUMN); `lib/db/src/schema/types/jsonb-shapes.ts` (BracketMixData entry).

**Test scenarios:**
- Happy path: schema TypeScript compiles after new columns added; existing seed rows remain valid.
- Edge case: re-running the migration is a no-op (verify by running guard script twice).

**Verification:**
- `pnpm --filter @workspace/scripts run check:migration-guards` passes with the new entry.
- `pnpm --filter @workspace/scripts run check:schema-drift` passes.
- Drizzle types include the new columns and they are typed as nullable.

---

- U2. **Add provenance + diff-log tables + override sentinel column**

**Goal:** Persist Specialist run history, dual-run comparisons, and the override-active flag.

**Requirements:** R10, R11, R7.

**Dependencies:** U1.

**Files:**
- Create: `lib/db/src/schema/bracket-mix-runs.ts` (new `bracket_mix_runs` table — `id`, `target_kind text` ('peer' | 'company' | 'global_default'), `target_id integer nullable`, `model text`, `sources jsonb`, `mix_value jsonb`, `roster_size_estimate integer nullable`, `run_at timestamp`, `provisional boolean`).
- Create: `lib/db/src/schema/bracket-mix-dual-run-diffs.ts` (new `bracket_mix_dual_run_diffs` table — `id`, `recompute_at timestamp`, `phase_b_mix jsonb`, `legacy_mix jsonb`, `phase_b_run_id integer FK bracket_mix_runs`, `notes text nullable`).
- Modify: `lib/db/src/schema/config.ts` (add `bracket_mix_override_run_id integer nullable FK bracket_mix_runs.id` to `globalAssumptions`).
- Create: `artifacts/api-server/src/migrations/bracket-mix-runs-001.ts` (guarded `CREATE TABLE IF NOT EXISTS` for both tables + `ADD COLUMN IF NOT EXISTS` for the override FK).
- Modify: `artifacts/api-server/src/migrations/migration-guards.json` (new entry).
- Test: `artifacts/api-server/src/__tests__/bracket-mix-runs.schema.test.ts` (FK shape, JSONB shapes round-trip).

**Approach:**
- Two narrow tables, no shared rows. `bracket_mix_runs` is the FK target for `peer.last_research_run_id`, `globalAssumptions.bracket_mix_override_run_id`, and `bracket_mix_dual_run_diffs.phase_b_run_id`.
- `target_kind` discriminator avoids a join-table; when `target_kind='global_default'`, `target_id IS NULL`.

**Patterns to follow:** `lib/db/src/schema/icp-data.ts` (jsonb + uniqueIndex pattern).

**Test scenarios:**
- Happy path: insert a `peer` run, FK from `icp_peer_companies.last_research_run_id` resolves it.
- Happy path: insert a `global_default` run with `target_id NULL`, FK from `globalAssumptions.bracket_mix_override_run_id` resolves it.
- Edge case: dropping a referenced run is blocked by FK (override row keeps integrity).
- Edge case: re-running the migration is a no-op.

**Verification:**
- Migration-guards + schema-drift checks pass.
- FK constraints enforced in DB.

---

- U3. **Tiago — Bracket-Mix Specialist (single-pass per target)**

**Goal:** Run grounded research per peer or per Mgmt-Co comp set, emit one archetype split + roster estimate + sample + citations, write a `bracket_mix_runs` row, update the target's `last_research_run_id`.

**Requirements:** R1, R2, R5, R10. Covers F1, F3.

**Dependencies:** U1, U2.

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/specialists/tiago.ts` (new directory + module — Specialist that calls `GroundedResearchService` once per target).
- Create: `artifacts/api-server/src/ai/ambient/specialists/index.ts` (barrel; allows future Specialists to slot in alongside).
- Create: `artifacts/api-server/src/ai/ambient/specialists/__tests__/tiago.test.ts`.

**Approach:**
- One Tiago module, two entry points: `runForPeer(peerId)` and `runForCompanyOverride(companyId, compSetSlugs[])`. Both produce the same `BracketMixSpecialistOutput` shape.
- Routes model selection through `artifacts/api-server/src/ai/specialist-llm-resolver.ts` (no new resolver code per Open Questions / Resolved).
- Carlo-style schema validation on LLM output (Zod) before persisting — reject malformed output, log + return `MinionResult`-shaped failure.
- Persists the run as a `bracket_mix_runs` row before updating the target's `last_research_run_id` (atomic, transactional).

**Patterns to follow:** `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts` (Renato — module shape, MinionResult, graceful skip on missing key); Lucca's drafter for citation-discipline reference.

**Test scenarios:**
- Happy path: peer run produces a normalized split summing to 1.0, writes one `bracket_mix_runs` row, updates `last_research_run_id`.
- Happy path: company-override run produces a complete split for that comp set, writes one `bracket_mix_runs` row, returns a run id consumable by U6's override-set endpoint.
- Edge case: malformed LLM output → no DB row written, returns `MinionResult` failure, logs Carlo-style validation error.
- Error path: Tavily unavailable → returns failure cleanly; previous `last_research_run_id` is preserved.
- Integration: split-weights normalization round-trips through `lib/engine/src/helpers/normalize-bracket-mix.ts` without distortion.

**Verification:**
- Tiago can be invoked from a script with a peer id and produces a row in `bracket_mix_runs`; the peer's `brand_archetype_split` is populated and weights sum to 1.0 (within float tolerance).

---

- U4. **Hugo — Aggregator Minion (deterministic global default)**

**Goal:** Combine all active peers' `brand_archetype_split` rows weighted by `roster_size_estimate` into one normalized `BracketMixData`; on cold start (no researched peers) emit equal-weight; write one `bracket_mix_runs` row tagged `target_kind='global_default'`.

**Requirements:** R3, R4, R6.

**Dependencies:** U2 (writes `bracket_mix_runs`); U1 (reads peer columns).

**Files:**
- Create: `artifacts/api-server/src/ai/ambient/minions/hugo.ts`.
- Create: `artifacts/api-server/src/ai/ambient/minions/__tests__/hugo.test.ts`.

**Approach:**
- Pure deterministic function: `aggregate(peers: PeerRow[], activeBrackets: BracketRow[]) → { mix: BracketMixData; provisional: boolean }`. No LLM, no IO except the final `bracket_mix_runs` insert (which the caller can opt out of for dry-run).
- Cold start: when zero peers have a non-null `brand_archetype_split`, return `{ mix: equalWeight(activeBrackets), provisional: true }` and **do not** write a runs row (R4 — provisional state is computed at read time, not stored).
- Normal path: weight each peer's split by its `roster_size_estimate`, sum across slugs, normalize so total weight = 1.0, emit `BracketMixData`.
- Idempotency: same input set → byte-identical output (ordered slug iteration, deterministic float reduction).

**Patterns to follow:** `lib/engine/src/company/bracket-service-consumption.ts` (deterministic math, no judgment); `lib/engine/src/helpers/normalize-bracket-mix.ts` (BracketMixData shape).

**Test scenarios:**
- Covers AE4. Happy path: same peer-split input twice → byte-identical output (`expect(JSON.stringify(a)).toBe(JSON.stringify(b))`).
- Covers AE1. Edge case: zero active peers with non-null split → equal-weight mix across active brackets, `provisional: true`, no row written.
- Edge case: one peer with split, others null → weighted result equals that peer's split (within float tolerance).
- Edge case: `roster_size_estimate` of 0 on a peer → that peer contributes zero weight.
- Edge case: brackets in peers' splits that are not in `activeBrackets` → silently ignored (R3 deterministic skip).
- Integration: weights normalize to 1.0 across `activeBrackets.slug`.

**Verification:**
- `test:calc` passes; Hugo's output passes through `normalize-bracket-mix.ts` unchanged.

---

- U5. **Dual-run global recompute orchestrator + feature flag**

**Goal:** When global recompute fires (per F2), run Hugo AND the existing legacy property-level path; write one `bracket_mix_runs` row (Phase B value) and one `bracket_mix_dual_run_diffs` row (both values + recompute_at). Feature flag selects which value the engine reads.

**Requirements:** R6, R11, R12. Covers F2.

**Dependencies:** U4.

**Files:**
- Create: `artifacts/api-server/src/services/bracketMix/recomputeGlobalDefault.ts`.
- Create: `artifacts/api-server/src/services/bracketMix/featureFlag.ts` (reads `process.env.BRACKET_MIX_PHASE_B` with environment-aware defaults — on for dev/staging, off for prod).
- Create: `artifacts/api-server/src/services/bracketMix/__tests__/recomputeGlobalDefault.test.ts`.
- Modify: any existing global-recompute caller (legacy property-level path entry point) to invoke the new orchestrator instead.

**Approach:**
- Orchestrator: read all active peers → call Hugo → run legacy property-level path → insert `bracket_mix_runs` (target_kind='global_default') → insert `bracket_mix_dual_run_diffs` row referencing the run → IF flag on, write Hugo's mix to `globalAssumptions.bracket_mix` (only when no override is active); IF flag off, write legacy mix.
- Override-protect: when `globalAssumptions.bracket_mix_override_run_id IS NOT NULL`, skip the `bracket_mix` write (override wins per R9), still write the diff log so Mgmt Co users see the would-be value.
- Flag default: `BRACKET_MIX_PHASE_B = 'on'` in dev/staging, `'off'` in prod at merge time.

**Execution note:** Test-first for the dual-run write path — start from a failing test that asserts both `bracket_mix_runs` and `bracket_mix_dual_run_diffs` rows are produced per recompute.

**Patterns to follow:** Existing global-recompute trigger (find via `rg "globalAssumptions.*update.*bracketMix"` at implementation time); per `replit-independence` skill, env var read goes through a typed config layer, not raw `process.env`.

**Test scenarios:**
- Covers AE5. Happy path: flag on, no override → recompute writes `bracket_mix_runs` (Phase B) + `bracket_mix_dual_run_diffs` (both values) + updates `globalAssumptions.bracket_mix` to Hugo's value.
- Covers AE2. Happy path: flag on, override active → recompute writes runs row + diff log row, but does NOT touch `globalAssumptions.bracket_mix`.
- Happy path: flag off → diff log still written; `globalAssumptions.bracket_mix` updated to legacy value.
- Error path: legacy path throws → Phase B side still completes; diff log row records `legacy_mix = null` with notes; no double-write.
- Integration: recompute triggered by U7's Costantino fan-out (peer freshness probe queues stale peers, then global recompute fires) produces exactly one diff log row per recompute event.

**Verification:**
- After one recompute: `bracket_mix_runs` has one new `target_kind='global_default'` row; `bracket_mix_dual_run_diffs` has one new row referencing that run; `globalAssumptions.bracket_mix` reflects the flag-selected value.

---

- U6. **Effective-mix read path, API routes, K&R card update, front-of-app surface, Rebecca tools**

**Goal:** Wire the override + provisional semantics end-to-end: an `effectiveBracketMix(companyId)` read function, four API routes (peer refresh, global recompute, override set, override clear), K&R card with per-peer Evidence panel + global Analyst, front-of-app Mgmt Co bracket-mix card with override indicator + provisional badge + per-company Analyst, and four Rebecca tools registered in the parity map.

**Requirements:** R7, R8, R9, R14, R15, R16, R17. Covers F3, F4, F5.

**Dependencies:** U3, U5.

**Files:**
- Create: `artifacts/api-server/src/services/bracketMix/effective.ts` (`effectiveBracketMix(companyId): { mix; source: 'override' | 'global'; provisional: boolean }`).
- Create: `artifacts/api-server/src/routes/admin/bracket-mix.ts` (POST `/api/admin/icp/peers/:id/refresh`, POST `/api/admin/icp/bracket-mix/global/regenerate`).
- Create: `artifacts/api-server/src/routes/companies/bracket-mix-override.ts` (POST `/api/companies/:id/bracket-mix/override`, DELETE `/api/companies/:id/bracket-mix/override`).
- Modify: `artifacts/api-server/src/openapi/spec.ts` (or equivalent api-spec entry) to register the four new endpoints with Zod schemas — codegen reruns will regenerate React Query hooks per `pnpm-workspace` skill.
- Create: `artifacts/api-server/src/ai/rebecca/tools/bracket-mix.ts` (four tool definitions).
- Modify: Rebecca tool registration index (find via `rg "rebecca.*tool.*register" artifacts/api-server/src/ai/`).
- Modify: parity map JSON (`rg "parity"` at implementation time — confirm the file location with the `parity-audit` skill).
- Create or Modify: K&R per-peer card component under `artifacts/hospitality-business-portal/src/components/admin/knowledge-resources/` (per-peer Analyst button, Evidence panel showing `bracket_mix_runs` for that peer + roster size + citations).
- Create or Modify: front-of-app Mgmt Co bracket-mix card (per `analyst-intelligence-display` SUPERSEDING block — Fabio range-quality dot + "out of range" chip, override-vs-default indicator, provisional badge, per-company Analyst button).
- Test: `artifacts/api-server/src/services/bracketMix/__tests__/effective.test.ts`, `artifacts/api-server/src/routes/admin/__tests__/bracket-mix.test.ts`, `artifacts/api-server/src/routes/companies/__tests__/bracket-mix-override.test.ts`, `artifacts/api-server/src/ai/rebecca/tools/__tests__/bracket-mix-parity.test.ts`.

**Approach:**
- `effectiveBracketMix(companyId)`: reads `globalAssumptions.bracket_mix_override_run_id`; if non-null, reads that run's `mix_value` and returns `source: 'override'`; if null, reads the latest `bracket_mix_runs` row with `target_kind='global_default'`; if no such row, computes equal-weight via Hugo's helper and returns `provisional: true`.
- Override set: U3's company-override Tiago run produces a `bracket_mix_runs` row id; the route writes that id to `globalAssumptions.bracket_mix_override_run_id` and mirrors `mix_value` to `globalAssumptions.bracket_mix`.
- Override clear: sets `bracket_mix_override_run_id` to NULL; mirrors the latest `target_kind='global_default'` run's `mix_value` to `globalAssumptions.bracket_mix` so the engine read path stays consistent.
- Rebecca tools mirror the four routes; parity map test asserts every UI mutation has a tool entry.

**Patterns to follow:** `analyst-research-buttons` skill (canonical Analyst affordance shape), `analyst-intelligence-display` SUPERSEDING block (range-quality dot + "out of range" chip + Fabio integration), `front-of-app-admin-isolation` skill (no Tables/APIs cards on front-of-app).

**Test scenarios:**
- Covers AE2. Happy path: company with non-null override; trigger global recompute; assert `effectiveBracketMix(companyId).source === 'override'` and the value is unchanged.
- Covers AE3. Happy path: clear override; assert `effectiveBracketMix(companyId).source === 'global'` and the value equals the current `target_kind='global_default'` run's `mix_value` verbatim.
- Covers AE1. Happy path: fresh DB, no peers researched; `effectiveBracketMix(companyId)` returns equal-weight + `provisional: true`.
- Error path: setting an override to a `bracket_mix_runs` id whose `target_kind` is not `'company'` is rejected (400).
- Integration: invoking `regenerate_global_bracket_mix` Rebecca tool produces the same `bracket_mix_runs` + `bracket_mix_dual_run_diffs` rows as the admin K&R button.
- Integration: parity map test fails the build if a new mutation route is added in U6 without a matching Rebecca tool (regression-protects R17).

**Verification:**
- All four routes return shape-validated responses (Zod-checked).
- K&R card renders Evidence for at least one peer with `last_research_run_id` populated; front-of-app card shows correct override / provisional badge across the three scenarios above.
- `parity-audit` skill's check passes.

---

- U7. **Costantino per-peer freshness probe**

**Goal:** Costantino reads `icp_peer_companies` rows on its existing audit cadence, opens a finding when `last_researched_at` is older than the configured threshold, and queues the peer for re-research (which fires Tiago via U3's `runForPeer`).

**Requirements:** R13. Covers AE6.

**Dependencies:** U3.

**Files:**
- Modify: existing Costantino runner (per `costantino-data-custodian` skill — find via `rg "costantino" artifacts/api-server/src/`).
- Modify: `artifacts/api-server/src/seeds/source-registry.ts` or `artifacts/api-server/src/seeds/admin-resources.ts` to register `icp_peer_companies` as a probed resource with default `staleAfterDays: 90`, `recheckCadence: 'weekly'` config (no inline literals — config rows in DB).
- Create: `artifacts/api-server/src/ai/ambient/costantino/__tests__/icp-peers-probe.test.ts`.

**Approach:**
- Probe checks each active peer's `last_researched_at`; rows older than `staleAfterDays` open a `costantino_findings` row tagged `kind='peer_research_stale'`.
- Queueing fan-out is async — the probe itself only opens findings; a separate worker (or admin button) drains the queue by invoking `runForPeer`.
- Per-peer `costantino_config` jsonb (from U1) overrides the default; absence of override means use the source-registry defaults.

**Patterns to follow:** existing Costantino probes per `costantino-data-custodian` skill.

**Test scenarios:**
- Covers AE6. Happy path: peer with `last_researched_at` > 90 days old → probe opens one `costantino_findings` row tagged `peer_research_stale`.
- Happy path: peer with `last_researched_at` within 90 days → no finding row.
- Edge case: peer with `last_researched_at IS NULL` → opens a finding (cold-start should be probed too).
- Edge case: peer with override `costantino_config.staleAfterDays = 30` → probe uses 30 days, not 90.
- Edge case: re-running the probe with an existing open finding for that peer does not duplicate the finding.

**Verification:**
- Costantino's existing audit cycle picks up the peer probe without code changes to its scheduler.
- Findings appear in the Costantino admin surface with correct kind + peer reference.

---

## System-Wide Impact

- **Interaction graph:** new global-recompute orchestrator (U5) replaces the existing recompute call site; the engine read path (`company-engine.ts:93` `bracketMix?` parameter) is unchanged because U6's `effectiveBracketMix` writes to the same `globalAssumptions.bracket_mix` column the engine already reads. **CLAUDE.md §156 boundary:** if implementation reveals that the engine read needs to differentiate `source: 'override' | 'global' | 'provisional'` (e.g., for the front-of-app card to show provenance), that change touches `lib/engine/src/company/` and must be authored from the shell CC session, not Replit Agent. Plan-time judgment: U6's `effectiveBracketMix` lives in `artifacts/api-server/src/services/`, *outside* the engine, and reads metadata from `bracket_mix_runs` separately — engine-read stays unchanged.
- **Error propagation:** Tavily failure (Tiago) → returns `MinionResult` failure → orchestrator (U5) still runs legacy path → diff log records `phase_b_mix = null` with notes → engine reads continue from current `globalAssumptions.bracket_mix`. No user-visible degradation.
- **State lifecycle risks:** override-clear must mirror the latest global default into `globalAssumptions.bracket_mix` (not just NULL the FK), or the engine reads stale override value. U6 enforces this in the clear endpoint and the test scenarios cover it.
- **API surface parity:** R17 mandates four Rebecca tools matching the four new mutation routes. The parity map test (U6) enforces this at build time.
- **Integration coverage:** the dual-run diff log (U5) is the cross-layer integration check that legacy and Phase B paths produce comparable values. Unit tests on Hugo + the legacy path alone would not surface drift between them — the diff log is the design artifact that does.
- **Unchanged invariants:** `lib/engine/src/company/company-engine.ts` (engine read path); `lib/engine/src/company/bracket-service-consumption.ts` (STR/hotel scalar math); `lib/engine/src/helpers/normalize-bracket-mix.ts` (shape normalization); the four legacy ICP client pages. The plan explicitly does not change these — engine still reads `globalAssumptions.bracket_mix`, the new pipeline writes to that same column.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| **CLAUDE.md §156 — financial-engine edits restricted to shell CC session.** If U5/U6 implementation reveals that `lib/engine/src/company/` must change (engine read needs `source` metadata, or Hugo's output shape requires engine-side normalization), Replit Agent cannot land it. | Plan deliberately keeps `effectiveBracketMix` in `artifacts/api-server/src/services/` and writes Hugo output to the existing `globalAssumptions.bracket_mix` column the engine already reads. If implementation reveals a true engine touch is needed, surface it as a separate CC-only sub-task and pause Replit Agent's portion. |
| **Phase A schema not on `feat/coderabbit-loop-clean`.** U1 assumes `icp_peer_companies` exists. | Implementer rebases/merges Phase A in before U1; verify with `rg "icp_peer_companies" lib/db/src/schema/` before starting. |
| **Tavily call volume spike during global recompute.** ~16 grounded calls per recompute + ad-hoc override runs could hit rate limits. | Hugo aggregator does not call Tavily — only Tiago does, and Tiago's per-peer fan-out is queued (not parallel-dispatched). Costantino's weekly cadence per peer keeps steady-state calls under existing `rateLimitPerMin: 60` for Tavily (`source-registry.ts:tavily`). |
| **Override-clear inconsistency.** If override is cleared but `globalAssumptions.bracket_mix` is not re-mirrored, the engine reads a stale override forever. | U6's clear endpoint explicitly mirrors the latest global default; test scenario covers this; override-clear is a single transactional write. |
| **Dual-run diff log growth.** ~one row per recompute + ~one per peer; over months, table grows. | No retention policy in v1 (per origin: "no alert thresholds in v1"); Phase C teardown will retire the diff log entirely. |
| **Specialist name collision risk over time.** Tiago / Hugo are unused today but the slide-factory roster grows. | Names are documented in `slide-factory` SKILL.md as part of U3/U4's shipping checklist; reserved-list hygiene is the standing skill rule. |

---

## Documentation / Operational Notes

- Update `slide-factory` SKILL.md roster to include Tiago (Specialist) and Hugo (minion) when U3/U4 land.
- Update `replit.md` Recent Significant Changes block (≤ 3 entries; remove oldest) when the Phase B feature flag flips on in prod.
- Costantino's `costantino-data-custodian` skill SKILL.md gains an entry for the `peer_research_stale` finding kind when U7 lands.
- Feature flag rollout runbook: dev/staging on at merge → operator reviews `bracket_mix_dual_run_diffs` for one full recompute cycle → flip prod via env var, no code change required.
- `parity-audit` map entry added in U6 for the four Rebecca tools — covered by the U6 parity test.

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-05-13-icp-bracket-mix-peer-derived-phase-b-requirements.md](../../docs/brainstorms/2026-05-13-icp-bracket-mix-peer-derived-phase-b-requirements.md)
- **Prior brainstorm (broader ICP simplification):** `docs/brainstorms/icp-simplification/requirements.md`
- **Phase A migration guards:** `artifacts/api-server/src/migrations/migration-guards.json` entries `0056_icp_bracket_catalog`, `0057_icp_bracket_mix`.
- **Engine consumer:** `lib/engine/src/company/company-engine.ts`, `lib/engine/src/company/bracket-service-consumption.ts`, `lib/engine/src/helpers/normalize-bracket-mix.ts`.
- **Storage:** `lib/db/src/schema/config.ts:97` (`globalAssumptions`), `lib/db/src/schema/types/jsonb-shapes.ts:222` (`BracketMixData`).
- **Specialist / minion patterns:** `artifacts/api-server/src/ai/ambient/minions/mgmt-co-markup-factors.ts` (Renato), `artifacts/api-server/src/ai/specialist-llm-resolver.ts`, `artifacts/api-server/src/services/GroundedResearchService.ts`.
- **Costantino:** `costantino-data-custodian` skill, `artifacts/api-server/src/seeds/source-registry.ts`.
- **Skills referenced:** `slide-factory`, `parity-audit`, `analyst-research-buttons`, `analyst-intelligence-display`, `front-of-app-admin-isolation`, `hplus-admin-nav-ia`, `replit-independence`, `pnpm-workspace`, `no-magic-numbers`, `costantino-data-custodian`.
- **Inviolable boundary:** `CLAUDE.md` §156 (financial-engine authoring restriction).
