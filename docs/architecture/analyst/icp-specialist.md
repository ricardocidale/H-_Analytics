# ICP Specialist

**Status:** Not yet built; brief documents exist under `docs/planning/`.
**Future home:** `engine/analyst/surface/icp/icp-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

The ICP (Ideal Customer Profile) Specialist owns the Mgmt-Co's portfolio definition: the segment, geography, tier, size band, and economics envelope that defines what properties this Mgmt-Co targets. The ICP is consumed by:

- Property Finder (filtering candidate acquisitions)
- Cognitive Engine (narrowing comp sets)
- Cross-Portfolio Specialist (defining the "in-portfolio" reference set)
- Mgmt-Co Property-Defaults Specialist (parameterizing the default ranges new properties inherit)

Because ICP feeds so many downstream surfaces, this Specialist's verdict is consequential.

---

## Inputs

- Existing portfolio properties (the Mgmt-Co's de facto ICP)
- Mgmt-Co stated preferences (geography filters, tier filters, size bands, economics envelope)
- Cognitive Engine output for "what segment is this Mgmt-Co actually in?" — derived from the portfolio, not from declaration

The Specialist's job is to reconcile stated and revealed preference. When they diverge, the verdict surfaces it.

---

## Outputs

`AnalystVerdict` with:

- The recommended ICP definition (geography, tier, size, economics)
- Confidence per dimension
- Properties that fit and properties that don't (the latter become Cross-Portfolio Specialist signals)
- Suggested adjustments to the Mgmt-Co's stated ICP if revealed preference disagrees

---

## Cognitive consultation

ICP is a Tier-1 surface by default. The Specialist routinely consults the Cognitive Engine because:

1. Segment definition requires market context (where do boutique-luxury operators with 10-80 room properties usually concentrate?)
2. Comp set assembly via progressive relaxation is exactly the Cognitive Engine's strength
3. ICP changes are infrequent enough that Tier-1 cost is acceptable

The Specialist passes `scope: { mgmtCo: true, portfolio: true, segment: "boutique-luxury" }` to the Cognitive Engine call.

---

## The property ↔ Mgmt-Co bridge in action

ICP is the canonical example of property-level data informing Mgmt-Co intelligence. The Specialist:

1. Loads every portfolio property's `PropertyContextPack`.
2. Asks the Cognitive Engine to characterize the implied segment.
3. Compares to the Mgmt-Co's stated ICP.
4. Returns a verdict with deltas.

This pipeline doesn't need any new bridging code — it falls naturally out of the Cognitive Engine's existing comparables relaxation + vector memory machinery.

---

## Persona-keyed test expectations

The L+B-segment golden test for ICP must include:

- A canonical L+B Mgmt-Co fixture (10-80 rooms, $250-600 ADR, F&B + events + wellness)
- A portfolio of 3-4 fixture properties
- The expected ICP verdict and confidence levels
- The expected list of "doesn't-fit" properties (if any)
