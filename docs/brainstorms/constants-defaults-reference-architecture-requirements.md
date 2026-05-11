---
date: 2026-05-11
topic: constants-defaults-reference-architecture
---

# Constants, Defaults & Reference-Table Architecture

## Summary

Define the operational architecture for default values, reference tables, and constants in H+ Analytics — a new dedicated agent (sibling to Costantino, Pietro, Vito) with narrow specialists and minions that research and refresh DB-recorded values; a four-level subtle indicator system that surfaces data quality at the field level; a Sources admin section redesign (Tables / APIs / URLs); and an enforcement layer (CI gate + Vito audit) that prevents pseudo-hardcoded fallbacks from recurring in the calc engine.

---

## Problem Frame

Every few tasks an AI agent writes `?? 0.03` against a financial value, wraps it in `const DEFAULT_INFLATION_RATE = 0.03`, or otherwise hardcodes a numeric fallback. The codebase's number-taxonomy doc (`docs/plans/number-taxonomy-and-assumption-lifecycle.md`) is "canonical reference, not to be re-litigated" and CLAUDE.md §1-3 codifies the rule — but the rule is documented, not enforced. The pattern recurs.

Worse, when a research-driven value DOES exist in the database (admin_resources, market_rates, or specialist-written tables), calc code paths still fall back to the pseudo-default because the read path doesn't distinguish "no DB row" from "DB row exists, you forgot to wire it up." The numbers on a financial statement export to a client today may silently combine real research values with pseudo-defaults, and the user has no way to tell at the field level which is which.

Separately, the admin Sources surface has grown organically — APIs, URLs, source health, and reference tables sit in inconsistent layouts; some surface to non-admin users in the form of confusing banners; admin can't refresh a single reference table on-demand from a clean UI; and there is no single owner agent for "go fetch fresh research values and write them to DB" — Costantino audits row health, Pietro handles source connectivity, but neither owns research-driven content refresh.

---

## Actors

- A1. **Admin user** — views the Sources admin section, sets per-table refresh intervals, clicks Analyst buttons to force immediate refresh, tests APIs and URLs.
- A2. **End user** — sees subtle per-field quality indicators next to assumption inputs and consumed numeric values across the app; reads the user manual, infotips ("i" icons), and Tour to interpret indicators.
- A3. **New dedicated agent** (name TBD per CLAUDE.md §10) — owns research-driven refresh of DB-recorded defaults, reference tables, and currency-sensitive value pairs. Sibling to Costantino/Pietro/Vito.
- A4. **Specialists** under A3 — narrow domain ownership, one specialist per coherent data category. At least four; may grow to 5-7.
- A5. **Minions** under each specialist — deterministic helpers (parsers, validators, deduplicators) and per-source integrations (FRED minion, web-search minion, etc.).
- A6. **Vito** (existing compliance agent) — gains a new periodic audit mode that scans the tree for legacy `?? <numeric-literal>` violations and writes findings to its existing surface.
- A7. **Costantino** (existing Data Custodian) — sibling agent, unchanged scope (row-level health audit of admin_resources).
- A8. **Pietro** (existing data-infrastructure agent) — sibling agent, unchanged scope (source connectivity and minion-driven source ingestion).
- A9. **Calc engine** — reads values via the new read-path hierarchy (exact → research → parent jurisdiction → not found) and emits quality grades alongside computed outputs.
- A10. **Developer** — adds new admin write features under the CI gate that fails the build on disallowed `?? <numeric-literal>` patterns.

---

## Key Flows

- F1. **Periodic refresh cycle**
  - **Trigger:** A Sources table's admin-editable refresh interval elapses since last refresh
  - **Actors:** A3 (new agent) → A4 (specialist for that table category) → A5 (minions)
  - **Steps:** Agent's scheduler ticks; identifies the table(s) with elapsed intervals; dispatches the owning specialist; specialist orchestrates minions (research via LLM, API, scraper as appropriate); minion results are validated and written to the relevant DB rows; refresh timestamp updated; quality grade per row recomputed
  - **Outcome:** DB rows for that table are fresh; grade indicators displayed in the UI flip from sky (stale) to emerald (fresh exact)
  - **Covered by:** R1, R3, R6, R7, R11

