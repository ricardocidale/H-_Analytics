# Constants ↔ AI Intelligence Specialists — Ownership Gap Analysis

**Date:** 2026-04-22
**Branch:** `adr-005/phase-1-workspace-bootstrap`
**Principle (locked by user):** Constants are authority-sourced (US Fed, IRS, IMF, central banks, statutes, GAAP/USALI). They are **written exclusively by AI Intelligence specialists**. Admin and users **cannot edit Constants** — the Constants tab exposes each row read-only with a per-row **"Refresh research"** button that triggers the relevant specialist to re-fetch the authority publication and update the row.

This audit answers the question: *are the AI Intelligence specialists actually doing their job creating and maintaining Constants today?* Short answer: **partially — the infrastructure is mostly built, but the specialists themselves don't exist as registered identities, the writer path leaves provenance incomplete, and the deprecated manual-edit path is still wide open.**

---

## 1. Current state — what already exists

### 1.1 Contract layer (✅ in place)
- `engine/analyst/contracts/verdict.ts` — frozen `AnalystVerdict` Zod contract: `specialistId`, `overallSeverity`, `overallQualityScore`, `dimensions[]` (with `field`, `severity`, `range{low,mid,high,unit}`, `evidence[]`, `qualityScore`/conviction, `actions[]`), `voice`, `meta{cognitiveRunId,…}`.
- Conviction floor: dimensions with non-`ok` numeric ranges must score ≥ 70.
- Evidence shape: `{ source, tier, asOf, url, personaFit }`.

### 1.2 Specialist registry (⚠️ exists but missing Constants specialists)
- `engine/analyst/registry/specialist-catalog.ts` declares the catalog.
- Today's catalog has **7 specialists**, all subject-bound to `mgmt-co`, `property`, `photos`, or `portfolio-ops`:

  | ID | Subject | Domain |
  | :-- | :-- | :-- |
  | `mgmt-co.funding` | mgmt-co | Capital stack, runway, refi |
  | `mgmt-co.revenue` | mgmt-co | Fees, recurring contracts, growth |
  | `mgmt-co.icp-intelligence` | mgmt-co | ICP sharpening |
  | `property.risk-intelligence` | property | Flood, brand, regulatory, market |
  | `property.executive-summary` | property | Underwriting narrative |
  | `photos.photo-enhancer` | photos | Photo standardization |
  | `portfolio-ops.watchdog` | portfolio-ops | Occupancy, ADR, DSCR, covenants |

- **No `constants.*` subject exists.** **No Tax Research, Macro Research, Depreciation Research, or Reporting Research specialist is registered.**
- The "Regenerate via Analyst" path on the Constants tab does grounded research but is not bound to any registered specialist identity in the catalog.

### 1.3 Constants storage (✅ in place)
- `model_constants` table — factory baseline rows. Written only by `script/seed-model-constants.ts` (manual `tsx` invocation). Holds `value`, `unit`, `authoritySource`, `notes`.
- `model_constant_overrides` table — departures from factory. Two writers:

  | Writer | Source value | What's captured | What's missing |
  | :-- | :-- | :-- | :-- |
  | `PUT /api/admin/model-constants/:key` (Override Dialog) | `"manual"` | `value`, `overrideNote`, `createdBy` | `authority`, `referenceUrl`, `researchRunId` all `null` |
  | `POST /api/admin/model-constants/:key/apply-research` (Apply Research Dialog) | `"analyst"` | `value`, `authority`, `referenceUrl`, `overrideNote` (analyst reasoning), `createdBy` | **`researchRunId: null`** — no link to specialist verdict |

### 1.4 Research pipeline (✅ in place)
- `server/ai/regenerate-constants.ts::proposeConstantRegeneration` calls `GroundedResearchService` (Perplexity / Tavily live web search) → Claude 4.5 Sonnet extraction → returns `{ value, authority, referenceUrl, reasoning }`.
- Per-key prompt templates exist for the registered keys: `depreciationYears`, `taxRate`, `inflationRate`, `capitalGainsRate`, `countryRiskPremium`, `costRateTaxes`, `daysPerMonth`.

