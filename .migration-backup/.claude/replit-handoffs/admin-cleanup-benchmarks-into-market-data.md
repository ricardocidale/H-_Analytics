# Phase Admin-Cleanup-8: Decide Benchmarks vs Market Data overlap

`Resources → Benchmarks` (`<ResourcesTab kind="benchmark"/>`) and `Resources → Market Data` (`<MarketDataTablesPage />`) display overlapping benchmark data through different components. The audit flagged this as a "pick one" — but didn't pre-decide, because the right answer depends on whether the two are conceptually different (writable benchmark slug registry vs read-only market-data reference tables) or actually duplicates.

This packet is **investigation-first**, not edit-first. Replit determines the answer, then either (a) confirms they're different and updates the audit, or (b) merges them.

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — UX investigation

## Context (MANDATORY)

The audit row "Resources → Benchmarks" notes: "Hospitality benchmarks; ⚠️ duplicate of Market Data tables; both display benchmark data via different components."

Before merging, we need to know:
1. Does `<ResourcesTab kind="benchmark"/>` write to `admin_resources` table with `kind=benchmark`? (registry of benchmark *slugs*)
2. Does `<MarketDataTablesPage />` read from a different table — `hospitality_benchmarks`, `market_adr_index`, `labor_rates`, etc.? (actual benchmark *values* refreshed by The Analyst)

If the answer is "yes, different tables, different shape" → these are NOT duplicates and the audit row should be updated. The fix is **clearer naming + cross-link**, not merging.

If the answer is "they read/write the same table" → merge.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 2 ✅
- **File count:** 1-3 (depends on outcome)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Investigate the data shape

- **Files:** None (read-only investigation)
- **Change:** Open both files and trace the data:
  - `client/src/components/admin/resources/ResourcesTab.tsx` — what API does it call when `kind="benchmark"`? What does the response shape look like? Trace the route handler.
  - `client/src/pages/ai-intelligence/MarketDataTablesPage.tsx` — what API does it call? What table?
- **Acceptance criteria (decision):**
  - [ ] If different tables / different shapes: the surfaces are NOT duplicates. Skip to S2-A.
  - [ ] If same table / same shape: the surfaces ARE duplicates. Skip to S2-B.

### S2-A: Different — clarify naming + cross-link

- **Files:**
  - `client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`
- **Change:**
  1. Rename the new internal tab "Benchmarks" (created in `admin-cleanup-resources-consolidation.md` packet) to "Benchmark Slugs" or "Benchmark Registry" — whatever clarifies that this is the registry of which slugs exist, not the values.
  2. Update the page subtitle in `client/src/pages/AiIntelligence.tsx` `pageMeta["resources"]` to reflect both surfaces.
  3. In the audit doc `.claude/audits/admin-intelligence-inventory.md`, update the "Resources → Benchmarks" row from "duplicate of Market Data" to "registry of benchmark slugs (admin-managed); Market Data tables hold the values (Analyst-refreshed)".
- **Acceptance criteria:**
  - [ ] No actual UI duplication remains in the user's mental model
  - [ ] Audit doc updated to reflect the clarification

### S2-B: Same — merge into Market Data

- **Files:**
  - `client/src/components/admin/resources/ResourcesAdminPage.tsx` (created in resources-consolidation packet)
  - `client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx`
- **Change:**
  1. Remove the "Benchmarks" tab from the new ResourcesAdminPage.
  2. Update the audit doc to confirm the merge.
- **Acceptance criteria:**
  - [ ] Resources tabs drop from 4 to 3 (APIs / Sources / Models)
  - [ ] Market Data leaf stays as the canonical benchmark surface

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] Behavioral: AI Intelligence → Resources renders the appropriate set of tabs based on the S1 decision

## Out of scope (MANDATORY)

- This packet depends on `admin-cleanup-resources-consolidation.md` having shipped first. If that hasn't, file a BLOCKED.md.
- Schema changes. Either path is UI-only.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-benchmarks-into-market-data.md
```
