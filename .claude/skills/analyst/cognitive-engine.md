# Skill: Cognitive Engine

**Status:** Built and stable. This skill is directive guidance for working with the Cognitive Engine façade, not a re-description of the engine itself.
**Authority:** `.claude/notes/analyst-architecture.md` is the mental-model authority for how the Cognitive Engine actually works. Read it first.
**Descriptive companion:** `docs/architecture/analyst/cognitive-engine.md`.
**Future façade:** `engine/analyst/cognitive/engine-client.ts` (Phase 2 stub → Phase 3 typed implementation).
**Parent skill:** `_index.md`.

---

## What this skill covers

The Cognitive Engine is the three-model parallel synthesis pipeline: Comparables Relaxation → Quantitative Panel (Gemini) + Market Panel (Sonnet) + Synthesis Panel (Opus) → Value Extraction. It's deeply built and treated as a stable foundation. This skill tells you how to use it from a Surface Specialist, and what bar a change to the Engine itself must clear.

---

## Hard rules

### 1. Specialists NEVER import `research-orchestrator.ts` directly

All access goes through `engine/analyst/cognitive/engine-client.ts`. The façade is introduced in Phase 2 as a thin re-export; Phase 3 adds typing, telemetry hooks, and eventual caching. The rule is enforced by CODEOWNERS (Phase 2) and, optionally, a naming-lint rule.

```ts
// WRONG
import { orchestrateResearch } from "server/ai/research-orchestrator";

// RIGHT (Phase 2+)
import { consult } from "engine/analyst/cognitive/engine-client";
```

A Specialist that imports directly — or a PR that adds such an import — bypasses every Engine-level hardening we'll add (telemetry, cache, error normalization). Reject such imports at review.

### 2. The N+1 evidence rule is non-optional for Tier-1 calls

When a Specialist consults the Cognitive Engine, the result MUST include at least 3 sources (`MIN_SOURCES_FOR_TIER1 = 3`). If the Engine returns fewer, the Specialist downgrades the verdict to `severity: "ok"` with a "developing data" voice note. Do NOT render a Tier-1 verdict with fewer than 3 sources.

Today's `analyst-table-refresh.ts` already enforces this via `MIN_SOURCES = 3`. The pattern applies to every Specialist that consults the Engine.

### 3. The deterministic-tool rule applies INSIDE the Engine

Any calculation expressible as a formula must use a deterministic tool from `calc/research/` (10 pure-function tools, registered in `calc/dispatch.ts`). The LLM's job is to call the right tool and interpret the result — not to do arithmetic.

See `.claude/rules/deterministic-tools.md`. This is what makes Engine output traceable and investor-defensible. A prompt change that asks Opus to "compute the cap rate" instead of "call `compute_cap_rate_valuation` and interpret" is a bug.

### 4. Cognitive Engine internals changes require an ADR

Any change to `server/ai/research-orchestrator.ts`, the three Cognitive Panel model choices (Gemini / Sonnet / Opus), the `calc/research/` tool roster, the vector memory namespace layout, `server/ai/staleness-detector.ts`, or `server/ai/confidence-scorer.ts` is an irreversible change. Write an ADR at `docs/architecture/decisions/ADR-NNN-<slug>.md` first. Reviewable. Merge the ADR before the code change, not with it.

---

## What the façade will expose (Phase 2+)

The planned public surface of `engine/analyst/cognitive/engine-client.ts`:

```ts
export async function* consult(req: CognitiveRequest): AsyncIterable<CognitiveResult>;
// Thin wrapper around orchestrateResearch. Adds typing. Phase 3 adds telemetry. Phase 5 adds caching.

export function isAvailable(): boolean;
// Health check — wraps the orchestrator's own isOrchestratorAvailable().
```

The `CognitiveRequest` shape is scoped to what a Specialist actually needs (surface, scope, propertyId?, fields[], personaContext) — not the full legacy `ResearchParams`. The façade converts.

