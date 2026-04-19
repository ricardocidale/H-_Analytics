# Batch 6 Pre-Audit — Remaining `|| 0` Outside Financial Audit Files

**Status:** Documentation only. No code edited by this commit.
**Purpose:** Classify each `|| 0` site in the non-audit portion of the codebase before Batch 6 execution. Companion to `batch-5-preaudit.md`; same methodology, different scope.
**Scope:** The 82 `|| 0` warnings outside financial audit / verification / calculation-checker files (those are Batch 5). Files range from LLM prompt builders to dashboard chart coordinates.

## Inventory at time of writing

Current lint: **161 `|| 0` warnings total** across 82 distinct file-sites. 79 are in Batch-5 scope; **82 remain in Batch 6 scope**. 

Note: Batch 5's inventory reports ~83 sites; the grep-to-lint count differs by a few because some `|| 0` occurrences inside `.toFixed()` string templates don't trigger the restricted-syntax rule. Tracking to lint count, not grep count.

Top Batch 6 files by count:

| File | Sites | Domain |
|---|---:|---|
| `server/routes/icp-research-helpers.ts` | 8 | LLM prompt builder |
| `server/ai/research-tool-prompts.ts` | 7 | LLM prompt builder |
| `client/src/components/portfolio/AddPropertyDialog.tsx` | 5 | User input parsing |
| `server/routes/finance.ts` | 4 | Server route, Number() coercion |
| `server/document-ai/templates.ts` | 3 | Document AI templates |
| `client/src/components/property-detail/CashFlowTab.tsx` | 3 | Optional engine output |
| `client/src/components/dashboard/OverviewTab.tsx` | 3 | groupBy accumulator |
| 30+ files | 1-2 each | Scattered |

## Six disposition categories for Batch 6

This batch has more pattern variety than Batch 5. Each site falls into one of six categories.

### Category A — **Safe `?? 0`** (schema-nullable / optional-chained / groupBy)

Upstream value is `number | null | undefined`. No NaN risk. `??` and `||` behave identically because we're guarding against nullish, not zero.

**Examples:**
- `cashFlowData[i]?.freeCashFlow || 0` (CashFlowTab) — optional-chained array index
- `property.operatingReserve || 0`, `property.preOpeningCosts || 0` (statementBuilders)
- `acc[p.market] = (acc[p.market] || 0) + 1` (OverviewTab, overviewExportData) — groupBy accumulator
- `(global.capitalRaise1Amount || 0) + (global.capitalRaise2Amount || 0)` (companyExports)
- `io_months || 0` (financing routes) — optional request field

**Estimated site count:** ~40

**Action:** Mechanical `||` → `??` swap. Zero risk.

### Category B — **Number.isFinite wrap** (user input parsing)

Upstream uses `parseInt()` / `parseFloat()` / `Number()` which can return NaN. `|| 0` masks NaN → 0. `?? 0` propagates NaN (breaks downstream). Needs `Number.isFinite` wrap.

**Examples:**
- `parseInt(e.target.value) || 0` (AddPropertyDialog × 5: roomCount, cateringBoostPercent, adrGrowthRate, startOccupancy, maxOccupancy)
- `parseFloat(e.target.value) || 0` inside `/100` divisions
- `Number(t.defaultRate) || 0`, `Number(t.serviceMarkup) || 0` (finance.ts × 4)

Same pattern as Batch 4's KnowledgeBaseEditor + AssetDefinitionTab + vector-store-service.

**Estimated site count:** ~14

**Action:** Replace with:
```ts
const parsed = parseInt(e.target.value);
set(Number.isFinite(parsed) ? parsed : 0);
```
or inline: `(Number.isFinite(parseInt(e.target.value)) ? parseInt(e.target.value) : 0)` — ugly, extract to helper if appearing >3 times in one file.

### Category C — **LLM prompt builders** (financial values formatted into Opus prompt text)

Upstream is a typed `number` from the property object. Used to build text sent to an LLM. `|| 0` silently replaces NaN with 0 in the prompt; `?? 0` would leak NaN into the prompt string rendering as "NaN" — which the LLM would then *comment on* in its output, potentially flagging bad data.

