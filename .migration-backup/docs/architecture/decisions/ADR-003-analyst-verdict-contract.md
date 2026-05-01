# ADR-003: AnalystVerdict Contract + Surface Router + Voice Renderer + Quality Scorer

**Status:** Accepted
**Date:** 2026-04-19
**Deciders:** Claude Code (proposer), human steward
**Tags:** analyst, contract, persona, voice, quality, router

---

## Context

ADR-001 established the two-tier Analyst architecture (Surface tier +
Cognitive tier). ADR-002 landed the `engine/analyst/` skeleton, CODEOWNERS,
and the naming-lint rule. Phase 3a's job is to turn those placeholders into
real code that every future Surface Specialist will use.

Four decisions have to land together or none of them are useful:

1. The **frozen `AnalystVerdict` contract** — the shape every Specialist
   returns from this point forward. Until the shape is committed in code
   with Zod refinements, Specialists keep inventing divergent shapes
   (four exist today: `WatchdogResult`, `FieldAlert[]`,
   `AnalystRefreshResult`, the SSE stream from the Cognitive Engine).
2. The **Surface Router** — the pure dispatcher that turns a `(specialistId,
   inputs)` call into a validated `AnalystVerdict`. Without the Router, the
   two existing `if (tabKey === ...)` dispatch chains (in
   `server/routes/global-assumptions.ts` and
   `server/ai/analyst-watchdog.ts`) keep growing as new Specialists land.
3. The **Voice Renderer** — the runtime enforcement point for the persona
   rule. Static vocabulary tests (`tests/audit/vocabulary-compliance.test.ts`)
   are defense in depth but cannot catch composed strings; a single
   chokepoint for all user-facing output is needed.
4. The **Quality Scorer** — one function producing one number (0-100) for
   every dimension. Without it, "High conviction" on the Funding Specialist
   means something different from "High conviction" on the Revenue Specialist.

These four lock together: the contract types `voice.headline` as a branded
`VoiceRenderedString` that only the Voice Renderer can construct, the Router
calls the Voice Renderer and the Quality Scorer in sequence, and every
surface ends up with a verdict that validates against the Zod schema.

---

## Decision

We implement the four pieces as a cohesive bundle in `engine/analyst/`:

1. **`engine/analyst/contracts/verdict.ts`** — `AnalystVerdict`,
   `VerdictDimension`, `VerdictRange`, `VerdictAction` (discriminated union),
   `Evidence`, `Severity` (4-tier), and `buildAnalystVerdict()` factory with
   full Zod validation. The `VoiceRenderedString` branded type prevents
   Specialists from constructing user-facing strings at compile time.
2. **`engine/analyst/router/surface-router.ts`** — `createSurfaceRouter()`
   factory returning a `SurfaceRouter` with `register`, `dispatch`, and
   `dispatchMany`. Conviction-floor downgrades, Specialist dispatch, Voice
   Renderer invocation, and final Zod validation all live here.
3. **`engine/analyst/voice/voice-renderer.ts`** — `createVoiceRenderer()`
   factory returning a `VoiceRenderer` with `renderDimension` and
   `renderSurface`. The `FORBIDDEN_VOICE_PATTERNS` constant is the single
   source of truth for runtime persona enforcement. Dev mode throws
   `PersonaViolationError`; production logs + sanitizes.
4. **`engine/analyst/quality/quality-scorer.ts`** — `createQualityScorer()`
   factory returning a `QualityScorer` with `score(inputs)`. Folds six
   weighted components (source count, source mix, data age, range spread,
   consensus, persona fit) into a 0-100 number. Re-exports
   `CONVICTION_FLOOR`, `MIN_SOURCES_FOR_ADVICE`, and `meetsConvictionFloor`
   from `shared/analyst-conviction.ts` so callers have one import point.

Tests land in `tests/analyst/` covering verdict-shape invariants, voice
persona enforcement, quality-scorer calibration, and an initial L+B
persona-keyed golden bench using stub Specialists.

### Deviations from the `verdict-contract.md` spec

1. **New `VerdictAction.kind = "dismiss"`.** The spec lists 5 kinds but the
   legacy `WatchdogActionKind.ack` ("Got it") doesn't cleanly map to any
   of them. `dismiss` is clearer than routing an ack through
   `view-source`.
2. **Discriminated `VerdictAction.payload` per kind.** The spec says
   "action-kind-specific payload"; this ADR locks the payload shapes as
   a Zod discriminated union so each kind's payload is typed (e.g.
   `kind: "set-value"` requires `payload: { field: string; value: number }`).
3. **`VerdictDimension.isNumericField: boolean`.** The spec's "numeric field"
   rule (non-ok numeric → range required) is runtime-enforced via an
   explicit boolean on the dimension rather than by field-name pattern
   matching. The Specialist that constructs the dimension knows whether
   its field is numeric; shifting the classification earlier is cheaper
   and avoids a runtime registry of field types.
4. **`VoiceRenderedString` + `__castVoiceRendered` internal helper.** The
   spec calls for a `Branded<string, "voice-rendered">` type. The
   implementation exposes the cast as `__castVoiceRendered` which is only
   imported by `voice-renderer.ts`. Specialists cannot construct branded
   strings without deliberately importing this internal helper.

