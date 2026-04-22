# Task #379 — Admin Defaults vs Source-of-Truth Overlap Audit

**Date:** 2026-04-22
**Scope:** Identify values present in BOTH the Admin sidebar **Defaults** group
(Management Company / Property / Market & Macro / Constants) and the Admin
sidebar **Resources / Source-of-Truth** group (APIs / Sources / Tables /
Benchmarks / Models). For each duplicate pick a canonical home, remove or
demote the non-canonical surface, and preserve engine behavior.

Sidebar restructuring is out of scope (tracked as Task #331).

---

## 1. Sidebar inventory

### Defaults group (`AdminSidebar.tsx` lines 282–305)
| Sidebar id | Component | Purpose |
|---|---|---|
| `defaults-management-company` | `ModelDefaultsTab → CompanyTab` | Company-wide defaults (mgmt fees, tax rate, cost of equity, exit cap, sales commission). |
| `defaults-property` | `ModelDefaultsTab → PropertyUnderwritingTab` | Property-level underwriting defaults (ADR, occupancy, USALI cost rates, depreciation, inflation, land value). |
| `defaults-market-macro` | `ModelDefaultsTab → MarketMacroTab` | Macro inputs (inflation rate, cost of equity, fiscal year). |
| `constants` | `ModelDefaultsTab → ModelConstantsTab` | Governed regulatory/structural constants registry (IRS depreciation, country taxes, country risk premium, etc). |

### Resources / Source-of-Truth group
| Sidebar id | Component | Carries values? |
|---|---|---|
| `resources-apis` | `ResourcesTab → APIs` | No — registry of API endpoints/integrations. |
| `resources-sources` | `ResourcesTab → Sources` | No — research source catalogue. |
| `resources-tables` | `ResourcesTab → Tables` | No — schema/table registry only. |
| `resources-benchmarks` | `ResourcesTab → Benchmarks` | No — benchmark dataset metadata. |
| `resources-models` | `ResourcesTab → Models` | No — LLM model registry. |

**Finding:** Today the Resources/SoT sidebar group is wiring metadata only —
it does not surface any numeric assumption. The "Source of Truth" for
governed numeric values is actually the **Constants** tab (which lives under
*Defaults* in the current sidebar layout but is conceptually SoT, since it
hosts the `MODEL_CONSTANTS_REGISTRY` with cited authorities and an
admin-overridable canonical layer).

This audit therefore treats the **Constants tab** as the SoT surface and the
other three Defaults tabs as the candidate-for-cleanup surfaces.

---

## 2. Registered Source-of-Truth values

From `shared/model-constants-registry.ts` (`MODEL_CONSTANTS_REGISTRY`):

| Key | Locality | Authority |
|---|---|---|
| `daysPerMonth` | universal | Norfolk AI USALI annualisation convention |
| `depreciationYears` | country | IRS Pub 946 / per-country tax authority |
| `inflationRate` | country | Country central bank / IMF WEO |
| `taxRate` | country + state | Country corporate income tax statute (US: federal + state) |
| `costRateTaxes` | country + state | Local property/real-estate tax authority |
| `countryRiskPremium` | country | Damodaran NYU Stern (Jan 2026) |
| `capitalGainsRate` | country | Country capital-gains tax statute |

---

## 3. Engine wiring reality check

How each registered value reaches the financial engine **today**:

| Key | Engine path | Reads from canonical Model Constants table? |
|---|---|---|
| `daysPerMonth` | `global.daysPerMonth` (overlaid by `applyModelConstantsToGlobals`) | ✅ Yes — overlay covers `locality === "universal"`. |
| `depreciationYears` | `property.depreciationYears ?? global.depreciationYears ?? DEPRECIATION_YEARS` | ✅ Yes (after this audit) — `applyModelConstantsToGlobals` now overlays `global.depreciationYears` from the canonical Model Constants layer (United States baseline) via the `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` set. Per-property overrides still win the cascade. |
| `inflationRate` | `property.inflationRate ?? global.inflationRate` | ⚠️ **Cascade exception — see `.claude/rules/inflation-cascade.md`.** Inflation is not a depreciation-style regulatory constant. The Management Company assumptions row is the engine's source of truth; per-property override wins; Macro & Market is the last-resort fallback. The Constants table may hold inflation rows **only** when written by an AI Intelligence specialist with a monetary-authority citation (US Fed target, IMF WEO, central-bank target). Admin hand-edits without an authority citation are not legitimate Constant rows. Adding `inflationRate` to `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` requires (a) specialist-sourced canonical rows, (b) production-deviation backfill, and (c) the behavior-preservation guard — all three. |
| `costRateTaxes` | `property.costRateTaxes ?? modelDefaults.costRateTaxes` | ❌ No — read via business-model defaults compile-time table. |
| `taxRate` | `property.taxRate ?? DEFAULT_PROPERTY_INCOME_TAX_RATE` | ❌ No. |
| `countryRiskPremium` | per-country compile-time lookup in `engine/helpers/default-resolver.ts` | ❌ No. |
| `capitalGainsRate` | per-country compile-time lookup | ❌ No. |

**Implication:** Only `daysPerMonth` is truly engine-canonical via the
ModelConstants overlay. For all country/country+state keys, the **engine's
canonical source today is the `globalAssumptions` row** (with per-property
override). The Constants-tab country rows are documentary/staging until a
follow-up task plumbs them through the engine cascade.

---

## 4. Duplicate inventory & canonical decisions

### 4.1 `depreciationYears`

| Surface | File | Behavior |
|---|---|---|
| **Defaults · PropertyUnderwritingTab** | `PropertyUnderwritingTab.tsx` | **Read-only** display of the resolved canonical value. Edit affordance removed in this PR. |
| **Constants tab** | `ModelConstantsTab.tsx` (registered key) | Canonical edit surface. Writes to the Model Constants table; engine reads via overlay (see below). |

**Decision:** Canonical home = **Constants tab** (Source of Truth) —
IRS Publication 946 governs the value; it is not a per-tenant business
choice.

**Action taken in this PR:**
- `applyModelConstantsToGlobals` (server/finance) extended with a
  `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` set so that
  `global.depreciationYears` is now overlaid from the canonical Model
  Constants layer using the United States jurisdiction baseline.
  Per-property overrides still win the engine cascade
  (`property.X ?? global.X`). **Behavior-preservation guard:** the
  overlay fires ONLY when an admin has explicitly saved a manual or
  analyst override row in the Constants tab. A seeded canonical row by
  itself is **not** a sufficient signal, because tenants who set a
  non-default `globalAssumptions.depreciationYears` via the old
  editable control would otherwise have their value silently replaced
  by the canonical baseline. Migration to a "canonical-row also wins"
  policy requires a per-tenant deviation backfill and is tracked under
  follow-up #381.
- PropertyUnderwritingTab depreciation editor demoted to a **read-only
  display sourced from the canonical Model Constants endpoint**
  (`GET /api/admin/model-constants?country=United%20States`), not from
  the `globalAssumptions` draft. The display is therefore guaranteed to
  match what the Constants tab shows; it cannot drift.
- A shared denylist (`server/routes/global-assumptions-denylist.ts`)
  is now applied to **both** `PUT /api/global-assumptions` and
  `POST /api/global-assumptions/save-tab`. `depreciationYears` cannot
  be written via either non-canonical path, regardless of role
  (PUT requires admin; save-tab only requires management access — the
  denylist closes the management-user bypass surface).
- Entry removed from `PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS` so the
  analyst soft-gate no longer fires on a tax-code-governed value.

**No engine-behavior change for existing tenants:** the seeded canonical
United States row (39 years) matches the existing
`globalAssumptions.depreciationYears` schema default (39) and the TS
factory `DEPRECIATION_YEARS` (39); and the overlay is off for tenants
without an explicit canonical/override row. Per-property overrides
remain authoritative in the cascade.

### 4.2 `inflationRate`

| Surface | File | Behavior |
|---|---|---|
| **Defaults · MarketMacroTab** | `MarketMacroTab.tsx` | Editable `PctField` → `globalAssumptions.inflationRate` (engine-effective). Canonical Defaults home. |
| **Defaults · PropertyUnderwritingTab** | `PropertyUnderwritingTab.tsx` | **Removed in this PR.** Both editors wrote to the same `draft.inflationRate` key, so removal is behavior-neutral. |
| **Constants tab** | registered country-keyed constant | Documentary today; not yet consumed by engine for country-keyed overlay (see Section 5). |

**Decision:** Canonical home = **MarketMacroTab** (it is the macro
inflation input by name, and the value is country-keyed but globally
applied as a macro escalator). Once the engine gains country-keyed
overlay support for `inflationRate` (see follow-up #381), the canonical
home will move to the Constants tab and MarketMacroTab will mirror the
depreciation-years pattern.

**Action taken in this PR:**
- Duplicate `PctField` for `inflationRate` removed from
  PropertyUnderwritingTab. MarketMacroTab is now the sole Defaults edit
  surface for this value.
- `inflationRate` entry removed from
  `PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS` (MarketMacroTab's analyst
  field-spec already covers it; the duplicate would have caused two
  soft-gates to fire on the same value).

### 4.3 `costRateTaxes`

| Surface | File | Behavior |
|---|---|---|
| **Defaults · PropertyUnderwritingTab** | `PropertyUnderwritingTab.tsx:247` | Editable `PctField` for `defaultCostRateTaxes` (USALI Property Taxes line). |
| **Constants tab** | registered country+state key | Documentary; not consumed by engine for this key. |

**Decision:** Canonical home = **PropertyUnderwritingTab** for now. The
USALI Property Taxes line is a per-property operating expense rate that
varies by jurisdiction and asset profile; it is not a single regulatory
constant. The Constants-tab entry exists for the country/state baseline
and reflects the local tax authority, but the engine reads via
`property.costRateTaxes ?? modelDefaults.costRateTaxes`.

**Action taken in this PR:** None.

**Follow-up (separate task):** Once the engine consults the Constants
canonical layer for country+state keys, demote PropertyUnderwritingTab's
`defaultCostRateTaxes` to "starting point" semantics and clarify the
Constants tab as the jurisdictional baseline.

### 4.4 `daysPerMonth`

| Surface | File | Behavior |
|---|---|---|
| **Constants tab** | registered universal key | Editable; overlay writes to engine global via `applyModelConstantsToGlobals`. |
| (no Defaults-tab editor) | — | Already SoT-only. |

**Decision:** Already canonical at SoT. No action needed.

### 4.5 `taxRate`, `countryRiskPremium`, `capitalGainsRate`

These appear in the Constants tab only (no editable counterpart in the
three Defaults tabs). They reach the engine via per-country compile-time
lookups in `shared/countryDefaults.ts` consumed by
`engine/helpers/default-resolver.ts`. No Defaults-vs-SoT duplicate to
resolve in this audit.

---

## 5. Out-of-scope items noted

- **Sidebar restructuring** — moving the Constants tab out of the
  *Defaults* group into a *Source of Truth* group is tracked under Task
  #331 and is intentionally not done here.
- **Engine canonical-layer consumption for the remaining country and
  country+state keys** (e.g. `costRateTaxes`) — the overlay scaffold
  added here (`COUNTRY_KEYS_OVERLAID_ON_GLOBAL`) is ready; expanding
  the set requires a per-key production-deviation backfill so existing
  tenant overrides are preserved. Tracked under follow-up #381.
  **`inflationRate` is governed by the dedicated cascade rule
  (`.claude/rules/inflation-cascade.md`)** and is not a routine
  candidate for the overlay set: any addition requires
  specialist-sourced canonical rows (an AI Intelligence specialist
  writing the row from a monetary-authority publication), production-
  deviation backfill, and the behavior-preservation guard — all three.
  Admin hand-typed inflation values do not satisfy the writer
  requirement. The `depreciationYears` overlay shipped in this PR
  is the reference implementation.

---

## 6. Summary of changes shipped with this audit

1. `server/finance/apply-model-constants.ts`
   — Added `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` and a canonical-row
   parameter; `global.depreciationYears` is now overlaid from the
   canonical Model Constants layer (United States baseline) before the
   engine reads it, but only when an explicit override / DB canonical
   row exists (not from TS factory). Per-property overrides still win
   the cascade. `withModelConstants` now loads canonical rows via
   `storage.listCanonicals()`.
2. `server/routes/global-assumptions.ts`
   — `PUT /api/global-assumptions` strips `depreciationYears` from the
   inbound body server-side, closing the duplicate persistence path.
3. `client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`
   — `depreciationYears` editor demoted to a read-only display sourced
   from the canonical Model Constants admin endpoint (cannot drift
   from the Constants tab). Duplicate `inflationRate` editor removed
   (canonical Defaults home is MarketMacroTab; both editors wrote the
   same draft key, so the change is behavior-neutral).
4. `client/src/components/admin/model-defaults/analyst-fields.ts`
   — `depreciationYears` and `inflationRate` removed from
   `PROPERTY_UNDERWRITING_TAB_ANALYST_FIELDS`. Regulatory constants are
   not analyst-band candidates; `inflationRate` analyst coverage now
   lives solely with MarketMacroTab.
5. `tests/finance/apply-model-constants.test.ts`
   — Flipped the previous "no country-key overlay" invariant for
   `depreciationYears`; added tests for canonical-row fallback, the
   no-overlay-from-TS-factory behavior-preservation guard, and the
   still-not-overlaid behavior for other country-keyed values
   (e.g. `inflationRate`).
6. `tests/analyst/analyst-fields-parity.test.ts`
   — Sample draft trimmed to drop the now-unmapped keys.
7. This audit doc.

No schema migrations are required: the seeded canonical row for the
United States is 39 years, matching the existing schema default and TS
factory. Existing tenants see no change in resolved
`globalAssumptions.depreciationYears`.
