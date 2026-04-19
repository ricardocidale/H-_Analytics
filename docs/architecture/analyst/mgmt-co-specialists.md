# Mgmt-Co Specialists

**Status:** 2 of 6 implemented; remainder scheduled for Phase 4.
**Future home:** `engine/analyst/surface/mgmt-co/*-specialist.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Scope

Each Mgmt-Co Specialist owns one tab in the Company Assumptions page. There is one Specialist per tab; tabs are independent surfaces from The Analyst's perspective even though they share a save flow. This separation matters because tabs have different benchmark sources, different validation rules, and different evidence tiers.

---

## The six tabs

| Tab | Specialist | Status | Today's location | Future location |
|---|---|---|---|---|
| Funding | Mgmt-Co Funding Specialist | ✅ Built | `engine/watchdog/capitalRaiseEvaluator.ts` | `engine/analyst/surface/mgmt-co/funding-specialist.ts` |
| Revenue | Mgmt-Co Revenue Specialist | ✅ Built | `engine/watchdog/revenueEvaluator.ts` | `engine/analyst/surface/mgmt-co/revenue-specialist.ts` |
| Compensation | Mgmt-Co Compensation Specialist | ⏳ Phase 4 (a.k.a. Norfolk audit Phase 3) | — | `engine/analyst/surface/mgmt-co/compensation-specialist.ts` |
| Overhead | Mgmt-Co Overhead Specialist | ⏳ Phase 4 | — | `engine/analyst/surface/mgmt-co/overhead-specialist.ts` |
| Company | Mgmt-Co Company Specialist | ⏳ Phase 4 | — | `engine/analyst/surface/mgmt-co/company-specialist.ts` |
| Property Defaults | Mgmt-Co Property-Defaults Specialist | ⏳ Phase 4 | — | `engine/analyst/surface/mgmt-co/property-defaults-specialist.ts` |

---

## Common contract

Every Mgmt-Co Specialist:

- Takes the saved tab payload (typed, validated upstream by zod) plus the prior values.
- Resolves benchmarks from `engine/analyst/benchmarks/*.ts` (Phase 2+).
- Returns an `AnalystVerdict` (see `verdict-contract.md`).
- **Does not call the Cognitive Engine on a tab save.** Tab saves are Tier-0 evaluation only — sub-second, deterministic, no LLM. If a Mgmt-Co Specialist decides Cognitive Engine consultation is warranted, it returns a verdict with `actions: [{ kind: "consult-cognitive", reason }]` and the Surface Router decides whether to fire the asynchronous research path.

---

## Funding Specialist (built)

**Today:** `engine/watchdog/capitalRaiseEvaluator.ts` (233 lines).

**Dimensions checked:** equity raise vs investment basis ratio, debt service coverage, exit cap rate, IRR sanity, capital stack composition.

**Benchmarks:** `analyst_watchdog_benchmarks` table (Funding-only today; will broaden in Phase 4).

**Phase 3 changes:**
- Returns `AnalystVerdict` instead of `{status, alerts}`.
- Re-export shim left at the old path for one release cycle, with `@deprecated` JSDoc.
- File renamed `funding-specialist.ts` and moved to `engine/analyst/surface/mgmt-co/`.

---

## Revenue Specialist (built)

**Today:** `engine/watchdog/revenueEvaluator.ts` (185 lines), wired into `/api/global-assumptions/save-tab` for `tabKey === "revenue"`.

**Dimensions checked (5):** F&B capture ratio, events revenue per available room, marketing cost rate, F&B cost rate, miscellaneous revenue rate.

**Benchmarks:** `shared/constants-revenue-benchmarks.ts` (HVS / STR / BLLA grounded). Will move to `engine/analyst/benchmarks/revenue.ts` in Phase 2.

**Phase 3 changes:** same as Funding — verdict shape backfill, re-export shim, file move.

---

## Compensation Specialist (next to build — Norfolk audit Phase 3)

**Surfaces:** salary bands, FTE counts, benefits load, payroll tax assumptions per role family.

**Benchmarks needed:** AHLA Lodging Industry compensation tables, BLS lodging-NAICS payroll tax rates, regional adjustments. Will live at `engine/analyst/benchmarks/compensation.ts`.

**Why this Specialist ships first under the new architecture:** it's the next item on the Norfolk financial audit and provides a live test of the steward checklist + verdict contract. It lands in `engine/analyst/surface/mgmt-co/compensation-specialist.ts` from day one, not in the legacy `engine/watchdog/` folder.

**Cognitive consultation:** likely yes for benefits-load assumptions (regional variance is high; Cognitive Engine consultation gives better ranges than constants alone).

---

## Overhead, Company, Property-Defaults Specialists

Specs deferred to Phase 4 design. Each will land here as a sibling sub-section once scoped.

---

## Persona-keyed test expectations

Every Mgmt-Co Specialist must pass `tests/analyst/personas/lb.test.ts` (Phase 3) — a golden bench with one canonical L+B-segment input fixture and the verdict the Specialist must return. New benchmark data, new tier inputs, or new evaluation dimensions all require updating the L+B golden fixture in the same PR.

This is non-negotiable: the persona test is what prevents any Specialist from quietly drifting away from L+B's range expectations.
