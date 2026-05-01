# Skill: Analyst SDK Contracts

**Status:** Consolidated reference. Every contract/schema/branded type in the Analyst system, with location + purpose + change discipline.
**Parent skill:** `_index.md`.
**Audience:** anyone adding a Specialist, calling the Cognitive Engine, rendering a verdict, or modifying any of the load-bearing types below.

---

## When to load this skill

You're touching code that produces or consumes any of the following:
- An `AnalystVerdict` (Surface Specialist output, Router dispatch, Voice Renderer input, client UI)
- A `SynthesisOutput` (Cognitive Engine structured-output path, OT-A.3+)
- A `VoiceRenderedString` (anything that creates user-facing text)
- An `AnalystAction` / `VerdictAction.kind` discriminated union member
- The `FIELD_DEFINITIONS` per-field semantic contract
- Zod schemas in `shared/analyst-conviction.ts`, `engine/analyst/contracts/verdict.ts`, or `server/ai/synthesis-schema.ts`

If you're not sure, load this skill. Cheap to skim, expensive to drift.

---

## Contract inventory (single pane of glass)

| Contract | Location | Status | Change discipline |
|---|---|---|---|
| `AnalystVerdict` | `engine/analyst/contracts/verdict.ts` | **Frozen** — Phase 3a, ADR-003 | ADR required to add/rename/remove fields |
| `VerdictDimension` | same | Frozen | Same |
| `VerdictRange` | same | Frozen | Same |
| `VerdictAction` (discriminated union, 6 kinds) | same | Frozen | Kind additions require ADR + client-side handler |
| `Evidence` | same | Frozen | Tier additions require extractor + Scorer update |
| `VoiceRenderedString` (branded) | same | Frozen | The brand is the guarantee; don't cast around it |
| `RawVerdictDimension` | same | Internal to pipeline (Specialist → Router) | May evolve; don't export to clients |
| `buildAnalystVerdict()` factory | same | Frozen — mandatory for construction | Never hand-assemble `AnalystVerdict` objects |
| `CONVICTION_FLOOR`, `MIN_SOURCES_FOR_ADVICE` | `shared/analyst-conviction.ts` | Frozen | Change = ADR (both consume + refine widely) |
| `DataQualitySummary` | same | Frozen | Extend, don't narrow |
| `CanonicalResearchField` enum (41 keys) | `server/ai/synthesis-schema.ts` | **Extensible** — add new fields carefully | Must align with downstream consumers (`extractGuidance`, UI, Property.researchValues) |
| `FIELD_DEFINITIONS` (unit + denominator + scope per field) | same | Active; rule: `.claude/rules/field-definitions-no-prescription-hints.md` bans typical-range hints | Describe unit + denominator + scope + evidence-source cues; no numeric range hints |
| `SynthesisOutputSchema` | same | **Active (default)** — OT-A.4 flipped `USE_AI_SDK_SYNTHESIS=true` in `7da9f25a`; legacy extractor retired | Zod-validated; schema failures fall through to `ORCHESTRATOR_BOTH_FAILED` sentinel |
| `NumericResearchValueSchema` | same | Frozen shape, field enum extensible | See FIELD_DEFINITIONS rule |
| `synthesisOutputToLegacyJson()` | same | Common envelope adapter | Feeds `extractGuidance`, UI render, single-model fallback. Retires when all consumers migrate to `SynthesisOutput.values[]` directly |
| `toLegacyResearchValuesMap()` | same | Legacy-bridge helper for `researchValues` persistence | Retained post-OT-A.4; converts `SynthesisOutput` → the `Record<string, ResearchValueEntry>` shape consumed by `Property.researchValues` |
| `formatFieldDefinitionsForPrompt()` | same | Synthesis prompt helper | Reads from `FIELD_DEFINITIONS` — update the const, not the helper |

---

## The one rule for every contract

**Construct through the provided factories.** Never hand-assemble:

