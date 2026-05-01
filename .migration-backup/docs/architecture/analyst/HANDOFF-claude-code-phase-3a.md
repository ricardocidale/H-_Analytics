# Handoff: Phase 3a — AnalystVerdict Contract + Surface Router + Voice Renderer + Quality Scorer

**From:** Replit Agent
**To:** Claude Code
**Date:** 2026-04-19
**Phase 1a context:** `docs/architecture/ANALYST.md` and `docs/architecture/analyst/*.md`
**Phase 1b context:** your own `.claude/skills/analyst/*.md` and `.claude/rules/analyst-team.md`, `.claude/rules/analyst-verdict-contract.md`
**Phase 2 context:** commit `5ba18f29` landed the `engine/analyst/` skeleton, `.github/CODEOWNERS`, the ESLint naming-lint rule, and `ADR-002-engine-analyst-skeleton.md`. The directories you'll fill in this phase already exist as `export {};` placeholders.
**Why this is a handoff:** the four pieces in this brief are pure-logic / type-only / runtime-persona-enforcement work. They're squarely in your strength zone (greenfield architectural code under tight rules) and adjacent to the persona rules and skills you authored in Phase 1b. Replit Agent will own Phase 3b in parallel-then-serial: backfill of the two existing watchdog evaluators to the new contract, UI consumption of `voice.headline` / `voice.detail`, and any DB-persistence shape for verdicts. That work depends on your contract being frozen first.

---

## Scope of work — four deliverables

1. **`engine/analyst/contracts/verdict.ts`** — the `AnalystVerdict` type + Zod schema + invariant assertions. The frozen contract every Specialist will return.
2. **`engine/analyst/router/surface-router.ts`** — pure dispatcher from `(specialistId, inputs)` → `AnalystVerdict`. Aggregates multi-Specialist results. Enforces conviction floor.
3. **`engine/analyst/voice/voice-renderer.ts`** — the runtime persona-rule enforcer. Specialist structured output → `voice.headline` + `voice.detail`. Rejects forbidden patterns.
4. **`engine/analyst/quality/quality-scorer.ts`** — the unified `qualityScore` (0-100) function. Folds the existing primitives in `shared/analyst-conviction.ts` and `server/ai/confidence-scorer.ts` into one consistent score.

Plus a persona-keyed test bench:

5. **`tests/analyst/verdict-shape.test.ts`** — invariants of the contract.
6. **`tests/analyst/voice/voice-renderer.test.ts`** — every forbidden pattern + every persona rule.
7. **`tests/analyst/quality/quality-scorer.test.ts`** — score calibration against representative inputs.
8. **`tests/analyst/personas/lb.test.ts`** — golden L+B persona cases (one per surface; placeholder Specialists are fine — Phase 4 fills in real ones).

Total: 4 source files + 4 test files + 1 ADR (`ADR-003-analyst-verdict-contract.md`). All five verification gates must pass.

---

## Mandatory pre-flight reading (in this order)

1. `docs/architecture/analyst/verdict-contract.md` — the spec for the contract. Source of truth for the shape; you may refine the spec in the same commit if implementation reveals issues, but document the deviation in ADR-003.
2. `docs/architecture/analyst/voice-rendering.md` — Voice Renderer spec.
3. `docs/architecture/analyst/quality-scoring.md` — Quality Scorer spec, weights, formulas.
4. `docs/architecture/analyst/surface-router.md` — Surface Router spec.
5. `.claude/rules/the-analyst-persona.md` — the persona contract you're enforcing.
6. `.claude/rules/analyst-team.md` — internal team vocabulary (your own file from Phase 1b).
7. `.claude/rules/analyst-verdict-contract.md` — placeholder rule from Phase 1b. **Replace this file in the same commit** with the post-Phase-3 binding rule (the contract is now real, not aspirational).
8. `shared/analyst-conviction.ts` — existing 39-line primitive. The Quality Scorer must extend, not replace, this. `CONVICTION_FLOOR = 40` and `MIN_SOURCES_FOR_ADVICE = 1` stay where they are; re-export them from `quality-scorer.ts`.
9. `server/ai/confidence-scorer.ts` — existing conviction-tier producer used inside the Cognitive Engine. The Quality Scorer must produce comparable numbers (badges must align: High/Moderate/Developing).
10. `engine/watchdog/capitalRaiseEvaluator.ts` and `engine/watchdog/revenueEvaluator.ts` — **read but do not edit.** These define `WatchdogResult { severity, verdict, reasoning, suggestedActions }`, the shape Phase 3b will backfill into `AnalystVerdict`. Knowing what the legacy shape carries (severity tri-state `ok|warn|alert`, suggested-action kinds `adjust|save_anyway|ack`) lets you design `AnalystVerdict` so the migration is mechanical.
11. `tests/audit/vocabulary-compliance.test.ts` — your runtime Voice Renderer must reject every pattern this test catches statically. The two layers are defense in depth.
12. `eslint.config.mjs` — the `ANALYST_INTERNAL_VOCAB_FORBIDDEN_IN_CLIENT` constant (added in Phase 2) is the static-analysis sibling of your runtime renderer.

