---
name: slide-factory
description: >
  The H+ Analytics slide factory — a precision agent pipeline that produces
  the canonical L+B 6-slide investor deck. Covers the full roster: Marco
  (orchestrator), Lorenzo team (canonical ingestion), Lucca (drafter), Maya
  (visual inspector), slide teams Sofia through Felix (Slides 1–6), and
  minions Aldo, Bruno, Carlo, Dino, Enzo. Load when building, debugging,
  or extending any part of the slide factory pipeline.
---

# Slide Factory

The slide factory is a precision-critical, agent-native pipeline that takes
a canonical deck artifact and property data, and produces a faithful
derivative investor presentation. It wraps the existing deterministic render
core (Playwright + React slide components) with an LLM-driven authoring and
inspection overlay.

**Core rule:** Precision over cost. One drift in front of an investor costs
more than any LLM bill. Every decision in this system — model tier, retry
policy, inspection threshold — is calibrated for fidelity, not speed.

---

## Terminology

The following definitions are canonical across the entire H+ Analytics agent system. They are reproduced here so anyone reading only this skill file gets the full picture. The authoritative source is `CLAUDE.md` § 10 — if there is ever a discrepancy, `CLAUDE.md` wins.

**Agent** — A named pipeline member that does substantive work using an LLM. Agents receive structured inputs, apply reasoning or generation, and produce structured outputs. Every agent declares a `role`, `short_description`, and `long_description`. Agents may be job-specific (Swarm format) or cross-app (Specialist format).

**Minion** — A deterministic helper invoked by an agent. Minions never call an LLM and exercise no judgment — they transform, validate, extract, or diff data according to fixed rules. Minions carry a single name. Examples in this factory: Aldo, Bruno, Carlo, Dino, Enzo.

**Specialist** — An Agent used across more than one product surface, not bound to a single pipeline. Specialists carry a single name (no NN suffix) and their outputs surface directly in the product UI. Examples in this factory: Lucca (Content Drafter), Maya (Visual Inspector).

**Swarm** — A coordinated team of job-specific Agents that collaborate on one pipeline stage. Swarm members use the `Name-NN` zero-padded format. When a swarm finishes, its combined output is a single artifact handed to the next pipeline stage. Swarm members are never reused outside their pipeline. Examples in this factory: Lorenzo-01..05, Sofia-01..03, Felix-01..05.

---

## Factory Members

### Orchestrator

| Name | Role | Scope |
|---|---|---|
| Marco | Factory Orchestrator | Slide factory |

### Swarms (job-specific, Name-NN format)

| Team | Slides | Members |
|---|---|---|
| Lorenzo-01..05 | Canonical ingestion | 5 agents |
| Sofia-01..03 | Slide 1 — Pipeline Spotlight | 3 agents |
| Bianca-01..03 | Slide 2 — Photo Gallery | 3 agents |
| Chiara-01..03 | Slide 3 — Investment Model | 3 agents |
| Dario-01..02 | Slide 4 — Portfolio Grid | 2 agents (deterministic) |
| Elisa-01..03 | Slide 5 — Financial Snapshot | 3 agents |
| Felix-01..05 | Slide 6 — Income Statement | 5 agents (expanded) |

### Cross-app specialists (single name)

| Name | Role | Used by |
|---|---|---|
| Lucca | Content Drafter | Slide factory + any surface needing cited copy |
| Maya | Visual Inspector | All slide team inspectors (Pass 2) |
| Tiago | Bracket-Mix Specialist — single-pass grounded research per peer or per Mgmt-Co comp set; emits brand-level archetype split + roster-size estimate + 5–10 sample properties + citations | ICP bracket-mix peer-derived pipeline (`ai/ambient/specialists/tiago.ts`) |

### Minions (deterministic helpers)

| Name | Function |
|---|---|
| Aldo | PDF/PPTX primitive extractor |
| Bruno | Playwright PNG renderer |
| Carlo | Zod schema validator |
| Dino | Pixel-diff calculator (±2px gate) |
| Enzo | Content hash cache (SHA-256 idempotency) |
| Franco | Deck render minion — renders the 6-slide PDF via Playwright, uploads to R2, writes `deckR2Key` onto the run row. Called by Marco's `produce_deck` tool and by the Rebecca `produce_slide_factory_deck` tool. No LLM. (`slides/minions/franco.ts`) |
| Hugo | Bracket-Mix Aggregator Minion — combines every active peer's `brand_archetype_split` (Tiago output) weighted by `roster_size_estimate` into one normalized `BracketMixData`. Pure deterministic; cold start (no researched peers) → equal-weight + provisional flag, no row written. Called by the global-recompute orchestrator. No LLM. (`ai/ambient/minions/hugo.ts`) |

---

## Pipeline Overview