### 1.5 Refresh trigger (⚠️ admin-button only, no schedule)
- `POST /api/admin/model-constants/:key/regenerate` — admin clicks "Regenerate via Analyst" → returns proposal → admin reviews → admin clicks "Apply" → row written with `source = "analyst"`.
- **No periodic auto-refresh.** Constants rows go stale silently between admin clicks.

### 1.6 Overlay → engine (✅ for one key, gated for others)
- `server/finance/apply-model-constants.ts::COUNTRY_KEYS_OVERLAID_ON_GLOBAL` set: today only `depreciationYears` (per Task #379). Behavior-preservation guard is intact — overlay only fires for explicit overrides, not seeded factory rows alone.

### 1.7 Admin UI (❌ contradicts the principle)
- `ModelConstantsTab.tsx` exposes:
  1. Country selector dropdown.
  2. **"Override..." button** → `OverrideDialog` with hand-typed numeric/JSON value + mandatory note → writes `source = "manual"`. **Per the new principle this UI must be removed for authority-derived keys.**
  3. **"Regenerate via Analyst" button** → `RegenerateDialog` with diff (current vs proposed) + Authority + Reasoning → admin clicks "Apply" → writes `source = "analyst"`. **This is the closest to what the principle requires, but it requires admin to compare and approve a value rather than just trigger a refresh.**
  4. **"Reset to factory" button** — removes the override row.

### 1.8 Scheduler infrastructure (✅ in place, no Constants job hooked in)
- `server/ai/ambient/scheduler.ts` — boots after 10s, ticks every 6h, runs `fetchAllBenchmarks`, `checkAllSources`, `refreshLlmRegistry`, watchdog, cleanups.
- `server/ai/ambient/research-scheduler.ts` — boots after 30s, ticks every 15min, executes user-defined `Scheduled Research Workflows` from DB (uses Anthropic Message Batches at 50% cost when possible).
- **No Constants-refresh job exists in either scheduler.**

---

## 2. The gap — where the principle is not honored today

| # | Gap | Severity | Where |
| :-- | :-- | :-- | :-- |
| **G1** | No Constants-domain specialists registered in the catalog. The 7 existing specialists do not own any Constants key. | **High** | `engine/analyst/registry/specialist-catalog.ts` |
| **G2** | The "Apply Research" writer leaves `researchRunId: null` — analyst-attributed rows have no verdict id linkage, so provenance is incomplete and not auditable per the AnalystVerdict contract. | **High** | `server/routes/admin/model-constants.ts:343` |
| **G3** | The "Override" path (`source = "manual"` with hand-typed value) is wide open for every key, including authority-derived ones. The new principle deprecates this entirely for authority-derived Constants. | **High** | `PUT /api/admin/model-constants/:key`, `OverrideDialog` |
| **G4** | Admin UI presents Constants as an editable surface (Override button, Apply diff with admin-side approval). Per the principle, the surface should be **read-only display + Refresh research button only** — no admin value entry, no admin-side value approval. | **High** | `ModelConstantsTab.tsx`, `OverrideDialog.tsx`, `RegenerateDialog.tsx` |
| **G5** | No periodic refresh job. Constants rows silently go stale between admin button clicks. | Medium | `server/ai/ambient/scheduler.ts` |
| **G6** | Authority-derived values not yet promoted to the registry: `NOL_UTILIZATION_CAP` (26 USC §172), `WORKING_CAPITAL_DAYS_PER_MONTH` (industry convention), USALI cost rates (`DEFAULT_COST_RATE_ROOMS`, `DEFAULT_COST_RATE_ADMIN`, USALI 11th Ed.), `DEFAULT_LAND_VALUE_PERCENT` (IRS guideline), `DEFAULT_REINVESTMENT_RATE` (Fed long-run target). | Medium | `shared/constants.ts` |
| **G7** | Existing factory rows don't carry specialist verdict ids — they were seeded from TS metadata. Even after the gap above is fixed, existing rows need a backfill to be properly analyst-attributed. | Medium | `script/seed-model-constants.ts`, `model_constants` table |
| **G8** | No server-side guard rejecting `source = "manual"` writes for authority-derived keys, so a regression could silently restore the old behavior. | Low (preventive) | `PUT /api/admin/model-constants/:key` |

---

## 3. Target state — what "specialists doing their job" looks like

1. **Catalog has Constants specialists.** Add four (or one consolidated) `constants.*` specialists:
   - `constants.tax-research` — owns `taxRate`, `costRateTaxes`, `capitalGainsRate`, `NOL_UTILIZATION_CAP`, `DEFAULT_LAND_VALUE_PERCENT`.
   - `constants.macro-research` — owns `inflationRate`, `countryRiskPremium`, `DEFAULT_REINVESTMENT_RATE`.
   - `constants.depreciation-research` — owns `depreciationYears`.
   - `constants.reporting-research` — owns `daysPerMonth`, `WORKING_CAPITAL_DAYS_PER_MONTH`, USALI cost-rate keys.

   Each specialist declares which registry keys it owns and the authority publications it's allowed to cite (whitelist of authoritative sources).

2. **The "Regenerate" path runs through a registered specialist and writes a real verdict.** The flow becomes:
   - Admin clicks **"Refresh research"** on a Constant row.
   - Server resolves the specialist that owns the key from the catalog.
   - Specialist runs (grounded research → extraction → AnalystVerdict with conviction, range, evidence, asOfDate).
   - Verdict is persisted with a `cognitiveRunId` / `verdictId`.
   - The Constant override row is written with `source = "analyst"`, full provenance, and the verdict id.
   - Admin sees the result (new value, evidence, conviction, asOfDate) — but does not type a number and does not "approve a value" before write. The specialist's verdict is the value.

3. **Manual override path is closed for authority-derived keys.** The `OverrideDialog` is removed for these keys. The `PUT /api/admin/model-constants/:key` endpoint rejects `source = "manual"` writes for any key whose registry entry is marked `specialistOwned: true`. (The endpoint stays open for non-authority keys not yet migrated, with a deprecation log.)

4. **Quarterly refresh job in the ambient scheduler.** A new `server/jobs/specialist-constants-refresh.ts` runs all `constants.*` specialists on a 90-day cadence, posts results as admin notifications/audit entries, and (with conviction ≥ threshold) auto-applies. The "Refresh research" button is still admin-triggerable on demand for between-cycle updates.

5. **Authority-derived values fully migrated.** The 5+ candidate values (G6) get registry entries, are claimed by the appropriate specialists, get factory rows seeded, and existing TS literals become last-resort floors only.

6. **Backfill pass.** Existing analyst-applied rows (which today have `researchRunId: null`) get retroactively linked to verdict records, or re-run to produce fresh verdicts.

7. **UI redesign.** `ModelConstantsTab` becomes read-only display per row + "Refresh research" button + "Last refreshed" timestamp + "Authority" link + "Conviction" + "Evidence" expandable. No `<Input>`, no `<NumberInput>`, no PctField bound to a Constant value.

8. **Server-side guard.** `PUT /api/admin/model-constants/:key` rejects writes with HTTP 422 when the key is `specialistOwned` and the source is anything other than `"analyst"` with a valid verdict id.

---

## 4. Phased migration plan

The phases are independent and can be done in this order without breaking anything live:

### Phase 1 — Specialist catalog scaffolding (1-2 days, isolated)
- Add `constants.*` specialists to `SPECIALIST_CATALOG`.
- Add a `constantsOwned: string[]` field per specialist to declare which registry keys they own.
- Add a `getSpecialistForConstant(key, country): Specialist` resolver.
- **No engine behavior change.** This phase is pure declaration.
- Tests: registry coverage test (every registry key has exactly one specialist owner).

### Phase 2 — Wire `researchRunId` on the analyst-apply path (½ day)
- In `proposeConstantRegeneration`, persist a verdict row (uses existing AnalystVerdict contract) and return the verdict id to the route.
- In the Apply route, pass `researchRunId` through to `model_constant_overrides`.
- Backfill: for existing `source = "analyst"` rows, generate retroactive verdict stubs or queue them for re-run.

### Phase 3 — Server-side guard on the manual path (½ day)
- Add `specialistOwned: boolean` flag to each registry entry (default `true` for the 7 existing keys).
- Reject `PUT /api/admin/model-constants/:key` when `key` is `specialistOwned`. Log and return HTTP 422 with a message pointing admin to the Refresh research button.
- Add a deprecation log entry in `OverrideDialog` for non-specialist-owned keys (still allowed, but warned).

### Phase 4 — UI redesign of Constants tab (1-2 days)
- Replace `OverrideDialog` with a per-row display card.
- "Override..." button → removed for `specialistOwned` keys.
- "Regenerate via Analyst" button → renamed to **"Refresh research"**, opens a results dialog (not a diff/approval dialog).
- Add visible: authority hyperlink, asOfDate, last refreshed timestamp, conviction, evidence summary, value range.
- Keep "Reset to factory" button (admin always retains the rollback escape hatch).

### Phase 5 — Quarterly refresh job (1 day)
- Add `server/jobs/specialist-constants-refresh.ts`.
- Hook into `server/ai/ambient/scheduler.ts` with a 90-day-cadence guard.
- For each registry key: resolve the owning specialist → call `proposeConstantRegeneration` → if conviction ≥ auto-apply threshold (e.g. 85), apply directly with `source = "analyst"` + verdict id. Otherwise, create an admin notification "Constant X has a proposed update awaiting review."
- Add an admin "Refresh history" view showing the last N refresh runs per key.

### Phase 6 — Promote authority-derived values to registry (½ day per key)
- For each of `NOL_UTILIZATION_CAP`, `WORKING_CAPITAL_DAYS_PER_MONTH`, `DEFAULT_COST_RATE_ROOMS`, `DEFAULT_COST_RATE_ADMIN`, `DEFAULT_LAND_VALUE_PERCENT`, `DEFAULT_REINVESTMENT_RATE`:
  - Add to `MODEL_CONSTANTS_REGISTRY` with `specialistOwned: true` and the right specialist owner.
  - Add prompt template to `proposeConstantRegeneration`.
  - Seed factory row.
  - Replace TS literal usage with `getEffectiveConstant(key, scope)`.
  - Keep the TS literal as last-resort floor only.

### Phase 7 — Migrate `shared/countryDefaults.ts` (multi-week, lowest priority)
- Country-keyed authority values move from compile-time TS into specialist-owned Constants rows, US-first.
- This is the long-tail migration; rest of the plan can ship without it.

---

## 5. What is safe to do today (no engine behavior change)

- Phase 1 (catalog scaffolding) and Phase 2 (verdict id wiring) are pure-additive and break nothing.
- Phase 3 (guard on manual path) is contained but is a behavior change for admins — needs UX coordination.
- Phase 4 (UI redesign) is contained to admin pages.
- Phase 5 (quarterly job) requires careful conviction threshold tuning to avoid noisy auto-applies.

---

## 6. Cross-references

- `.claude/rules/inflation-cascade.md` — the rule this audit operationalizes for one key.
- `.agents/skills/inflation-cascade/SKILL.md` — agent guidance.
- `.agents/skills/constants-vs-defaults/SKILL.md` — the general discipline.
- `replit.md` — Constants tier definition.
- `docs/audits/task-379-defaults-vs-source-of-truth.md` — depreciation as the worked precedent for overlay extension.
- `engine/analyst/contracts/verdict.ts` — AnalystVerdict contract (frozen).
- `engine/analyst/registry/specialist-catalog.ts` — where Phase 1 edits live.
- `server/ai/regenerate-constants.ts` — where Phase 2 edits live.
- `server/routes/admin/model-constants.ts` — where Phase 3 edits live.
- `client/src/components/admin/ModelConstantsTab.tsx` — where Phase 4 edits live.
- `server/ai/ambient/scheduler.ts` — where Phase 5 hook lives.