- `AnalystVerdict` → `buildAnalystVerdict()` (runs Zod, computes `overallSeverity` and `overallQualityScore`)
- `VoiceRenderedString` → only `voice-renderer.ts` via `__castVoiceRendered` (branded type blocks other constructors at compile time)
- Specialist output → return `RawVerdictDimension[]` + top-level intent; let the Router + Voice Renderer + Quality Scorer fill in the rest

Hand-constructed objects skip invariant refinements and will pass tests locally while breaking downstream.

---

## AnalystVerdict — the surface contract

Every Surface Specialist returns this shape. Every route handler serializes it. Every client component consumes its `voice.*` fields.

**Seven invariants enforced by Zod refinements at build time:**

1. `overallSeverity === max(dimensions.severity)` — computed, not declared
2. `overallQualityScore` = severity-weighted avg of `dimensions.qualityScore`
3. Non-ok numeric dimension MUST carry a non-null `range`
4. Non-ok dimension with a range MUST have `qualityScore >= CONVICTION_FLOOR (40)`
5. Every dimension has `>= MIN_SOURCES_FOR_ADVICE (1)` evidence entries
6. Tier-1 verdicts require `meta.cognitiveRunId`
7. Tier-1 verdicts require `>= 3` total evidence entries across all dimensions (N+1 rule)

If any invariant fails, `buildAnalystVerdict` throws `InvalidVerdictError` with the failing Zod path. That exception is a bug in the Specialist or a design gap in the contract — **never catch-and-continue**.

**Severity ordering (4 tiers, ADR-003 fixed the mapping from 3-tier legacy):**

| 4-tier | Legacy 3-tier | Use |
|---|---|---|
| `ok` | `ok` | Within range, no action needed |
| `advisory` | `warn` | Calibration opportunity, nudge |
| `warning` | `alert` | Significant divergence, review |
| `block` | n/a (new) | Hard-stop; The Analyst will not endorse |

**VerdictAction.kind (6 values, discriminated by payload):**

| Kind | Payload | When |
|---|---|---|
| `consult-cognitive` | `{ field, reason }` | Surface Specialist wants Cognitive-Engine depth |
| `accept-range` | `{ field, range }` | User can endorse the recommended range |
| `set-value` | `{ field, value }` | User can apply a specific recommended value |
| `open-admin` | `{ tableName, rowId? }` | Route to admin benchmark table |
| `view-source` | `{ url, sourceName }` | Open the citation |
| `dismiss` | `undefined` | User acknowledges without action |

Note: **`save_anyway` is intentionally NOT in the union.** It's a UI-only ghost button the dialog renders outside the action list when `severity !== "ok"`, via `onProceedAnyway`. Phase 3b locked this.

---

## SynthesisOutput — the Cognitive Engine structured-output contract

**Status:** Active default post-OT-A.4 (commit `7da9f25a`). `USE_AI_SDK_SYNTHESIS=true` by default; legacy regex extractor retired.

Opus emits this shape via Vercel AI SDK `streamObject`. The `synthesisOutputToLegacyJson()` adapter (also in `synthesis-schema.ts`) converts `SynthesisOutput` into the legacy nested envelope consumed by `extractGuidance`, UI render, and the single-model fallback.

```
SynthesisOutput = {
  values: NumericResearchValue[]   // each field enum-restricted
  overall: {
    consensusRatio: number (0..1)  // from Cognitive Engine Phase 2 API validation
    keyTakeaways: string[]         // 1-5 bullets for UI summary
  }
}
```

Critical rule: **every `NumericResearchValue.field` must be a member of `CANONICAL_RESEARCH_FIELDS`.** Adding a new canonical field requires updating three locations atomically:

1. `CANONICAL_RESEARCH_FIELDS` array in `synthesis-schema.ts`
2. `FIELD_DEFINITIONS` entry (unit + denominator + scope)
3. Downstream consumers — `synthesisOutputToLegacyJson()` adapter + `extractGuidance` in `server/ai/guidance/extractor.ts`

Ship all three in a single commit or the schema and consumers drift silently.