```
Admin Brief (Tab 1)
  → Lorenzo team (Tab 2): Canonical PDF/PPTX → spec JSON + canonical PNGs
  → Property Setup (Tab 3): assign properties to slides 1/2/3/5
  → Lucca (Tab 4): draft all narrative slots with citations
  → Admin vets Lucca's draft (Tab 4)
  → Marco dispatches 6 teams in parallel (Tab 5):
      Sofia-01→02→03 (Slide 1)
      Bianca-01→02→03 (Slide 2)
      Chiara-01→02→03 (Slide 3)
      Dario-01→02 (Slide 4 — deterministic)
      Elisa-01→02→03 (Slide 5)
      Felix-01→02→03→04→05 (Slide 6 — expanded)
        └─ each -03/-02 Inspector calls:
              Dino (Pass 1: pixel-diff)
              Maya (Pass 2: holistic visual judgment)
  → All slides approved → Deck Review + Download (Tab 6)
```

---

## Skill Files for Individual Members

- `teams/marco.md` — orchestrator
- `teams/lorenzo-team.md` — canonical ingestion swarm
- `teams/lucca.md` — content drafter
- `teams/maya.md` — visual inspector
- `teams/sofia-team.md` — Slide 1 team
- `teams/bianca-team.md` — Slide 2 team
- `teams/chiara-team.md` — Slide 3 team
- `teams/dario-team.md` — Slide 4 team
- `teams/elisa-team.md` — Slide 5 team
- `teams/felix-team.md` — Slide 6 team
- `minions/minions.md` — all minion profiles

---

## Key Files in Codebase

```
artifacts/api-server/src/slides/
  build-lb-payload.ts       — composite 6-slide payload builder
  lb-token.ts               — LB deck token signing/verification
  deck-logic-version.ts     — cache-busting version constant
  deck-render-constants.ts  — viewport, timeout, format constants
  playwright-browser.ts     — shared browser instance (Bruno uses this)
  slot-readiness.ts         — per-slot complete/stale/missing status

artifacts/api-server/src/routes/
  lb-deck-pdf.ts            — POST /render, GET /render-status, GET /download
  internal-lb-deck-payload.ts — internal payload delivery route

artifacts/hospitality-business-portal/src/pages/
  LbSlides.tsx              — 7-tab wizard UI (Setup + Slide 1-6 editor tabs)

artifacts/hospitality-business-portal/src/features/internal-deck/
  editor/Slide1-6EditorPanel.tsx — per-slide slot editors
  editor/editor-shared.tsx  — shared atoms, readiness, provenance
  slides.tsx                — React slide components (960×540 canvas)
  contract.ts               — slot-specific DeckPayloadV2 schema
  theme.ts                  — canonical color/font/spacing constants

docs/slide-system/canonical/
  design-contract.json      — 1399-line canonical design spec
  self-validation-checklist.md — 10-point agent validation loop
  coding-agent-instructions.md — detailed rendering rules
  agent-prompt-instructions.txt — high-level agent rules
  r2-manifest.json          — R2 keys for canonical PDFs and PNGs
```

---

## Hallucination Defenses

The factory implements 10 layered defenses (A–J from the precision pipeline
pattern). Every LLM call is constrained by at least 3:

- **B** Schema-locked output (Carlo validates every LLM output)
- **C** Forbidden-claim lists in every Builder prompt
- **E** "If uncertain, flag — never guess" in all prompts
- **F** Enzo caches by content hash — re-runs are byte-identical
- **H** Audit log: every LLM call persisted to DB
- **I** Pixel-diff floor: Dino rejects before any LLM can argue

---

## Model Tiers

| Agent | Model | Reason |
|---|---|---|
| Lorenzo-01, 02, 04 | Deterministic | No LLM needed |
| Lorenzo-03, 05 | Opus 4.7 | Vision reconciliation, holistic spec check |
| Lucca | Opus 4.7 | Narrative quality + citation discipline |
| Sofia-02, Bianca-02, Chiara-02, Elisa-02, Felix-02 | Sonnet 4.6 | Constraint-fitting assembly |
| Dario-01 | Deterministic | Fully deterministic slide |
| Felix-03, 04 | Sonnet 4.6 | Financial calculation validation + formatting |
| Maya | Opus 4.7 | Holistic visual judgment (strongest vision model) |
| Marco | Sonnet 4.6 | Routing and orchestration, not synthesis |
| All minions | Deterministic | No LLM |

---

## What Exists vs What Needs Building

### Already built (V1)
- Composite payload builder (`build-lb-payload.ts`)
- PDF render pipeline (`lb-deck-pdf.ts`)
- 7-tab wizard UI (`LbSlides.tsx`)
- Per-slide slot editors with 3-bucket system + provenance tracking
- `DeckPayloadV2` slot schema + readiness system
- Canonical design contract, PNGs, validation checklist (hand-curated)

### Needs building (V2)
- `slide_factory_runs` DB table (resumable run state)
- Tab 1 Brief: file upload, acceptance gate, mode selection
- Lorenzo team: automated canonical ingestion (Sage → Lorenzo renaming)
- Lucca: single-pass all-slot Drafter (replaces per-slot Analyst clicking)
- Maya: holistic visual inspector (Pass 2, called by all -03 agents)
- Dino: pixel-diff pass (Pass 1)
- Marco: factory orchestrator
- Per-team Builder agents (Sofia-02 through Felix-04)
- Tab gates + SSE progress stream
