---
title: "Agent-Native Precision Pipeline Pattern (Per-Team Factory with Hybrid Inspector)"
date: 2026-05-06
category: architecture-patterns
module: slide-factory-internal-deck
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Building an LLM pipeline that must produce canonical-fidelity output (pixel/text exact) from structured source documents (e.g., PPTX, PDF, deterministic specs)
  - Hallucination drift in LLM-driven generation is unacceptable and must be defended against with layered (deterministic + judgment) verification
  - Each output unit (slide, page, section) has a distinct contract such that a dedicated specialist team per unit improves quality vs. one generalist agent
  - Both a tabbed admin UI and a conversational agent (e.g., Iris) must operate on the same generation backend with parity
  - The pipeline is an overlay on an existing legacy generator and manual fallback (never auto-fallback) is the required failure-handling discipline
related_components:
  - documentation
  - assistant
  - tooling
tags:
  - agent-native
  - slide-factory
  - hallucination-defense
  - hybrid-inspector
  - per-team-agents
  - precision-pipeline
  - canonical-fidelity
  - model-selection
---

# Agent-Native Precision Pipeline Pattern (Per-Team Factory with Hybrid Inspector)

## Context

The H+ Analytics repo already has a deterministic four-layer slide-render stack for the L+B six-slide investor deck (see prior architecture-patterns docs from 2026-05-02 through 2026-05-04 listed under Related). That stack — Layer 1 schema (`spec_skeleton_v4.json`, `design-contract.json`), Layer 2 theme (`PALETTE`/`FONTS`/`bb()`), Layer 3 Playwright renderer with absolute-positioned React components, Layer 4 builder (`buildSlidePayload` / `buildLbPayload`) plus a 10-point self-validation checklist and ±2px pixel-diff gate — solves the deterministic correctness problem. Given a fully-specified payload, the renderer reproduces the canonical layout faithfully.

What it does *not* solve is the **agent-native authoring problem**. The user's actual workflow is: "I have a canonical PDF and PNG that look exactly the way the investor presentation needs to look. I have property-specific data, photos, and assumptions in the database. I want a system where any future canonical can be ingested by uploading a PDF/PPTX, and any property can have a deck rendered against it, with judgment-heavy decisions (photo harmony on Slide 3, layout transformation on Slide 6 in LB mode) handled by LLMs that I can trust not to drift away from the canonical." (auto memory [claude])

The friction was concrete:

- **The canonical was hand-curated in ChatGPT 5.4.** Multiple iterations of "describe this PDF in detail so it could be precisely recreated" produced an 8.3MB JSON spec; canonical PNGs were exported manually from PowerPoint. This is not a workflow that scales to "the next deck I haven't anticipated." (auto memory [claude])
- **The render path required perfectly-authored payloads.** Slot copy, photo selection, slide-6 layout transformation in LB mode — all had to be hand-supplied or hand-coded into the builder. Every new property re-paid that cost.
- **LLM hallucination is a load-bearing risk.** The user said it directly: *"I'm worried about hallucination making slides drift away from original slide deck look and feel… I don't know how to do the defenses."* Without a defense-in-depth strategy, an LLM that drafts copy or judges layout will eventually invent a feature, a square footage, or a financial figure — and that drift will land in front of an investor. (auto memory [claude])
- **Cost and latency are not the optimization target.** The factory runs rarely (when an investor deck is actually being produced). One drift in front of an investor costs more than any plausible LLM bill or render queue depth. *"Precision here is everything."* (auto memory [claude])

The deeper question, and the one this guidance answers, is generic: **how do you architect a precision-critical agent-native pipeline that takes a canonical artifact plus entity-specific data and produces a faithful derivative without letting the LLM stack hallucinate the output away from the canonical?**

The slide factory is the worked example. The pattern applies to any pipeline where:

- A canonical artifact (slide deck, contract template, brand identity guide, regulatory filing template) defines ground truth.
- Entity-specific data must be merged into it (property records, customer details, transaction data).
- The output must be a faithful derivative — it can vary in content but not in the canonical's structural, visual, or compliance invariants.
- Some steps require genuine judgment (layout, tone, photo harmony, compliance language) that resists pure heuristics.

