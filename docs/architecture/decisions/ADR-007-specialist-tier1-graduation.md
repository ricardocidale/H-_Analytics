# ADR-007: Specialist Tier-1 Graduation — from deterministic gates to N+1 cognitive evaluators

**Status:** Proposed
**Date:** 2026-04-25
**Deciders:** Ricardo (product directive 2026-04-25 — "make Specialists super smart, use as much LLM, N+1, APIs, well-written prompts/contexts, links, tables as possible"); Claude Code (architect role); Replit Agent (executor of phases)
**Tags:** analyst, specialists, cognitive-engine, intelligence-bar, graduation, n+1, evidence

---

## Context

### What just changed

`/.claude/rules/specialist-intelligence-bar.md` (committed `6c1d165f`, 2026-04-25) sets a binding floor: every Specialist that backs an assumption tab MUST deliver Tier-1 cognitive output — N+1 synthesis, ≥3 cited evidence per dimension, comparables tables for numeric verdicts, live API resources where mapped, range-first delivery. The rule names the contract; this ADR designs the path from current state to the contract.

### Current state

| Specialist | Letter | Status today | Verdict source | Live API | Cited evidence | Comparables table |
|---|---|---|---|---|---|---|
| `mgmt-co.funding` | A | "built" — Phase 3b watchdog wrapper | `evaluateCapitalRaise` (deterministic) | ❌ none | ❌ benchmark labels only | ❌ none |
| `mgmt-co.revenue` | B | "built" — Phase 3b watchdog wrapper | `evaluateRevenue` (deterministic) | ❌ none | ❌ benchmark labels only | ❌ none |
| `mgmt-co.icp-intelligence` | C | "needs-page" | (not implemented) | — | — | — |
| `property.risk-intelligence` | D | "needs-page" | (not implemented) | — | — | — |
| `property.executive-summary` | E | "needs-page" | (not implemented) | — | — | — |
| `photos.photo-enhancer` | F | "built" (image-gen, exempt from rule) | image pipeline | n/a | n/a | n/a |
| `portfolio-ops.watchdog` | G | "needs-page" | (not implemented) | — | — | — |
| `constants.tax-research` | H | "needs-page" — Constants Specialist (different shape) | (not implemented) | — | — | — |
| `constants.macro-research` | I | "needs-page" — Constants Specialist | (not implemented) | — | — | — |
| `constants.depreciation-research` | J | "needs-page" — Constants Specialist | (not implemented) | — | — | — |
| `constants.reporting-research` | K | "needs-page" — Constants Specialist | (not implemented) | — | — | — |
| `resources.builder` | L | "built" (admin tooling, exempt) | admin form | n/a | n/a | n/a |