- F2. **Admin manual refresh**
  - **Trigger:** Admin clicks the Analyst button on a specific Sources table tab
  - **Actors:** A1 (admin) → A3 → A4 → A5
  - **Steps:** Admin clicks Analyst; UI shows blocking progress state; agent dispatches that table's specialist immediately; specialist + minions run live research; results written to DB; grade indicators update
  - **Outcome:** Same as F1 but synchronous and user-triggered
  - **Covered by:** R1, R8

- F3. **Calc-time read (the load-bearing flow)**
  - **Trigger:** Calc engine needs a (key, jurisdiction) value to compute a financial output
  - **Actors:** A9 (calc engine) → A3 (only if research path triggered)
  - **Steps:** Engine asks for `(exitCapRate, Cartagena, Colombia)`; storage reads exact (key, jurisdiction) — if hit and within refresh interval, return value with 🟢 emerald grade; if hit but stale, return value with 🔵 sky grade; if miss, the new agent attempts live research (LLM/Perplexity/scraper) and writes result + returns with 🟢 emerald; if research fails, fall back to nearest parent jurisdiction (Colombia for Cartagena, "global" for unsupported countries) and return with 🟡 amber grade; if even parent is missing, return a sentinel "not found" with 🔴 red grade so the calc surfaces it to UI as missing
  - **Outcome:** Calc proceeds with a graded value or a structured missing-value signal; the field's indicator reflects exactly where the value came from
  - **Covered by:** R10, R11, R12

- F4. **CI gate trips on new violation**
  - **Trigger:** Developer opens a PR adding `?? <numeric-literal>` against a DB-bound key, or `const DEFAULT_<X> = <number>` outside allowed constants files
  - **Actors:** A10 (developer)
  - **Steps:** PR opens → CI runs the extended `check-magic-numbers.ts` ratchet → ratchet identifies the violation and reports file/line + rule → CI fails → developer rewrites read path to use DB-backed lookup
  - **Outcome:** Violation cannot land; codebase trends toward zero pseudo-hardcoded fallbacks
  - **Covered by:** R26, R27

- F5. **Vito audit sweep**
  - **Trigger:** Vito's periodic schedule fires, or admin invokes Vito's audit on-demand
  - **Actors:** A6 (Vito) → A1 (admin triages)
  - **Steps:** Vito scans calc + read paths for residual `?? <numeric-literal>` patterns and other taxonomy violations; writes findings into existing Vito surface; admin reviews findings; engineering migrates findings one at a time
  - **Outcome:** Legacy violations not caught by the CI gate (i.e., pre-existing tree state) become visible and triageable
  - **Covered by:** R28

---

## Requirements

**The Agent**

- R1. A new dedicated agent (named per CLAUDE.md §10 at planning time) owns research-driven refresh of all DB-recorded defaults, reference tables, and constants in scope of this work.
- R2. The new agent is a sibling to Costantino, Pietro, and Vito — non-overlapping scope. Costantino does row-level health audit; Pietro handles source connectivity; Vito audits compliance; the new agent owns content refresh via research.
- R3. The new agent operates through specialists and minions per CLAUDE.md §10 — precision via narrow ownership; no god-object orchestrator.

**The Specialists**

- R4. At least four specialists exist, each with a single narrow domain:
  - **Business Defaults Specialist** — guesstimated default values for hypothetical future management companies and properties (employee counts, room counts, ADR, occupancy, fee rates, comp ratios, etc.)
  - **Country Reference Specialist** — country-level macro reference data (inflation rate, country risk premium, GDP-related rates), including the (display local-currency, calc USD) pair pattern per currency-sensitive field
  - **State/Province Reference Specialist** — sub-national regional data (tax rates, beta, labor cost indexes)
  - **Financial Constants Specialist** — slow-changing authoritative values (depreciation years per jurisdiction, GAAP-equivalent rules, capitalization thresholds)
