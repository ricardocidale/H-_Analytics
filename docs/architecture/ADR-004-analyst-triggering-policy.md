# ADR-004: The Analyst Triggering Policy — When Intelligence Fires

**Status:** Proposed
**Date:** 2026-04-16
**Authors:** Replit (proposal) + Claude Code (critique + corrections)
**Deciders:** Ricardo Cidale

---

## The Problem

The Analyst fires at the wrong times. It auto-triggers on empty data, stalls without timeout, costs money on garbage context, and doesn't fire when it should (seed time, export time). The triggering policy determines when intelligence is generated, at what cost, and with what safeguards.

## The Two-Tier Model

**Correct. Ship this.**

| | Tier-0: Deterministic | Tier-1: LLM Research |
|---|---|---|
| **What** | DB lookup against country_defaults + hospitality_benchmarks | Multi-model synthesis with web research |
| **Cost** | Zero. Pure DB queries. | $0.05-0.10 per property per run |
| **Speed** | 50ms per property | 60-120 seconds |
| **When** | Every write. Always. No exceptions. | On demand only. Never automatic on page load. |
| **Code** | `server/ai/analyst-watchdog.ts` — **ALREADY BUILT** | `server/routes/research.ts` — exists |
| **Writes** | `validationStatus`, `flaggedFieldCount`, `assumption_guidance` rows | Rich `assumption_guidance` with citations, conviction scores, data quality |

**Critical correction for Replit:** Tier-0 is NOT "not yet scoped." It exists. `analyst-watchdog.ts` contains:
- `validatePropertyAssumptions()` — full property validation against country_defaults + benchmarks
- `validateFieldChanges()` — fires on every property PATCH
- `checkStaleness()` — marks properties stale after 30 days
- `checkPortfolioConsistency()` — catches cross-property anomalies
- Wired into seed runner (`seeds/index.ts`) and property PATCH route
- **BLOCKED ONLY BY:** the `validationStatus` column not existing in the DB. Run `drizzle-kit push`.

---

## The Decision Table

| Trigger | Tier | Precondition | Timing | Outcome |
|---------|------|-------------|--------|---------|
| Seed / import | 0 | Property exists | Blocking in seed job | Set validationStatus; write DB-sourced guidance; set researchFitness |
| Property save | 0 | PATCH accepted | Fire-and-forget (50ms) | Recompute status; flag/validate; log to assumption_change_log |
| Company save (basics changed) | 0 | GA save accepted | Fire-and-forget | Re-validate ALL properties (basics affect country defaults) |
| Company save (basics changed) | — | — | Mark stale | Set all guidance as stale so Tier-1 re-runs when requested |
| First eligible visit | 1 | Context checklist GREEN | Blocking (user waits) | Full research; persist guidance |
| Manual "Refresh Intelligence" | 1 | Context checklist GREEN | Blocking (user waits) | Streamed research run |
| Ambient scheduler (>30 days stale) | 1 | Context checklist GREEN | BACKGROUND | User never pays; scheduler handles |
| Export request | Gate | — | Blocking | BLOCK on excluded/pending; watermark on stale |
| Dashboard open | — | — | NEVER | Read status badges only |

### What changed from Replit's proposal:
- Added "Company save re-validates ALL properties" — because changing company country affects every property's country default validation
- Made "Company save" fire-and-forget, not blocking — 50ms for Tier-0, user doesn't wait
- Added researchFitness outcome to seed validation — properties can be excluded_data
- Clarified export gate: three severity levels (block/block-with-override/watermark)

---

## Context Checklist (Minimum for Tier-1)

### Company-Level Research
| Requirement | Field | Why |
|-------------|-------|-----|
| Company name set | `globalAssumptions.companyName` | The Analyst needs to know who it's researching |
| Company country set | `globalAssumptions.companyCountry` OR HQ address country | Country drives tax, depreciation, CRP |
| Operations start date | `globalAssumptions.companyOpsStartDate` | Drives staffing timeline |
| At least 1 research-ready property | `properties WHERE validationStatus IN ('validated', 'flagged')` | The Analyst sizes the HMC from the portfolio |
| HMC Setup page endorsed | `user_page_visits.endorsed = true WHERE pageKey = 'company-assumptions'` | User has confirmed base info is correct |