## Guidance

The architecture is an **agent-native overlay on top of a deterministic render core**. The render core stays — pure functions, schema validation, pixel-diff gates. The overlay adds an LLM-driven authoring and inspection layer with hallucination defenses baked in at every junction.

There are 13 sub-patterns. Each maps to a specific failure mode. Apply them as a set; weakening any one weakens the whole.

### A. Five-stage pipeline, mapped to a tabbed wizard

The pipeline has five canonical stages. The user-facing wizard surfaces them as sequentially gated tabs. The admin is positioned as the **factory's client placing a "PO order"** — files in, deck out, with explicit acceptance gates. (auto memory [claude])

| Stage | Tab | Purpose | Gate |
|---|---|---|---|
| 1. Pre-intake | **Brief** (PO order) | Admin uploads canonical files, picks mode and target, answers fundamental questions | Acceptance agent (small/cheap LLM + Zod) verifies files valid, fields filled, answers cohere |
| 2. Intake | **Canonical** | Lorenzo team runs: PDF/PPTX → structured JSON spec + canonical PNGs | Admin endorses Lorenzo team's output OR sends it back to refine |
| 3. Setup | **Property Setup** | Pick entities, projection windows, mode confirmation | Acceptance agent confirms entity data is loaded |
| 4. Drafter + vetting | **Content Drafting & Vetting** | Drafter LLM writes per-slot copy with citations + open questions; admin vets | Every required slot filled, within character budget, admin-approved |
| 5. Render + verification | **Render & Verification** | Per-team factory line runs: Reader → Builder → Inspector | Both Pass-1 (math) and Pass-2 (judgment) green per slide |
| 6. Final review | **Deck Review & Download** | Combined deck preview, download | Admin's final acceptance |

Tabs 2–6 are grayed out until Tab 1 is saved + accepted. Tab 4 is the natural pause point (admin vetting); Tab 6 is the final pause point. Each tab persists its output in R2 + DB so the factory survives session loss; runs are resumable indefinitely. (auto memory [claude])

### B. Per-team naming convention: shared first name + numeric suffix

When multiple specialist agents share a mission, they share **one human first name** with a **numeric suffix indicating line stage**. Example: Sofia 1, Sofia 2, Sofia 3 are three specialists on the Slide-1 team. The user explicitly stated this convention as load-bearing for discoverability and reasoning. (auto memory [claude])

Generic application:

- One mission = one shared name. Six independent missions (six slides) = six distinct names (Sofia, Bianca, Chiara, Dario, Elisa, Felix).
- Within a mission, suffix in line-order: N1 first, N2 second.
- Cross-mission shared infrastructure (orchestrator, primitives) gets a separate role name, not a numbered slot in a mission's name. The slide factory's orchestrator is **Marco**.

This is a generic naming pattern, not slide-specific. Any agent-native mission-decomposition benefits.

### C. Three-role line per team, with judgment-density exceptions

The default specialist line is three roles: **Reader → Builder → Inspector**. (auto memory [claude])

```
N1 (Reader)        N2 (Builder)         N3 (Inspector)
- deterministic    - LLM judgment       - hybrid
- TS function      - slot fitting,      - Pass 1 deterministic
- loads cached       layout, photo        Pass 2 LLM vision
  spec, contract,    placement          - emits complete or
  payload, PNG     - schema-locked        reject
                     output
```

Two exceptions in the slide factory illustrate when to vary:

- **Dario (deterministic slide 4)** collapses Reader+Builder into 2 agents — content is 100% deterministic from the siblings array.
- **Felix (slide-6 transformation)** expands to 5 agents — adds a sub-pipeline (Felix 4 IS Calculator + Felix 5 IS Formatter) feeding the Builder/Paster, who performs the layout judgment. (auto memory [claude])

For content-needing-judgment slides, a **Drafter** is added as a fourth role that runs separately (in Tab 4) before Builder. Drafter writes narrative copy with citations and open questions; admin vets; Builder takes vetted content and fits it. Builder is **assemble-only**, never auto-drafting. This separation is what makes admin vetting (Defense J below) tractable.

### D. Hybrid Inspector pattern: deterministic floor + LLM-vision holistic gate

