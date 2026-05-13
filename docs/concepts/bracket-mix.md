---
date: 2026-05-13
status: canonical
supersedes: docs/brainstorms/icp-simplification/requirements.md for definitional purposes only — the brainstorm remains the planning record
---

# ICP Bracket Mix (Canonical Concept)

## 1) One-sentence definition (the elevator)

ICP Bracket Mix is the Management Company–level weighted distribution of shared customer-property archetypes used only to scale service-line fee consumption (especially hotel vs STR behavior) in company-level financial calculations.

---

## 2) User direction (verbatim source, 2026-05-11)

Source: `docs/brainstorms/icp-simplification/requirements.md` (§"User direction (2026-05-11) — verbatim source of truth").

> "What I have to say about ICP is that we need to keep it simple and base the ICP to be used by the Management Company financial calculations in the market research and tables that show the other hospitality brands that are on the market. By understanding these companies that I provided 6 names and you found many more, you can provide the user with a fairly good estimate of what their ICP companies look like. You can even have 3 to 5 ICP brackets so that you can mix them when calculating what the revenue and expenses will be as far as influenced by the ICP for the management company. As far as services sourced by ICP companies the app should assume that hotels will consume all the services and the STR will only pay for marketing, branding and performance bonus type of fees. That is enough. All the complexity of defining an ICP by the admin or the app AI should be simplified and the agents working on ICPs should focus on looking at competitors and similar companies that are in the market and what kind of customer properties they have. If they own the properties or not is not relevant because you want to know the revenue side most of all. As far as vendor costs for pass-through services the app should do a national research and establish these costs as percentage of revenue and similarly for the markup factors to be used by the management companies to charge these services to clients properties."

Interpretation rule:
- This quote is the governing intent.
- If implementation details drift, this quote is the correction anchor.

---

## 3) What problem this replaces (the legacy ~70-field per-company ICP)

The previous ICP model overfit the use case.

It required a per-company, high-granularity freeform profile (`lib/shared/src/icp-types.ts`) and a heavy pipeline to maintain assumptions that are not load-bearing for the Management Company revenue/cost use case.

What was wrong with the old shape:
- It asked every company to author bespoke detail.
- It coupled ICP to property descriptors at excessive granularity.
- It made the system harder to maintain and harder to migrate.

What Bracket Mix replaces it with:
- Shared reusable brackets (3–5, currently 4 canonical rows).
- One per-company mix of weights across those shared brackets.
- Service-consumption behavior embedded in bracket type (hotel/str/mixed), not user toggles.

Legacy status contract (R17–R20):
- Legacy schema is superseded for new calculation input.
- Existing records are preserved read-only for historical reference.
- No automatic backfill from old 70-field ICP into bracket mix.

Primary source:
- `docs/brainstorms/icp-simplification/requirements.md` (R1–R24).

---

## 4) Canonical bracket catalog (current 4)

Code source of truth:
- `artifacts/api-server/src/ai/icp/bracket-catalog.ts`.

Service-consumption doctrine:
- `hotel` => consumes all Management Company service lines.
- `str` => consumes only marketing, branding, performance-bonus lines.
- `mixed` => blended hotel/STR consumption behavior.

Current canonical brackets:

1. `boutique-upscale-hotel`
   - Name: Boutique Upscale Hotel
   - serviceConsumption: `hotel`
   - Canonical rule: full service-line consumption.

2. `soft-brand-boutique`
   - Name: Soft-Brand Boutique
   - serviceConsumption: `hotel`
   - Canonical rule: full service-line consumption.

3. `performance-managed-str`
   - Name: Performance-Managed STR Cluster
   - serviceConsumption: `str`
   - Canonical rule: only STR-eligible categories (`ICP_STR_ELIGIBLE_SERVICE_CATEGORIES`).

4. `agritourism-experiential`
   - Name: Agritourism / Experiential Lodge
   - serviceConsumption: `mixed`
   - Canonical rule: blended hotel + STR behavior. At engine-input time the entry is split 50/50 into a synthetic full + str_only pair via `lib/engine/src/helpers/normalize-bracket-mix.ts`.