---

## File 1: `engine/analyst/contracts/verdict.ts`

### Required exports

Match the spec in `docs/architecture/analyst/verdict-contract.md` exactly, with these refinements:

- **`Severity`** — keep the 4-tier `"ok" | "advisory" | "warning" | "block"`. The legacy watchdog shape uses `"ok" | "warn" | "alert"`; document the mapping at the bottom of the file (`"warn" → "advisory"`, `"alert" → "warning"`, `"block"` is new and reserved for Phase 4 hard-stops).
- **`EvidenceTier`** — keep `"db_table" | "api" | "web" | "estimated"`. Already matches `shared/analyst-conviction.ts` `DataQualitySummary.sourceTypes`.
- **`Evidence`** — add Zod schema as `EvidenceSchema = z.object({...})`, infer the type with `z.infer`. Be aware: the project bans `as any` in `engine/**` and disallows `||` numeric fallbacks. Use `??` and `Number.isFinite` (see `calc/shared/decimal-helpers.ts` `assertFinite`).
- **`VerdictRange`** — add a refinement: `low <= mid <= high` and `low < high` (when `low === high`, `mid` must equal both). Reject zero-spread ranges with a separate `ExactRange` type if needed in Phase 4 — for now, a refined `VerdictRange` is enough.
- **`VerdictAction`** — keep the 5 `kind` values. Add a discriminated union per kind so `payload` is typed (e.g., `kind: "set-value"` requires `payload: { field: string; value: number }`). The legacy `WatchdogActionKind` (`adjust | save_anyway | ack`) maps to: `adjust → set-value`, `save_anyway → accept-range` (with a synthetic range), `ack → view-source` (or a new `kind: "dismiss"` if you find none of the existing kinds fit — document the addition in ADR-003).
- **`VerdictDimension`** — keep the spec'd fields. Add a Zod refinement asserting the invariants:
  - `severity !== "ok" && range !== null → qualityScore >= CONVICTION_FLOOR`
  - `severity !== "ok" && isNumericField(field) → range !== null`
  - `evidence.length >= MIN_SOURCES_FOR_ADVICE`
- **`AnalystVerdict`** — keep the spec'd fields. Add a Zod refinement asserting:
  - `overallSeverity === max(dimensions.map(d => d.severity))` (define a severity ordering helper)
  - `overallQualityScore` is computed, not declared (provide a helper `computeOverallQuality(dimensions)`)
  - `meta.tier === 1 → meta.cognitiveRunId` is required
  - `meta.tier === 1 → evidence count across all dimensions >= 3` (the existing N+1 rule)
- **`AnalystVerdictBuilder`** — a thin builder class or factory function so Specialists construct verdicts without copy-pasting the `meta`/`overallSeverity`/`overallQualityScore` computation. Builder validates against the Zod schema before returning.

### Branded "voice-rendered" type

The spec calls for typing `voice` as `Branded<string, "voice-rendered">` so Specialists can't construct `voice.headline` directly. Implement:

```ts
declare const VoiceRendered: unique symbol;
export type VoiceRenderedString = string & { readonly [VoiceRendered]: true };
```