- R5. Specialist count may grow (typical 5-7) as research surfaces sub-categories. The architecture accommodates added specialists without breaking existing UI mapping.
- R6. Each specialist owns its own minions — deterministic helpers (parsing, validation, deduplication) and per-source integrations (FRED minion, OECD minion, web-search minion, Perplexity minion, etc.).

**Cadence and Triggers**

- R7. Each Sources table has an admin-editable refresh interval (e.g., country inflation every 90 days; GAAP constants every 365 days; business defaults every 180 days). When the interval since last refresh elapses, the agent auto-fires the owning specialist for that table.
- R8. Each Sources table tab displays an Analyst button. Admin click triggers immediate (blocking) refresh of that specific table — the live path that bypasses the interval.
- R9. Calc-time reads are never blocking on live research. If a value needs to be fetched live, it happens on the Analyst-button path or the periodic path — not during a calc that's powering a user-facing render or export.

**Read Path and Quality Grading**

- R10. When the calc engine reads a (key, jurisdiction), the fallback hierarchy is:
  1. Exact (key, jurisdiction) DB row within refresh interval → 🟢 emerald
  2. Exact (key, jurisdiction) DB row past refresh interval (stale) → 🔵 sky
  3. Live research attempt by the agent; success → write + 🟢 emerald; failure → continue
  4. Nearest parent jurisdiction (e.g., Colombia for Cartagena; "global" or USD-baseline for unsupported countries) → 🟡 amber
  5. Nothing available anywhere → 🔴 red (structured "missing-value" signal surfaced to UI)
- R11. Every numeric value consumed by user-facing renders (assumptions, financial statements, projections, slide-deck fields) carries a quality grade rendered as a subtle visual indicator next to the field, using the existing CLAUDE.md severity color scale: 🟢 emerald / 🔵 sky / 🟡 amber / 🔴 red.
- R12. Indicators are subtle — small icons or color dots adjacent to fields. NO banners, NO toasts, NO modals for quality-grade communication.
- R13. The four grade levels are documented in: the user manual, per-field infotips ("i" icons), in-product helpers, and the Tour. Users learn what each color means once and apply that knowledge across the app.

**Currency Convention**

- R14. The app's operating currency is USD for now. The calc engine ALWAYS uses USD-denominated values for monetary inputs regardless of property location. This formalizes and extends the existing CLAUDE.md Inflation Policy (which already mandates US inflation rate for all properties).
- R15. Currency-sensitive reference fields maintain a **(display-only local-currency, calc-used USD)** value pair per country. At minimum: inflation rate, cost of capital, risk-free rate, debt cost. The Country Reference Specialist researches and maintains both sides of every pair.
- R16. Each side of a currency pair has its own quality grade and refresh cycle. A property in Colombia may show "Colombia inflation rate (local currency): 8.5% 🟢" alongside "US inflation rate (calc-used): 3.2% 🟢" — both visible, only the USD value is consumed by calc.
- R17. Calc-time reads on currency-sensitive fields always pull the USD side. Local-currency sides are display-only.

**Sources Admin UI**

- R18. The Sources admin section is organized into three sub-sections: **Tables**, **APIs**, **URLs**.
- R19. **Tables sub-section** — one table per tab. Each tab shows the table as a full column/row layout occupying the frame's main column. Each tab has: (a) the Analyst button to force immediate refresh, (b) the admin-editable refresh interval, (c) the last-refresh timestamp, (d) per-row quality grade indicator.
- R20. **APIs sub-section** — one accordion (chevron) line per API. Line shows: API name, status icon (color-coded per quality grade), last-tested timestamp. Expanded line reveals: additional API metadata, admin-only Test button. Admin cannot edit API row content directly.
- R21. **URLs sub-section** — same accordion UI as APIs. URL name, status icon, last-tested timestamp; expanded reveals metadata and Test button. Admin cannot edit URL row content directly.
- R22. API and URL row content is populated and modified only by the agent / specialist / minion paths or directly by a developer (code path or migration). Admin reads + tests only.