### Property-Level Research
| Requirement | Field | Why |
|-------------|-------|-----|
| Room count > 0 | `properties.roomCount` | Can't research ADR/occupancy without rooms |
| Start ADR > 0 | `properties.startAdr` | Need a starting point for range research |
| Country set | `properties.country` | Drives all country-specific benchmarks |
| Purchase price > 0 | `properties.purchasePrice` | Needed for exit valuation research |
| Property type set | `properties.type` | Full Equity vs Financed changes the research scope |
| Not excluded by Analyst | `validationStatus NOT IN ('excluded_data')` | Analyst has vetted this property as researchable |

### What changed from Replit's proposal:
- Added `companyOpsStartDate` to company checklist
- Added `roomCount > 0` and `startAdr > 0` to property checklist (a 0-room property is meaningless)
- Added HMC Setup endorsed gate — prevents research on stale seed data
- Added researchFitness check — The Analyst won't research a property it has excluded

---

## Staleness Policy

**Full re-run, not field-level.** Here's why:

LLM research prompts include full property context. You can't ask "just re-research exit cap rate" without the model seeing ADR, occupancy, location, quality tier, and comparable set. The cost per property (~$0.05-0.10) doesn't justify the engineering complexity of field-level research routing.

**Triggers:**
- Time-based: `lastValidatedAt` > 30 days → mark stale
- Change-based: 3+ assumption changes since last Tier-1 run → mark stale
- Source-based: if a data source used in the last research run goes unhealthy → mark stale (future enhancement)

**Who pays:**
- The ambient scheduler (`server/ai/ambient/scheduler.ts`) runs every 6 hours
- It checks for stale properties and enqueues Tier-1 refreshes
- Max 2 concurrent research runs to avoid flooding LLM APIs
- The user NEVER pays for staleness refresh — they see "Refreshing in background" not a blocking modal

**Kill `use-auto-refresh-intelligence.ts`:** This client-side hook is wrong. It makes the first user to open a stale page wait 60-120 seconds. Move all scheduled refresh to the server-side ambient scheduler. The client hook should ONLY read status, never trigger research.

---

## Export Gate

Three tiers of severity:

| Property Status | Export Behavior |
|----------------|-----------------|
| `excluded_data` | **HARD BLOCK.** "Cannot export: [property] excluded by The Analyst — data quality issues." No override. |
| `pending_validation` | **HARD BLOCK.** "Cannot export: [property] has unvalidated assumptions. Run The Analyst first." No override. |
| `flagged` | **SOFT BLOCK.** "The Analyst flagged [N] fields on [property]. Review before exporting." Admin can override with acknowledgment. |
| `stale` | **WATERMARK.** Export proceeds. Footer on every page: "Intelligence last reviewed [date]." Flagged fields listed on cover page. |
| `validated` | **CLEAN.** No warnings, no watermarks. |

Additionally: **HMC Setup must be endorsed** before any export. If `user_page_visits.endorsed = false` for company-assumptions, block with: "Please review and save Company Assumptions before exporting investor materials."

---

## Ship Order (Revised)

Replit's order is almost right but has a critical dependency error: Step 3 (export gate) cannot ship before Tier-0 exists, because without Tier-0, all properties are permanently `pending_validation` and no exports ever work.

### Phase 1: Unblock Tier-0 (5 minutes — Replit)
```
npx drizzle-kit push
```
This creates `validationStatus`, `lastValidatedAt`, `flaggedFieldCount`, `validationReason` columns. The Analyst watchdog (`analyst-watchdog.ts`) is already wired and will start firing on every property PATCH and seed run.