Only `voice-renderer.ts` may produce `VoiceRenderedString` (via internal cast). The contract typed against `VoiceRenderedString` means a Specialist that tries to set `dimension.voice.headline = "raw string"` fails at compile time. This is the static enforcement; the runtime check in the renderer is the second layer.

### Re-exports from `engine/analyst/contracts/index.ts`

Replace the `export {};` placeholder with `export * from "./verdict";`. Keep the file 1 line.

### Re-export update at `engine/analyst/index.ts`

Already re-exports `./contracts`. No change needed.

### Lines: ~250-350 including JSDoc and Zod schema. Keep the file disciplined — no dead code.

---

## File 2: `engine/analyst/router/surface-router.ts`

### Required exports

```ts
export interface SurfaceRouterInputs {
  specialistId: string;        // e.g. "mgmt-co.funding"
  payload: unknown;            // Specialist-specific; routed by id
  cognitiveContext?: { runId?: string };
  persona: PersonaContext;
}

export interface SurfaceRouter {
  register(specialistId: string, specialist: SpecialistFn): void;
  dispatch(inputs: SurfaceRouterInputs): Promise<AnalystVerdict>;
  dispatchMany(inputsList: SurfaceRouterInputs[]): Promise<AnalystVerdict>; // aggregated
}

export function createSurfaceRouter(deps: { voiceRenderer: VoiceRenderer; qualityScorer: QualityScorer; }): SurfaceRouter;
```

`SpecialistFn` type lives in the contract file (or in `engine/analyst/router/specialist.ts` if you prefer). Specialists return a partial verdict (dimensions + structured intent), the Router calls Voice Renderer for `voice.*` and Quality Scorer for `qualityScore`, applies the conviction floor (`< 40` downgrades severity), computes `overallSeverity` / `overallQualityScore`, and returns the validated `AnalystVerdict`.

### Critical rules (from `docs/architecture/analyst/surface-router.md` and your skill `.claude/skills/analyst/orchestrator.md`)

- **No LLM calls in the Router.** Period. The Cognitive Engine is consulted *by Specialists*; the Router is pure dispatch.
- **Every dispatch goes through Voice Renderer before returning.** No raw Specialist strings escape.
- **Conviction floor decisions live in the Router**, not in Specialists. A Specialist returns `severity: "warning"` and `qualityScore: 32`; the Router downgrades to `severity: "ok"` with the developing-data voice.
- **Multi-Specialist aggregation is the Router's job** (`dispatchMany`). Picks `max(severity)`, weighted-avg of `qualityScore`, concatenates dimensions, single composed surface-level voice.

### Failure modes

- Unknown `specialistId` → throw `UnknownSpecialistError` (define in this file). Don't return a synthetic verdict.
- Specialist throws → wrap in `SpecialistExecutionError`, log structured, re-throw. The route handler converts to a 500 — not the Router's job.
- Zod validation of the constructed verdict fails → throw `InvalidVerdictError`. This means a Specialist or Voice Renderer is buggy, not a user problem.

### Lines: ~180-250.

---

## File 3: `engine/analyst/voice/voice-renderer.ts`

### Required exports

```ts
export interface VoiceRenderInputs {
  field: string;
  severity: Severity;
  range: VerdictRange | null;
  qualityScore: number;
  evidence: Evidence[];
  intent: "above-range" | "below-range" | "within-range" | "missing-data" | "block";
  personaContext: PersonaContext;
}

export interface VoiceRenderOutput {
  headline: VoiceRenderedString;
  detail?: VoiceRenderedString;
}

export interface VoiceRenderer {
  renderDimension(inputs: VoiceRenderInputs): VoiceRenderOutput;
  renderSurface(dimensions: VerdictDimension[]): VoiceRenderOutput;
}

export function createVoiceRenderer(): VoiceRenderer;
```

### Forbidden patterns (runtime-rejected)

The renderer must reject (throw `PersonaViolationError` in dev, log + sanitize in prod) any output containing:

- `the analysts` (plural)
- `our analysts` / `your analysts`
- `the analyst` lowercase as a noun (must be capitalized "The Analyst")
- `the system generated` / `the system produced` / `the algorithm`
- `the chatbot` / `the assistant` / `AI helper` (these are reserved for Rebecca)
- `Save Changes` / `Save changes`
- `Ask the Analyst`
- `Regenerate Intelligence`, `No Intelligence`
- The five internal team names: `Surface Specialist`, `Cognitive Engine`, `Surface Router`, `Voice Renderer`, `Quality Scorer`

