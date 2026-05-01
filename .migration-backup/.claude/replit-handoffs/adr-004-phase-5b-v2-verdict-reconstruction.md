# ADR-004 Phase 5B v2: cognitive-cache verdict reconstruction

Pre-authored ahead of ADR-007 acceptance. Ships the HIT-side verdict reconstruction in `engine/analyst/cognitive/engine-client.ts` so a Specialist evaluator gets a typed `RawVerdictDimension[]` directly from a cache hit, instead of re-implementing per-Specialist glue from `GuidanceSlim[]`. Without this, every graduating Specialist (G1–G6 per ADR-007) re-invents the same reconstruction code and inevitably drifts back to deterministic shortcuts. This packet is the seam that lets Tier-1 evaluators **be** AI rather than dress-up.

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-004-verdict-cache.md`](../../docs/architecture/decisions/ADR-004-verdict-cache.md) (Status: **Accepted** 2026-04-20)
- **Supports downstream:** [`docs/architecture/decisions/ADR-007-specialist-tier1-graduation.md`](../../docs/architecture/decisions/ADR-007-specialist-tier1-graduation.md) (Status: **Proposed** 2026-04-25). G1 cannot start until this packet ships, but this packet itself is well-defined under ADR-004 alone.
- **Last ADR-004 edit:** 2026-04-20 (acceptance)
- **Sessions stable since acceptance:** 4+ (Phase 5A migrations + 5A Claude side both shipped clean against v1 doctrine)
- **Gate decision:** ✅ **Cleared to execute.** ADR-004 is Accepted and stable. ADR-007's Proposed status does NOT block this packet — verdict reconstruction is a precondition for ANY Tier-1 Specialist regardless of graduation order.

## Context (≤200 words)

Phase 5B v1 (`38a468b3`) shipped `tryCacheRead()` — the cache lookup that returns either `{ hit: true, guidance: GuidanceSlim[] }` or `{ hit: false, missReason }`. The module's header docs explicitly defer "Full `AnalystVerdict` reconstruction from guidance rows" to v2.

That deferral is now blocking. Per ADR-007's Tier-1 Specialist Pattern §1, the canonical evaluator skeleton expects `engine-client` to return reconstructed `RawVerdictDimension[]` on HIT, not raw `GuidanceSlim[]`. If we don't ship reconstruction, every G1–G6 Specialist re-implements its own `GuidanceSlim → RawVerdictDimension` mapping, which means drift, inconsistent severity computation, and an emerging anti-pattern of "smart enough to look like AI."

This packet adds:
- `reconstructDimensionsFromGuidance()` — a pure function turning `GuidanceSlim[]` + user inputs into `RawVerdictDimension[]`.
- `consultCognitive()` — a thin wrapper over `tryCacheRead()` that, on HIT, returns reconstructed dimensions; on MISS, returns the same typed miss signal as today (caller still owns the orchestrator invocation).

References:
- ADR-004 §3-4 (TTL + invalidation gates already in `tryCacheRead`)
- ADR-007 §1 (Tier-1 Specialist Pattern step 3 — the consumer of this work)
- `engine/analyst/contracts/verdict.ts:229` (`RawVerdictDimensionSchema` — target shape)
- `engine/analyst/cognitive/engine-client.ts:1-138` (existing v1)

## Atomic-budget check

- **Sub-step count:** 4 (≤7 ✅)
- **File count:** 2 source + 1 test (≤3 source ✅; tests in verification domain)
- **Capability domains touched:** 2 — `route` (engine-client extension; this is route-adjacent cache logic) + `verification` (test additions) ✅

## Design notes

**Why a sibling reconstructor file?** Reconstruction is non-trivial (range derivation + confidence-to-quality mapping + evidence assembly + severity computation). Embedding it in `engine-client.ts` would push that module past its single-responsibility boundary (cache-decision logic). A sibling `verdict-reconstructor.ts` keeps both files small, testable in isolation, and reusable should we ever want to reconstruct from non-cached cognitive output (Tier-1 MISS path, when 5C ships).

**Why does reconstruction need user input values?** `RawVerdictDimension.severity` is a function of the user's current value relative to the cached range — "your $350 ADR is above the $220–$310 high-end range" → `severity: "warning"`. The cache stores ranges (input-context-driven); user input drives severity (always fresh). Including user input in the cache key would invalidate every keystroke; keeping it out + passing at reconstruction time is the correct factoring.

**What this packet does NOT do:**
- It does NOT invoke the orchestrator on cache miss. That stays caller responsibility (the Specialist evaluator) per ADR-007 §1 step 4.
- It does NOT write new cache rows. That's Phase 5C (Replit-owned).
- It does NOT render voice. That's the Surface Router's responsibility downstream — `RawVerdictDimension` is pre-voice by design.
- It does NOT change `tryCacheRead`'s signature or behavior.

## Tasks

### S1: Implement `reconstructDimensionsFromGuidance()` in a sibling module

- **Files:**
  - `engine/analyst/cognitive/verdict-reconstructor.ts` (NEW, ≤180 lines)
- **Change:** Create a pure function:
  ```ts
  import {
    type Evidence,
    type RawVerdictDimension,
    type Severity,
    type VerdictRange,
    type VoiceIntent,
    CONVICTION_FLOOR,
  } from "../contracts/verdict";
  import type { GuidanceSlim } from "./engine-client";

  /**
   * Per-dimension input from the caller: user's current value for that
   * assumption (the value flowing into the engine right now), and a hint
   * of whether the field is numeric. Numeric fields drive severity vs the
   * cached range; non-numeric fields stay severity:"ok" by default unless
   * the caller passes a non-null `severityOverride`.
   */
  export interface DimensionInput {
    field: string;          // assumptionKey from GuidanceSlim
    userValue: number | null;
    isNumericField: boolean;
    severityOverride?: Severity;
  }

  export interface ReconstructOptions {
    /** Specialist id used to namespace evidence ids. */
    specialistId: string;
    /** Current wall-clock for evidence asOf timestamps. Injectable for tests. */
    now?: () => Date;
  }

  /**
   * Reconstructs RawVerdictDimension[] from cached guidance rows + the
   * user's current values. Pure function — no I/O.
   *
   * Severity rules (per ADR-007 §1 step 6 + ADR-003 invariants 3-4):
   *   - severityOverride wins when present
   *   - non-numeric field with no override → "ok"
   *   - numeric field, userValue null → "ok" (nothing to compare)
   *   - numeric field, userValue inside [low, high] inclusive → "ok"
   *   - numeric field, userValue outside the range → "warning"
   *   - confidence "low" → severity capped at "advisory" (never "warning")
   *
   * QualityScore mapping:
   *   - "high"     → 78
   *   - "moderate" → 55  (above CONVICTION_FLOOR)
   *   - "low"      → 28  (below CONVICTION_FLOOR — ADR-003 invariant 4
   *                       requires range:null when severity is non-ok)
   *   - null       → 50  (defensive default)
   *
   * Range:
   *   - { low, mid, high } from valueLow / valueMid / valueHigh; null when
   *     all three are null OR severity ends up "ok" with confidence "low"
   *     (per ADR-003 invariant 3 — Router downgrade path).
   *
   * Evidence:
   *   - One Evidence per row with sourceName + sourceDate (URL is null at
   *     this layer; live-API evidence is added by the Specialist's
   *     comparables-fetch step per ADR-007 §1 step 5). reasoning becomes
   *     the evidence summary.
   *
   * Intent:
   *   - "ok" + range present  → "anchored"
   *   - "ok" + range null     → "developing-data"
   *   - "advisory"            → "context"
   *   - "warning"             → "challenge"
   *   - "block"               → "challenge"
   */
  export function reconstructDimensionsFromGuidance(
    rows: readonly GuidanceSlim[],
    inputs: readonly DimensionInput[],
    options: ReconstructOptions,
  ): RawVerdictDimension[] {
    // implementation per the rules above
  }
  ```
- **Affected dependency surfaces:** S-Analyst-Verdict, S-Cognitive-Cache (verify against `.claude/audit-inventory.md` at execution).
- **Cross-check invariants:**
  - "ADR-003 invariant 3: numeric non-ok dimensions require a range" — enforced by the reconstruction rules above (range goes null only on `severity === "ok"` with low confidence).
  - "ADR-003 invariant 4: non-ok with range requires `qualityScore >= CONVICTION_FLOOR`" — enforced by the confidence-to-quality mapping. The "low" case maps to 28 (below floor) and the rules above force severity to "advisory" max + range is preserved only when severity stays "ok".
  - "ADR-003 invariant 5: ≥3 evidence per dimension" — this packet does NOT enforce; the caller (Specialist) is responsible for ensuring ≥3 GuidanceSlim rows OR augmenting with comparables-fetch evidence. This is the correct boundary because cache-only evidence count varies; the Specialist sees the full picture.
  - "Severity rules must align with `fromLegacySeverity` in verdict.ts" — sanity-check during execution that the severity ranges produced here are compatible with what `buildAnalystVerdict()` accepts.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors.
  - [ ] No new lint warnings on the new file.
  - [ ] Function is pure: no I/O, no `Date.now()` (only via injected `options.now`), no DB.
  - [ ] All severity-rule branches covered by S4 tests.
- **Test impact:** Covered by S4.
- **Rollback notes:** Delete the file. No DB or migration touched.

### S2: Add `consultCognitive()` wrapper to engine-client.ts

- **Files:**
  - `engine/analyst/cognitive/engine-client.ts` — extend (existing 138-line file).
- **Change:**
  - Import `reconstructDimensionsFromGuidance`, `DimensionInput`, `ReconstructOptions` from the new sibling.
  - Define a new typed result discriminated union:
    ```ts
    export type ConsultCognitiveResult =
      | {
          hit: true;
          runId: number;
          completedAt: Date;
          modelPrimary: string | null;
          tier: number;
          /** Reconstructed pre-voice dimensions ready for the Surface Router. */
          dimensions: RawVerdictDimension[];
          /** Run id to thread into AnalystVerdict.meta.cognitiveRunId. */
          cognitiveRunId: string;
        }
      | {
          hit: false;
          missReason: MissReason;
        };
    ```
  - Define a new request type extending `ConsultRequest`:
    ```ts
    export interface ConsultCognitiveRequest extends ConsultRequest {
      /** Per-dimension inputs needed for severity computation on HIT. */
      dimensionInputs: readonly DimensionInput[];
      /** Specialist id (threaded into evidence ids). */
      specialistId: string;
    }
    ```
  - Add `consultCognitive(req, deps)`:
    ```ts
    export async function consultCognitive(
      req: ConsultCognitiveRequest,
      deps: EngineClientDeps,
    ): Promise<ConsultCognitiveResult> {
      const cacheRead = await tryCacheRead(req, deps);
      if (!cacheRead.hit) {
        return { hit: false, missReason: cacheRead.missReason };
      }
      const dimensions = reconstructDimensionsFromGuidance(
        cacheRead.guidance,
        req.dimensionInputs,
        { specialistId: req.specialistId, now: deps.now },
      );
      return {
        hit: true,
        runId: cacheRead.runId,
        completedAt: cacheRead.completedAt,
        modelPrimary: cacheRead.modelPrimary,
        tier: cacheRead.tier,
        dimensions,
        cognitiveRunId: String(cacheRead.runId), // run id stringified for AnalystVerdict.meta
      };
    }
    ```
  - **Update the file's header docstring**: replace the "What v1 does NOT ship" / "deferred to Phase 5B v2" paragraph with a "What v2 ships" paragraph naming `consultCognitive()` and `reconstructDimensionsFromGuidance()`. The header at lines 1-29 of the existing file is the source.
- **Affected dependency surfaces:** S-Cognitive-Cache, S-Analyst-Verdict.
- **Cross-check invariants:**
  - "`tryCacheRead` signature unchanged" — preserved; `consultCognitive` is a sibling, not a replacement.
  - "Module stays pure / no DB import" — preserved; the reconstructor is also pure.
  - "Engine-client → server boundary" — verify no new `server/` import sneaks in.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors.
  - [ ] Existing 18 tests for `tryCacheRead` continue to pass unchanged.
  - [ ] `grep -rn "from.*server/" engine/analyst/cognitive/` returns nothing new.
- **Test impact:** Covered by S4.
- **Rollback notes:** Revert the commit. No DB touched.

### S3: Update header docs + add doctrine cross-references

- **Files:**
  - `engine/analyst/cognitive/engine-client.ts` — header docstring lines 1-29.
- **Change:**
  - Replace "What v1 ships" → "What v1 + v2 ship" with a clear v2 line: "Phase 5B v2 (`<this commit>`): `consultCognitive()` + `reconstructDimensionsFromGuidance()` — full HIT-side reconstruction. Specialists call `consultCognitive()` and receive `RawVerdictDimension[]` directly."
  - Replace "What v1 does NOT ship" with "What v2 still does NOT ship": orchestrator invocation on MISS (caller's responsibility per ADR-007 §1 step 4) + write-after for new runs (Phase 5C, Replit-owned).
  - Add cross-ref pointer to ADR-007.
- **Affected dependency surfaces:** none (docs-only).
- **Cross-check invariants:**
  - "Documentation accuracy" — every claim in the header docstring is independently verifiable from the code below it.
- **Acceptance criteria:**
  - [ ] Header docs accurately describe what v2 ships.
  - [ ] No stale references to "Phase 5B v2 deferred" remain in the file.
- **Test impact:** None.
- **Rollback notes:** Revert.

### S4: Tests — reconstruction + consult-cognitive HIT/MISS paths

- **Files:**
  - `tests/analyst/engine-client.test.ts` (extend) AND/OR new `tests/analyst/verdict-reconstructor.test.ts` if reconstruction tests grow large enough to warrant a sibling file. Decide at execution time per the project's existing test-organization conventions.
- **Change:** Add tests covering:
  1. **Reconstruction — happy path:** 5 numeric guidance rows + matching user inputs all inside ranges → 5 RawVerdictDimensions, all `severity: "ok"`, range present, qualityScore mapped from confidence.
  2. **Reconstruction — user value above range:** numeric field, userValue > range.high, confidence "high" → `severity: "warning"`, range present, intent `"challenge"`.
  3. **Reconstruction — user value above range, low confidence:** same input but confidence "low" → severity capped at `"advisory"` (NOT "warning") per ADR-003 invariant 4 + the rules in S1.
  4. **Reconstruction — null userValue:** numeric field, userValue null → `severity: "ok"`, intent `"developing-data"`.
  5. **Reconstruction — non-numeric field with override:** isNumericField false + severityOverride "warning" → severity respects override; range stays as cached.
  6. **Reconstruction — confidence null:** qualityScore defaults to 50.
  7. **Reconstruction — severityOverride wins over computed severity:** numeric field, userValue inside range, override "block" → final severity "block".
  8. **`consultCognitive` — HIT path:** mock `findRunByCacheKey` + `findGuidanceByRunId` to return a fresh complete run with 3 guidance rows; assert the result is `{ hit: true, dimensions: [3 RawVerdictDimensions], cognitiveRunId: "<runId>" }`.
  9. **`consultCognitive` — MISS path (fresh_miss):** mock `findRunByCacheKey` to return null; assert `{ hit: false, missReason: "fresh_miss" }`. (No reconstruction performed.)
  10. **`consultCognitive` — MISS path (ttl_expired):** mock a stale completed run; assert `{ hit: false, missReason: "ttl_expired" }`.
  11. **`consultCognitive` — explicitBypass:** assert `{ hit: false, missReason: "explicit_bypass" }` even when a fresh run exists.
- **Affected dependency surfaces:** S-Cognitive-Cache (verification).
- **Cross-check invariants:**
  - "Test names describe the business rule, not the implementation."
  - "Existing 18 tests for `tryCacheRead` must continue to pass" — assert at the end of S4 by running the full test file.
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/analyst/engine-client.test.ts` (or sibling) passes; new cases all run.
  - [ ] No flake — all 11+ new cases deterministic, no time-zone-dependent assertions.