**Front-of-App Cleanup**

- R23. Sources data (admin_resources, API status, URL status, source health) is never rendered to non-admin user paths. Visibility is admin-only.
- R24. Existing diagnosing banners, toasts, and inline alert boxes derived from data-quality concerns are removed across the app.
- R25. Information previously surfaced via banners (e.g., "Some data sources may be stale," "Inflation rate fallback in use") becomes subtle per-field quality indicators per R11.

**Enforcement**

- R26. A CI gate (extending the existing `scripts/src/check-magic-numbers.ts` ratchet) fails the build on PR-time addition of:
  - `?? <numeric-literal>` against fields/keys that should come from DB
  - `const DEFAULT_<X> = <number>` outside `lib/shared/src/constants*.ts` and `lib/db/src/constants.ts`
  - Other patterns surfaced during planning as taxonomy violations
- R27. The CI gate whitelist preserves: TRUE CONSTANTS per number-taxonomy doc (math/physics absolutes like `DAYS_PER_MONTH = 30.5`); structural indices (0, 1, -1); computer-science/programming-layer values (slide dimensions, retry counts, screen breakpoints) which live in dedicated code locations and are not displayed to users.
- R28. Vito (existing compliance agent) gains a periodic audit mode that scans the tree for legacy `?? <numeric-literal>` patterns and other taxonomy violations and writes findings into Vito's existing compliance surface. Vito is the secondary defense for legacy code; CI is the load-bearing prevention layer for new code.

---

## Acceptance Examples

- AE1. **Covers R7, R8.** Given the Country Inflation Rates table has an admin-set 90-day refresh interval and its last refresh was 91 days ago, when the agent's next periodic check ticks, the agent auto-fires the Country Reference Specialist for that table; refresh runs in the background; users browsing the app at that moment see the indicators on inflation-rate-derived fields transition from 🔵 sky to 🟢 emerald when the refresh completes. Separately, when admin clicks the Analyst button on the Country Inflation Rates tab, the refresh runs immediately and the tab UI shows a blocking progress state until the refresh completes.

- AE2. **Covers R10, R11, R12.** Given calc engine requests cost of capital for Cartagena, Colombia and no exact (Cartagena, Colombia) row exists in DB, when the calc fires, the agent attempts live research (LLM + Perplexity + scraper as configured); if research fails, the calc receives Colombia's USD cost of capital with a 🟡 amber grade; the user's screen shows the cost-of-capital field with a small amber dot adjacent to it; no banner, toast, or modal appears.

- AE3. **Covers R14, R15, R16, R17.** Given a property in Colombia is being valued, when the calc engine computes its NPV/IRR projection, the inflation rate used is the US inflation rate (e.g., 3.2%), not Colombia's local-currency inflation rate (e.g., 8.5%); the cost-of-capital used is Colombia's USD-denominated rate (e.g., 12%), not Colombia's local-currency rate (e.g., 20%); the Sources admin Country tab for Colombia displays both the local-currency inflation rate (8.5% 🟢) and the calc-used US inflation rate (3.2% 🟢), plus both the local-currency cost of capital (20% 🟢) and the calc-used USD cost of capital (12% 🟢).

- AE4. **Covers R26, R27.** Given a developer opens a PR adding `const fallback = current.inflationRate ?? 0.03;` to `lib/engine/src/projection-engine.ts`, when CI runs, the extended `check-magic-numbers.ts` ratchet fails the build, reporting the file, line, and rule; the developer cannot merge until they (a) move the inflation rate read to a DB-backed lookup AND (b) ensure no `?? <numeric-literal>` remains against this field. Conversely, when a developer adds `const SLIDE_LANDSCAPE_WIDTH_PX = 1920;` to `lib/shared/src/constants-slides.ts`, CI passes because computer-science/screen-dimension values are whitelisted per R27.