The check is regex-based with word boundaries. The list lives in a single exported constant `FORBIDDEN_VOICE_PATTERNS` so the test file imports the exact same list.

### Range-without-conviction guard

A `VoiceRenderInputs` with `range !== null` and `qualityScore < CONVICTION_FLOOR` must produce a downgraded headline ("Developing data — The Analyst will refine this as more sources land.") with no range emitted in user-facing text. The Router has already downgraded severity in this case, but the renderer is the second-layer guard.

### Composition rules (from `voice-rendering.md`)

- **Severity → tone** map (4 rows in the spec).
- **Quality → conviction label** map (4 rows in the spec).
- **Range-first, conviction-led, investor-aware** tone.
- **Singular voice.** "The Analyst reviewed", never "the system" or "we".

### Determinism

The renderer is **pure** — same inputs produce same output. No timestamps, no random IDs, no ambient state. The test file asserts this explicitly.

### Environment branch

`process.env.NODE_ENV === "production"` → log violation + return sanitized output (strip the offending phrase, keep the rest).
Otherwise → throw `PersonaViolationError`. Tests run in non-production, so they assert throws.

### Lines: ~250-350.

---

## File 4: `engine/analyst/quality/quality-scorer.ts`

### Required exports

```ts
export interface QualityInputs {
  evidence: Evidence[];
  range: VerdictRange | null;
  benchmarkVariance?: number;
  cognitiveConsensusRatio?: number;
  persona: PersonaContext;
}

export interface QualityBreakdown {
  total: number;            // 0-100
  components: {
    sourceCount: number;          // 0-15
    sourceMix: number;            // 0-20
    dataAge: number;              // 0-15
    rangeSpread: number;          // 0-15
    consensus: number;            // 0-20
    personaFit: number;           // 0-15
  };
}

export interface QualityScorer {
  score(inputs: QualityInputs): QualityBreakdown;
}

export function createQualityScorer(): QualityScorer;

// Re-export from shared/analyst-conviction.ts so callers use one source:
export { CONVICTION_FLOOR, MIN_SOURCES_FOR_ADVICE, meetsConvictionFloor } from "@shared/analyst-conviction";
```

### Weights (from `quality-scoring.md`)

| Component | Max | Source |
|---|---|---|
| Source count vs minimum | 15 | `MIN_SOURCES_FOR_ADVICE` / N+1 |
| Source mix tier | 20 | `db_table=1.0, api=0.85, web=0.6, estimated=0.2` averaged × 20 |
| Data age | 15 | linear decay from `evidence.asOf` over 365d |
| Range spread vs benchmark | 15 | the `clamp(1 - spreadRatio / (2 * benchmarkSpreadRatio), 0, 1) * 100` formula in the spec, scaled to 15 |
| Cross-source convergence | 20 | `cognitiveConsensusRatio` × 20 (default 0.5 if missing) |
| Persona fit | 15 | `mean(evidence.map(e => e.personaFit))` × 15 |

Weights are calibrated against `tests/analyst/personas/lb.test.ts`. If a calibration round shifts a weight, document the change in ADR-003 §Calibration.

### Determinism + finite-number discipline