- **Test impact:** Net-new tests (~120 LOC).
- **Rollback notes:** Revert the commit.

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — TypeScript: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass (no UI strings touched, baseline gate)
- [ ] `npm run test:file -- tests/analyst/engine-client.test.ts tests/analyst/verdict-reconstructor.test.ts` (whichever exist) — all pass
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19 phases)
- [ ] `npm run health` — ALL CLEAR

### Behavioral verification (no dev-server interaction needed)

This packet has no UI surface. Behavioral verification is fully covered by the test gates above. The HIT path is unit-testable end-to-end via injected `findRunByCacheKey` + `findGuidanceByRunId` mocks; no DB round-trip needed. The MISS path's downstream consumer (the Specialist's orchestrator invocation) is out of scope for this packet — wired in by G1 Funding (ADR-007).

### Surface-specific verification

- **S-Cognitive-Cache:** `engine/analyst/cognitive/engine-client.ts` is the surface; gates above cover it.
- **S-Analyst-Verdict:** verdict-shape invariants (`tests/analyst/verdict-shape.test.ts`) MUST continue to pass — the reconstruction output feeds `buildAnalystVerdict()` downstream and any drift surfaces immediately.

## Out of scope

- **Orchestrator invocation on MISS** — caller (Specialist evaluator) responsibility per ADR-007 §1 step 4. This packet's MISS path returns the same typed signal as Phase 5B v1.
- **Write-after for newly-orchestrated runs** — Phase 5C (Replit-owned). When 5C ships, fresh orchestrator output gets persisted with the cache key + inputs hash, and subsequent calls hit the v2 reconstruction path.
- **Voice rendering** — Surface Router responsibility downstream. `RawVerdictDimension` is intentionally pre-voice.
- **`buildAnalystVerdict()` invocation** — caller calls the builder once they have `RawVerdictDimension[]` from this packet plus their `specialistId`, `tier`, `durationMs`, `cognitiveRunId`. This packet returns the dimensions; assembly stays in the Specialist body.
- **Comparables-table data** — fetched from live API resources by the Specialist (ADR-007 §1 step 5). Reconstruction does not touch it; per-dimension comparables are added by the caller before `buildAnalystVerdict()`.
- **Persona-aware cache keys** — already addressed by ADR-004 §3 (`personaHash` in cache key). Not touched here.
- **Engine-client → orchestrator wiring** — explicit non-goal. Crossing that boundary belongs in G1 (Funding's first sub-step is filing the packet that wires it).

If during execution Replit identifies work that belongs in scope but isn't listed, file a `BLOCKED.md` sibling rather than expanding the packet.

## Surfaces footer template

Every commit emitted from this packet must end with:

```
Surfaces: S-Cognitive-Cache, S-Analyst-Verdict
Packet: .claude/replit-handoffs/adr-004-phase-5b-v2-verdict-reconstruction.md
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

If executed via the explicit-delegation lane (CC-side per `claude-replit-split.md` and `phases.md` 5B owner), also include:

```
Delegated-by: Replit-Agent
DELEGATE.md: .claude/replit-handoffs/adr-004-phase-5b-v2-verdict-reconstruction-DELEGATE.md
```

Confirm exact S-tags against `.claude/audit-inventory.md` at execution time.

## Completion report (filled by executor on exit)

After all sub-steps land, the executor appends to this packet:

- **Commits:** `<sha1>`, `<sha2>`, …
- **Sub-steps PASSED:** `<list>`
- **Sub-steps SKIPPED with reason:** `<list>`
- **Verification gates PASSED:** `<list>`
- **Verification gates SKIPPED with reason:** `<list>`
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** `<list>`
- **Session-memory entry added:** ✅ / ❌
- **Phases.md updated:** flip ADR-004 row "5B" from ⏳ Pending → ✅ Shipped (via the explicit-delegation lane note: 5B owner is Claude Code per `phases.md`).