---

## FIELD_DEFINITIONS — the per-field semantic contract

**The hardest-earned artifact in the Analyst system.** Pins unit + denominator + scope for every canonical field so Opus doesn't invent its own semantics.

Derived from industry practice (USALI conventions + Marriott/Hilton/Hyatt operator contract norms + what the legacy extractor historically parsed). Industry practice ≠ textbook; when they differ, industry practice wins because downstream consumers were built against it.

**Two bugs already caught and fixed in v3 (pre-OT-A.4):**

| Field | Wrong (v2) | Right (v3+) |
|---|---|---|
| `rampMonths` | "calendar months between ramp steps" | "TOTAL months from opening to stabilized occupancy" |
| `incentiveFee` | "% of TOTAL revenue" | "% of GOP (hospitality-standard)" |

When adding or refining a definition: grep `server/ai/guidance/extractor.ts` for the field's legacy path lookups (what extractGuidance reads from the envelope) and match the semantics, or consult the OT-A.3 history in `docs/operational-tooling/OT-A-3-*.md`. Rule `.claude/rules/field-definitions-no-prescription-hints.md` forbids numeric typical-range hints in the definition string.

---

## The acceptance gate that actually works

OT-A.3 taught us: aggregate bucket-match percentage is the **wrong** metric for stochastic two-shot comparisons. The right gate is **categorical**:

| Failure category | Threshold | Example |
|---|---|---|
| **Unit error** (orders of magnitude off) | **ZERO** allowed | `landValue: 5_000_000` when legacy emits `30` |
| **Denominator error** (wrong base) | **ZERO** allowed | `costFB: 65 (% of total)` when legacy emits `32 (% of F&B)` |
| **Scope error** (per-step vs cumulative) | **ZERO** allowed | `occupancyStep: 12 (cumulative)` when legacy emits `6.5 (per-step)` |
| **Stochastic variance on narrow-range fields** | **Accepted** | `costSeg5yrPct: 18 vs 23` — both in investor-defensible band |

The old path has the same stochastic variance — it's hidden inside free-form prose the extractor regex-parses, so it looks deterministic. Don't punish the new path for a noise floor the old path has too.

**When designing a future A/B harness:** categorize each disagreement. Block on categorical errors; accept stochastic variance.

---

## How this fits with the Cognitive Engine deep-dive

This skill describes **contracts** (what flows between components). The engine deep-dive at `.claude/notes/analyst-architecture.md` describes **mechanics** (how the three-model pipeline actually runs). Load both if you're making architectural decisions; load just this one if you're writing Specialist code and need to know the exact shape to return.

---

## Referenced files

- `engine/analyst/contracts/verdict.ts` — `AnalystVerdict`, `VerdictDimension`, `VerdictRange`, `VerdictAction`, `Evidence`, `VoiceRenderedString`, `buildAnalystVerdict()`
- `engine/analyst/router/surface-router.ts` — `createSurfaceRouter()`, `SpecialistFn`, `SurfaceRouterInputs`
- `engine/analyst/voice/voice-renderer.ts` — `createVoiceRenderer()`, `FORBIDDEN_VOICE_PATTERNS`
- `engine/analyst/quality/quality-scorer.ts` — `createQualityScorer()`, `QUALITY_COMPONENT_CAPS`
- `shared/analyst-conviction.ts` — `CONVICTION_FLOOR`, `MIN_SOURCES_FOR_ADVICE`, `meetsConvictionFloor()`
- `server/ai/synthesis-schema.ts` — `CANONICAL_RESEARCH_FIELDS`, `FIELD_DEFINITIONS`, `SynthesisOutputSchema`, `toLegacyResearchValuesMap()`, `formatFieldDefinitionsForPrompt()`
- `docs/architecture/decisions/ADR-001-analyst-two-tier.md` — why the split
- `docs/architecture/decisions/ADR-003-analyst-verdict-contract.md` — why these fields and not others
- `.claude/rules/analyst-verdict-contract.md` — binding rule