Design note:
- These are shared catalog entries, not company-specific copies. Bracket count must remain in `[3, 5]` (R1) without code changes per bracket.

---

## 5) Mix shape (BracketMixData)

Canonical persisted shape (`global_assumptions.bracket_mix`):

```ts
type BracketMixData = {
  entries: BracketEntry[];
  assignedAt?: string; // ISO timestamp
  evidence?: string;
};

type BracketEntry = {
  id: string;
  name: string;
  archetypeLabel: string;
  serviceConsumption: "hotel" | "str" | "mixed";
  weight: number;
  rationale?: string;
};
```

Engine-facing compatibility shape:

```ts
type BracketMixEntry = {
  bracketSlug: string;
  weight: number;
};
```

Constraint contract:
- Weight sum must be `1.0 ± ICP_BRACKET_MIX_WEIGHT_TOLERANCE`.
- Entry count must be `<= ICP_BRACKET_MIX_MAX_ENTRIES`.
- Each weight must be `>= 0`.

Relevant code:
- `artifacts/api-server/src/routes/icp-brackets.ts` (validation and persistence boundary).
- `lib/engine/src/helpers/normalize-bracket-mix.ts` (normalization and mixed splitting).
- `lib/engine/src/company/icp-bracket-types.ts`.

---

## 6) Storage location and ownership rules

Single source of truth:
- `global_assumptions.bracket_mix` (jsonb), per-user row.

Critical ownership rule:
- Never patch the shared platform-default row (`userId IS NULL`) when writing a user mix.
- Writes must target the caller's own `global_assumptions` row.
- If the user row does not exist, create/upsert a user-scoped row.

Evidence:
- `artifacts/api-server/src/routes/icp-brackets.ts` enforces own-row writes in `handleSaveMix`.
- `artifacts/api-server/src/routes/global-assumptions.ts` exposes company mix read/assign/patch endpoints.

Catalog storage:
- Shared table `icp_brackets` (`lib/db/src/schema/icp-brackets.ts`), not user-scoped.

---

## 7) Authoring sources (exactly 3)

### A) Deterministic assignment minion (current)
- File: `artifacts/api-server/src/ai/icp/bracket-assignment-minion.ts`.
- Role: deterministic portfolio classifier and mix proposer.
- No LLM usage. Classifies each Mgmt Co property as hotel/str/mixed via `businessModel` + `propertyType` + name keywords. Splits hotel bucket into boutique-upscale vs soft-brand by `starRating` / `qualityTier` / asset definition level.
- Empty-portfolio fallback: `EMPTY_PORTFOLIO_DEFAULT_MIX` (45/25/20/10 across the 4 brackets).
- Trigger: `POST /api/company/bracket-mix/assign` (UI: "Assign Brackets" button).

### B) Tiago peer-derived Specialist (Phase C target)
- Planned file: `artifacts/api-server/src/ai/ambient/specialists/tiago.ts` (per Phase C handoff spec).
- Role: LLM-backed bracket characterization from peer market comps in the new `icp_peer_companies` table.
- Scope: revenue-side characterization from comps; ownership of comps is irrelevant (R5/R6).
- Output validated by Carlo-style Zod before persistence. Persisted in `bracket_mix_runs`; dual-run diffs in `bracket_mix_dual_run_diffs`.

### C) User edit
- UI entrypoint: `artifacts/hospitality-business-portal/src/pages/CompanyBracketMix.tsx`.
- Server paths:
  - `/api/icp/brackets/mix` (PUT/PATCH full-replace semantics).
  - `/api/company/bracket-mix` (PATCH merge/normalize semantics).

---

## 8) Single load-bearing engine integration

Only load-bearing integration point:
- `lib/engine/src/company/company-engine.ts`
- Function: `generateCompanyProForma()`.

What it does:
1. Detects STR presence using `bracketMixHasStrComponent()`.
2. Computes per-category scalars in [0,1] via `computeServiceConsumptionScalars(bracketMix, brackets, categoryNames)`.
   - `full` profile → all categories at 1.0 (hotels)
   - `str_only` profile → only categories in `ICP_STR_ELIGIBLE_SERVICE_CATEGORIES` at 1.0; rest 0
   - Final scalar per category = Σ(weight_i × applies(bracket_i, category)).