---

## What the Engine gives you back

- Streaming `CognitiveResult` events, including the phase narration the UI renders.
- Structured output via `research-value-extractor.ts` → `assumption_guidance` rows.
- `qualityScore` inputs the Specialist can pass to the Quality Scorer (see `quality-scoring.md`).
- `cognitiveRunId` the Specialist attaches to its `AnalystVerdict.meta` for audit trail.

---

## When to consult the Cognitive Engine (decision tree)

Not every Specialist call needs the Engine. Consult WHEN:

1. The user explicitly clicked "Consult the Analyst" (`ResearchRequested` event).
2. A property's guidance is Due for review or Overdue (Staleness Specialist referral).
3. The market is thinly covered by benchmarks (few comps for the property's tier/market).
4. A field's value moves outside the benchmark range and the Specialist needs market context to advise.
5. ICP characterization — always Tier-1.
6. Admin Defaults table refresh — always Tier-1.

Otherwise: Tier-0 (constants + DB benchmark lookup, sub-second, no LLM). The default is Tier-0 and Tier-1 is opt-in per the conditions above.

---

## Don't re-invent what the Engine already solves

The Engine already handles:

- Comparables assembly with progressive constraint relaxation (`server/ai/comparables/relaxation-engine.ts`).
- Peer-set retrieval from pgvector memory (inside Neon Postgres; namespaces `research-history`, `comparables`, etc.).
- Dual-panel parallel LLM execution with single-panel graceful degradation.
- API validation against live market data (Xotelo, CoStar, FRED, etc.).
- Opus synthesis with streaming SSE events.
- Confidence tier scoring (`confidence-scorer.ts`).

If a Specialist wants to "ask the market" or "get a peer set" or "cross-validate against live data" — it calls the façade. Writing a parallel data path in a Specialist is a bug; the Engine is the only place that knows how to do this correctly.

---

## Open questions (tracked, not blocking)

From Claude Code's deep-dive note (`.claude/notes/analyst-architecture.md` §Open questions / my open questions). These are Phase 5 work items:

1. **Orchestrator-level cache** — ten clicks on the same property = ten full pipeline runs. Needs `(propertyId, fieldGroup, contextHash)` memo with TTL.
2. **`research-history` namespace** — may not be in the admin reindex menu; needs confirmation.
3. **Single-panel fallback prompt quality** — does Opus handle `[FAILED]` markers gracefully?
4. **Staleness re-run audit trail** — are old guidance rows superseded, deleted, or archived?
5. **Guidance ↔ engine seam** — is `assumption_guidance` read-only metadata with explicit user-accept writing to assumption columns?

These questions do not block Phase 1-4. They become Phase 5 work items with ADRs.

---

## What NOT to do

- Do not import `server/ai/research-orchestrator.ts` from a Specialist. Use the façade.
- Do not add LLM arithmetic (prompts that ask the model to compute numbers). Use a deterministic tool.
- Do not render a Tier-1 verdict with fewer than 3 sources.
- Do not bypass the Engine with a separate data fetch path from a Specialist.
- Do not re-tune the Engine's model selection or prompts without an ADR.
- Do not describe the Engine to the user — the user only sees The Analyst. "The Cognitive Engine" is internal vocabulary (`.claude/rules/analyst-team.md`).

---

## References

- `.claude/notes/analyst-architecture.md` — **authority** for the Engine's mental model
- `docs/architecture/analyst/cognitive-engine.md` — descriptive spec
- `docs/architecture/ANALYST.md` — architecture spine
- `.claude/rules/deterministic-tools.md` — the no-LLM-arithmetic rule
- `.claude/rules/research-precision.md` — N+1 evidence rule
- `.claude/skills/research/SKILL.md` — the Engine from the research-workflow angle
- `.claude/skills/analyst/steward.md` — change-control gate for Engine edits