The Inspector (N3 on every team) runs **two passes, both blocking by default**: (auto memory [claude])

- **Pass 1 — deterministic.** Pixel-diff vs canonical PNG within a tight tolerance (±2px in the slide case), plus a 10-point self-validation checklist. This is the math floor. No LLM can talk around it.
- **Pass 2 — LLM with vision.** Holistic "would I sign off on this?" judgment. Scoped strictly to aesthetic/holistic concerns (photo crop, layout balance, tone). Cannot block on pixel-precision concerns — those are Pass 1's domain.

The two passes are bicameral: Pass 1 catches mechanical drift, Pass 2 catches drift that's pixel-correct but visually wrong (e.g., a photo cropped at the chin). Either red blocks the slide.

```ts
// Pass 1 (deterministic)
async function pixelDiffPass(
  emittedPdfPath: string,
  canonicalPngPath: string,
  tolPx: number,
): Promise<{ ok: boolean; deltaPx: number }> { /* sharp-based math */ }

// Pass 2 (LLM with vision)
async function holisticJudgmentPass(
  emittedPng: Buffer,
  canonicalPng: Buffer,
  changeSummary: string,
): Promise<{ ok: boolean; concerns: Concern[] }> { /* Opus 4.7 with vision */ }
```

### E. Lorenzo ingestion pipeline: deterministic-extract + vision-reconcile

The intake pipeline that turns a canonical artifact (PDF/PPTX) into a structured spec is **architecturally symmetric to the Inspector**: deterministic primitive extraction provides the math floor, LLM vision contributes only interpretive fields. (auto memory [claude])

| Stage | Role | Determinism |
|---|---|---|
| Lorenzo-01 | PDF Primitive Extractor (`pdftotext -bbox` → word-level elements) | Deterministic |
| Lorenzo-02 | Visual Renderer (canonical PNGs at stable R2 keys) | Deterministic |
| Lorenzo-03 | Vision Reconciler (Opus 4.7 per-slide, LLM + vision) | Interpretive fields only |
| Lorenzo-04 | Carlo — Schema Validator (Zod) | Deterministic |
| Lorenzo-05 | Holistic Inspector (Opus 4.7, optional second pass) | Holistic judgment |

The schema lock is the key defense: Lorenzo-03's output cannot overwrite numerical fields (bbox, font_size, color) that came from Lorenzo-01. Lorenzo-03 only contributes `semantic_role`, `variable_binding`, `overflow_behavior`, `character_count`. Schema validator (Lorenzo-04/Carlo) rejects numerical-field overwrites.

This is a separate pipeline from the per-render hot path. It runs on demand when a new canonical is uploaded.

### F. Drafter + admin vetting: the human is the final filter before render

For slots that need narrative judgment, a **Drafter** LLM runs in Tab 4 with strict per-claim citation requirements: every fact tagged with its source (e.g., `{source: "property_assumptions.roomCount"}`) or marked as a suggestion (e.g., `{source: "general_knowledge", confidence: "suggestion"}`). Untagged claims are rejected before the admin sees them. (auto memory [claude])

The vetting UI shows:

- Each draft slot's text, with per-claim citations.
- Edit / accept / reject controls.
- A plain-English summary of what was generated automatically vs. what the admin must verify.
- Drafter's `<NEEDS_HUMAN_INPUT>` markers as explicit admin questions.

Builder runs only after the admin endorses the vetted slate. This is the strongest defense in the stack — humans are the final filter before render. Drafter outputs **never reach Builder unmediated**.

### G. Tabbed wizard UX with sequential gates and admin-as-client framing

The tabbed wizard pattern (Section A above) is the right UX for any acceptance-gated multi-stage pipeline where some steps need human review. The user explicitly framed the model: *"if I am looking at a page with tabs… the first one would be asking the admin for basic information including for admin to upload or delete files… all other tabs… will be grayed out until the admin Saves the tab."* (auto memory [claude])

Within each tab, a **scoped progress display** shows only the stages relevant to that phase, with status icons (`○` queued, `⚙` running, `✓` done, `✗` failed, `⏸` blocked-on-admin). A compact banner at the top of the page shows the global state (`Tab 2 — Lorenzo Ingestion · Lorenzo-03 working on slide 3 (~32%)`). Stage events stream via SSE for live progress.