**Examples:**
- `` `Keys: ${p.roomCount || 0}` `` (icp-research-helpers)
- `` `Starting ADR: $${(p.startAdr || 0).toFixed(0)}` ``
- `` `Base Management Fee: ${((ga.baseManagementFee || 0) * 100).toFixed(1)}%` ``
- `(input.purchase_price || 0).toLocaleString()` (research-tool-prompts)

**Estimated site count:** ~15

**Action:** Two valid approaches:

1. **`?? 0`**: LLM receives "NaN" in prompt on bad data, its output mentions the anomaly — passive detection. Low risk; the LLM is robust enough to handle unexpected tokens without crashing.

2. **`assertFinite(value, "field")`**: throws with context at prompt-build time. Blocks the LLM call entirely. Strictest; matches financial-safety rule prescription.

**My recommendation:** `?? 0` for prompt builders. LLM surfacing anomalies in its output is the correct failure mode — it gives the user visibility. `assertFinite` here would block on data that the LLM could have gracefully reasoned about.

### Category D — **Financial display in dashboards / exports**

Upstream is typed `number` from engine output. Used for chart data, export rows, dashboard cards. Same NaN propagation concern as Batch 5 Category B.

**Examples:**
- `{ ...value: cf.freeCashFlow || 0 }` (propertyPdfExports chart data)
- `financials.totalProjectionANOI || 0` (OverviewTab KPI card)
- `(Number.isFinite(...) ? ... : 0)` patterns already present in some files

**Estimated site count:** ~12

**Action:** `?? 0` for display contexts (NaN appears as "NaN" in UI — visible, catchable). `assertFinite` only where upstream is financial-critical (e.g. summed values feeding other calculations).

**My recommendation:** `?? 0` for presentation-layer sites. UI "NaN" strings are visible; the user reports them fast. Don't use `assertFinite` in dashboard rendering — it'd crash the page.

### Category E — **Chart / layout coordinates**

Upstream is optional chart config (`viewBox.cx`, `brand.LINE_HEX[1]`, etc.). Pure cosmetic.

**Examples:**
- `brand.LINE_HEX[1] || brand.SECONDARY_HEX` — array fallback on hex color
- Coordinate fallbacks inside chart components

**Estimated site count:** ~8

**Action:** Safe `?? 0` swap. Zero risk.

### Category F — **Misc / inspect required**

Sites that don't cleanly fit above. May need case-by-case review.

**Examples:**
- `server/document-ai/templates.ts` — document template defaults
- `client/src/lib/formatters.ts` — formatter utility
- `client/src/components/ui/progress.tsx` — UI component
- `server/table-renderer.ts` — server-side table rendering

**Estimated site count:** ~3

**Action:** Inspect each before deciding. Likely A or D when looked at.

---

## Per-file quick classification

