# Specialist Intelligence Bar — every assumption tab

> **Binding for every Specialist that backs an assumption tab.** The bar
> below is the floor, not the ceiling. New Specialists that don't clear
> it MUST NOT merge without an ADR documenting why.

H+ Analytics is a financial intelligence platform for sophisticated
investors. Every assumption tab is a place where The Analyst must show
its work — ranges, citations, comparables, live market context. Specialists
that ship as deterministic threshold checks miss the product point. The
plumbing (router, verdict contract, voice renderer, cognitive engine)
already exists exactly to deliver this experience; the gap is at the
evaluator-body layer.

## The bar

Every Specialist with `subject ∈ {mgmt-co, property}` and any
assumption-tab surface MUST satisfy ALL six requirements:

| # | Requirement | Verifiable as |
|---|---|---|
| 1 | **Tier-1 cognitive evaluation.** The verdict comes from the Cognitive Engine N+1 pipeline (Gemini quantitative panel + Claude Sonnet market panel + Opus synthesis). Not a deterministic threshold check, not a single-model call. | `verdict.meta.cognitiveRunId` non-null. Per ADR-003 invariant 6. |
| 2 | **Context-rich prompt.** Property + portfolio + market context injected via the prompt-builder pattern in `server/ai/`. No stub payloads, no synthetic placeholders. | Prompt template references the actual property fields, the portfolio aggregate, and the relevant market locality. Reviewed at PR time. |
| 3 | **Citation-backed evidence.** Each dimension carries ≥3 evidence items, every item with a `url` OR `documentRef`. Per ADR-003 invariant 5. | Verdict-shape test asserts `dimension.evidence.length >= 3` AND `evidence.every(e => e.url || e.documentRef)`. |
| 4 | **Tabular comparables (numeric dimensions).** Verdicts on rates, ratios, $ amounts, % values, or market metrics carry a `comparables: ComparableRow[]` payload that the voice renderer turns into a `<table>` block. Categorical / boolean dimensions are exempt. | Numeric `dimension.kind` ⇒ `comparables.length >= 3` OR a documented "no public comp data" exemption in the Specialist's source. |
| 5 | **Live API resources where mapped.** Specialist's `assignmentRefs` include ≥1 `kind: "api"` resource. The evaluator pulls fresh data via the Resources control plane and records source provenance per evidence item. Falls back to a benchmark resource only when the API health is `red` or `amber`. | Catalog entry has `assignmentRefs.some(r => r.kind === "api")`. Specialist's evidence items name the resource that produced them. |
| 6 | **Range-first delivery.** Every numeric dimension with non-`ok` severity carries a `range = { low, mid, high }` with conviction surfaced via `qualityScore >= CONVICTION_FLOOR`. The user's judgment lives in the range, not the midpoint. | Per ADR-003 invariants 3 + 4. Already enforced at builder time by `buildAnalystVerdict()`. |

## What the bar does NOT require

- Every Specialist must use Opus 4.7. Cheaper synthesis models are fine
  per ADR-004 routing rules; the requirement is N+1, not the most
  expensive model.
- Every dimension must trigger its own cognitive run. One run can serve
  multiple dimensions when the inputs overlap.
- Live API on every dimension. Fallback to benchmark resources is fine
  when the API is down or unmapped — but the assignmentRef must exist.
- Tables for non-numeric dimensions. A categorical verdict like "Brand
  fit" doesn't need a comp table.
- Net-new infrastructure. Every primitive needed (cognitive engine,
  verdict contract, voice renderer, Resources sidebar APIs) is already
  built; the rule is about consistent USE of them.

## Existing Specialists below the bar

| Specialist | Status | Below-bar gap | Owner / when |
|---|---|---|---|
| `mgmt-co.funding` | Ships as Phase 3b watchdog wrapper around `evaluateCapitalRaise` | Tier-0 only; no `cognitiveRunId`; no live API; no comparables table | Graduate during P7+ behind an explicit ADR |
| `mgmt-co.revenue` | Ships as Phase 3b watchdog wrapper around `evaluateRevenue` | Same as Funding | Graduate during P7+ behind an explicit ADR |
| `photos.photo-enhancer` | Image-generation pipeline, not an assumption tab | Exempt — different surface category | — |
| `resources.builder` | Resource Builder UI, not an assumption tab | Exempt — admin tooling, not investor-facing intelligence | — |

The graduation path for the watchdog-wrapping Specialists is an explicit
ADR + phase, NOT a quiet refactor and NOT a one-shot rewrite. Each one
is a deliberate doctrine event with prompt design, evidence-source
selection, and golden-test bench review.

## Scope — "assumption tab"

Every surface where the user types, edits, or accepts a number that
flows into the financial model. Concretely:

- Company Assumptions sub-tabs (Company, Compensation, Overhead, Revenue, etc.)
- Property Edit sub-tabs (Other Assumptions, Funding, Revenue, Costs, Exit, etc.)
- Market & Macro tab
- Constants tab (per registered key, when admin clicks "Refresh research")
- Model Defaults sub-tabs (CompanyTab, MarketMacroTab, PropertyUnderwritingTab)
- ICP Definition tab
- Any future tab where assumptions persist to the engine

Specialists outside this scope (image gen, resource builder, watchdog
schedulers) are exempt from requirements 4 + 5 but still hit 1, 2, 3, 6
where applicable.

## Verifiability — the proof gate

`tests/proof/specialist-intelligence-bar.test.ts` is the enforcement
gate. To be authored when the first super-smart Specialist ships
(target: P7-Day-1). Until then, the rule is enforced at PR review
against this file.

The proof test asserts, for every Specialist with `subject ∈ {mgmt-co,
property}` and `status === "built"`:

- Requirement 1: a fixture cognitive run produces a non-null
  `meta.cognitiveRunId`.
- Requirement 3: every fixture verdict has ≥3 evidence items per
  dimension, each carrying `url` or `documentRef`.
- Requirement 5: catalog `assignmentRefs.some(r => r.kind === "api")`.
- Requirement 6: numeric non-ok dimensions carry a range with conviction
  ≥ floor (already covered by `tests/analyst/verdict-shape.test.ts`).

Requirements 2 + 4 are reviewed at PR time, not statically asserted.

## Cross-references

- ADR-001 — analyst two-tier architecture
- ADR-003 — `AnalystVerdict` contract + invariants
- ADR-004 — verdict cache (governs per-dimension cost economics)
- ADR-006 — Resources control plane (governs API + benchmark resource
  assignment per Specialist)
- `.claude/rules/the-analyst-persona.md` — user-facing voice
- `.claude/rules/research-precision.md` — N+1 pipeline + deterministic-tool
  protection
- `.claude/skills/research/SKILL.md` — N+1 pipeline reference
- `.claude/skills/analyst/_index.md` — analyst skill entry point
- `.claude/rules/no-hardcoded-values.md` — anti-pattern: hardcoded
  benchmarks instead of live API calls
