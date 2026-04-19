# ADR-001: Two-Tier Architecture for The Analyst

**Status:** Accepted
**Date:** 2026-04-19
**Deciders:** Replit Agent (proposer), human steward
**Tags:** analyst, architecture, vocabulary

---

## Context

Until April 2026, The Analyst existed as a sophisticated but un-spined collection of engines. The Cognitive pipeline (`server/ai/research-orchestrator.ts` and ~25 supporting files) was deeply built — three-model parallel synthesis, deterministic-tool enforcement, vector memory, comparables relaxation. But the watchdog and per-tab evaluation surfaces (`server/ai/analyst-watchdog.ts`, `engine/watchdog/*Evaluator.ts`, field-alert paths) were partial, returned divergent shapes, and had no unifying contract or routing layer.

The user requested a "team of specialists with an orchestrator" coordinating evaluation across Mgmt-Co assumptions, Property assumptions, Admin defaults, ICP, and cross-portfolio surfaces. The persona rule (`.claude/rules/the-analyst-persona.md`) forbids exposing any team to the user — The Analyst must always appear singular.

These two pressures — a real need for internal team structure, and a hard rule against user-facing plurality — required reconciliation.

---

## Decision

The Analyst is structured as **two tiers** with a clear separation of concerns:

1. **Surface tier — Specialists.** One Specialist per UI surface (Mgmt-Co per-tab, Property per-tab, Admin Defaults, ICP, Cross-Portfolio, Staleness). Each is a small, focused engine that knows its surface and returns a unified `AnalystVerdict`. Specialists are the team Phase 4 builds out.

2. **Cognitive tier — Engine.** The existing pipeline Opus built and Claude Code documented in `.claude/notes/analyst-architecture.md`. Treated as a stable foundation. Surface Specialists call it via a typed façade (Phase 2+) when Tier-1 evaluation is required. The Cognitive tier is internally a team (Quantitative Panel, Market Panel, Synthesis Panel, deterministic tools, vector memory, comparables relaxation) but that team is the Cognitive Engine's internal structure, not the Surface team.

3. **Surface Router.** A pure-dispatch layer between HTTP routes and Specialists, wrapped by a Voice Renderer. No LLM. The user's "orchestrator" lives here.

User-facing voice remains singular: "The Analyst." Internal vocabulary is plural and team-shaped: "Surface Specialists", "Cognitive Engine", "Cognitive Panels", "Surface Router", "Voice Renderer", "Quality Scorer". The Voice Renderer (Phase 3) enforces the persona rule at runtime.

---

## Consequences

### Positive

- **Names what exists.** The Cognitive Engine has a name and a documented home. Future contributors stop re-discovering the architecture from code.
- **Names what's missing.** The Surface tier becomes a buildable backlog with a clear contract (`AnalystVerdict`) instead of an ad-hoc "more watchdog code".
- **Resolves the persona-vocabulary tension.** The persona rule remains intact for users; code gets the team vocabulary it needs.
- **Each tier has its own change-control discipline.** Cognitive Engine changes are rare and high-impact; Surface Specialist changes are frequent and per-PR. Different gates, same steward.
- **Property ↔ Mgmt-Co bridge is implicitly solved.** Both tiers already share comparables relaxation and vector memory; cross-surface data flow doesn't require new infrastructure.

### Negative

- **Two tiers means two places to look.** A bug in field-evaluation could be in the Specialist or in the Cognitive Engine; debugging requires knowing which.
- **The `AnalystVerdict` contract becomes a coordination point.** Adding a field requires an ADR; this is intentional friction but it is friction.
- **Some existing files are renamed or re-homed.** `engine/watchdog/*Evaluator.ts`, `server/ai/analyst-watchdog.ts`, `server/ai/analyst-table-refresh.ts` move to `engine/analyst/surface/...`. Re-export shims mitigate but the cognitive load isn't zero.

### Neutral / Notable

- The Cognitive Engine internals are NOT re-designed. This ADR is purely about adding the Surface tier and naming the existing Cognitive tier; it does not re-litigate Opus's pipeline design.
- The Surface Router's name was chosen specifically to avoid collision with `orchestrateResearch`. The user calls this the "orchestrator" colloquially; in code we use "Surface Router".

---

## Alternatives considered

### Alternative A: One flat layer of Specialists, no Cognitive tier separation

Merge everything into a single "team of analysts" without the two-tier distinction. Each Specialist handles its own LLM calls, prompt building, and synthesis.

Rejected because: it would require re-implementing the Cognitive Engine's Opus-built pipeline N times (one per Specialist), or worse, duplicating it. The Cognitive Engine's investment value is precisely that it's a shared, deeply-built capability.

### Alternative B: Single monolithic Analyst module

Keep everything in `server/ai/` flat, add a unified verdict contract, skip the surface/cognitive split.

Rejected because: it doesn't solve the routing problem (the `if (tabKey === ...)` chain in `save-tab` keeps growing) and it doesn't give per-surface stewardship (Compensation Specialist would be lost in the same folder as `kb-content.ts`).

### Alternative C: Expose the team to the user as "The Analyst Team"

Drop the singular-voice rule, embrace plurality in UI.

Rejected because: the persona rule is non-negotiable per `the-analyst-persona.md`, and the singular voice is a deliberate product choice (one trusted intelligence agent, not a committee). The two-tier picture preserves this rule perfectly: the team exists, but only in code.

---

## Implementation notes

- **Phase 1a** (this ADR's accompanying work): the spine doc and per-component specs under `docs/architecture/`. Zero code change.
- **Phase 1b** (handoff to Claude Code): `.claude/skills/analyst/` and `.claude/rules/analyst-team.md` codify the vocabulary.
- **Phase 2:** `engine/analyst/` skeleton (re-exports only) + CODEOWNERS + naming-lint. ADR-002 will lock the verdict shape.
- **Phase 3:** `AnalystVerdict` contract + Surface Router + Voice Renderer + backfill of the two existing tab evaluators.
- **Phase 4:** Build remaining Surface Specialists incrementally.
- **Phase 5:** Cognitive Engine reorg (file moves) + targeted hardening (orchestrator-level cache, etc.).

Re-export shims with `@deprecated` JSDoc are required for every move. No big-bang renames.

---

## References

- `docs/architecture/ANALYST.md` — the spine doc
- `.claude/rules/the-analyst-persona.md` — persona contract
- `.claude/notes/analyst-architecture.md` — Claude Code's deep-dive on the Cognitive Engine
- `docs/architecture/intelligence-pipeline.md` — legacy pipeline doc, predates this ADR
- ADR-002 (planned) — unified verdict shape
- ADR-003 (planned) — orchestrator-level cache for the Cognitive Engine