### Phase 2: Precondition + Actionable UX (Replit — 2 hours)
- Research endpoint returns `{ blocked: true, missingRequirements: [...] }` when context insufficient
- **Already partially built:** `server/routes/research.ts` now checks `companyName`, `endorsed` page visit, and property access. Replit should add the full checklist from above.
- FirstVisitBanner becomes a checklist that shows what's missing
- "Refresh Intelligence" button disabled with reason until checklist is green

### Phase 3: Remove Auto-Fire (Replit — 30 minutes)
- Delete the 1.5s setTimeout in `PropertyEdit.tsx`
- Delete `use-auto-refresh-intelligence.ts` or gut it to read-only
- First-visit nudge only; never auto-trigger Tier-1 on page load
- Move staleness refresh to ambient scheduler

### Phase 4: Unify Status + Export Gate (Claude Code + Replit — 1 hour)
- On successful Tier-1, write `validationStatus = 'validated'` and `lastValidatedAt`
- **Already partially built:** export gate in `premium-exports.ts` blocks on excluded, warns on unvalidated
- Replit adds client-side handling for `HMC_NOT_ENDORSED` and `PROPERTIES_EXCLUDED` error codes

### Phase 5: Tab Badges + Returning User Banner (Replit — 2 hours)
- Tab badge counts ("3 fields to review") from assumption_guidance
- Returning user delta banner from assumption_change_log
- First login welcome banner on Dashboard

---

## Failure Modes

| Failure | Impact | Mitigation |
|---------|--------|-----------|
| Tier-0 flags everything (false positives) | Every property is "flagged", export is blocked | Already fixed: benchmark unit mismatch (decimals vs percentages). Conviction floor prevents advice on bad data. |
| HMC endorsement blocks new users | User can't explore anything | Gate applies to Tier-1 only, not to viewing existing guidance. User can browse properties and see Tier-0 results before endorsing HMC. |
| Stale ambient refresh floods LLM | 10 properties × $0.10 = $1.00 every 30 days | Max 2 concurrent runs. Queue the rest. Total cost is negligible. |
| Tier-0 returns no_data for all fields | Everything stays `pending_validation` | When benchmarks are empty (seeds haven't run), Tier-0 should return `no_data` verdict, not `flagged`. Properties with `no_data` for all fields stay `pending_validation`, not `excluded_data`. |
| User saves wrong country then triggers research | Garbage intelligence based on wrong country | Tier-0 catches this immediately — country defaults won't match. Property gets flagged. The Analyst won't let Tier-1 run on a flagged property unless the user acknowledges the flags. |
| Circular blocking: save → flag → can't export → fix → still flagged | User stuck in loop | Tier-0 re-runs on every save. Fixing the field immediately re-validates. No manual "re-run validation" step needed. |

---

## What's Consistent, What's Not

| ADR | Consistent? | Notes |
|-----|-------------|-------|
| ADR-001 (self-managing LLM engine) | ✓ | LLM selection is separate from triggering policy |
| ADR-002 (Analyst validates everything) | ✓ after Tier-0 unblocked | Currently blocked by missing DB column |
| ADR-003 (how the app works) | ✓ | Full-database research pool, endorsement gates, research fitness |
| Code: `analyst-watchdog.ts` | ✓ | Tier-0 is built, needs DB migration |
| Code: `research.ts` endorsement gate | ✓ | Checks `user_page_visits.endorsed` |
| Code: `premium-exports.ts` export gate | ✓ | Blocks on excluded, warns on unvalidated |
| Code: `use-auto-refresh-intelligence.ts` | ✗ | Must be removed or gutted — client should never trigger Tier-1 automatically |
| Code: PropertyEdit.tsx auto-fire | ✗ | Must remove the 1.5s setTimeout |
| Code: ResearchTheater byte-count progress | ✗ | Must replace with AnalystWorkingView phase-based progress |

---

## The One Thing That Matters Most

**Run `drizzle-kit push`.** Everything else — the triggering policy, the export gate, the endorsement system, the tab badges — is blocked by three missing database columns. Five minutes of work unblocks the entire architecture.
