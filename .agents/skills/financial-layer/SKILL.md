---
name: financial-layer
description: >
  The H+ financial agent layer: how financial data flows from the deterministic
  engine to every consumer (slide factory, report surfaces, Rebecca). Covers the
  two-branch architecture (deterministic reads via Marco/Felix/Elisa vs. diagnostic
  intelligence via Gustavo's specialists), Lucca as the bridge, the cost/trigger
  model for each branch, and what to add when a new consumer needs financial data.
  Load when designing or extending any surface that consumes financial output.
---

# Financial Layer

The financial layer is the agent architecture that sits above the deterministic
financial engine and delivers financial data to consumers — the slide factory,
report surfaces, Rebecca, and any future output layer.

**Core rule:** The engine is deterministic and pure. The agent layer never
re-implements calculation logic — it reads engine output, interprets it (when
LLM judgment is needed), and packages it for presentation. The engine's
invariants (ADR-007, CLAUDE.md Section 4) are never relaxed.

---

## Two Branches — Never Merge Them

```
lib/engine/src/ + lib/calc/src/  (pure deterministic math — no LLM, no storage)
        │
        ├── Branch A: Deterministic reads
        │     Dispatched by Marco (slide factory orchestrator)
        │     Felix-01, Elisa-01 read aggregateUnifiedByYear / stable-year payloads
        │     Felix-03 validates arithmetic
        │     Cost: $0. Trigger: Marco factory dispatch.
        │
        └── Branch B: Diagnostic intelligence
              Dispatched by Gustavo (analyst orchestrator)
              Specialists: Ana (Funding), Bia (Revenue), Daniela (Risk),
                           Quitéria (Returns / letter R, ADR-010),
                           Rafaela (Distributions / letter S, ADR-010),
                           + 12 others
              Cost: ~$0.80/AnalystButton press. Trigger: admin AnalystButton only.
              Output: cached verdicts with citations and comparables tables
```

These branches have incompatible cost models and trigger disciplines. They must
never be merged into a single orchestrator.

---

## Lucca — The Bridge

Lucca is the only agent that reads **both** branches and combines them into
slide-ready narrative copy.

```
Branch B cached verdicts (Gustavo specialists)
        │
        └──▶ Lucca (Content Drafter, cross-app)
                  │  reads: Quitéria verdict (IRR health)
                  │  reads: Rafaela verdict (distribution structure)
                  │  reads: property data + context
                  └──▶ Approved narrative slots → Marco dispatches slide teams
```

Lucca produces the copy for:
- **Slide 3** — investment thesis, vision bullets, strategic details, rationale cards
- **Slide 5** — transformation narrative (left-panel comparison, investor summary copy)

Lucca does **not** produce financial table data. Numbers on slides come from
Branch A (deterministic engine reads), never from Lucca's narrative pass.

---

## Data Flow by Slide

| Slide | Data source | Agent responsible | LLM cost |
|---|---|---|---|
| Slide 1 — Pipeline Spotlight | Property metadata + Lucca copy | Sofia-02 | Lucca pass only |
| Slide 2 — Photo Gallery | Property photos | Bianca-02 | Lucca pass only |
| Slide 3 — Investment Model | Lucca copy (from Gustavo verdicts + property data) | Chiara-02 | Lucca pass only |
| Slide 4 — Portfolio Grid | Portfolio property list (deterministic) | Dario-01 (deterministic) | $0 |
| Slide 5 — Financial Snapshot | Lucca copy + stable-year NOI / financing summary (Elisa-01) | Elisa-02 | Lucca pass only |
| Slide 6 — Income Statement | `aggregateUnifiedByYear` output (Felix-01) | Felix-02, Felix-03, Felix-04 | Felix-02 + Felix-04 only |

**Slide 6 is engine-only.** The 10-year pro forma table must never depend on
a Gustavo specialist verdict. Felix-03 validates the arithmetic deterministically
before Felix-04 applies formatting. No LLM may produce or adjust the financial
figures in Slide 6.

---

## Gustavo's Specialist Roster (Current + Planned)

### Built (letters A–Q)

| Letter | Name | Domain | Subject |
|---|---|---|---|
| A | Ana | Funding Intelligence | mgmt-co |
| B | Bia | Revenue Intelligence | mgmt-co |
| C | Cecília | ICP Intelligence | mgmt-co |
| D | Daniela | Property Risk Intelligence | property |
| E | Eloá | Executive Summary | property |
| F | Fernanda | Photo Enhancer | photos |
| G | Giovanna | Portfolio Watchdog | portfolio-ops |
| H | Helena | Tax Authority Research | constants |
| I | Isadora | Macro Indicators Research | constants |
| J | Júlia | Depreciation Schedule Research | constants |
| K | Kamila | Reporting Conventions Research | constants |
| L | Letícia | Resource Builder | resources |
| M | Mariana | Compensation Intelligence | mgmt-co |
| N | Natália | Overhead Intelligence | mgmt-co |
| O | Olívia | Company Intelligence | mgmt-co |
| P | Paula | Property Defaults Intelligence | mgmt-co |
| Q | Quentin | Portfolio Capital Raise | portfolio-ops |

### Proposed — ADR-010 (Proposed status, prerequisites not yet met)

| Letter | Name | Domain | Subject |
|---|---|---|---|
| R | Quitéria | Returns Intelligence | property |
| S | Rafaela | Distributions Intelligence | property |

**ADR-010 prerequisites before build:**
1. Returns diagnosis methodology skill used 3+ times
2. Waterfall schema design lands as its own ADR (see ADR-011)
3. Resources control plane has placeholder entries for Preqin / Carta / NAREIM / ILPA
4. User sign-off on build sequence and vendor selection

**Slide factory dependency:** Quitéria (R) and Rafaela (S) verdicts feed Lucca's
Slide 3 investment thesis narrative. Build ADR-010 on its own merits — the slide
factory consumes the verdicts through Lucca's cache read, not as a build dependency.

---

## Cost and Trigger Model

### Branch A — Deterministic reads

- **Cost:** $0 per slide run
- **Trigger:** Marco dispatches Felix/Elisa/Dario as part of the factory run
- **Retries:** Deterministic — re-run is free and byte-identical (Enzo cache)
- **Never trigger from:** save handlers, useEffect hooks, page loads

### Branch B — Diagnostic intelligence (Gustavo's specialists)

- **Cost:** ~$0.40 per specialist run × 2+ vendors = ~$0.80 per AnalystButton press
- **Trigger:** Admin presses `<AnalystButton />` only
- **Cache:** Specialist verdict cached after each run — cache reads are free
- **Never auto-trigger from:** save handlers, useEffect hooks, page loads, factory dispatch
- **Trigger discipline:** `.claude/rules/analyst-trigger-discipline.md`

### Lucca — Bridge pass

- **Cost:** Opus 4.7 (narrative quality + citation discipline)
- **Trigger:** Admin vets and approves in Tab 4 of the factory wizard
- **Input:** Cached specialist verdicts (Branch B) + property data + context
- **Output:** Approved narrative slots consumed by slide teams in Tab 5

---

## Adding a New Consumer

When a new surface (report, export, dashboard widget) needs financial data:

1. **Is it a deterministic financial table or number?**
   → Read from the engine directly in a Reader-class agent under the surface's
   orchestrator. Felix-01's pattern (`aggregateUnifiedByYear` call, completeness
   validation, gap report on failure) is the template.