### Severity — 4 tiers vs legacy 3

We keep the 4-tier `Severity = "ok" | "advisory" | "warning" | "block"`.
The legacy 3-tier `WatchdogSeverity = "ok" | "warn" | "alert"` maps as
`"warn" → "advisory"`, `"alert" → "warning"`. `"block"` is new and
reserved for hard-stop verdicts in Phase 4+ (e.g. configurations that
violate an accounting identity the engine cannot resolve).

The mapping helper `fromLegacySeverity()` lives in the contract file so
Phase 3b's watchdog backfill is one import away from converting.

### Conviction floor in the Router

The conviction-floor decision (when to downgrade `severity` to `"ok"` and
emit developing-data voice) is the Router's responsibility, not the
Specialist's and not the Voice Renderer's. Reasons:

- Specialists cannot apply admin overrides (the admin may have flagged a
  dimension as "below-floor-acceptable with audit reason"); the Router is
  where admin context threads.
- The Voice Renderer is pure and input-driven; asking it to also apply
  business logic about when a severity should be downgraded would blur its
  single responsibility (rendering structured input into strings).
- The conviction-floor decision must be made BEFORE the Voice Renderer
  runs, since the renderer's forbidden-patterns check only triggers on
  strings that have already been composed — a below-floor dimension should
  never reach string composition with a range at all.

The Voice Renderer has a second-layer guard (`qualityScore < CONVICTION_FLOOR`
always produces developing-data voice) so a buggy Specialist that bypasses
the Router cannot leak a low-conviction range into user output.

### Pure Voice Renderer + env-branched enforcement

The renderer is pure — same inputs produce same output. Violations:

- In **dev / test** (`process.env.NODE_ENV !== "production"`) throw
  `PersonaViolationError`. Tests assert throws.
- In **production** log the violation with the matched pattern label and
  return the sanitized text (offending tokens replaced via the same
  `FORBIDDEN_VOICE_PATTERNS` list).

This is defense in depth. Static vocabulary tests prevent literal strings.
The runtime renderer prevents composed strings. Sanitization in prod
prevents a deploy-breaking throw for a subtle pattern that slipped through.

### Quality Scorer weights

The weights match `docs/architecture/analyst/quality-scoring.md`:

| Component | Weight |
|---|---|
| Source count vs minimum | 15% |
| Source mix tier | 20% |
| Data age (365-day linear decay) | 15% |
| Range spread vs benchmark variance | 15% |
| Cross-source convergence | 20% |
| Persona fit | 15% |

#### Calibration plan

The weights are calibrated against `tests/analyst/personas/lb.test.ts`. When
Phase 4+ adds new Specialists and persona fixtures, calibration may shift
weights. Any weight change requires:

1. Updating the weight table in this ADR with the new numbers + rationale.
2. Updating `docs/architecture/analyst/quality-scoring.md`.
3. Updating `engine/analyst/quality/quality-scorer.ts`'s
   `QUALITY_COMPONENT_CAPS`.
4. Re-running the persona golden bench and updating any goldens whose
   score changed.

The initial anchors we test:
- A "perfect" input (3 `db_table` sources fresh, tight range, full
  consensus, persona fit 1.0) scores ≥ 95.
- An "estimated-only" input (1 estimated source, 365 days old, wide range,
  0.2 consensus, persona fit 0.3) scores < `CONVICTION_FLOOR` (40).

---

## Consequences

### Positive

- **One contract, one Router, one Renderer, one Scorer.** Future
  Specialists are small — just the evaluation logic — because the
  surrounding infrastructure is shared.
- **Every Specialist's output is statically and dynamically validated.**
  TypeScript catches shape drift at compile time. Zod catches invariant
  violations at construction time. The persona renderer catches forbidden
  strings at runtime. Tests anchor calibration.
- **The Router's conviction-floor decision means Specialists can be
  optimistic.** A Specialist sees a range outside benchmark → emits
  `severity: "warning"`. The Router downgrades if evidence quality
  doesn't support it. Specialists don't need to know about override
  flags or admin policy.
- **Phase 3b's watchdog backfill is mechanical.** `fromLegacySeverity` +
  the action-kind mapping gloss over the 3→4 severity delta. The existing
  `WatchdogResult` converts field-by-field.

### Negative

- **The branded `VoiceRenderedString` adds compile-time friction.** A
  Specialist cannot just write `dimension.voice.headline = "..."`. This is
  intentional but may confuse contributors who haven't read the skills
  first. Mitigation: `steward.md` and this ADR both document the flow; the
  `__castVoiceRendered` name is deliberately ugly to signal "don't call
  this directly."
- **The `buildAnalystVerdict()` factory is mandatory.** Specialists must
  use it; hand-constructing `AnalystVerdict` won't trigger refinements.
  Mitigation: the type is exported as a computed shape (not a plain
  interface), making hand-construction awkward enough that reviewers will
  flag it.
