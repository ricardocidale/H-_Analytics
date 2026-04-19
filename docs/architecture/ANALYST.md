# The Analyst — Architecture Spine

**Status:** Living document. Phase 1 baseline (April 2026).
**Audience:** Replit Agent, Claude Code, future contributors.
**Authority:** This document is the spine. Per-component specs live under `docs/architecture/analyst/`. Architecture decisions live under `docs/architecture/decisions/`. Persona contract lives at `.claude/rules/the-analyst-persona.md` (non-negotiable).

---

## TL;DR — One paragraph

The Analyst is the singular AI agent that delivers ranges, verdicts, and intelligence on every assumption surface in H+ Analytics. To the user it is one voice. Internally it is a **two-tier system**: a small set of **Surface Specialists** (one per UI surface) call into a large pre-existing **Cognitive Engine** (research orchestrator + dual LLM panels + deterministic tools + vector memory) and return verdicts that a **Surface Router** renders in The Analyst's voice. The persona rule forbids ever exposing the team to the user — code uses team names, the UI never does.

---

## Why this document exists

Until now The Analyst has been **un-spined**: real engines existed (`server/ai/research-orchestrator.ts`, `server/ai/analyst-watchdog.ts`, `server/ai/analyst-table-refresh.ts`, `engine/watchdog/*Evaluator.ts`, `shared/analyst-conviction.ts`) but no document named the system, no contract unified them, and no gate governed changes to them. Each new contributor (human or agent) re-discovered the architecture from code. This document fixes that.

Two reference notes informed this spine:
1. `.claude/rules/the-analyst-persona.md` — the user-facing persona contract (singular voice, range-first, conviction-led).
2. `.claude/notes/analyst-architecture.md` — Claude Code's mental model of the existing Cognitive Engine (the brain Opus already built).

This spine reconciles them and adds the missing piece: the **Surface tier**.

---

## The two tiers

```
                  USER ACTION (save tab • open page • view ICP • run research)
                                  │
                                  ▼
                ┌────────────────────────────────────┐
                │         SURFACE ROUTER             │   pure dispatch, no LLM
                │  routes events → Specialists       │   renders verdicts in Analyst voice
                └────────────────────────────────────┘
                                  │
   ┌──────────┬──────────┬────────┼────────┬──────────┬──────────────┐
   ▼          ▼          ▼        ▼        ▼          ▼              ▼
 Mgmt-Co   Property   Admin     ICP   Cross-     Staleness       (future)
 Specialist Specialist Defaults     Portfolio   Specialist
 (per tab) (per tab)  Specialist                                  ◄── SURFACE TIER
                                  │
                                  ▼
                ┌────────────────────────────────────┐
                │       COGNITIVE ENGINE             │   Opus already built it
                │  orchestrateResearch + tools       │   See .claude/notes/analyst-architecture.md
                └────────────────────────────────────┘
                                  │
  Comparables Relaxation • Quantitative Panel (Gemini) • Market Panel (Sonnet)
  • Synthesis Panel (Opus) • Vector Memory (Pinecone) • Deterministic Tools (calc/research)
  • Validators • Confidence Scorer • Staleness Detector             ◄── COGNITIVE TIER
```

### Surface tier (the team Phase 1 names)

A **Surface Specialist** is a small, focused engine that:
- Knows one UI surface (a Mgmt-Co tab, a Property tab, the Admin Defaults page, the ICP builder, the cross-portfolio view, or the staleness lifecycle).
- Knows what to ask the Cognitive Engine for, and when to skip it.
- Returns a unified `AnalystVerdict` (defined in Phase 3).
- Never speaks to the user directly — its verdict goes through the **Voice Renderer** which enforces persona rules.

Today: 2 of ~12 Specialists exist (Funding, Revenue — at `engine/watchdog/capitalRaiseEvaluator.ts` and `revenueEvaluator.ts`, scheduled to migrate to `engine/analyst/surface/mgmt-co/` in Phase 2). Cross-Portfolio and Staleness are partially built inside `server/ai/analyst-watchdog.ts` and `server/ai/staleness-detector.ts`; they will be re-homed and re-shaped in Phase 4.

### Cognitive tier (already built, this spine just names it)

