# Skill: Mgmt-Co Specialists

**Status:** 2 of 6 implemented; 4 pending in Phase 4.
**Descriptive companion:** `docs/architecture/analyst/mgmt-co-specialists.md`.
**Future home:** `engine/analyst/surface/mgmt-co/<name>-specialist.ts` (Phase 2+).
**Parent skill:** `_index.md`.

---

## Scope

One Specialist per tab of the Company Assumptions page. The six tabs are independent evaluation surfaces: each has its own benchmarks, validation rules, and evidence tier. Never merge responsibilities across tabs.

| Tab | Specialist | Today | Future home |
|---|---|---|---|
| Funding | Mgmt-Co Funding Specialist | ✅ `engine/watchdog/capitalRaiseEvaluator.ts` | `engine/analyst/surface/mgmt-co/funding-specialist.ts` |
| Revenue | Mgmt-Co Revenue Specialist | ✅ `engine/watchdog/revenueEvaluator.ts` | `engine/analyst/surface/mgmt-co/revenue-specialist.ts` |
| Compensation | Mgmt-Co Compensation Specialist | ⏳ Phase 4 | `engine/analyst/surface/mgmt-co/compensation-specialist.ts` |
| Overhead | Mgmt-Co Overhead Specialist | ⏳ Phase 4 | `engine/analyst/surface/mgmt-co/overhead-specialist.ts` |
| Company | Mgmt-Co Company Specialist | ⏳ Phase 4 | `engine/analyst/surface/mgmt-co/company-specialist.ts` |
| Property Defaults | Mgmt-Co Property-Defaults Specialist | ⏳ Phase 4 | `engine/analyst/surface/mgmt-co/property-defaults-specialist.ts` |

---

## Hard rules

### 1. Tab saves are Tier-0 — no LLM calls

Every `TabSaved` event hitting a Mgmt-Co Specialist evaluates against constants + DB benchmark lookups only. Sub-second, deterministic, zero API cost. If a Specialist decides Cognitive Engine consultation is warranted, it returns a verdict with `actions: [{ kind: "consult-cognitive", reason }]` — the Surface Router then decides whether to fire the asynchronous Tier-1 path.

A Specialist that invokes the Cognitive Engine directly on a save path is a bug. Tab-save latency budget is ~200ms; Tier-1 runs are seconds.

### 2. Benchmarks live in `engine/analyst/benchmarks/<area>.ts` (Phase 2+)

Today:
- Funding: `analyst_watchdog_benchmarks` DB table.
- Revenue: `shared/constants-revenue-benchmarks.ts`.

Phase 2 migrates each to `engine/analyst/benchmarks/<area>.ts`. Specialists import from that path. Do not inline benchmark values in Specialist code — they drift and become un-auditable.

### 3. Every Specialist returns the same verdict shape

Until Phase 3: existing shape (`{ status, alerts }`); see `.claude/rules/analyst-verdict-contract.md`.
After Phase 3: `AnalystVerdict`. Migration via re-export shim; no breaking changes.

### 4. Persona-keyed L+B golden test is mandatory

Every Mgmt-Co Specialist must pass `tests/analyst/personas/lb.test.ts` (Phase 3) with a canonical L+B-segment input fixture. New dimensions, new benchmark data, new tier inputs — all require updating the L+B golden in the same PR.

---

## Funding Specialist (built)

**Today:** `engine/watchdog/capitalRaiseEvaluator.ts` (233 lines).
**Benchmarks:** `analyst_watchdog_benchmarks` DB table.
**Dimensions checked:** equity raise vs investment basis ratio, debt service coverage, exit cap rate, IRR sanity, capital stack composition.

**Phase 3 migration:**
- Move to `engine/analyst/surface/mgmt-co/funding-specialist.ts`.
- Return `AnalystVerdict`.
- Re-export shim at legacy path with `@deprecated` JSDoc.
- L+B golden covers all 5 dimensions.

---

## Revenue Specialist (built)

**Today:** `engine/watchdog/revenueEvaluator.ts` (185 lines), wired via `/api/global-assumptions/save-tab` when `tabKey === "revenue"`.
**Benchmarks:** `shared/constants-revenue-benchmarks.ts` (HVS / STR / BLLA grounded). Moves to `engine/analyst/benchmarks/revenue.ts` in Phase 2.
**Dimensions checked (5):** F&B capture ratio, events revenue per available room, marketing cost rate, F&B cost rate, miscellaneous revenue rate.

**Phase 3 migration:** same pattern as Funding.

---

## Compensation Specialist (next to build — Norfolk audit Phase 3)

**Surfaces:** salary bands, FTE counts, benefits load, payroll tax assumptions per role family.
**Benchmarks needed:** AHLA Lodging Industry compensation tables, BLS lodging-NAICS payroll tax rates, regional adjustments. Will land at `engine/analyst/benchmarks/compensation.ts`.
**Cognitive consultation:** likely yes for benefits-load assumptions (regional variance is high).
**Why this ships first under the new architecture:** it's the next Norfolk audit target and provides a live test of the steward checklist + verdict contract.

This Specialist lands in `engine/analyst/surface/mgmt-co/compensation-specialist.ts` from day one — NOT in the legacy `engine/watchdog/` folder.

---

## Overhead, Company, Property-Defaults Specialists

Specs deferred to Phase 4 design. When you introduce one of them:

1. Add the sibling per-component spec at `docs/architecture/analyst/mgmt-co-specialists.md` (extend existing file).
2. Add the benchmark table at `engine/analyst/benchmarks/<area>.ts`.
3. Add the Specialist file at `engine/analyst/surface/mgmt-co/<area>-specialist.ts`.
4. Add the L+B golden case in `tests/analyst/personas/lb.test.ts`.
5. Add the routing entry in `engine/analyst/surface/surface-router.ts`.
6. Walk the 9-step steward checklist (`steward.md`).

---

## Cross-surface implications

A Mgmt-Co tab save may imply:

- **Cross-Portfolio effects** — a change in Mgmt-Co defaults cascades to properties without per-property overrides. Set `crossSurface: { needsCrossPortfolio: true, reason }` on the verdict.
- **Property-Defaults effects** — Mgmt-Co Property-Defaults Specialist's job to evaluate whether a change to propagation defaults is sound.
- **Admin Defaults effects** — rare. A Mgmt-Co save generally doesn't alter admin tables.

The Router aggregates. Don't daisy-chain Specialists directly.

---

## What NOT to do

- Don't call the Cognitive Engine on save paths.
- Don't inline benchmark values; import from `engine/analyst/benchmarks/` (or the interim location).
- Don't introduce a fifth divergent verdict shape before Phase 3.
- Don't craft user-facing strings; populate structured verdict fields only.
- Don't skip the L+B golden update when changing a Specialist.

---

## References

- `docs/architecture/analyst/mgmt-co-specialists.md` — descriptive spec
- `engine/watchdog/capitalRaiseEvaluator.ts` — today's Funding implementation
- `engine/watchdog/revenueEvaluator.ts` — today's Revenue implementation
- `.claude/skills/analyst/orchestrator.md` — how the Router dispatches to these
- `.claude/skills/analyst/voice.md` — how verdicts become strings
- `.claude/skills/analyst/quality-scoring.md` — how conviction is computed
- `.claude/skills/analyst/steward.md` — change-control gate
- `.claude/rules/analyst-verdict-contract.md` — transition policy