Five Specialists have user-facing assumption-tab surfaces that need to clear the bar (A, B, C, D, E, G — six counting Watchdog at portfolio level, even though it's not strictly an "assumption tab"). The four Constants Specialists (H, I, J, K) sit on a different shape — they write authority-sourced rows into `model_constants` rather than emit per-tab verdicts — and graduate against a separate but related contract.

### Forces

1. **Doctrine-first vs. ship-first.** Without a written graduation pattern, P7 will land six more watchdog-wrapping Specialists because that's what the existing pattern teaches. Per `claude-replit-split.md §Doctrine Freeze Gate`, doctrine must stabilize before phase work.
2. **Cost economics matter.** N+1 (Gemini 2.5 Flash + Claude Sonnet 4.6 + Claude Opus 4.7 synthesis) is ~$0.40–0.70 per cold run today (per SYSTEM-MODEL.md §9). Six Specialists × frequent re-runs × portfolio of 10–50 properties = budget concern. ADR-004's verdict cache is the lever; this ADR establishes when it gets pulled.
3. **Incremental learning.** A one-shot rewrite of all six Specialists into Tier-1 mode is multi-week, blocks all other work, and forfeits the chance to learn from each graduation. Funding (the first) will surface design choices that change how Revenue (the second) is built.
4. **Fallback safety.** Tier-1 calls fail. Vendor outages, rate limits, network. The graduation pattern must include a deterministic fallback so a tab never renders blank intelligence — and the fallback must be visibly inferior so users don't mistake it for Tier-1 output.
5. **The cognitive façade is half-built.** `engine/analyst/cognitive/engine-client.ts` (Phase 5B of ADR-004) ships the read-side (cache hit/miss decision). The miss path that actually invokes `server/ai/research-orchestrator.ts` and reconstructs an `AnalystVerdict` is deferred. Graduation needs that miss path live before Specialist #1 can call it.

### What this ADR is NOT about

- Re-designing `AnalystVerdict` (that's ADR-003, frozen).
- Re-designing the Cognitive Engine internals (`server/ai/research-orchestrator.ts` is treated as stable foundation).
- Re-designing Resources / assignment refs (ADR-006).
- Re-designing the verdict cache (ADR-004).
- The Constants Specialists (H–K). Their graduation is a sibling track; graduation pattern is similar but the output shape is `model_constants` rows, not `AnalystVerdict`. A separate ADR will cover them when their first graduates.

---

## Decision

### 1. The Tier-1 Specialist Pattern

Every Tier-1 Specialist MUST follow this skeleton:

```
SpecialistFn(payload, context) → AnalystVerdict
  ├─ 1. Build prompt-context     ← prompt-builder pulls property + portfolio + market
  ├─ 2. Resolve cache key         ← engine-client.computeCacheKey(...)
  ├─ 3. Cache read (engine-client.tryCacheRead)
  │     ├─ HIT  → reconstruct verdict from GuidanceSlim[] (skip 4-6)
  │     └─ MISS → continue
  ├─ 4. Cognitive run             ← engine-client.consultCognitive(prompt-context)
  │       returns { cognitiveRunId, dimensions[], evidenceItems[] }
  ├─ 5. Comparables fetch         ← live API resources by assignmentRef.kind === "api"
  │       returns ComparableRow[] per dimension (where applicable)
  ├─ 6. Build verdict             ← buildAnalystVerdict({
  │       dimensions: from step 4,
  │       evidence: from step 4 + step 5 source provenance,
  │       comparables: from step 5,
  │       meta.cognitiveRunId: from step 4
  │     })
  └─ 7. Voice render is downstream (Surface Router responsibility, unchanged)
```

The skeleton is deterministic at the top (steps 1–3) and bottom (step 6); the LLM work lives in step 4; the API work lives in step 5. Each step has a clean failure mode (see §3).

### 2. Order of graduation

Six assumption-tab Specialists graduate in this order, one per phase:

| Phase | Specialist | Why this order |
|---|---|---|
| **G1** | `mgmt-co.funding` (A) | Already wrapping a watchdog; clearest Tier-0→Tier-1 delta; smallest dimension count (5 dimensions); no per-property fan-out (mgmt-co scope) |
| **G2** | `mgmt-co.revenue` (B) | Same shape as Funding; second-instance validates the pattern; small dimension count |
| **G3** | `property.risk-intelligence` (D) | First **property-scoped** Specialist; introduces per-property fan-out (cache key includes propertyId); lessons feed G4-G5 |
| **G4** | `property.executive-summary` (E) | Property-scoped; reads OUTPUT of other Specialists' verdicts (composition pattern); validates the cross-Specialist read path |
| **G5** | `mgmt-co.icp-intelligence` (C) | Mgmt-co scope but most complex prompt (ICP definition is structural, not numeric — likely the Specialist that stress-tests the comparables-table requirement most) |
| **G6** | `portfolio-ops.watchdog` (G) | Cross-portfolio scope; runs LAST because it depends on the verdicts of properties + mgmt-co Specialists; new failure modes |

Each phase ships as one packet (per `_TEMPLATE.md` atomic budget) plus its golden-test bench. Phases do NOT bundle. G2 starts only after G1 lands clean and at least one session of soak time has passed.

### 3. Fallback policy — when Tier-1 fails

Three failure classes get distinct treatment:

| Failure | Cause | Treatment |
|---|---|---|
| **Cache hit but stale guidance** | Cache key matches but rows are flagged `superseded_at` or `engine_version_drift` is detected | Treat as MISS; proceed to Cognitive run. |
| **Cognitive run timeout / vendor 5xx / rate-limit** | The N+1 orchestrator throws within bounded retry | **Fall back to Tier-0 watchdog** (where one exists) and emit verdict with `meta.fallbackReason: "tier1_unavailable"` + `voice.intent: "developing-data"`. UI surfaces a "Tier-1 unavailable; showing best-effort intelligence" badge. NEVER crash or emit blank. |
| **API resource down / amber / red** | Live comparables fetch fails | Build verdict WITHOUT comparables block; evidence cites the benchmark fallback resource (assignmentRef where `kind === "benchmark"`); voice renders the same dimensions but the comparables `<table>` is replaced with a "Live data unavailable; showing benchmark range" notice. |

The fallback path is **visibly degraded** — always — so the user never mistakes Tier-0 output for Tier-1. The Intelligence Bar rule's six requirements still apply at the verdict-shape level (Tier-0 fallbacks emit `severity: "ok"` with `voice.intent: "developing-data"` per ADR-003 invariants), but the user-facing experience makes the degradation legible.

### 4. Cost containment

| Lever | Mechanism | Source of authority |
|---|---|---|
| Per-Specialist daily token budget | `specialistConfigs.workflowOverrides.dailyTokenBudget` (existing) | ADR-006 + existing Specialist config |
| Per-dimension cache | ADR-004 verdict cache, two-axis TTL + inputs-hash | ADR-004 |
| Engine-version fence | `cacheKey.engineVersion` invalidates on synthesis prompt edits | ADR-004 §4 invalidation-trigger 6 |
| Persona-aware caching | Cache-key includes `personaHash` (multi-tenant safe) | ADR-004 §3 |
| Per-property fan-out throttle | Property-scoped Specialists batch at most N concurrent runs (`maxConcurrentRuns` workflow override) | ADR-006 |

Every Tier-1 Specialist that ships MUST exercise all five levers. PR review checklist line: "Has this Specialist's daily-token-budget default been set in the catalog config? Has cache-key correctness been tested under property mutation?"

### 5. The "graduation packet" pattern

Each graduation phase produces a packet with this structure (formalized in `_TEMPLATE.md`'s sub-step shape):

- **S1** — Author the prompt-builder for this Specialist (pulls property + portfolio + market context). New file under `server/ai/specialists/<id>-prompt-builder.ts`. Tests assert prompt template references the actual property fields (Intelligence Bar requirement #2).
- **S2** — Wire the cognitive call: the existing watchdog-wrapping Specialist's evaluator body is replaced with the §1 skeleton. Cache key + cognitive client + verdict reconstruction.
- **S3** — Wire ≥1 live API assignmentRef on the catalog entry. Comparables fetcher + provenance. (When no live API exists for a dimension, the catalog entry stays at benchmark only and the Specialist's PR description documents why — Intelligence Bar §"What 'the bar' does NOT require".)
- **S4** — Add a golden-test bench (`tests/analyst/golden/<specialist-id>.test.ts`) with at least 3 fixture personas (e.g. "Aspen luxury wellness", "Outer Banks beach rental", "Medellín boutique hotel" for property-scoped; portfolio personas for mgmt-co). Each fixture asserts every Intelligence Bar invariant.
- **S5** — Ship the fallback: explicit test that simulates Tier-1 unavailable and asserts the verdict still emits with `meta.fallbackReason` set + the Tier-0 dimension shape preserved.
- **S6** — Update the Specialist's catalog entry: bump from `status: "needs-page"` (or watchdog wrapper) to `status: "built"` only when the bar test passes.

A graduation packet is ≤6 sub-steps, ≤3 source files (prompt-builder + Specialist + fallback wiring; tests live in their own files but count as one verification domain), 2 capability domains (`route` + `verification`).

### 6. Per-Specialist starter assignmentRefs

Every graduating Specialist ships with a minimum-viable set of API assignmentRefs declared in the catalog. The exact set is Specialist-specific but the floor is:

| Specialist | Minimum API resources to wire at graduation |
|---|---|
| Funding | An LP-comp dataset API (e.g., PitchBook / PrivateEquityInfo / a curated benchmark API) — even if the v1 fetcher is a stub returning canned data. Wiring matters; data quality follows. |
| Revenue | A market F&B / events / hospitality F&B share API where one exists; otherwise pre-loaded benchmark resource only and a documented "no live API mapped" Specialist-PR exception. |
| Risk Intelligence | Property-comp data API (FRED + Census + sentiment / hazard APIs as available). |
| Executive Summary | No new API; reads other Specialists' verdicts via composition. |
| ICP Intelligence | Demographics / psychographics API (Census ACS, SimilarWeb-style, etc.) — at least one. |
| Watchdog | No new API; aggregates portfolio verdicts. |

Catalogs ship with `assignmentRefs.kind === "api"` populated. Falling back to benchmark-only is the bar-met behavior when API is unmapped.

---

## Consequences

### Positive

- **Bar is enforceable, not aspirational.** A graduation phase fails to merge if the bar test (the proof gate authored at §5/S4) fails. Reviewers stop waving through deterministic stubs.
- **Cost is bounded by ADR-004 cache + per-Specialist budget.** Worst case is a graduating Specialist's bench-test cost (~5 cognitive runs × $0.40–0.70 = ~$2–4 per CI run); steady-state cost is cache-hit-dominant.
- **Each graduation teaches the next.** G1 → G6 is a learning sequence, not parallel rollout. Pattern revisions (e.g., "comparables fetcher should batch") land between phases, not mid-rollout.
- **Fallback degradation is legible.** Users never see blank intelligence, and they always know when they're seeing best-effort vs Tier-1 output. Trust in Tier-1 grows because the fallback is visibly worse.
- **The cognitive façade gets exercised early.** ADR-004 Phase 5B's miss path (currently deferred) becomes blocking for G1, which forces it to ship.

### Negative

- **Six phases, six cycles.** Realistically 6–10 weeks at one graduation per session-cluster. P7's "all 5 Specialists C–G get evaluators" framing is invalidated; P7 becomes a queue of 6 packets, not one.
- **Watchdog evaluators don't go away immediately.** They become the fallback path. Each graduation keeps the watchdog wired for its fallback case — the Tier-0 logic stays as code, just demoted from primary.
- **Cost step-change.** Tier-0 was ~$0/Specialist; Tier-1 with caching is ~$5–15/Specialist/day at portfolio scale. Six Specialists fully graduated is on the order of $30–90/day in steady state. Tolerable given product positioning, but visible in the budget.
- **Engine-client.ts miss path is on the critical path.** ADR-004 Phase 5B's deferral becomes blocking. Either G1 waits, or Phase 5B v2 ships first as a CC explicit-delegation packet.

### Neutral / notable

- **Constants Specialists (H–K) stay on a separate track.** Their output is `model_constants` rows, not `AnalystVerdict`. They use the same N+1 cognitive engine but a different post-cognitive shape. A sibling ADR will cover their graduation pattern when the first one is ready.
- **Photos and Resource Builder remain exempt.** Image generation and admin tooling don't surface ranges to investors; the Intelligence Bar's requirements 4 + 5 don't apply there. Their evaluator codepaths stay deterministic.
- **Multi-tenancy postponed to Tier-1 maturity, not pre-graduation.** ADR-004's persona-aware cache keys are forward-compatible; no migration needed before G1.

---

## Alternatives considered

### Alt-1 — One-shot rewrite of all six Specialists into Tier-1 (rejected)

Treat graduation as one big phase: design the pattern once, apply to all six Specialists in parallel, ship as a single ADR + multi-packet bundle.

**Rejected because:**
- Multi-week timeline blocks every other initiative (P6 finish, ADR-004 5B/5C, ADR-005, OT-A.5).
- No incremental learning. The first Specialist's design choices are best-validated against the second; doing all six in parallel either freezes the design too early or ships six different patterns.
- Fallback strategy needs to be earned per Specialist (Funding's fallback is "evaluateCapitalRaise"; Risk Intelligence has no equivalent — needs new design). Doing all six together hides this asymmetry.
- The architect-driven rewrite-tax doctrine (`claude-replit-split.md §Doctrine Freeze Gate`, 2026-04-22 revision) is exactly the lesson against this pattern.

### Alt-2 — Keep watchdogs as primary; add Tier-1 as a sidecar advisory (rejected)

Watchdogs stay the primary verdict source. Tier-1 runs in parallel and surfaces as a "supplemental analysis" panel below the watchdog verdict.

**Rejected because:**
- Doubles cost without doubling value. Watchdog still draws CPU; Tier-1 still draws LLM tokens; user sees two outputs and has to reconcile them.
- Confuses the Intelligence Bar's verifiability gate. `meta.cognitiveRunId` would be on the sidecar, not the primary verdict — bar test fails.
- Ricardo's directive ("make Specialists super smart") isn't "add a smart sidecar to the existing dumb gates." The graduation IS the work.

### Alt-3 — Per-tab UI experimentation; let Tier-1 evolve into different shapes per Specialist (rejected)

Each Specialist designs its own output shape. Funding's verdict has citations + waterfall; Revenue's has cohorts; Risk's has heatmaps. The shared `AnalystVerdict` contract becomes a loose interface.

**Rejected because:**
- ADR-003 froze `AnalystVerdict` for exactly this reason. Per-Specialist shape divergence breaks the Voice Renderer's persona enforcement and the Surface Router's dispatch.
- Verdict-cache (ADR-004) needs a stable shape to hash against.
- The user-facing voice ("The Analyst") is singular per `the-analyst-persona.md`. Six different shapes break that contract.

### Alt-4 — Skip Funding/Revenue graduation; only build C–G as Tier-1 from the start (rejected)

Leave Funding and Revenue as watchdog wrappers (they "already work"), only invest the graduation cost on the unbuilt Specialists.

**Rejected because:**
- Funding and Revenue are the Specialists currently used in production save-tab handlers. They're the highest-leverage targets — graduating them affects every save-tab call, not just future tab work.
- The pattern needs to be validated against an existing-with-tests Specialist before being applied to a Specialist with no tests yet. G1 (Funding) + G2 (Revenue) are the natural test bed.
- Leaving the bar uncleared on the two most-used Specialists makes the rule selectively enforced, which corrodes its authority.

---

## Implementation notes

### Sequencing dependencies

```
ADR-004 Phase 5B v2 (cognitive miss path) ─┐
                                            ├─→ G1 Funding ─→ G2 Revenue ─→ G3 Risk ─→ G4 ExecSum ─→ G5 ICP ─→ G6 Watchdog
ADR-007 Acceptance ─────────────────────────┘
```

`engine/analyst/cognitive/engine-client.ts` Phase 5B v2 (the miss path that actually invokes the orchestrator and reconstructs an `AnalystVerdict`) is a precondition for G1. It currently ships as a deferred TODO; G1's first sub-step is filing a CC explicit-delegation packet for that work, OR Replit lands it independently first.

### Skill / rule cross-refs

- `.claude/rules/specialist-intelligence-bar.md` — the bar this ADR designs the path to
- `.claude/rules/the-analyst-persona.md` — voice contract (unchanged)
- `.claude/rules/analyst-verdict-contract.md` — verdict shape (unchanged, frozen)
- `.claude/rules/research-precision.md` — N+1 pipeline (unchanged)
- `.claude/skills/analyst/_index.md` — analyst skill entry; will get a "Tier-1 graduation" pointer at acceptance
- `.claude/skills/analyst/cognitive-engine.md` — façade reference; likely gets the miss-path implementation note at acceptance
- `.claude/skills/research/SKILL.md` — N+1 orchestrator reference (unchanged)

### Phase tracking

When this ADR moves to Accepted, six rows get added to `.claude/phases.md` under a new "Specialist Tier-1 Graduation (governed by ADR-007)" workstream:

| Phase | Scope | Status | Owner | Blocked-by | Next |
|---|---|---|---|---|---|
| G1 | Funding graduation | ⏳ Pending | Replit | ADR-007 Accepted + ADR-004 5B v2 shipped | — |
| G2 | Revenue graduation | ⏳ Pending | Replit | G1 ✅ + 1 session soak | — |
| G3 | Risk Intelligence graduation | ⏳ Pending | Replit | G2 ✅ | — |
| G4 | Executive Summary graduation | ⏳ Pending | Replit | G3 ✅ | — |
| G5 | ICP Intelligence graduation | ⏳ Pending | Replit | G4 ✅ | — |
| G6 | Watchdog graduation | ⏳ Pending | Replit | G5 ✅ | — |

### Acceptance criteria for this ADR

- Reviewed by Ricardo (the directive-author).
- Cross-referenced from `.claude/skills/analyst/_index.md`.
- Phase rows added to `.claude/phases.md`.
- The ADR-004 Phase 5B v2 packet (cognitive miss path) is queued (CC explicit-delegation request from Replit OR a Replit packet) before G1 starts.

---

## References

### Related ADRs

- ADR-001 — analyst two-tier architecture (sets the Tier-0 / Tier-1 distinction)
- ADR-003 — `AnalystVerdict` contract (frozen; this ADR builds on it)
- ADR-004 — verdict cache (cost mechanism for Tier-1 graduation)
- ADR-006 — Resources control plane (governs API + benchmark assignment)

### Related architecture docs

- `docs/architecture/analyst/cognitive-engine.md` — façade design
- `docs/architecture/analyst/mgmt-co-specialists.md` — Funding/Revenue current shape
- `docs/architecture/analyst/property-specialists.md` — Risk/ExecSum target shape
- `docs/architecture/ANALYST.md` — architecture spine

### Related rules

- `.claude/rules/specialist-intelligence-bar.md` — the bar (THE driver for this ADR)
- `.claude/rules/the-analyst-persona.md` — voice contract
- `.claude/rules/no-hardcoded-values.md` — anti-pattern this ADR helps eliminate
- `.claude/rules/research-precision.md` — N+1 pipeline + deterministic-tool protection
- `.claude/rules/claude-replit-split.md` — packet discipline + Doctrine Freeze Gate

### Related skills

- `.claude/skills/analyst/_index.md` — analyst skill entry
- `.claude/skills/research/SKILL.md` — N+1 pipeline reference
- `.claude/skills/resources/SKILL.md` — Specialist↔Resource governance