3. Applies scalars to `serviceFeeBreakdown.byCategory` BEFORE `computeCostOfServices(...)` so vendor cost-of-services reflects only revenue actually billed in each line.
4. Re-derives base fee revenue from scaled category totals.
5. Preserves `byCategoryByPropertyId` as unscaled gross drill-down for audit.
6. Pure-hotel mixes skip scaling entirely (scalars are all 1.0 — short-circuit).

What it does NOT do:
- Does not modify property-engine math (`lib/engine/src/property/property-engine.ts`).
- Does not modify ADR, RevPAR, occupancy, or property-level revenue formation.
- Does not alter partner comp, staffing-tier logic, or fixed-cost lines.
- Does not introduce per-property bracket mix.

Plumbing:
- Route validators: `artifacts/api-server/src/routes/finance.ts` (portfolio + company compute endpoints).
- Enrichment: `artifacts/api-server/src/finance/recompute.ts` (`enrichWithBrackets`, `loadBracketProfilesForMix`).
- Persisted-shape normalization: `lib/engine/src/helpers/normalize-bracket-mix.ts`.

Engine authoring boundary (hard rule):
- Per `CLAUDE.md` §156, edits in `lib/engine/src/company/**` require shell CC authoring discipline.
- Keep new bracket-mix write/read logic OUTSIDE the engine. Phase C plan locates the shared writer at `artifacts/api-server/src/services/bracketMix/effective.ts`.

---

## 9) Narrow UI surface (allowed front-of-app usage)

Bracket mix is intentionally narrow in UI.

Allowed front-of-app surfaces:
1. `artifacts/hospitality-business-portal/src/pages/CompanyBracketMix.tsx`
   - Route: `/company/icp-definition`.
   - Full edit + impact preview (revenue/GP delta vs saved mix; cash-shortfall warning).
   - Tabs: Bracket Mix · Market Evidence · Data Sources · Legacy ICP.

2. `artifacts/hospitality-business-portal/src/components/company/BracketMixSummaryCard.tsx`
   - Read-only chip on Company overview, links to (1).

3. `artifacts/hospitality-business-portal/src/components/company-assumptions/IcpMixSummary.tsx`
   - Read-only chip row on Company Assumptions page.

