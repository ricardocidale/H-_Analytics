---
title: "Slide factory financial data: diagnostic intelligence and presentation packaging are distinct concerns — no new financial orchestrator needed"
date: 2026-05-06
category: architecture-patterns
module: slide-factory-financial-layer
problem_type: architecture_pattern
component: assistant
severity: high
applies_when:
  - Deciding where a new pipeline should source financial intelligence or analyst verdicts
  - Evaluating whether to create a new orchestrator vs. extending an existing specialist team
  - Designing cost and trigger discipline for a pipeline stage that consumes financial data
  - Wiring Gustavo's specialist output into a slide or presentation context
tags:
  - slide-factory
  - orchestrator-scope
  - gustavo
  - marco
  - lucca
  - diagnostic-intelligence
  - presentation-packaging
  - cost-model
  - analyst-button
  - financial-layer
---

# Slide factory financial data: diagnostic intelligence and presentation packaging are distinct concerns — no new financial orchestrator needed

## Context

The slide factory pipeline (orchestrated by Marco) produces a 6-slide investor deck. Slide 5 (Financial Snapshot) and Slide 6 (Income Statement) need financial data: stable-year NOI, purchase price, financing summary, and a 10-year pro forma table. Three architectural forks were evaluated for sourcing that data.

At the time, the existing architecture had:
- **Gustavo** as analyst orchestrator dispatching diagnostic specialists (Ana, Bia, etc.) via the AnalystButton gate — ~$0.80/press, LLM-required, cached verdicts
- **Marco** as slide factory orchestrator dispatching swarm agents (Felix-01..03, Elisa-01..03, etc.) deterministically — zero LLM cost, Marco-dispatched
- **Lucca** as cross-app drafter who reads Gustavo's cached specialist verdicts and weaves them into narrative copy (Slide 3 investment thesis, Slide 5 transformation narrative)
- **Felix-01 / Elisa-01** as swarm agents that call `aggregateUnifiedByYear` and read stable-year property payloads directly from the engine — deterministic, no LLM

The three forks evaluated:

**Fork A:** Add Returns (Quitéria, letter R) and Distributions (Rafaela, letter S) specialists to Gustavo's team per ADR-010. Slide factory consumes their cached verdicts via Lucca. No new orchestrator.

**Fork B:** Create a new financial services orchestrator alongside Gustavo. Gustavo retains diagnostic intelligence; the new orchestrator owns presentation-ready financial artifacts for the slide factory.

**Fork C:** Broaden Gustavo's mandate to serve both diagnostic intelligence and the slide factory's presentation data needs directly.

**Decision: Fork A.**

## Guidance

**1. Name the two consumers before proposing a new orchestrator.**

Fork B would have produced an orchestrator whose sole consumer was the slide factory. Marco already fills that role. A second orchestrator between the engine and the slide teams would either shadow Marco or produce a service with no second consumer — a clear architectural smell. Before proposing a new orchestrator, name its two independent consumers. If you cannot, the fork is wrong.

**2. Respect the cost-model boundary between Gustavo's layer and Marco's layer.**

Gustavo's specialists are LLM agents gated behind the AnalystButton (~$0.80/press). Felix-01 and Elisa-01 are deterministic engine reads dispatched by Marco at zero cost. These two cost models must not be merged into a single orchestrator. The boundary is intentional.

**3. Lucca is the designed bridge — use her.**

Lucca's purpose is to translate cached Gustavo specialist verdicts into narrative copy for slides. She is the correct integration point when a slide needs both financial data (from Felix/Elisa) and diagnostic narrative (from Gustavo's specialists). Adding another orchestrating layer between Gustavo and the slide factory defeats her purpose and duplicates her role.

**4. Slide 6's income statement table must be engine-only — never specialist-verdict-dependent.**

The 10-year pro forma table must flow directly from `aggregateUnifiedByYear` output, validated by Felix-03 arithmetically, then formatted by Felix-04. It must never depend on a Specialist verdict from Gustavo's layer. Specialist verdicts are diagnostic opinion; the pro forma table is a deterministic financial artifact.