- **The Voice Renderer's sanitization in prod is a soft fallback.** A
  subtle persona violation could reach users if dev tests don't cover it.
  Mitigation: dev/test mode always throws; coverage expands with each new
  Specialist's persona test.
- **Weight changes require an ADR amendment.** This is intentional
  friction — calibration shifts should not be casual — but it does mean
  a persona-test failure can't be "fixed" by tweaking a weight without
  updating two documents.

### Neutral / Notable

- The contract does not specify a serialization format. HTTP/SSE shapes
  are the route layer's concern (Phase 3b).
- The contract does not specify a persistence schema. Phase 3b decides
  whether `assumption_guidance` grows a verdict column, a new `verdicts`
  table lands, or JSONB wraps the full shape.
- The contract does not bind client UI. Phase 3b updates the React
  watchdog dialog to consume `voice.headline` / `voice.detail` — until
  then, the two existing tab evaluators continue to return
  `WatchdogResult` via re-export shims.

---

## Alternatives considered

### Alternative A: Let each Specialist craft its own voice

Reject. Tone would drift across ~12 Specialists; forbidden patterns would
slip through; A/B testing of wording would be impossible.

### Alternative B: Put conviction-floor logic in the Voice Renderer

Reject. The renderer is pure and input-driven. Adding business logic
about override semantics muddles its job. The Router is the right place
because it also threads admin context and multi-Specialist aggregation.

### Alternative C: Use field-name patterns to infer `isNumericField`

Reject. Requires a registry that drifts. Making the Specialist assert
the flag is cheaper and explicit.

### Alternative D: Separate "raw" and "rendered" verdict types exported equally

Reject. The only place that constructs rendered verdicts is the Router
(via Voice Renderer). Exporting the raw type alongside the rendered type
invites Specialists to construct rendered verdicts themselves — defeating
the branded-string static check. The raw intermediate lives as
`RawVerdictDimension`; only the final `AnalystVerdict` is exported for
consumption.

### Alternative E: No Zod — use TypeScript types only

Reject. TypeScript catches shape at compile time but not invariants
(`overallSeverity = max(dimensions.severity)`, `tier 1 requires
cognitiveRunId`, etc.). Zod refinements make the invariants executable.

---

## Implementation notes

- **File sizes:** `verdict.ts` ~320 lines, `surface-router.ts` ~250 lines,
  `voice-renderer.ts` ~280 lines, `quality-scorer.ts` ~200 lines. Tests
  add ~500 lines. No dead code.
- **`engine/analyst/{contracts,router,voice,quality}/index.ts`** each
  become `export * from "./<file>";` — one line, removes the Phase 2
  placeholder.
- **`tests/analyst/`** globs under vitest's existing `tests/**/*.test.ts`
  pattern. No config change needed.
- **`.claude/rules/analyst-verdict-contract.md`** is replaced in the same
  commit as the code lands. The Phase 1b placeholder becomes the
  binding post-Phase-3 rule.

### Phase 3b (Replit Agent, parallel-then-serial)

Phase 3a freezes the contract. Phase 3b backfills:

1. `engine/watchdog/capitalRaiseEvaluator.ts` →
   `engine/analyst/surface/mgmt-co/funding-specialist.ts` returning
   `AnalystVerdict`. Legacy path becomes a `@deprecated` re-export shim.
2. `engine/watchdog/revenueEvaluator.ts` → same pattern.
3. `server/routes/global-assumptions.ts` `/save-tab` handler calls
   `createSurfaceRouter()` instead of the inline `if (tabKey === ...)`
   chain.
4. React watchdog dialog component reads `voice.headline` /
   `voice.detail` instead of crafting strings client-side.
5. `tests/analyst/personas/lb.test.ts` cases 1 and 2 swap stubs for the
   real backfilled Specialists.
6. A `verdicts` cache table OR extension of `assumption_guidance`
   persists the latest `AnalystVerdict` per `(orgId, assumptionField)`.

---

## References

- ADR-001 — two-tier architecture
- ADR-002 — `engine/analyst/` skeleton + CODEOWNERS + naming-lint
- `docs/architecture/ANALYST.md` — architecture spine
- `docs/architecture/analyst/verdict-contract.md` — contract spec (may be
  amended in this commit to reflect the deviations listed above)
- `docs/architecture/analyst/surface-router.md` — Router spec
- `docs/architecture/analyst/voice-rendering.md` — Voice Renderer spec
- `docs/architecture/analyst/quality-scoring.md` — Quality Scorer spec
- `.claude/rules/the-analyst-persona.md` — the persona contract this
  enforces at runtime
- `.claude/rules/analyst-team.md` — internal vocabulary
- `.claude/rules/analyst-verdict-contract.md` — rule now binding
- `.claude/skills/analyst/orchestrator.md` — Surface Router skill
- `.claude/skills/analyst/voice.md` — Voice Renderer skill
- `.claude/skills/analyst/quality-scoring.md` — Quality Scorer skill
- `.claude/skills/analyst/steward.md` — change-control gate
- `shared/analyst-conviction.ts` — primitives we extend
- `engine/watchdog/capitalRaiseEvaluator.ts`,
  `engine/watchdog/revenueEvaluator.ts` — Phase 3b backfill targets