- AE5. **Covers R23, R24, R25.** Given a non-admin user navigates the front-of-app and reaches a property page or assumption-editor that previously displayed "API status: degraded" or "Inflation rate fallback in use" banners, when they view the page, no such banner appears; data-quality concerns surface only as the subtle per-field quality indicators on the assumption inputs (R11); the admin user reaching the same property page also sees no banners, but can navigate to the Sources admin section to inspect API and table status directly.

- AE6. **Covers R20, R21, R22.** Given an admin user opens the Sources admin section and navigates to the APIs sub-section, when they look at the list, each API row appears as an accordion line with a chevron, the API name, a color-coded status icon, and a last-tested timestamp; when they click the chevron on a specific API, the line expands revealing additional API metadata (endpoint URL, response shape sample, last error if any) and a "Test" button; when they click "Test," the API is probed live and the status icon updates; there is no field in the expanded line that allows the admin to edit the API's URL, key, or other configuration — all such content is read-only.

---

## Success Criteria

- Every calc-time numeric input consumed by a financial statement, projection, slide field, or assumption display traces to one of: (a) a DB row with a visible indicator grade, (b) a whitelisted math/physics/CS constant in an approved code location, or (c) the agent's research-fallback path that ends in an indicator-graded value.
- Zero `?? <numeric-literal>` patterns against DB-bound keys remain in the production tree after Vito's first full sweep, and the CI gate prevents new ones from being introduced.
- Admin can refresh any Sources table on-demand via the Analyst button on that table's tab. Admin can edit each table's refresh interval. The current interval and last-refresh timestamp are visible.
- End users see the subtle four-level indicator next to every assumption field and consumed numeric value, and can learn what each color means via the manual / infotips / Tour.
- No banners or toasts diagnosing data quality remain anywhere in the app. Data-quality information surfaces only as per-field indicators.
- Currency convention is enforced: the calc engine uses USD-denominated values for currency-sensitive fields regardless of property location; local-currency counterparts remain visible in admin views but are never consumed by calculations.
- When the user delivers a slide deck or financial statement to a client, every number on every page is traceable (via indicator + admin Sources view) to a real data source — research, DB, or an explicitly-marked fallback.

---

## Scope Boundaries

- **Slide factory production / PDF rendering** — separate plan (`docs/plans/archive/2026-05-08-001-feat-slide-factory-deck-render-and-r2-upload-plan.md` and successors). This work produces the trustworthy data; slide rendering consumes it.
- **Login stability** — separate concern; not addressed in this work even though it gates client delivery.
- **Financial-engine correctness audit** (IRR vector construction, statement identities, portfolio rollup, DSCR/loan sizing) — separate active plan at `docs/plans/2026-05-10-003-refactor-financial-engine-server-side-and-correctness-plan.md`.
- **Range / band recommendation UX** — the infrastructure here supports it; a separate brainstorm covers the user-facing recommendation surface.
- **Specific research tool choice per specialist** (Perplexity vs Tavily vs raw LLM vs custom scraper) — deferred to planning.
- **Renaming or restructuring existing Costantino, Pietro, or Vito agents** — out of scope. The new agent slots in as sibling. Vito gains an audit mode but its existing surfaces are unchanged.
- **Switching the app's operating currency away from USD** — the architecture supports a one-line config change when this happens, but designing or building the switch itself is not in scope now.
- **Specific agent and specialist names** — picked at planning time per CLAUDE.md §10 (Italian/Brazilian first names; reserved names per the catalog).
- **Future-property default research as a user-visible recommendation surface** — this work builds the infrastructure (Business Defaults Specialist + DB rows); the UX for surfacing defaults to users creating new properties is a later brainstorm.

---

## Key Decisions