Admin/K&R catalog surface:
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/knowledge-registry/AssetPanel.tsx`.
- Catalog and national tables belong in Admin Information Architecture, not front-of-app editing (R21, `front-of-app-admin-isolation`).

---

## 10) Rebecca parity (required tools)

Per parity contract (`CLAUDE.md` §7), user-editable actions must have Rebecca parity.

Canonical bracket-mix parity tools:
- `get_bracket_mix` — read mix + catalog.
- `update_bracket_mix` — write user mix; server normalizes to 1.0.

Deterministic assignment trigger endpoint:
- `POST /api/company/bracket-mix/assign`
  - Runs bracket-assignment minion.
  - Rebecca reads resulting state through `get_bracket_mix`.

References:
- `docs/discipline/agent-native-parity-map.md` (lines 144–148).
- Tool defs/dispatch:
  - `artifacts/api-server/src/chat/rebecca-tool-defs-admin.ts`
  - `artifacts/api-server/src/chat/rebecca-tool-impls-admin.ts`

---

## 11) Phase C peer-derived future state (planned)

Phase C target architecture (per `docs/handoffs/phase-c-icp-bracket-mix-peer-derived.md`):

- Tiago Specialist:
  - LLM-backed peer-comp bracket characterization.
  - Grounded outputs validated before persistence.

- Hugo minion:
  - Deterministic aggregator over per-peer Specialist outputs.
  - Produces a single global-default mix candidate.

- Override sentinel:
  - Nullable FK on `global_assumptions` to `bracket_mix_runs.id`.
  - Prevents silent overwrite of a user override by a recompute.

- Shared writer:
  - `writeEffectiveBracketMix` as single mutation gateway.
  - All bracket-mix writers route through it.

- Provisional mode:
  - `provisional: true` when peer evidence is cold-start/incomplete.
  - Surfaced with `analyst-intelligence-display` contracts: provisional badge + Fabio range-quality dot.

- Feature flag:
  - `BRACKET_MIX_PHASE_B` controls staged rollout.

- Freshness governance:
  - Costantino `peer_research_stale` finding kind, 90-day default cadence.

References:
- `docs/handoffs/phase-c-icp-bracket-mix-peer-derived.md`.
- `docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md` (local-branch reference per handoff context).

---

## 12) PRECISION BOUNDARIES — Do not use Bracket Mix here

This section is intentionally strict. Bracket Mix is a narrow Mgmt Co–level control, not a universal modeling primitive. Its power comes from precise placement, not broad reuse.

Out of scope / prohibited uses:

- ❌ Property-level engine math (`lib/engine/src/property/property-engine.ts`).
- ❌ ADR, RevPAR, occupancy, or property-level revenue formation.
- ❌ Vendor pass-through cost percentages as bracket attributes (R11 — those are national tables in K&R).
- ❌ Mgmt Co markup factor percentages as bracket attributes (R12 — same).
- ❌ Per-bracket vendor cost tables.
- ❌ Per-company vendor pass-through or markup authoring.
- ❌ Inferring property descriptors (rooms, suites, baths, F&B seats, event sqft, acreage) from bracket mix.
- ❌ Introducing `property.bracketMix` or any per-property bracket assignment field.
- ❌ Backfilling from legacy `lib/shared/src/icp-types.ts` 70-field schema into bracket mix.
- ❌ Front-of-app editor for bracket catalog rows (R21 — admin-only, read-only in K&R).
- ❌ Front-of-app display of raw national pass-through / markup tables.
- ❌ User-facing toggles for hotel-vs-STR consumption behavior (R10 — it is a property of the bracket, never a user choice).

If you find yourself reaching for one of the above, you are using the wrong primitive. Re-read §2 before adding code.

---

## 13) Cross-references (skills, ADRs, brainstorm, handoff)

Primary concept and requirements:
- `docs/brainstorms/icp-simplification/requirements.md`

Execution / handoff docs:
- `docs/handoffs/phase-c-icp-bracket-mix-peer-derived.md`
- `docs/plans/2026-05-13-001-feat-icp-bracket-mix-peer-derived-phase-b-plan.md` (local-branch reference per handoff context)
- `docs/discipline/agent-native-parity-map.md`

Core implementation references:
- `artifacts/api-server/src/ai/icp/bracket-catalog.ts`
- `artifacts/api-server/src/ai/icp/bracket-assignment-minion.ts`
- `artifacts/api-server/src/routes/icp-brackets.ts`
- `artifacts/api-server/src/routes/global-assumptions.ts`
- `artifacts/api-server/src/routes/finance.ts`
- `artifacts/api-server/src/finance/recompute.ts`
- `lib/engine/src/company/company-engine.ts`
- `lib/engine/src/company/bracket-service-consumption.ts`
- `lib/engine/src/company/icp-bracket-types.ts`
- `lib/engine/src/helpers/normalize-bracket-mix.ts`
- `lib/db/src/schema/icp-brackets.ts`

Governing contracts:
- `CLAUDE.md` §1 — no magic numbers / named constants discipline.
- `CLAUDE.md` §7 — agent-native parity.
- `CLAUDE.md` §10 — agent taxonomy (Specialist / minion / orchestrator names).
- `CLAUDE.md` §156 — financial-engine authoring restriction.

Skills:
- `hplus-admin-nav-ia` — where the bracket catalog and national tables live in admin IA.
- `front-of-app-admin-isolation` — why the catalog editor never appears on front-of-app.
- `analyst-research-buttons` — re-run button contract for the bracket-mix page.
- `analyst-intelligence-display` — range-badge + provisional badge + Fabio dot contract.
- `slide-factory` — reserved-name registry (Tiago, Hugo).
- `external-data-source-integration` — pattern for the national pass-through and markup tables.
- `costantino-data-custodian` — `peer_research_stale` finding kind.
