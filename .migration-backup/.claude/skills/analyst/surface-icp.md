# Skill: ICP Specialist

**Status:** Not yet built; brief documents exist under `docs/planning/`.
**Descriptive companion:** `docs/architecture/analyst/icp-specialist.md`.
**Future home:** `engine/analyst/surface/icp/icp-specialist.ts`.
**Parent skill:** `_index.md`.

---

## Scope

Owns the Mgmt-Co's **portfolio definition**: the segment, geography, tier, size band, and economics envelope that defines what properties this Mgmt-Co targets. ICP is consumed by:

- **Property Finder** — filtering candidate acquisitions.
- **Cognitive Engine** — narrowing comp sets during research.
- **Cross-Portfolio Specialist** — defining the "in-portfolio" reference set.
- **Mgmt-Co Property-Defaults Specialist** — parameterizing default ranges new properties inherit.

Because ICP feeds so many downstream surfaces, this Specialist's verdict is consequential. Changes to ICP cascade widely.

---

## Hard rules

### 1. ICP is Tier-1 by default

Unlike most Specialists, ICP routinely consults the Cognitive Engine. Reasons:

1. Segment definition requires market context — the Cognitive Engine's comparables relaxation is exactly the right shape for this.
2. ICP changes are infrequent enough that Tier-1 cost is acceptable.
3. Portfolio-implied ICP (revealed preference) requires analyzing every portfolio property together — synthesis work the Engine does well.

The Specialist passes `scope: { mgmtCo: true, portfolio: true, segment: <stated> }` to the façade.

### 2. Reconcile stated vs revealed preference

The Specialist's core job: compare the Mgmt-Co's stated ICP (geography filters, tier filters, size bands) against revealed preference (what the portfolio actually looks like). When they diverge, surface it in the verdict.

- Properties that fit both stated and revealed → in-portfolio, no action.
- Properties that fit stated but not revealed → fine, but flag if they're outliers.
- Properties that fit revealed but not stated → "The Analyst notes this property doesn't match your stated ICP — consider updating either."

### 3. Divergent properties flow to Cross-Portfolio

When a property doesn't fit the ICP as evaluated, the ICP Specialist sets `verdict.crossSurface: { needsCrossPortfolio: true, reason: "icp-divergence" }`. The Router fans out.

### 4. ICP changes require cascade verification

When the Mgmt-Co updates its stated ICP, every downstream consumer is affected:

- Property Finder re-runs with new filters.
- Cognitive Engine comp-set assembly uses new scope.
- Cross-Portfolio re-runs outlier detection with new baseline.
- Property-Defaults Specialist updates inherited defaults.

The ICP Specialist emits a verdict listing every downstream implication. The Router dispatches cascade events.

### 5. Persona-keyed test is mandatory

The L+B-segment golden for ICP:

- Canonical L+B Mgmt-Co fixture (10-80 rooms, $250-600 ADR, F&B + events + wellness).
- Portfolio of 3-4 fixture properties.
- Expected ICP verdict and confidence levels.
- Expected list of "doesn't-fit" properties.

---

## Inputs

- **Stated preferences** — Mgmt-Co's declared ICP (geography filters, tier filters, size bands, economics envelope).
- **Portfolio properties** — each property's `PropertyContextPack` (`server/ai/context-pack/property-pack.ts`).
- **Cognitive Engine output** — segment characterization derived from the portfolio (revealed preference).

Do NOT hand-compute segment classifications. The Engine's comp-set work produces this for free.

---

## Outputs

`AnalystVerdict` with:

- **Recommended ICP definition** — geography, tier, size, economics, with conviction per dimension.
- **Properties that fit** and **properties that don't** — the latter become Cross-Portfolio signals.
- **Suggested adjustments to stated ICP** when revealed preference disagrees.
- **Cascade actions** — downstream Specialists that need to re-run.

---

## The property ↔ Mgmt-Co bridge in action

ICP is the canonical example of property-level data informing Mgmt-Co intelligence. The pipeline:

1. Load every portfolio property's `PropertyContextPack`.
2. Ask the Cognitive Engine to characterize the implied segment.
3. Compare to stated ICP.
4. Return a verdict with deltas.

No new bridging code needed — this falls naturally out of the Engine's existing comparables-relaxation + vector-memory machinery.

---

## What NOT to do

- Don't hand-implement segment classification; consult the Engine.
- Don't silently let stated and revealed ICP drift — always surface the delta.
- Don't dispatch to Cross-Portfolio directly; use `crossSurface`.
- Don't emit a verdict without a per-dimension conviction score.
- Don't treat ICP as a Tier-0 surface (it isn't).

---

## References

- `docs/architecture/analyst/icp-specialist.md` — descriptive spec
- `server/ai/context-pack/property-pack.ts` — property context bundles
- `server/ai/comparables/relaxation-engine.ts` — Engine's comp-set assembly
- `.claude/skills/analyst/cognitive-engine.md` — façade rules
- `.claude/skills/analyst/surface-cross-portfolio.md` — downstream cascade
- `.claude/skills/analyst/orchestrator.md` — Router dispatch
- `.claude/skills/analyst/steward.md` — change-control gate