- **New dedicated agent vs. extending Costantino or Pietro.** Rationale: Costantino's health-audit and the new agent's research-refresh are conceptually distinct responsibilities. Extending either risks god-object architecture; sibling agents preserve narrow ownership. Decision matches CLAUDE.md §10 agent-taxonomy principles.
- **4+ specialists by table category vs. 2 by methodology vs. 1 god-specialist.** Rationale: precision through narrow ownership; matches Sources UI tabs 1:1; allows specialists to evolve research methodology independently. User explicitly requested "as many specialists as needed" with "well defined and narrower capabilities."
- **Hybrid cadence: per-table interval + Analyst button.** Rationale: admin retains control for high-value moments (pre-client-delivery refresh); periodic interval guarantees baseline freshness; matches existing Analyst-table pattern from analyst-refresh-guards work.
- **4-level grading reusing existing severity colors (emerald/sky/amber/red).** Rationale: keep visual vocabulary consistent with the rest of the app; no new color system for users to learn.
- **Subtle per-field indicators, NOT banners.** Rationale: user has explicitly stated banners across the app are noisy and unwanted; per-field indicators meet the same information need with less interruption.
- **CI gate + Vito audit as two-layer enforcement.** Rationale: CI gate is load-bearing prevention (cannot be ignored); Vito catches existing tree state (the legacy violations) without blocking. Addresses user's "again and again" recurrence concern at both temporal axes (new and old).
- **Currency-sensitive field-pair pattern (display local-currency, calc USD).** Rationale: app operates in USD; local-currency values have informational value for users (and for admins maintaining the tables) but must not contaminate calc results; field-pair pattern is explicit and surveyable, with each side independently graded.
- **Sources admin UI redesign (3 sub-sections, accordion lines for APIs/URLs, one-table-per-tab for Tables).** Rationale: each sub-section has a distinct interaction model (tables are dense rows; APIs/URLs are sparse with detail-on-demand). Mixing them in one layout was the prior failure mode.

---

## Dependencies / Assumptions

- `docs/plans/number-taxonomy-and-assumption-lifecycle.md` is canonical reference for the number taxonomy. This work formalizes its enforcement; does not relitigate the taxonomy.
- CLAUDE.md §1-3 (number taxonomy), §8 (market rates regenerate-only pattern), §10 (agent naming), §"Inflation policy", §"Intelligence Display" remain authoritative.
- Costantino + Pietro continue running with current scope. No changes to those agents in this work.
- Vito (existing compliance agent) is extended with a new audit mode. Existing Vito surfaces unchanged.
- `scripts/src/check-magic-numbers.ts` ratchet is the existing enforcement primitive; this work extends it (does not rewrite).
- The `admin_resources` (or successor) table schema may need additions for grade tracking, refresh interval per table, and field-pair (currency) — schema migration is a planning concern.
- Existing severity color scale (emerald/sky/amber/red) is the reused visual vocabulary; no new design tokens introduced.

---

## Outstanding Questions

### Deferred to Planning

- [Affects R1, R4] [User decision] Specific agent + specialist names per CLAUDE.md §10. Picked at planning time using Italian/Brazilian first names from the unused list.
- [Affects R6] [Technical] Minion design per specialist — per-source minions (FRED minion, OECD minion) vs per-methodology minions (web-search minion, LLM-summarize minion). May be a mix.
- [Affects R10] [Needs research] Live research tool choice per specialist — LLM-only, LLM + Perplexity, custom scraper for specific authority sites. Decision per specialist, not global.
- [Affects R11] [Design] Exact icon shape, size, and accessibility treatment (color-blind, screen-reader) for the four-level indicator. Reuses existing severity color, but the indicator shape (dot, icon, halo) needs design pass.
- [Affects R15] [Needs research] Full list of currency-sensitive reference fields beyond inflation rate and cost of capital — likely includes risk-free rate, debt cost, weighted-average cost of capital, market risk premium. Inventory done at planning time.
- [Affects R20, R21] [Design] Exact accordion-line content for API and URL rows (which metadata fields shown collapsed vs expanded).
- [Affects R23] [Technical audit] Full inventory of every front-of-app surface that currently displays Sources data or banners. Audit pass at planning time produces the remove-list.
- [Affects R26] [Technical] Detailed CI gate rule patterns (regex vs AST) for detecting `?? <numeric-literal>` against DB-bound keys vs allowed constants — false-positive prevention needs care.
- [Affects R28] [Technical] Vito audit output schema (existing surface format) and how Vito findings get triaged into engineering work — issue creation? Linear? In-app review?