| File | Sites | Categories |
|---|---:|---|
| `AddPropertyDialog.tsx` | 5 | **B** (all parseInt/parseFloat user input) |
| `finance.ts` | 4 | **B** (Number() coercion of route params) |
| `financing.ts` | 2 | **A** (optional request fields) |
| `icp-research-helpers.ts` | 8 | **C** (LLM prompt builder) |
| `research-tool-prompts.ts` | 7 | **C** (LLM prompt builder) |
| `OverviewTab.tsx` | 3 | **A** (groupBy × 2), **D** (KPI card) |
| `overviewExportData.ts` | 2 | **A** (groupBy × 2) |
| `CashFlowTab.tsx` | 3 | **A** (optional-chained FCF array) |
| `statementBuilders.ts` | 2 | **A** (schema-nullable property fields) |
| `propertyPdfExports.ts` | 2 | **D** (chart data from cashFlowData) |
| `companyExports.ts` | 2 | **A** (schema-nullable capitalRaise fields) |
| `CompanyBalanceSheet.tsx` | 2 | **D** (balance sheet display — review carefully) |
| `ManagementFeesSection.tsx` (property-edit) | 2 | **D** |
| `ManagementFeesSection.tsx` (company-assumptions) | 1 | **D** |
| `map-utils.ts` | 2 | **D** (property.purchasePrice + buildingImprovements) |
| `property-photos.ts`, `uploads.ts` | 1 each | **A** |
| `premium-pdf-pipeline.ts` | 2 | **A/D** inspect |
| `Company.tsx` | 2 | **D** |
| chart files (DonutChart, RadialGauge, BarChart, specialized-rows) | 1 each | **E** |
| `ThemeManager.tsx`, `ThemeFormDialog.tsx` | 1 each | **B or E** inspect |
| `formatters.ts`, `progress.tsx`, `table-renderer.ts` | 1 each | **F** inspect |
| `icp-intelligence.ts`, `data-routing.ts`, `context-pack/company-pack.ts` | 1 each | **A** (server state fields) |
| `OverviewCompositionSections.tsx`, `exportRenderersCsv.ts` | 1 each | **D** |
| `property-detail/RevenueAssumptionsSection.tsx` | 1 | **B** (input parsing) |
| `CurrencyInput.tsx`, `StressTestTab.tsx`, `DSCRTab.tsx` | 1 each | **B** (Number() input) |
| `YearlyCashFlowStatementCore.tsx` | 1 | **D** |
| `PropertyMarketResearch.tsx` | 1 | **A/D** inspect |
| `PropertyMap.tsx` | 1 | **A** (optional property field) |
| `document-ai/templates.ts` | 3 | **F** inspect |
| **Total** | **~82** | 40 A + 14 B + 15 C + 12 D + 8 E + 3 F |

---

## Recommended execution strategy

### Option 1 — **All-at-once** (single big commit, ~82 sites)

Risk: one failing site blocks the whole commit. Hard to isolate what caused a regression if verify:summary fails.

### Option 2 — **By category** (my recommendation)

Split into 6 sub-batches, each its own commit:

- **6a — Category A** (~40 sites): safe mechanical swap. Zero risk.
- **6b — Category E** (~8 sites): chart coordinates. Zero risk. Could merge with 6a if we're feeling bold.
- **6c — Category C** (~15 sites): LLM prompt builders. `?? 0` with documentation. Low risk (LLM handles "NaN" gracefully).
- **6d — Category D** (~12 sites): dashboard / export display. `?? 0`. Low-moderate risk — any upstream NaN becomes a visible UI artifact.
- **6e — Category B** (~14 sites): user input parsing with `Number.isFinite` wrap. Moderate risk — behavioral change at input boundary.
- **6f — Category F** (~3 sites): inspect each before editing. Triage first.

Each sub-batch passes `verify:summary` independently. If 6d or 6e surfaces a bug, we stop, fix, resume.

### Option 3 — **Conservative: Categories A + E only**

22 sites of guaranteed-safe work. Get the easy wins, defer the rest pending more careful review.

**My recommendation:** Option 2 executed 6a → 6b → 6c → 6d → 6e → 6f. Five small commits, each with its own verify:summary.

---

## Open questions for reviewer

1. **Category C (LLM prompt builders): `?? 0` or `assertFinite`?** My default: `?? 0`. But strictest-mode would be `assertFinite`, matching financial-safety rule. Pick now — applies to all 15 C sites.

2. **Category D (display): any specific file that should use `assertFinite` instead of `?? 0`?** My default: none — display layers should degrade gracefully, not crash. Flag any you see differently.

3. **Sub-batch ordering:** 6a first (safest) or 6e first (highest information value — surfaces parse-input bugs)?

4. **Merge with Batch 5?** Once Batch 5 execution strategy is decided, 6a–6f could run in parallel with Batch 5a–5c under the same ~5-day cleanup window. Or keep them separate for reviewability.

---

## Related

- `.claude/plans/batch-5-preaudit.md` — sibling doc, financial audit files.
- `.claude/plans/lint-warning-cleanup.md` — parent plan.
- `.claude/rules/financial-safety.md` — `assertFinite` rule that this defers to for Category D moments.
- `docs/architecture/SYSTEM-MODEL.md` §9 — ranked roadmap.
