# Cognitive Engine

**Status:** Built. This document is a pointer, not a spec.
**Authoritative reference:** `.claude/notes/analyst-architecture.md` (Claude Code's deep-dive)
**Parent:** `docs/architecture/ANALYST.md`

---

## What it is

The Cognitive Engine is the existing three-model parallel synthesis pipeline that Opus built. It is not re-implemented or re-designed by this architecture spine. The two-tier picture treats it as a stable foundation that Surface Specialists call into when Tier-1 evaluation is required.

For the full mental model — phase-by-phase walkthrough, file references, design rationale, open questions — read `.claude/notes/analyst-architecture.md`. That document is the authority.

---

## What this spine adds

- **Names it.** "Cognitive Engine" is the canonical internal term. Not "the watchdog," not "the engine," not "the orchestrator" (that name is taken by the Surface Router at the higher tier).
- **Wraps it.** Phase 2 introduces `engine/analyst/cognitive/engine-client.ts` — a typed façade Specialists call instead of importing `research-orchestrator.ts` directly.
- **Governs it.** Changes to Cognitive Engine internals go through the steward checklist (`.claude/skills/analyst/steward.md`, Phase 1b).

---

## Components (summary, see CC's note for detail)

| Component | File |
|---|---|
| Research Orchestrator (the brain) | `server/ai/research-orchestrator.ts` |
| Comparables Relaxation Engine | `server/ai/comparables/relaxation-engine.ts` |
| Quantitative Panel (Gemini 2.5 Flash) | invoked via `server/ai/clients.ts` |
| Market Panel (Claude Sonnet 4.5) | invoked via `server/ai/clients.ts` |
| Synthesis Panel (Claude Opus 4.6) | invoked via `server/ai/clients.ts` |
| Vector Memory | `server/ai/vector-store-service.ts` |
| Deterministic Tools (10 calc functions) | `calc/research/*.ts`, registered in `calc/dispatch.ts` |
| Validators | `server/ai/research-validation.ts`, `calc/research/validate-research.ts` |
| Confidence Scorer | `server/ai/confidence-scorer.ts` |
| Staleness Detector | `server/ai/staleness-detector.ts` |
| Context Packs | `server/ai/context-pack/*.ts` |
| Prompt Builders | `server/ai/research-prompt-builders.ts`, `server/ai/research-tool-prompts.ts`, `server/ai/prompt/*.ts` |
| Value Extractor | `server/ai/synthesis-schema.ts` (`synthesisOutputToLegacyJson` adapter), `server/ai/guidance/*.ts` |
| Ambient Fetchers | `server/ai/ambient/*.ts` + `server/services/MarketIntelligenceAggregator.ts` |
| LLM Plumbing | `server/ai/clients.ts`, `llm-registry-manager.ts`, `resolve-llm.ts`, `llm-recommender.ts`, `llm-health-probe.ts` |
| Source Health | `server/ai/source-health-checker.ts` |
| Knowledge Base | `server/ai/kb-content.ts`, `server/ai/knowledge-base.ts` |
| Vector Indexing | `server/ai/vector-indexing.ts` |

These ~25 files (out of `server/ai/`'s 41) are the Cognitive Engine. Phase 5 of this architecture program reorganizes `server/ai/` into capability sub-folders matching this taxonomy. No files are renamed in Phase 1; this is a destination, not a starting state.

---

## How Specialists call it (Phase 2+)

```ts
// engine/analyst/cognitive/engine-client.ts (Phase 2 stub, Phase 3 implementation)
import { orchestrateResearch } from "server/ai/research-orchestrator";
import type { CognitiveRequest, CognitiveResult } from "../contracts";

export async function* consult(req: CognitiveRequest): AsyncIterable<CognitiveResult> {
  // typed wrapper; eventually adds caching, telemetry, error normalization
  yield* orchestrateResearch(req.toLegacyParams());
}
```

Specialists never import `research-orchestrator.ts` directly. The Phase 2 façade and Phase 3 typing are what enforce this.

---

## Open questions (from Claude Code, to address in Phase 5)

1. **No orchestrator-level cache.** Ten clicks on the same property = ten full Gemini + Sonnet + Opus runs. Candidate solution: `(propertyId, fieldGroup, contextHash)` memo with TTL.
2. **`research-history` namespace** may not be in the admin reindex menu — needs confirmation against `server/routes/admin/intelligence-vector-store.ts`.
3. **Single-panel fallback prompt quality** — when one of Gemini or Sonnet fails, the synthesis prompt still expects both; does Opus handle the `[FAILED]` marker gracefully?
4. **Staleness re-run audit trail** — see `staleness-specialist.md` for the proposed policy.
5. **Guidance ↔ engine seam** — confirm and document that `assumption_guidance` is read-only metadata; user explicit accept is what writes to assumption columns.

These do not block Phase 1-4. They become Phase 5 work items.