Pure function. Use `assertFinite` from `calc/shared/decimal-helpers.ts` on every numeric input (engine/** bans `||` numeric fallbacks). Missing optional inputs use documented defaults; log them via `console.debug` in dev so calibration can spot reliance on defaults.

### Lines: ~200-280.

---

## Tests

### `tests/analyst/verdict-shape.test.ts`

- Builder produces a verdict that round-trips through Zod parse without loss.
- Refinements fire on each invariant (one `expect(() => parse).toThrow()` per invariant).
- Severity ordering helper is correct for all 16 pairs.
- `computeOverallQuality` handles edge cases (zero dimensions, single dimension, all `severity: "ok"`).

### `tests/analyst/voice/voice-renderer.test.ts`

- Every entry in `FORBIDDEN_VOICE_PATTERNS` triggers a `PersonaViolationError` in dev mode.
- Every persona rule from `.claude/rules/the-analyst-persona.md` has at least one regression case.
- Severity-tone mapping table has a positive case per row.
- Quality-conviction mapping table has a positive case per row.
- `range !== null && qualityScore < 40` produces the developing-data headline with no range.
- Pure: 100 calls with the same input produce identical output.
- Production-mode branch: violation is logged + sanitized, not thrown.

### `tests/analyst/quality/quality-scorer.test.ts`

- Each component contributes within its declared range.
- Total is in `[0, 100]` for 50 random inputs (property test, fixed seed).
- A "perfect" input (3 db_table sources, 0 days old, tight range, full consensus, persona fit 1.0) scores ≥ 95.
- An "estimated-only" input (1 estimated source, 365 days old, wide range, 0.2 consensus, persona fit 0.3) scores < `CONVICTION_FLOOR`.
- Re-exports of `CONVICTION_FLOOR` and `MIN_SOURCES_FOR_ADVICE` match `shared/analyst-conviction.ts` (assert reference equality).

### `tests/analyst/personas/lb.test.ts`

Three golden cases (Specialists are placeholders; Phase 4 fills real logic):

1. **L+B funding, well-sized.** Stub Specialist returns `severity: "ok"`, all dimensions in-range, qualityScore 75. Verdict round-trips, voice headline matches the snapshot.
2. **L+B revenue, marketing under-invested.** Stub returns `severity: "warning"`, qualityScore 65, range present. Voice headline includes "below the L+B luxury range".
3. **L+B compensation, missing data.** Stub returns `severity: "warning"`, qualityScore 28. Router downgrades to `severity: "ok"` with developing-data voice, no range emitted.

Snapshot files allowed for headlines (the `voice-renderer` is pure, snapshots are stable).

### Wiring

Make sure `tests/analyst/` is in the test runner's discovery glob. The existing config likely globs `tests/**/*.test.ts` — confirm by running `npm run test:summary` once before committing tests.

---

## ADR-003

Write `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md` using `docs/architecture/decisions/ADR-template.md`. Cover at minimum:

- The decision to freeze the contract as defined.
- Any deviation from `verdict-contract.md` you made (e.g., the new `dismiss` action kind if you added one, the discriminated `VerdictAction.payload` if you elaborated it, the branded `VoiceRenderedString`).
- The Severity 4-tier vs legacy 3-tier mapping decision.
- The conviction-floor-in-the-Router decision (vs in Specialists or Voice Renderer).
- The pure-renderer + dev-throws-prod-sanitizes decision and its alternatives.
- The Quality Scorer weights and the calibration plan.

Reference ADR-001 and ADR-002 as predecessors. ~150-250 lines.

---

## Boundaries — what NOT to touch

This is mandatory. Every file outside this list is **not yours** in Phase 3a.

**You may create:**
- `engine/analyst/contracts/verdict.ts` (replaces the `export {};` placeholder)
- `engine/analyst/router/surface-router.ts` and any helper file under `engine/analyst/router/`
- `engine/analyst/voice/voice-renderer.ts` and any helper under `engine/analyst/voice/`
- `engine/analyst/quality/quality-scorer.ts` and any helper under `engine/analyst/quality/`
- `tests/analyst/**/*.test.ts` (and snapshot files)
- `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md`

**You may edit:**
- `engine/analyst/contracts/index.ts` (replace placeholder with `export * from "./verdict"`)
- `engine/analyst/router/index.ts` (same)
- `engine/analyst/voice/index.ts` (same)
- `engine/analyst/quality/index.ts` (same)
- `engine/analyst/index.ts` (already re-exports the four subdirs; only edit if you add a top-level helper)
- `.claude/rules/analyst-verdict-contract.md` (replace the Phase 1b placeholder content with the post-Phase-3 binding rule — the contract is real now)
- `docs/architecture/analyst/verdict-contract.md` ONLY if implementation revealed a spec issue. Document the deviation in ADR-003.
- `replit.md` and `claude.md` — append a short note under "Architecture" that Phase 3a landed (one bullet each, no rewrite).

**You may NOT touch:**
- `engine/watchdog/capitalRaiseEvaluator.ts`, `engine/watchdog/revenueEvaluator.ts` — the backfill is Phase 3b (mine).
- `engine/analyst/surface/**` — Specialists are Phase 4. The placeholders stay placeholders. The `surface/mgmt-co/index.ts` re-export shim from Phase 2 stays exactly as it is.
- `server/routes/global-assumptions.ts` or any route handler — wiring the Router into the request path is Phase 3b.
- `client/src/**` — UI consumption of `voice.headline` / `voice.detail` is Phase 3b.
- `shared/analyst-conviction.ts` — re-export from the Quality Scorer; do not modify the source. If the spec needs a new export from `analyst-conviction.ts`, raise it in `BLOCKED.md` and stop.
- `server/ai/confidence-scorer.ts` — the Quality Scorer must produce comparable badges, but it does not depend on or modify `confidence-scorer.ts`. Phase 5 handles the Cognitive Engine reorg.
- `tests/audit/vocabulary-compliance.test.ts` — that's the static suite; your renderer is the runtime sibling. Keep them independent.
- `eslint.config.mjs` — the naming-lint rule from Phase 2 is enough. Don't add more linting in this phase.
- `.github/CODEOWNERS` — already gates analyst-domain edits.
- The five engineering-discipline skills under `.agents/skills/` — project-agnostic, not yours.

If you discover a need outside this list, **stop and write to `BLOCKED.md`**. Do not expand scope.

---

## Pre-commit verification (every commit, no `--no-verify`)

Per `.claude/rules/pre-commit-verification.md`:

1. `npx tsc --noEmit --skipLibCheck -p tsconfig.json` → exit 0
2. `npm run lint:summary` → 0 errors (the naming-lint rule will check your new files; expect zero hits)
3. `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` → 11/11 pass
4. `npm run test:summary` → all pass (must include your four new test files)
5. `npm run verify:summary` → UNQUALIFIED

Commit message must include:

```
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

Plus a `Surfaces:` footer (the relevant surface here is "S0 contract + S0 runtime infra", but use the canonical tags from `.claude/audit-inventory.md` if they differ).

Commit syntax (no shell config that strips identity):
```
git -c user.email=agent@anthropic.com -c user.name="Claude Code" commit -F /tmp/<msg-file>
```

---

## When this is done

1. Push to `main` (the repo's working branch).
2. Append a short entry to `.claude/session-memory.md` (≤5 lines): "Phase 3a complete: AnalystVerdict + Router + Voice + Quality + tests landed. Commit `<sha>`. Ready for Replit Agent's Phase 3b backfill."
3. Reply on the channel the user uses to relay handoffs that Phase 3a is in `main` and what commit SHA. Replit Agent will pick up Phase 3b from there.

If anything in this brief conflicts with `.claude/rules/the-analyst-persona.md` or `.claude/rules/analyst-team.md`, the `.claude/rules/*` files win and the brief is wrong — flag it before proceeding.

---

## What Phase 3b (Replit Agent) will do after you land

For your context, so you know what your contract has to support downstream:

1. Backfill `engine/watchdog/capitalRaiseEvaluator.ts` and `engine/watchdog/revenueEvaluator.ts` to return `AnalystVerdict` via new files at `engine/analyst/surface/mgmt-co/funding-specialist.ts` and `revenue-specialist.ts`. The legacy `engine/watchdog/*Evaluator.ts` paths become deprecated re-export shims.
2. Wire `createSurfaceRouter` into `server/routes/global-assumptions.ts` `/save-tab` handler. The route stops returning `WatchdogResult` and starts returning `AnalystVerdict` (or a serialized projection).
3. Update the React watchdog dialog component to consume `voice.headline` / `voice.detail` instead of crafting strings client-side.
4. Add a `verdicts` cache table or extend `assumption_guidance` to persist the latest `AnalystVerdict` per (orgId, assumptionField) — exact shape decided after seeing your real `AnalystVerdict`.
5. Update `tests/analyst/personas/lb.test.ts` cases 1 and 2 to use the real backfilled Specialists instead of stubs.

Design the contract so step 2 is a thin serialization concern, step 3 is "the existing component reads two new string fields", and step 4 is "stringify the verdict and store as JSONB". If any of those would be hard, the contract needs to change before you commit.