2. **Does it need diagnostic narrative or LP-credibility context?**
   → Read cached specialist verdicts via Lucca or a Lucca-equivalent drafter.
   Do not create a new specialist just for this surface.

3. **Does the need warrant a new Gustavo specialist (ADR-010 pattern)?**
   → File an ADR. Verify the current tail letter in `specialist-catalog.ts`
   (not `identity.ts` comments). Follow the Tier-0 → Tier-1 → IB-bench graduation
   pattern per ADR-007.

4. **Should a new orchestrator be created?**
   → Only if it has two independent consumers and neither of them is Marco or
   Gustavo. If you cannot name two consumers, do not create the orchestrator.

---

## Key Files

```
lib/engine/src/
  property/property-engine.ts         — per-property 360-month pro forma
  aggregation/cashFlowAggregator.ts   — aggregateUnifiedByYear (Felix-01 calls this)
  analyst/registry/specialist-catalog.ts — Gustavo's specialist roster (authoritative)
  analyst/identity.ts                 — orchestrator persona (update when catalog changes)

lib/calc/src/
  returns/irr-vector.ts               — IRR calculation (Quitéria will consume)
  analysis/waterfall.ts               — waterfall distributions (Rafaela will consume)
  returns/exit-valuation.ts           — exit cap rate valuation

artifacts/api-server/src/finance/
  service.ts                          — server-side financial computation service
  recompute.ts                        — cache invalidation and recompute triggers

artifacts/api-server/src/slides/
  build-lb-payload.ts                 — composite 6-slide payload builder
  slot-readiness.ts                   — per-slot complete/stale/missing status

.agents/skills/slide-factory/SKILL.md            — slide factory full roster + pipeline
.agents/skills/slide-factory/teams/felix-team.md — Felix-01..05 specs (Slide 6)
.agents/skills/slide-factory/teams/elisa-team.md — Elisa-01..03 specs (Slide 5)
.agents/skills/slide-factory/teams/lucca.md      — Lucca cross-app drafter spec

docs/architecture/decisions/ADR-007-*   — DI discipline: calc/engine never import storage
docs/architecture/decisions/ADR-010-*   — Returns (R/Quitéria) + Distributions (S/Rafaela)
docs/architecture/decisions/ADR-011-*   — Waterfall schema (prerequisite for Rafaela)
```

---

## What This Skill Is Not

- **Not the engine technical contract.** For calculation pipeline stages, module
  taxonomy, return metrics, and financial statement line items, load
  `.agents/skills/financial-engine/SKILL.md`.

- **Not the slide factory pipeline.** For the full slide factory roster and
  per-team specs, load `.agents/skills/slide-factory/SKILL.md`.

- **Not the analyst specialist patterns.** For how specialists graduate from
  Tier-0 to Tier-1, load `.agents/skills/analyst-intelligence-display/SKILL.md`.
