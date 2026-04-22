# Inflation Rate Cascade Rule

> Inflation rate is a **market-driven, time-varying value with optional authority backing**. It is not a regulatory constant like depreciation life. The cascade, the writer, and the citation requirement are all different from depreciation.

## TL;DR

- **Engine cascade (unchanged):** `property.inflationRate ?? mcAssumptions.inflationRate ?? macroMarketFallback`. The Management Company assumptions row is the source of truth; per-property override wins; Macro & Market is the last-resort fallback.
- **Defaults Admin** holds inflation as a **seed value only** — initial value loaded into a fresh tenant's MC assumptions row. The instant a user clicks Save on Company Assumptions, the inflation field becomes an assumption (working variable), not a default.
- **Constants table MAY hold inflation rate**, but **only** when the row carries a citable monetary authority (US Federal Reserve long-run inflation target, IMF World Economic Outlook, ECB target, BoE target, Banco Central do Brasil, etc.) **AND** the row was written by a specialist defined in the AI Intelligence section. Admin hand-edits to inflation in the Constants tab without an authority citation are not legitimate Constant rows.
- **AI Intelligence specialists are the writer.** Specialists revise/suggest inflation values and ranges; humans (admins, founders, users) are passive consumers of those suggestions in the inflation cascade. Specialists are defined in the `AI Intelligence` realm of the app, not in Admin.
- **Hard-coded TS literal for inflation = forbidden.** Inflation must always come through the cascade or a specialist-sourced Constant row. A `const INFLATION_RATE = 0.03` anywhere outside a documented seed table is a defect.

## Why this is different from depreciation

| Property | `depreciationYears` | `inflationRate` |
|---|---|---|
| Source | IRS Pub 946 (statute) | Central bank target / IMF outlook (forecast) |
| Changes when | IRS amends the publication | Central bank revises its target; macro outlook shifts |
| Cadence | Years (or never) | Quarterly to annually |
| Per-property override appropriate? | Rarely (asset-class only) | **Yes** — different markets / submarkets / unit-economics inflate differently |
| Per-MC override appropriate? | No | **Yes** — different operating geographies face different inflation |
| Constant row writer | Admin (when IRS publishes a change) | Specialist (when central bank publishes a target) |
| Can be a hard-coded TS literal? | Last-resort floor only, with DB row superseding | **Never** — must flow through cascade or specialist-sourced row |

Depreciation is a regulatory authority constant: one number per jurisdiction, rarely changes, admin updates it when the regulator does. Inflation is a market estimate with authority anchoring: every property may have its own number, central banks publish targets that shift over time, specialists keep the row fresh, humans rarely hand-edit it.

## Where inflation lives (the four surfaces)

### 1. Management Company assumptions (SOURCE OF TRUTH for engine)
- Page: Company Assumptions (user-facing, ManagementRoute).
- Field: `companyAssumptions.inflationRate`.
- Writer: the user (working variable / assumption — the moment they click Save, this is the truth).
- Read by: every property in the portfolio that does not have its own override.

### 2. Property assumptions (override)
- Page: Property Edit → Other Assumptions.
- Field: `property.inflationRate` (nullable).
- Writer: the user.
- Wins the engine cascade when set.

### 3. Defaults Admin → Market & Macro tab (FALLBACK / SEED)
- Page: Admin → Defaults → Market & Macro.
- Field: `defaults.inflationRate`.
- Writer: admin (or specialist suggesting via "Ask The Analyst").
- Role: (a) seed value loaded into a fresh tenant's MC assumptions row, and (b) last-resort fallback when neither MC nor property has a value. Resist accreting fields here that belong elsewhere.

### 4. Constants table (OPTIONAL, AUTHORITY-SOURCED)
- Storage: `model_canonicals` / `model_constant_overrides` keyed by `(constantKey="inflationRate", country, [countrySubdivision])`.
- Writer: **specialist** in the AI Intelligence realm (e.g. a Macro Research specialist that fetches central-bank publications). Admin may approve a specialist's recommendation; admin should not type a number freehand.
- Required provenance: `authoritySource` (e.g. "US Federal Reserve long-run inflation target"), `authorityRef` (URL or doc id), `asOfDate`, `effectiveFrom`, conviction + range from the originating specialist verdict.
- Engine consumption: a Constant row may flow into the Defaults seed and from there into MC assumptions on tenant initialization. It does **not** silently overwrite a tenant's saved MC inflationRate at runtime. Overlay onto `globalAssumptions.inflationRate` is allowed only behind an explicit admin opt-in (see "Overlay extension policy" below).