The Cognitive Engine is the brain Opus built and Claude Code documented. It is **not re-implemented** by this spine. See `.claude/notes/analyst-architecture.md` for the full mental model. Components:

| Component | File | Role |
|---|---|---|
| Research Orchestrator | `server/ai/research-orchestrator.ts` | AsyncGenerator; runs Phases 0-3 and streams SSE events |
| Comparables Relaxation | `server/ai/comparables/relaxation-engine.ts` | Phase 0; assembles peer set with progressive constraint loosening |
| Quantitative Panel | Gemini 2.5 Flash via `server/ai/clients.ts` | Numbers, ranges, benchmarks |
| Market Panel | Claude Sonnet 4.5 via `server/ai/clients.ts` | Narrative, risk, positioning |
| Synthesis Panel | Claude Opus 4.6 via `server/ai/clients.ts` | Reconciles A vs B, streams to client |
| Vector Memory | `server/ai/vector-store-service.ts` | Pinecone — 4 namespaces (knowledge-base, scenarios, properties, comparables) plus research-history |
| Deterministic Tools | `calc/research/*.ts` registered in `calc/dispatch.ts` | The 10 pure-function math tools; LLMs never compute arithmetic |
| Validators | `server/ai/research-validation.ts`, `calc/research/validate-research.ts` | Bounds, sanity, cross-field consistency |
| Confidence Scorer | `server/ai/confidence-scorer.ts` | Raw evidence → conviction tier |
| Staleness Detector | `server/ai/staleness-detector.ts` | "Up to date / Due / Overdue / Not yet reviewed" |
| Context Packs | `server/ai/context-pack/*.ts` | Typed property/company narratives, not raw rows |

### Surface Router (the orchestrator the user asked for)

Pure dispatch, no LLM. Sits between an HTTP route or save event and the right Surface Specialist. Owns:
- Event → Specialist routing
- Aggregating multi-Specialist findings when one event spans surfaces
- Mediating the **property ↔ Mgmt-Co bridge** (described below)
- Owning the conviction-floor decision (advise / advise-with-caveat / withhold)
- Calling the Voice Renderer before returning to the route

Today: doesn't exist. The current `/api/global-assumptions/save-tab` handler does this routing inline as an `if (tabKey === ...)` chain. Phase 3 extracts it.

---

## The property ↔ Mgmt-Co data bridge

Every Specialist that needs cross-surface data (Mgmt-Co Specialists referencing portfolio properties; ICP Specialist referencing both; Cross-Portfolio Specialist by definition) goes through the Cognitive Engine, never around it. Two existing mechanisms cover the bridge:

1. **Phase 0 progressive relaxation** (`comparables/relaxation-engine.ts`) pulls peer property data into the comps block that both Cognitive Panels see.
2. **Vector memory** retrieval — every research run feeds the next; Mgmt-Co runs can retrieve relevant property runs and vice-versa.

A Specialist requests cross-surface data by setting a scope flag on its Cognitive Engine call. There is no separate cross-surface fetch path. This keeps drift impossible: there's one place that knows how to assemble a comparable set.

---

## The unified verdict contract

Every Surface Specialist returns the same shape, defined in Phase 3 at `engine/analyst/contracts/verdict.ts`. See `docs/architecture/analyst/verdict-contract.md` for the full spec. Key fields:

- `specialistId` — which Specialist produced this
- `severity` — ok | advisory | warning | block
- `range` — { low, mid, high } when applicable; `null` for non-numeric verdicts
- `qualityScore` — 0-100, computed by the Quality Scorer
- `evidence[]` — sources with tier, recency, persona-fit
- `voice` — pre-rendered Analyst-voice strings (computed by Voice Renderer)
- `actions[]` — proposed remediations the user can accept

Today: the two existing tab evaluators return divergent shapes (`{status, alerts}` vs `FieldAlert[]`). Phase 3 backfills both to `AnalystVerdict` with re-export shims so callers don't break.

---

## Quality scoring

Range quality is not a bolt-on — it's the deliverable. The persona rule says: "NEVER show a range without a conviction level." The Quality Scorer (Phase 3, `engine/analyst/quality/quality-scorer.ts`) extends today's `shared/analyst-conviction.ts` primitives with:

1. Source count (N+1 minimum where Tier-1 evidence is required)
2. Source mix tier (db_table > api > web > estimated)
3. Data age (days since source-year)
4. Range spread vs benchmark variance
5. Cross-source convergence (already produced by `research-orchestrator.ts` `consensusRatio`)
6. Persona-fit bonus (does this source apply to L+B's segment?)

Resulting `qualityScore` (0-100) determines the verdict's conviction tier. See `docs/architecture/analyst/quality-scoring.md`.

---

## The voice rule (and why we have a Voice Renderer)

The persona rule (`.claude/rules/the-analyst-persona.md`) forbids:
- Plural ("the analysts", "our analysts", "your analysts")
- "the system generated" → "The Analyst reviewed"
- Showing a range without a conviction level
- Showing a conviction level without explaining what drives it
- Showing empty fields without ranges

A **Voice Renderer** (Phase 3, `engine/analyst/voice/voice-renderer.ts`) sits between every Specialist and every user-facing surface. It:
- Renders verdict fields into Analyst-voice strings
- Runtime-checks output against forbidden patterns
- Throws (in dev) or logs + sanitizes (in prod) on violation

This means Specialist code is free to use internal team vocabulary; only Voice Renderer output reaches the user.

---

## What the user calls things vs what code calls things

| User-facing | Code-facing | Where the rule lives |
|---|---|---|
| The Analyst | The Analyst (the system as a whole) | `.claude/rules/the-analyst-persona.md` |
| (never exposed) | Surface Specialist | This doc + `.claude/rules/analyst-team.md` (Phase 1b) |
| (never exposed) | Cognitive Engine | This doc + `.claude/notes/analyst-architecture.md` |
| (never exposed) | Cognitive Panel (Quantitative / Market / Synthesis) | This doc |
| (never exposed) | Surface Router | This doc |
| (never exposed) | Voice Renderer, Quality Scorer | This doc |

If you find an internal team term in user-facing code, it's a bug. The vocabulary test will catch most; Voice Renderer (Phase 3) catches the rest.

---

## Phased roadmap

| Phase | Scope | Status |
|---|---|---|
| **1a** | This spine + per-component docs + ADR-001 + ADR template | **Shipping now** |
| **1b** | `.claude/skills/analyst/` + `.claude/rules/analyst-team.md` + `.claude/rules/analyst-verdict-contract.md` | Handoff to Claude Code; brief at `docs/architecture/analyst/HANDOFF-claude-code-phase-1b.md` |
| **2** | `engine/analyst/` skeleton (re-exports only) + CODEOWNERS + naming-lint rule + ADR-002 | After 1a + 1b accepted |
| **3** | `AnalystVerdict` contract + Surface Router + Voice Renderer + backfill 2 existing evaluators + persona-keyed test bench | Project task |
| **4** | Build remaining Surface Specialists (Compensation, Overhead, Company, Property-Defaults, ICP, Cross-Portfolio, Staleness, per-tab Property Specialists) | Incremental, one PR each |
| **5** | Cognitive Engine reorg (`server/ai/` 41 flat files into 6 capability folders) + Claude Code's open questions (orchestrator cache, research-history reindex, guidance↔engine seam) | Mechanical move + targeted hardening |

---

## Reading order for a new contributor

1. `.claude/rules/the-analyst-persona.md` — what The Analyst *is* to the user
2. **This document** — the system shape
3. `.claude/notes/analyst-architecture.md` — the Cognitive Engine in depth (Claude Code's deep-dive)
4. `docs/architecture/analyst/surface-router.md` — how routing will work
5. `docs/architecture/analyst/verdict-contract.md` — the contract every Specialist meets
6. The per-Specialist docs in `docs/architecture/analyst/*-specialist*.md` for the surface you'll touch
7. `docs/architecture/decisions/` — the ADRs explain why irreversible choices were made

---

## Authoritative references

- Persona contract: `.claude/rules/the-analyst-persona.md`
- Cognitive Engine deep-dive: `.claude/notes/analyst-architecture.md`
- Per-component specs: `docs/architecture/analyst/`
- Architecture decisions: `docs/architecture/decisions/`
- Top-level system view: `docs/architecture/ARCHITECTURE.md`
- Intelligence pipeline (legacy doc, predates this spine): `docs/architecture/intelligence-pipeline.md`