**5. Prefer atomic composition over new orchestrators.**

Tools are atomic primitives; features are prompt-defined outcomes that compose those primitives. The slide factory already correctly composes engine calls (Felix/Elisa) + specialist verdicts (via Lucca) without requiring a new orchestrating layer.

## Why This Matters

Getting this boundary wrong has cascading consequences:

- **Fork B** would introduce an orchestrator with one consumer — dead weight the moment the slide factory changes. Every Marco dispatch would route through an unnecessary intermediary.
- **Fork C** would make Gustavo's LLM cost (~$0.80/press) incurred whenever a slide is built, even for purely mechanical financial table reads. On a 50-deal portfolio, slide regeneration becomes expensive.
- **Correct Fork A** keeps financial table generation zero-cost and synchronous (Felix/Elisa → Felix-03 → formatted output), while diagnostic narrative remains analyst-gated and human-triggered (AnalystButton → Gustavo → Lucca → copy).

The load-bearing concept is the "diagnostic intelligence vs. presentation packaging" distinction:
- **Diagnostic intelligence** — "Is this IRR healthy? What levers fix it?" → Gustavo's concern, LLM-required, AnalystButton-gated
- **Presentation packaging** — "Here is the formatted 10-year pro forma" → Marco/Felix/Elisa's concern, deterministic, zero cost

These are different concerns. They must never be merged into one orchestrator.

## When to Apply

Apply this pattern whenever a new pipeline needs financial data that already flows through the engine:

1. **Is the data a deterministic engine read?** → Add a Felix/Elisa-class swarm agent under Marco. Do not route through Gustavo.
2. **Does the slide/section also need diagnostic narrative?** → Lucca reads Gustavo's cached specialist verdicts. Do not create a new specialist just for the slide factory.
3. **Does a new specialist belong in Gustavo's roster (ADR-010 pattern)?** → Add the specialist per naming convention. The slide factory still consumes verdicts via Lucca's cache read, not by calling Gustavo directly.
4. **Before proposing a new orchestrator:** name its two independent consumers. If you cannot, Fork B is wrong.

## Examples

**Correct — Slide 6 income statement:**
```
Marco dispatches →
  Felix-01 (reads aggregateUnifiedByYear, deterministic)
  → Felix-03 (validates arithmetic, deterministic)
  → Felix-04 (formats 10-year table, Sonnet 4.6)
```
No Gustavo involvement. Zero diagnostic LLM cost.

**Correct — Slide 5 transformation narrative:**
```
Lucca reads cached Gustavo specialist verdicts (already computed via AnalystButton press)
Lucca composes narrative copy for Slide 5 transformation story
Marco dispatches → Elisa-02 (builds slide with Lucca's approved copy)
```
Gustavo's verdicts were produced by an earlier admin AnalystButton press, not triggered by the slide build.

**Wrong — routing pro forma through Gustavo:**
```
Marco dispatches → Gustavo (LLM, ~$0.80/press)
                 → Gustavo returns formatted pro forma  ← VIOLATION
```
Pro forma is a deterministic artifact. It must never be LLM-generated or analyst-gated.

**Wrong — adding a third orchestrator:**
```
Marco dispatches → FinancialServicesOrchestrator (new, no second consumer)
                 → FinancialServicesOrchestrator dispatches → engine reads
```
This shadows Marco's existing dispatch responsibility. No second consumer exists.

## Related

- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — full factory pipeline architecture; Lucca's drafter role (Tab 4), Marco's orchestrator role (Tab 5), overlay scope discipline
- `.agents/skills/slide-factory/SKILL.md` — authoritative roster: Marco as factory orchestrator, Lucca as cross-app drafter, full pipeline map
- `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` — Gustavo's diagnostic specialist concern (the layer being distinguished from Marco's pipeline)
- `docs/architecture/decisions/ADR-010-returns-and-distributions-specialists.md` — Returns (Quitéria/R) and Distributions (Rafaela/S) specialists that will join Gustavo's roster
- CLAUDE.md Section 9 — Financial Engine Authoring Authority (governs who touches engine code, not orchestration topology)
