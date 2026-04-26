# Phase G1 — Funding (A) Tier-1 graduation

> First execution of the ADR-007 graduation pattern. Lifts `mgmt-co.funding` from a deterministic watchdog wrapper to a Tier-1 N+1 cognitive Specialist conforming to `.claude/rules/specialist-intelligence-bar.md`. Pattern proven here teaches G2-G6.

---

## Title

`Phase G1: Funding Tier-1 Graduation`

## Doctrine Freeze Gate Check

- **Governing ADR:** [ADR-007](../../docs/architecture/decisions/ADR-007-specialist-tier1-graduation.md) — Specialist Tier-1 Graduation
- **ADR status:** **Accepted** (2026-04-26)
- **Last ADR edit:** 2026-04-26 (acceptance flip + ricardo's amendments in `fbb7429d`)
- **Sessions stable:** Doctrine ratified same session as packet authoring; explicit gate-cross by directive author per `claude-replit-split.md` Revision history pattern. Phase 5B v2 dependency landed clean (`24853904`) before this packet opens — that's the actual stability signal that matters.
- **Gate decision:** ✅ Cleared to execute (CC owns engine work per the 2026-04-26 research/intelligence lane).

## Context (≤200 words)

Today, `engine/analyst/surface/mgmt-co/funding-specialist.ts` is a Phase 3b watchdog wrapper around `evaluateCapitalRaise` — pure deterministic, five hard-coded dimensions, single benchmark evidence per dimension, no comparables, no live API, no `cognitiveRunId`. It does not clear `.claude/rules/specialist-intelligence-bar.md`.

This packet replaces the evaluator body with the §1 Tier-1 skeleton: required-fields gate → context assembly → cache read via `consultCognitive()` (the seam shipped Phase 5B v2 in `24853904`) → on MISS invoke the cognitive orchestrator → quality-check + bounded regress → `buildAnalystVerdict()`. The legacy `evaluateCapitalRaise` stays as the **fallback path** when Tier-1 fails (vendor outage, rate-limit, orchestrator throw) — visibly degraded per ADR-007 §3 so users can tell the difference.

Phase 5B v2 (`engine/analyst/cognitive/engine-client.ts` `consultCognitive` + `verdict-reconstructor.ts`) is the unblocking dependency and shipped clean. Phase 5C (write-after persistence on cache MISS) is **Replit-owned** and not part of this packet — G1 returns the freshly-orchestrated verdict directly without persisting; persistence lights up when 5C lands.

Cross-skill: `.claude/skills/analyst/_index.md`, `.claude/skills/research/SKILL.md` (N+1 orchestrator), `.claude/skills/resources/SKILL.md` (assignmentRef contract).

## Atomic-budget check

- **Sub-step count:** 6 (= max)
- **Source file count:** 3 (prompt-input-builder NEW, funding-specialist.ts REPLACE body, specialist-catalog.ts EDIT entry) — tests + golden bench live in their own files but count as one verification domain per `_TEMPLATE.md`.
- **Capability domains touched:** `route` (engine/analyst is route-equivalent in CC's lane) + `verification` = 2 (= max).

Within budget. No split required.

---

## Tasks

### S1 — Funding context-and-prompt-input builder (NEW file)

- **Files:**
  - NEW `server/ai/specialists/mgmt-co-funding-prompt-input-builder.ts` (estimated 220-280 LOC)
- **Change:**
  - Export `buildFundingPromptInput(ctx: FundingPromptInputContext): FundingPromptInput` — pure function. Assembles the structured input pack the Prompt Engineer LLM stage (per ADR-007 §1 step 2) consumes to engineer the multi-stage prompts. Pack contains: required-fields list (5 dimensions), portfolio aggregate (property count, total raise need, runway need), persona context (vertical slug, market tier, locale), prior verdicts (composition references — empty in G1's first run), Specialist intent string ("Funding raise sizing + tranche pacing + runway adequacy for management company capital stack").
  - Export `mapInputsToDimensionInputs(inputs: CapitalRaiseInputs): DimensionInput[]` — adapts the legacy `CapitalRaiseInputs` shape to the `DimensionInput[]` shape `consultCognitive` expects. One DimensionInput per known dimension key; userValue from inputs; isNumericField=true for all five.
  - Export `buildFundingCacheKey(args: { specialistId, fieldGroup, persona, ...inputsHashSeed }): VerdictCacheKey` — wraps `computeCacheKey` from `engine/analyst/cognitive/cache-keys.ts` with Funding-specific field-group taxonomy.
  - **What this file does NOT do:** call any LLM, hit any DB, or import from `server/`. Pure functions, importable from edge.
- **Affected dependency surfaces:** S-Analyst-Verdict, S-Cognitive-Cache
- **Cross-check invariants:**
  - Names referenced in prompt-input fields MUST match `candidateFields[].key` in `specialist-catalog.ts` (already locked: `runwayBufferMonths`, `sizingOvershootPct`, `trancheGapMonths`, `revenueRampDelayMonths`, `burnFlexDownPct`).
  - `DimensionInput.fieldKey` MUST round-trip: keys emitted here must match keys the reconstructor consumes (Phase 5B v2 contract).
  - Per `field-definitions-no-prescription-hints.md`: prompt-input descriptions name evidence sources, never typical ranges. No "typical 12-18 months runway" — let the cognitive panels reason from market.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] NEW `tests/analyst/specialists/funding-prompt-input.test.ts` passes (≥6 cases: pack-shape, dimensionInput-roundtrip, cache-key determinism, persona variance, intent string non-empty, no leakage of legacy `CapitalRaiseInputs` field names that aren't in the candidateFields list).
  - [ ] No new lint warnings.
- **Test impact:** NEW `tests/analyst/specialists/funding-prompt-input.test.ts`.
- **Rollback:** Revert the commit. No side effects.

### S2 — Cognitive wiring in funding-specialist.ts (REPLACE body)

- **Files:**
  - `engine/analyst/surface/mgmt-co/funding-specialist.ts` (REPLACE the `createFundingSpecialist` factory body; preserve the file's outer structure + types so the registry binding in `engine/analyst/surface/mgmt-co/index.ts` keeps working)
- **Change:** Implement the ADR-007 §1 10-step Tier-1 skeleton:
  1. **Required-fields gate** — already wrapped externally by `withRequiredFieldsGate()` (P6a). Specialist body assumes inputs are present.
  2. **Resolve context** — call `buildFundingPromptInput(ctx)` from S1.
  3. **Resolve cache key** — `buildFundingCacheKey(...)` from S1.
  4. **Cache read** — `consultCognitive(req, deps.engineClientDeps)` from `engine/analyst/cognitive/engine-client.ts`. On HIT → reconstructed `RawVerdictDimension[]` + `cognitiveRunId`; skip to step 8.
  5. **Cognitive run (N+1)** — `await deps.orchestrator.run(promptSet)`. Returns `{ cognitiveRunId, dimensions, evidence }`. **G1 stub:** `deps.orchestrator` is injected; integration with `server/ai/research-orchestrator.ts` lives in `server/ai/specialists/mgmt-co-funding-orchestrator-adapter.ts` (NEW, 1 file but counts as part of S2's "funding-specialist.ts replace" surface — adapter pattern keeps engine/ pure of server/ imports). The adapter wraps the existing orchestrator with the per-Specialist prompt-engineer stage.
  6. **Comparables fetch** — `await deps.comparablesFetcher.fetch("funding")` returns `ComparableRow[]`. G1 v1 fetcher returns canned data per ADR-007 §6 (LP-comp dataset stub); upgrade to live PitchBook/PrivateEquityInfo API in a follow-up.
  7. **Quality check + REGRESS** — convergence check (synthesis evidence ≥3, range-width-vs-conviction sanity, ADR-003 invariant compliance). On FAIL: regress via prompt-engineer with re-framed input (max 2 regresses per ADR-007 §1 line 7). On regress exhaustion: emit honest-fail verdict (`severity: "ok"`, `voice.intent: "developing-data"`, `range: null`).
  8. **Build verdict** — call `buildAnalystVerdict({ specialistId: "mgmt-co.funding", dimensions, evidence: [...synthesisEvidence, ...comparablesEvidence], comparables, meta: { cognitiveRunId, promptEngineerRunId, regressCount, vendorsUsed, fallbackReason: null } })`.
  9. **(Voice render is downstream — Surface Router handles, unchanged.)**

  **Fallback path** (steps 5/7 throw): catch the cognitive failure, log, **call legacy `evaluateCapitalRaise(inputs, benchmarks)` and adapt its output to RawVerdictDimension[] using the existing `buildDimensions()` helper kept inline**. Set `meta.fallbackReason: "tier1_unavailable"` and `tier: 0` on the SpecialistOutput. The voice renderer surfaces a "Tier-1 unavailable; showing best-effort intelligence" badge downstream — that wiring is Replit's slice when ready.

  Factory signature changes from `createFundingSpecialist(benchmarks, options)` to `createFundingSpecialist(benchmarks, options, deps?: FundingSpecialistDeps)` where `deps` is optional. **When `deps` is undefined the Specialist falls back to Tier-0 immediately** — preserves backward-compat for tests + the Phase 3b call sites until Replit wires `deps` from the route handler.

- **Affected dependency surfaces:** S-Analyst-Verdict, S-Cognitive-Cache, S-Analyst-Tier0-Fallback
- **Cross-check invariants:**
  - Pre-cross-check rule pairs from `.claude/rules/cross-check-invariants.md`: Specialist returns `SpecialistOutput` (not `WatchdogResult`) — that contract was set Phase 3b and is unchanged. The fallback path's adapter MUST emit the same `RawVerdictDimension[]` shape it does today (preserved verbatim from the existing `buildDimensions()` helper; do not refactor inline).
  - Per `engine→server` boundary: this file MUST NOT import from `server/`. The orchestrator adapter and comparables fetcher are injected via `deps`; their concrete impls live in `server/ai/specialists/`.
  - Per ADR-003: every non-ok numeric dimension has a range; range carries qualityScore ≥ CONVICTION_FLOOR; non-ok dimensions carry ≥3 evidence items. Phase 5B v2's reconstructor handles HIT-path; G1 must mirror those guarantees on MISS-path output.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] Existing `tests/analyst/funding-specialist.test.ts` (legacy Tier-0 wrapper test) still passes — backward compat preserved when `deps` is undefined.
  - [ ] NEW `tests/analyst/specialists/funding-tier1.test.ts` passes (≥10 cases): cache HIT path returns reconstructed dims; cache MISS path invokes stubbed orchestrator and returns its output; orchestrator throw → fallback to Tier-0 with `fallbackReason: "tier1_unavailable"` + `tier: 0`; required-fields-gate empty payload → still goes through fallback path (defensive); regress loop bounded at 2; honest-fail emits `severity: "ok"` + `intent: "developing-data"` when regresses exhaust.
- **Test impact:** NEW `tests/analyst/specialists/funding-tier1.test.ts`. NEW `tests/analyst/specialists/funding-orchestrator-adapter.test.ts` (small — exercises the prompt-engineer stage stub).
- **Rollback:** Revert the commit; the legacy `createFundingSpecialist(benchmarks, options)` two-arg signature is preserved as default behavior, so registry bindings keep working without `deps`.

### S3 — Catalog: assignmentRef + Specialist intent

- **Files:**
  - `engine/analyst/registry/specialist-catalog.ts` (lines 50-53 — `mgmt-co.funding` `assignmentRefs`)
- **Change:** Add `{ kind: "api", slug: "lp-comp-dataset", required: false, role: "comparables" }` to the `mgmt-co.funding` `assignmentRefs` array. Per ADR-007 §6, even a stub-fetcher justifies wiring — data quality follows. Optional (not `required: true`) so the Specialist can fall back to benchmark-only when the API is unmapped or red-status. Keep existing `model` + `benchmark` refs untouched.
- **Affected dependency surfaces:** S-Resources-Catalog, S-Analyst-Verdict
- **Cross-check invariants:**
  - The slug `lp-comp-dataset` must match the resource definition in `admin_resources` (or be added there in a Replit-owned UI slice — out-of-scope for G1; the catalog ref can point at an unmapped resource without breaking the Specialist's runtime per Resources control plane spec).
  - `tests/proof/specialist-intelligence-bar.test.ts` (when authored, per Intelligence Bar §"Verifiability") will assert `assignmentRefs.some(r => r.kind === "api")` for every assumption-tab Specialist with `subject ∈ {mgmt-co, property}`. G1 satisfies this.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] Catalog Zod schema (`SpecialistDefinitionSchema`) still validates the row.
  - [ ] No catalog-consumer test breaks (sidebar map, audit, runtime config).
- **Test impact:** Existing `tests/analyst/specialist-catalog.test.ts` (if any) re-runs; no new tests required for a single-row edit.
- **Rollback:** Revert the line.

### S4 — Golden-test bench (3 personas)

- **Files:**
  - NEW `tests/analyst/golden/mgmt-co-funding.test.ts`
- **Change:** Author a persona-keyed golden bench per ADR-007 §5 + Intelligence Bar §"What 'the bar' does NOT require" (3 fixtures suffice). Personas:
  - **`large-managementco`** — 8 properties, $80M total need, conservative 18mo runway buffer, mid-tranche-gap. Expected verdicts: most dimensions `ok`; one `advisory` on `sizingOvershootPct` if buffer is below benchmark.
  - **`startup-boutique`** — 2 properties, $5M need, aggressive 6mo runway buffer, no tranche-2. Expected verdicts: at least one `warning` on `runwayBufferMonths`; honest-fail OK on `trancheGapMonths` (no T2 to evaluate).
  - **`expansion-stage`** — 4 properties, $30M raise, mid-tranche schedule, 12mo buffer. Mixed severity to exercise advisory + warning paths.
  - Each fixture asserts every Intelligence Bar invariant (1-9): non-null `cognitiveRunId` on Tier-1 path; ≥3 evidence per non-ok dimension; comparables present on numeric dimensions; range present on non-ok numeric dimensions; range conviction ≥ CONVICTION_FLOOR; persona consistency in voice (downstream); regress count tracked; vendor-breadth ≥2 on cognitive run (asserted via `meta.vendorsUsed.length >= 2`).
  - Bench uses **stubbed orchestrator** that returns canned cognitive output per persona — real orchestrator is exercised in integration, not goldens.
- **Affected dependency surfaces:** S-Analyst-Verdict
- **Cross-check invariants:** Persona names match the canonical fixtures in `tests/analyst/personas/lb.test.ts` if there's overlap (likely not — those are property-scoped; mgmt-co personas are new).
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/analyst/golden/mgmt-co-funding.test.ts` — all 3 fixtures × 9 assertions PASS.
  - [ ] No flakiness on 5 consecutive runs.
- **Test impact:** NEW file; no others affected.
- **Rollback:** Delete the file.

### S5 — Fallback explicit test

- **Files:**
  - `tests/analyst/specialists/funding-tier1.test.ts` (extend with one more case from S2)
- **Change:** Add explicit test case asserting:
  - When `deps.orchestrator.run` throws (simulated rate-limit / 5xx / network), the Specialist returns `SpecialistOutput` with `tier: 0`, `meta.fallbackReason: "tier1_unavailable"`, and dimensions matching the legacy `buildDimensions()` shape exactly. Voice intent on individual dimensions stays "within-range"/etc per Tier-0 classifier — the visible-degradation badge wiring is downstream UI work.
  - When `deps.engineClientDeps.findRunByCacheKey` returns a `superseded` row, `consultCognitive` returns `missReason: "superseded"`, the Specialist proceeds to MISS path (orchestrator), and produces a Tier-1 verdict normally.
- **Affected dependency surfaces:** S-Analyst-Verdict, S-Analyst-Tier0-Fallback
- **Cross-check invariants:** None new — these test cases pin the §3 ADR-007 fallback policy.
- **Acceptance criteria:**
  - [ ] Both new test cases PASS.
  - [ ] Coverage report (if running): `funding-specialist.ts` ≥85% line coverage, fallback branch executed.
- **Test impact:** Same file as S2's new tests.
- **Rollback:** Remove the two test cases.

### S6 — Catalog status flip + commit footer

- **Files:**
  - `engine/analyst/registry/specialist-catalog.ts` (re-edit `mgmt-co.funding` entry: confirm `status: "built"` + add a `tierMinimum: 1` field if the schema supports it; add a commit-message-only marker otherwise — schema extension is out-of-scope for G1)
- **Change:** No schema change. The Specialist's `status: "built"` is true both before and after graduation; what changes is the *quality bar* the Specialist now meets. Document the graduation in the commit message + add a one-line comment above the catalog entry: `// Tier-1 graduate (G1, 2026-04-XX) — see ADR-007 + tests/analyst/golden/mgmt-co-funding.test.ts`.
- **Affected dependency surfaces:** S-Resources-Catalog
- **Cross-check invariants:** Persona/voice/copy in this row is user-facing — `tests/audit/vocabulary-compliance.test.ts` must still pass.
- **Acceptance criteria:**
  - [ ] All five gates (TS, lint, vocab, test:summary, verify:summary) PASS.
  - [ ] Commit message ends with `Surfaces: S-Analyst-Verdict, S-Cognitive-Cache, S-Resources-Catalog, S-Analyst-Tier0-Fallback` and `Packet: .claude/replit-handoffs/adr-007-g1-funding-graduation.md`.
- **Test impact:** None directly; gates already cover.
- **Rollback:** Revert the comment line.

---

## Verification

### Gate commands

- [ ] `npm run check` — TS: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/analyst/specialists/funding-prompt-input.test.ts` — all PASS
- [ ] `npm run test:file -- tests/analyst/specialists/funding-tier1.test.ts` — all PASS
- [ ] `npm run test:file -- tests/analyst/specialists/funding-orchestrator-adapter.test.ts` — all PASS
- [ ] `npm run test:file -- tests/analyst/golden/mgmt-co-funding.test.ts` — 3 fixtures × 9 assertions PASS
- [ ] `npm run test:summary` — All test files PASS
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19+ phases)
- [ ] Vocabulary test passes (no forbidden terms in catalog comment + commit msg)

### Behavioral verification (manual, post-merge)

- [ ] In dev server, Funding tab Save → response carries `meta.cognitiveRunId` (Tier-1 path) OR `meta.fallbackReason: "tier1_unavailable"` (Tier-0 fallback) — observable via DevTools Network tab on the `/api/global-assumptions` save response.
- [ ] Browser console: 0 new errors during Funding-tab save flow.
- [ ] If cognitive route is healthy: at least 2 vendors named in `meta.vendorsUsed` (e.g., `["anthropic", "google"]` per `llm-vendor-roster.md` requirement #7).

### Surface-specific verification

- **S-Analyst-Verdict:** verdict shape passes `tests/analyst/verdict-shape.test.ts` regression suite.
- **S-Cognitive-Cache:** cache HIT vs MISS ratio observable in `meta.cacheState` (HIT counter > 0 after second identical save within TTL).
- **S-Analyst-Tier0-Fallback:** `tests/analyst/specialists/funding-tier1.test.ts` exercises both branches.

## Out of scope

- **Phase 5C write-after persistence on cache MISS** — Replit-owned. G1 returns the freshly-orchestrated verdict directly; persistence + supersede semantics light up when 5C lands. G1's tests assume an in-memory deps stub for the cache reader.
- **Live LP-comp dataset API integration.** S3 wires the catalog ref + S2 wires the fetcher injection point, but the v1 fetcher returns canned data (per ADR-007 §6 "wiring matters; data quality follows"). Real PitchBook/PrivateEquityInfo integration is a follow-up packet.
- **Voice renderer "Tier-1 unavailable" badge UI.** Replit's slice when ready — the Specialist emits `meta.fallbackReason` so the badge has data; rendering is downstream.
- **Real `server/ai/research-orchestrator.ts` integration in production code paths.** S2 stops at the adapter contract; the adapter is unit-tested with stubs. Wiring it to the live N+1 orchestrator + threading credentials happens in a Replit-owned route-handler slice, two-track per `claude-replit-split.md` §"two-track ADR execution".
- **G2-G6 Specialists.** Sequential per ADR-007 §2; G2 (Revenue) starts only after G1 lands clean + 1 session soak.
- **Specialist consolidation** (ADR-007 §2 amendment 2026-04-26). G1 keeps Funding as a dedicated Specialist; consolidation evaluation happens during G3-G6 design.
- **Schema extension for `tierMinimum: 1` on Specialist catalog rows.** S6 does NOT extend the schema; just commits a comment. Schema work, if needed, is its own packet.

If during execution CC discovers in-scope work not listed (e.g., the orchestrator adapter needs a primitive that doesn't exist), file a `BLOCKED.md` sibling rather than expanding this packet.

## Surfaces footer template

Every commit emitted from this packet must end with:

```
Surfaces: S-Analyst-Verdict, S-Cognitive-Cache, S-Resources-Catalog, S-Analyst-Tier0-Fallback
Packet: .claude/replit-handoffs/adr-007-g1-funding-graduation.md
```

## Completion report (filled by CC on exit)

After all sub-steps land, append to this packet:

- **Commits:** `<sha-S1>`, `<sha-S2>`, `<sha-S3>`, `<sha-S4>`, `<sha-S5>`, `<sha-S6>` (one commit per sub-step per atomic-budget rule)
- **Sub-steps PASSED:** `<list>`
- **Sub-steps SKIPPED with reason:** `<list — should be empty>`
- **Verification gates PASSED:** `<list>`
- **Verification gates SKIPPED with reason:** `<list>`
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** `<list>`
- **Session-memory entry added:** ✅ / ❌
- **Pattern lessons for G2 (Revenue):** `<at least 3 specific lessons that should change the G2 packet design — e.g., "comparables fetcher should batch", "prompt-engineer stage needs N input tokens budgeted", "regress-rate observed = X%, vs. <15% steady-state target"