## Overlay extension policy (Task #381 territory)

`server/finance/apply-model-constants.ts` exposes a `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` set that lets a canonical Constants row drive the engine's `globalAssumptions.<key>`. Today the set contains only `depreciationYears`. To add `inflationRate`:

1. The canonical row(s) for `inflationRate` must be **specialist-sourced** (the row's source field references an AI Intelligence specialist verdict, not an unattributed manual admin entry).
2. A production-deviation backfill must be run: every existing tenant whose `companyAssumptions.inflationRate` differs from the seeded canonical must either (a) be migrated to an explicit override row preserving their value, or (b) be flagged for admin review before the overlay activates.
3. The behavior-preservation guard already in `applyModelConstantsToGlobals` (overlay only when an explicit admin override row exists) must remain — even after the key is added to the set, seeded canonical rows alone do not silently overwrite a tenant's assumption.
4. The Macro & Market fallback role does not change. Defaults Admin remains a seed surface.

If those conditions are not met, **do not add `inflationRate` to the overlay set**. Doing so silently overrides every tenant's market-judged inflation assumption with whatever a single canonical row says — that violates the cascade and surprises users.

## Forbidden patterns

- ❌ `const INFLATION_RATE = 0.03;` anywhere in `calc/`, `engine/`, `server/`, `client/`, or route handlers.
- ❌ Fallback chains in business logic that resolve to a TS literal for inflation (e.g. `property.inflationRate ?? global.inflationRate ?? 0.03`). The chain must terminate in a documented seed table or specialist-sourced row, not a literal.
- ❌ Adding `inflationRate` to `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` without (a) specialist-sourced canonical rows, (b) production-deviation backfill, and (c) the behavior-preservation guard intact.
- ❌ Treating Constants Admin as the place users go to set "their" inflation. Users set inflation on Company Assumptions; Constants is for authority-published reference values written by specialists.
- ❌ Surfacing inflation as a read-only "computed from Constants" field on Company Assumptions. Inflation on the user-facing page is always editable; specialist suggestions appear via the Analyst banner, not by locking the field.
- ❌ Removing the Macro & Market inflation fallback because "the Constants tab now has it." The fallback chain is independent of the canonical surface.

## Allowed patterns

- ✅ A Macro Research specialist (in AI Intelligence) fetches the US Fed long-run inflation target, writes a `model_canonical` row keyed `(inflationRate, "United States")` with full provenance, and surfaces an "Apply" recommendation in Defaults Admin.
- ✅ Admin reviews the recommendation and clicks Apply, which updates `defaults.inflationRate` for new-tenant seeding (existing tenants are unaffected at runtime).
- ✅ A user on Company Assumptions sees the seeded inflation value, optionally edits it, clicks Save — that value is now the assumption and wins the engine cascade for their MC.
- ✅ A user on Property Edit sets a per-property inflation override for a specific market — that wins for that property only.
- ✅ A future Task #381 follow-up adds `inflationRate` to the overlay set after the conditions in "Overlay extension policy" are all met and tested.

## Self-check

Before merging any change that touches inflation rate, ask:

1. Did I add a hard-coded inflation literal anywhere outside a documented seed/factory? → Remove it.
2. Did I add `inflationRate` to `COUNTRY_KEYS_OVERLAID_ON_GLOBAL`? → Verify the overlay-extension policy conditions are all met and add a test exercising the behavior-preservation guard for inflation specifically.
3. Did I write a Constants Admin row for inflation by hand without specialist provenance? → Route it through a specialist verdict instead.
4. Did I make the inflation field on Company Assumptions read-only or "computed"? → Revert; the user's working variable must remain editable.
5. Did I remove the Macro & Market fallback? → Restore it.

## Cross-references

- `.agents/skills/constants-vs-defaults/SKILL.md` — general Constants vs Defaults discipline. Inflation is the worked example where the line is most subtle.
- `replit.md` Business Model section — Constants vs Defaults vs Assumptions three-tier rule.
- `docs/audits/task-379-defaults-vs-source-of-truth.md` — depreciation overlay precedent and the inflation row that explicitly defers to this rule.
- `server/finance/apply-model-constants.ts` — `COUNTRY_KEYS_OVERLAID_ON_GLOBAL` (the gate).
- `tests/finance/apply-model-constants.test.ts` — invariant tests for what is and is not overlaid today.

## One-line summary

Inflation flows MC → property → Macro fallback at runtime; it lives in the Constants table only when a specialist sources it from a monetary authority; it is never a TS literal.