**Resumability is non-negotiable.** Each completed stage's output persists. Admin closes the tab, refresh resumes from the last completed stage. Runs persist indefinitely; admin can re-open a prior run, change Tab 1 inputs, re-run from any tab. The cache (Defense F below) shortcuts unchanged stages.

### H. Hallucination defenses A–J as a composed system

The defenses compose. No single one is sufficient; the combination is. (auto memory [claude])

| Letter | Defense | Mechanism |
|---|---|---|
| A | Bicameral validation | Every LLM field cross-checked against a deterministic source |
| B | Schema as defense | Zod-typed input AND output for every LLM call; forbidden free-form JSON |
| C | Forbidden-claim lists | Drafter system prompt enumerates "DO NOT INVENT" failure modes (architectural details, demographics, owners' names) |
| D | Multi-model cross-validation | High-stakes stages run two models from different labs in parallel; disagreements surface to admin |
| E | Conservative-fallback prompts | Every LLM agent's prompt: "If uncertain, leave blank and emit a structured admin question rather than guessing" |
| F | Idempotency by content hash | Cache by SHA-256 of (model, prompt, input_data); same input → byte-identical output |
| G | Adversarial Inspector | Challenger agent runs after primary: "Try to find what's wrong" |
| H | Audit log | DB persistence of every LLM call: `{run_id, stage_id, model, prompt_hash, response_hash, prompt, response, timestamp}` |
| I | Pixel-diff floor | Math truth wins; pixel-fail → automatic rejection; no LLM can talk around it |
| J | Vetting UI as human gate | Admin is the final filter before render |

The cardinal rule: **every LLM-produced field that *can* be validated deterministically *must* be**. LLMs only contribute fields where deterministic validation is impossible (`semantic_role`, narrative copy, holistic visual judgment).

Composition example, Drafter pipeline:

```
1. Drafter (Opus 4.7) generates draft with citations            (C, E)
2. Cross-validation Drafter (Gemini 3 Pro) runs in parallel     (D)
3. Both validated against Zod schema                            (B)
4. Disagreements surfaced to admin                              (D)
5. Cached by content hash                                       (F)
6. Audit-logged                                                 (H)
7. Admin vets in Tab 4                                          (J)
8. Vetted content reaches Builder
```

### I. Per-stage model selection with an Update LLM button

Different stages have different model needs. (auto memory [claude])

| Stage class | Primary | Why | Challenger (defense D) |
|---|---|---|---|
| Vision reconciliation, harmony, holistic judgment | Opus 4.7 | Strongest structured-output under vision | GPT-5 |
| Narrative composition with citations | Opus 4.7 | Grounded creative output with structure | Gemini 3 Pro |
| Constraint-fitting, slot-positioning | Sonnet 4.6 | Bounded by Zod + deterministic helpers | escalate to Opus for high-judgment slides |
| Pre-intake validation (file shape, presence) | Haiku 4.5 | Cheap, fast, sufficient | none — Zod covers most |

A user-facing **Update LLM button** in the factory header runs a Model Researcher agent that compares "what's currently configured" vs "what's available now," surfaces a structured diff, and lets the admin apply individual updates or all-recommended. Updates invalidate the content-hash cache for affected stages. Configuration persists in `model-config.json` per run with version history.

### J. Tiered failure handling — never auto-fallback on canonical violations

Failure recovery is **per failure class**, not one global retry policy: (auto memory [claude])

| Failure class | Handling |
|---|---|
| Transient LLM error | Auto-retry once |
| Schema validation | Self-correction retry loop, max 3 attempts, then escalate |
| Pixel-diff Pass 1 fail | Never auto-retry; surface immediately to admin |
| Pass 2 advisory concern | Severity-tagged; only high-severity blocks |
| Drafter `<NEEDS_HUMAN_INPUT>` | Becomes admin question in Tab 4 |
| Cross-validation disagreement | Vetting item in Tab 2 |
| Hard infra failure | Surface + offer manual fallback button |

**Canonical-fidelity violations never auto-fallback.** A manual `[⚠ Run Legacy Render]` button lives in the factory header, disabled by default, enabled only on hard failure or admin opt-in. Output from the legacy path is metadata-tagged `[LEGACY RENDER · canonical-fidelity gates skipped]` so it's never confused with factory output.

### K. Per-team skills + shared cross-cutting skill

Prompts live in version-controlled skill files, organized DRY: (auto memory [claude])

```
.agents/skills/slide-factory/
  SKILL.md                       # master roster, pipeline overview, hallucination
                                  # defenses, model tiers, key files
  teams/marco.md                 # factory orchestrator
  teams/lorenzo-team.md          # canonical ingestion (Lorenzo-01..05)
  teams/lucca.md                 # content drafter (Tab 4)
  teams/maya.md                  # visual inspector (Pass 2)
  teams/sofia-team.md            # Slide 1 team (Sofia-01..03)
  teams/bianca-team.md           # Slide 2 team
  teams/chiara-team.md           # Slide 3 team
  teams/dario-team.md            # Slide 4 team (deterministic)
  teams/elisa-team.md            # Slide 5 team
  teams/felix-team.md            # Slide 6 team (expanded 5-agent)
  minions/minions.md             # Aldo, Bruno, Carlo, Dino, Enzo
```

Per-team skills reference shared content via `## Includes` sections; the skill loader resolves and concatenates at prompt-assembly time. Defense C and other shared rules live once; drift is structurally impossible.

### L. Precision-over-cost stance — explicit and scoped

For pipelines that run rarely and where one drift is catastrophic: state the stance explicitly and let it govern every tradeoff. (auto memory [claude])

- LLM calls are ~free; reach for them where they buy precision.
- Sequential pipelines are fine; don't sacrifice fidelity for parallelism.
- Heavy validation passes are good; pile them on (deterministic gate + LLM vision second pass + canonical-PNG diff + self-validation checklist).
- Caching is for correctness (idempotency, reproducibility), not for speed.
- Render time of 1+ minute per deck is acceptable. Render time of 5 seconds with a 1% chance of canonical drift is not.

The corollary: this stance is **scoped to the precision-critical pipeline**. It does not generalize to other agent surfaces in the same app (conversational agents, dashboards, real-time engines). Don't carry the stance outside its domain without checking.

### M. Overlay scope, not replacement

The agent-native architecture **wraps** the existing deterministic render core, it does not replace it. Specifically: (auto memory [claude])

- Call existing payload builders (`buildSlidePayload`, `buildLbPayload`); do not replace.
- Render existing React components (`Slide{N}.tsx`); do not fork.
- Use the existing singleton Playwright browser.
- Marco exposes a new entry point (Tab 5 dispatch via `POST /api/lb-slides/factory/runs/:id/trigger-build`); legacy endpoints (`/api/properties/:id/deck.pdf`, `POST /api/lb-slides/render`) remain as the backend for the manual fallback button.

This keeps the deterministic-render layer (covered by the four prior architecture-pattern docs) intact and lets the agent overlay be developed, tested, and rolled back independently.

## Why This Matters

**Canonical fidelity is the contract with the audience.** When a deck is shown to an investor, the audience reads it as authoritative. Every visual choice — layout, typography, color, photo crop, financial presentation — was made deliberately during canonical design and reviewed by human experts. An LLM that drifts away from those choices, even by a small amount, is silently shipping bets that the audience will read as endorsed. The architecture's job is to make that drift structurally impossible, not just unlikely.

**Hallucination is not a tail risk; it is the dominant failure mode.** Without defense in depth, an LLM that drafts copy will eventually invent a feature, owner, or financial figure. Every defense letter (A–J) addresses a specific failure mode the user has already encountered or anticipated; removing any one weakens the system in a recoverable-only-by-luck way. Specifically: schema lockdown (B) plus deterministic-anchor bicameral validation (A) plus pixel-diff math floor (I) plus human vetting (J) covers the four orthogonal axes of drift (structural, factual, visual, narrative). Cross-lab cross-validation (D) and the adversarial Inspector (G) catch correlated failures within a single lab's models.

**Human time is the cheapest precision tool we have.** The vetting UI (J) is not a workaround for weak LLMs — it is a deliberate architectural choice. The user said it directly: *"the admin's time is cheaper than the cost of a hallucination shipping in front of an investor."* Designing the system to surface bets to a human, with citations and open questions, is more reliable than any prompt-engineering approach. (auto memory [claude])

**Agent-native overlay enables emergent capability.** The Lorenzo intake pipeline (E) means future canonicals can be ingested without code changes. The user explicitly mentioned this: *"the next set of slides, some day in the future, you would only ask me to upload a PDF file and the PNG file."* The deterministic render core can't deliver that — it requires hand-curated specs. The agent overlay makes it tractable. (auto memory [claude])

**Naming conventions reduce cognitive overhead.** Six teams of three named `text-harvester-1`, `slot-fitter-1`, `inspector-1` per team is a denial-of-service attack on the developer's working memory. Six teams named Sofia 1/2/3, Bianca 1/2/3, etc., is reasoned about easily and lets `Marco` stand out as the orchestrator without ambiguity.

**Tiered failure handling and the manual fallback button are reliability tools, not safety nets.** The legacy render path stays available specifically *because* the factory has hard precision gates. When a gate trips, the admin gets a clear choice: fix the input (vetting Tab 4 question, cross-validation disagreement) or explicitly opt into the legacy path with metadata-tagged output. This is more honest than an auto-fallback that silently degrades quality.

## When to Apply

This architecture applies when **all** the following hold:

- A canonical artifact (template, master document, brand identity, regulatory filing template) defines ground truth that must not be paraphrased away.
- Entity-specific data must be merged into it (one customer, one property, one transaction, one filing).
- The output is a faithful derivative — content varies but structural/visual/compliance invariants are inviolate.
- Some merge steps require judgment (layout under constraint, narrative tone, visual harmony, compliance language) that resists clean heuristics.
- The pipeline runs **rarely or asynchronously** (not on a per-request hot path), so latency and cost can be traded for precision.
- Human review is feasible and acceptable in the pipeline (the admin is willing to spend minutes vetting an output rather than hoping the LLM got it right).
- One drift in front of the audience is catastrophic relative to engineering cost.

Concrete fits beyond slides: regulatory filings (SEC submissions from canonical templates + entity data), legal contract assembly (template + parties + terms), brand-compliant marketing collateral (brand guide + campaign copy), pitch decks for any investor-facing fund, due-diligence packets, board reports.

The architecture **does not** fit:

- Real-time conversational agents (latency budget is wrong; precision-over-cost stance does not apply).
- High-volume per-user content generation (cost-per-call matters; vetting UI doesn't scale).
- Content where audience expectations are loose (blog drafts, internal notes, brainstorming output) — defenses A–J are overkill.
- Pipelines without a meaningful canonical (open-ended generation tasks).

When in doubt: if you cannot point at a canonical artifact and say "the output must look exactly like this with these specific things swapped in," this architecture is too heavy.

## Examples

### Example 1 — Slide 3 photo harmony (judgment-heavy slot)

The user wants a NEW render/photo from storage placed below an existing photo, **same size, harmoniously**. Said directly: *"I could do that in a second here but want the factory to know how to do it."* (auto memory [claude])

**Before (deterministic-only).** The render path would either skip the second photo or hardcode a position. Either way, every property gets the same treatment regardless of how the photos actually compose visually.

**After (agent-native overlay).**

```
Chiara 1 (Reader)       loads canonical spec for slide 3, swap contract, payload, canonical PNG
Chiara 2 (Builder, LLM) reasons about: aspect-ratio match between hero photo and harmony-second
                        photo, vertical alignment, gap below existing photo, caption tone for new
                        photo. Outputs schema-validated payload to Chiara 3.
Chiara 3 (Inspector)    Pass 1: pixel-diff vs canonical Slide 3 PNG within ±2px (chrome must
                        match exactly); Pass 2: Opus 4.7 with vision evaluates whether the new
                        photo is genuinely harmonious — same crop ratio, same vertical rhythm
                        with existing photo, caption fitting the slot's editorial tone.
                        Cross-validated by GPT-5 (defense D).
```

The judgment lives in Chiara 2; the math floor in Chiara 3 Pass 1; the holistic gate in Chiara 3 Pass 2. The admin vets the photo selection upstream in Tab 4 (per Defense J + Q11 confirmed: admin picks photos, LLM places them).

### Example 2 — Slide 6 LB-mode layout transformation

In LB portfolio mode, Slide 6 must: flip title from "5-year" to "10-year"; **remove** the canonical's two-column inline IS text elements; **paste** a separately-built standalone IS PDF into the freed real estate; respect padding against slide title, slide number, and the investor-metrics block on the right. (auto memory [claude])

**Before.** The current `buildLbPayload` generates a base64 PNG of an IS table and stuffs it into a payload field; the React component renders it. Layout is hardcoded.

**After (Felix team, 5 specialists).**

```
Felix 4 (IS Calculator)       computes 10-year aggregated values via aggregateUnifiedByYear
Felix 5 (IS PDF Formatter)    builds a standalone IS PDF (closed accordion form, report fonts,
                              PALETTE accents) using pdf-lib
Felix 1 (Reader)              loads canonical Slide 6 spec, swap contract, payload, canonical PNG
Felix 2 (Builder/Paster, LLM) judgment-heavy: title swap; deletion of two-column inline IS
                              elements; computes the freed bbox respecting padding against title,
                              footer, slide number, investor-metrics block, and any chrome it
                              should leave alone; pdf-lib composite paste of Felix 5's IS PDF
                              onto the slide canvas; renders final Slide 6 PDF via Playwright
Felix 3 (Inspector)           Pass 1: pixel-diff vs canonical Slide 6 PNG (ignoring the IS
                              region), self-validation checklist; Pass 2: holistic visual
                              judgment that the IS PDF is properly placed, padded, balanced
```

Felix 2 is where the judgment lives — *"respect proper padding against title, slide number, and other elements"*. The user described this as judgment, not policy. Without an LLM, you'd encode preserve/move/eliminate as a config table that breaks on any canonical that doesn't match the table's assumptions. (auto memory [claude])

### Example 3 — Lorenzo ingestion replaces ChatGPT-5.4 + PowerPoint manual workflow

**Before.** Admin had a new canonical PDF. Steps: (1) iterate with ChatGPT 5.4 producing JSON until an 8.3MB `spec_skeleton_v4.json` is "complete enough"; (2) export each slide from PPTX as a 960×540 PNG manually; (3) drop everything into `attached_assets/` and R2; (4) hand-edit the swap contract. Days of work, one-off, not reproducible. (auto memory [claude])

**After (Lorenzo team, 5 agents).** Admin uploads PDF (and optionally PPTX) in Tab 1. In Tab 2:

```
Lorenzo-01   pdftotext -bbox primitive extraction                 -> word-level elements JSON
Lorenzo-02   canonical PNGs at stable R2 keys (no per-run regen) -> canonical PNG paths
Lorenzo-03   LLM + vision reconciler (Opus 4.7, per-slide)        -> semantic_role, variable_binding,
             (schema-locked: cannot overwrite Lorenzo-01 numerics)   overflow_behavior, character_count
Lorenzo-04   Carlo — Zod schema validator                         -> pass / fail with diff
Lorenzo-05   Holistic inspector (Opus 4.7)                        -> punch list / approved verdict
```

Lorenzo-04/Carlo drives Lorenzo-03's refinement loop. When Carlo passes and Lorenzo-05 ships green, Tab 2 surfaces the JSON spec + canonical PNGs for admin endorsement. Admin endorses (or sends back with notes). Output is stored as `canonicalSpec` JSONB on the run row + R2 keys for canonical PNGs.

The same architectural pattern (deterministic-extract + LLM-vision-reconcile + schema-lock) is what makes the Inspector work on the render side. Symmetry is intentional: hard truths get math, soft judgment gets vision, the two are kept separately accountable. (auto memory [claude])

### Example 4 — Drafter producing Slide 1 vision bullets with citations

**Before.** Slot copy was either hand-authored by the admin or drafted by a generic LLM with no citation discipline. Drafted copy could quietly invent property features the database didn't know about.

**After.**

Drafter prompt (excerpt, from `factory-shared/SKILL.md`):

```
DO NOT INVENT:
- Historical facts not present in property assumptions
- Specific architectural details (cedar shingles, barrel-vaulted ceiling)
- Exact financial figures not in app data (use ranges from assumptions only)
- Property feature counts (rooms / baths / acres) not in assumptions
- Locations / demographics / market data not in app data
- Names of nearby attractions, landmarks, or businesses
- Historical owners or notable past residents

For every fact in the draft, emit a citation:
{ source: "property_assumptions.<field>" } | { source: "improvement_budget.<line>" } |
{ source: "general_knowledge", confidence: "suggestion" }

If you cannot ground a slot, respond "<NEEDS_HUMAN_INPUT>" with a structured admin question.
```

Drafter (Opus 4.7) produces `DrafterOutput` (Zod-validated). Cross-validation Drafter (Gemini 3 Pro) produces a parallel draft. Both validated, disagreements surfaced. Admin vets in Tab 4 with citations visible per claim, can edit / accept / reject / answer `<NEEDS_HUMAN_INPUT>` questions. Builder runs only on vetted output.

The result: every word that ships through Builder traces to either a database field or an admin's explicit endorsement. There is no path where Drafter's output reaches the renderer without a human check. (auto memory [claude])

## Related

This pattern layers on top of the deterministic render core. The four prior architecture-pattern docs cover that core; this doc covers the agent-native overlay.

- `docs/solutions/architecture-patterns/canonical-contract-rebuild-architecture-2026-05-03.md` — Four-layer architecture for fixed-design deck rendering (schema / theme / renderer / payload-builder + self-validation gate). Moderate overlap (3/5): shared problem domain (LB slides), shared canonical-contract substrate the agents now consume, shared file references. Differs in motivation (renderer correctness vs agent orchestration). The four layers remain the foundation; this doc adds the agent-native overlay above them.
- `docs/solutions/architecture-patterns/lb-deck-composite-payload-architecture-2026-05-04.md` — Composite payload over multi-pass rendering for the 6-slide LB deck. Moderate overlap (3/5): same deck, same per-slide-different-property structure that the six per-slide teams now produce; shared composite-payload solution approach. Differs in layer (rendering vs intake/build/inspect). Composite payload is now produced by per-slide team Builders rather than a single rendering route.
- `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md` — Per-slot semantics in `SlidePayload` instead of a generic bag. Moderate overlap (2/5): the agent factory's Builder role outputs into exactly this slot-specific schema. Different problem (schema design vs production pipeline). Builders are the canonical schema producers; Inspectors are the canonical schema verifiers.
- `docs/solutions/architecture-patterns/slide-deck-generation-decision-reversal-2026-05-03.md` — Decision record: Playwright HTML→PDF replaced the two-format PPTX pipeline. Low overlap (1/5): same deck domain, output-format history only; orthogonal to the agent overlay.
- `docs/solutions/architecture-patterns/rebecca-agent-native-architecture-2026-05-05.md` — Function-calling agentic loop, action parity. Moderate overlap (2/5): shared agent-native philosophy and per-stage model selection theme. Different agent (Rebecca conversational vs the slide factory's Lorenzo/Marco/per-slide-team pipeline) and different problem.
- `docs/solutions/architecture-patterns/ai-intelligence-specialists-page-2026-05-02.md` — Specialists accordion IA. Moderate overlap (2/5): the Lorenzo ingestion team + six slide-build teams will surface here; same nav/IA surface, different layer.
- `docs/solutions/workflow-issues/three-way-diff-recon-methodology-2026-05-03.md` — Three-way diff (human brief × machine-precise JSON spans × generated PDF) for diagnosing canonical drift. The hybrid Inspector's pixel-diff Pass 1 is conceptually descended from this slot-level diff methodology.
- `docs/slide-system/canonical/spec_skeleton_v4.json`, `docs/slide-system/canonical/design-contract.json`, `docs/slide-system/canonical/coding-agent-instructions.md`, `docs/slide-system/canonical/self-validation-checklist.md` — the canonical contract artifacts the factory consumes and validates against.
- `artifacts/api-server/src/slides/`, `artifacts/hospitality-business-portal/src/features/internal-deck/` — the existing render-pipeline modules wrapped by the agent overlay (not replaced).
