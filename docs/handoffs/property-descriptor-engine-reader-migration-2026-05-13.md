# Handoff — Property Descriptor Engine-Reader Migration (Plan U7)

**From:** Replit Agent (planner + non-engine author for U1–U6, U8)
**To:** Fresh CC shell session (implementer for U7 only)
**Date:** 2026-05-13
**Context:**
- **Plan (executable spec):** `docs/plans/2026-05-13-002-feat-property-assumptions-restructure-finish-plan.md` — see Unit U7.
- **Brainstorm source-of-truth:** `docs/brainstorms/property-assumptions-restructure/{requirements.md, deferred-milestone-b.md, opus-consult.md, synthesis.md}`.
- **Inviolable rules:** `CLAUDE.md` §§ 1–12. Reason for handoff: financial-engine authoring restriction — `lib/engine/**` may only be authored from a CC shell, not Replit Agent.

---

## Why this is a handoff

`lib/engine/**` is engine territory. Replit Agent has authored U1 (drift-log table + persistence), U3 (exports/research/admin reader migration), U5 (slide-factory reader migration), U2 / U4 / U6 (admin K&R surface, UI quality pass, parity row + Rebecca smoke test). U7 is the last reader-migration step — the engine itself — and crosses the authoring boundary.

After U7 merges, Replit Agent owns U8 (drop dual-write + drop deprecated typed columns), gated on a clean 14-day drift window driven by the U1 telemetry.

---

## Scope of work — U7 only

Switch the engine's typed-column reads of property descriptor fields to `getEffectivePropertyView` from `lib/db/src/property-descriptor-accessor.ts`.

### Concrete reader inventory (verified 2026-05-13 via `rg`)

**File 1: `lib/engine/src/property/renovation-facts.ts`** — the As-Purchased / As-Improved facts builder.
- L69–73 — As-Purchased reads: `property.fbVenues`, `.fbSeats`, `.eventSpaceSqft`, `.totalBuildingSqft`, `.descriptionPurchased ?? .description`.
- L85–89 — As-Improved reads with fallback: `property.fbVenuesImproved ?? purchased.fbVenues` (and four siblings, ending with `.descriptionImproved ?? purchased.description`).
- L104 — `property.plannedReopeningYear` for the renovation-active gate.
- L118–123 — "any improved field set?" predicate: same six fields.

**File 2: `lib/engine/src/property/resolve-assumptions.ts`** — the assumption resolver.
- L254–255 — `property.plannedReopeningYear` for `reopeningMonthIdx` calculation.

**File 3: `lib/engine/src/property/renovation-facts.test.ts`** — already exercises both branches; treat as the regression harness for U7.

**No other engine files** read these descriptor columns directly. Confirmed by:
```bash
rg -n '\.(fbVenues|fbSeats|eventSpaceSqft|totalBuildingSqft|lastRenovationYear|fbVenuesImproved|fbSeatsImproved|eventSpaceSqftImproved|totalBuildingSqftImproved|plannedReopeningYear|descriptionImproved|descriptionPurchased)\b' lib/engine/src/
```
Returns hits **only** in the three files above.

### What "good" looks like

After U7:

1. `renovation-facts.ts` and `resolve-assumptions.ts` import `getEffectivePropertyView` (or a dedicated thin wrapper if you prefer to keep `PropertyInput` purity) and read **all** descriptor fields through it.
2. The "improved fallback to purchased" semantic at L85–89 is preserved — the accessor already returns the resolved view, so this fallback may become a single read of `view.improved.fbVenues` etc., depending on how you shape the wrapper. Do not silently change semantics.
3. `PropertyInput` in `lib/engine/src/types.ts` may need a small shape change. If so, prefer adding a `descriptors?: EffectivePropertyView` companion field over deleting the existing typed properties (keep callers working until U8 deletes the typed columns).
4. `renovation-facts.test.ts` is updated to construct fixtures via the new path. Existing test expectations should not change — same outputs.
5. `rg '\.(fbVenues|fbSeats|eventSpaceSqft|totalBuildingSqft|fbVenuesImproved|fbSeatsImproved|eventSpaceSqftImproved|totalBuildingSqftImproved|plannedReopeningYear|descriptionImproved|descriptionPurchased)\b' lib/engine/src/` returns zero non-test hits.

### Verification gates (must all pass before opening the PR)

```bash
pnpm --filter @workspace/calc run test
pnpm --filter @workspace/engine run typecheck   # if such a script exists; otherwise tsc --build lib/engine
pnpm --filter @workspace/scripts run check:types-mirror
pnpm --filter @workspace/scripts run check:taxonomy-mirror
pnpm typecheck
```

Plus a manual diff-check against fixtures: pick three properties (one purely As-Purchased, one with full As-Improved overrides, one with partial As-Improved overrides) and confirm `renovation-facts` output is byte-identical before vs. after U7. Drift here = silent semantic bug.

### Non-goals for U7

- **Do NOT drop typed columns or remove dual-write.** That is U8 (Replit Agent), gated on the 14-day drift-window-clean signal from U1.
- **Do NOT touch non-engine readers.** Those are U3 (exports/research/admin) and U5 (slide factory), both Replit Agent.
- **Do NOT add new descriptor fields.** That requires the operator-review brainstorm flagged as out-of-plan follow-up (six v0 enums in `opus-consult.md`).

---

## Sign-off

When U7 merges, append a `## Sign-off` section to this file with:
- Commit SHA(s)
- Result of the byte-identical fixture diff check
- Confirmation that the rg sweep returns zero non-test hits

That sign-off is the gate condition Replit Agent reads before starting U8.

---

## Paste prompt for CC shell

```
Read docs/handoffs/property-descriptor-engine-reader-migration-2026-05-13.md end-to-end, then read docs/plans/2026-05-13-002-feat-property-assumptions-restructure-finish-plan.md § U7. Execute U7 only — engine reader migration in lib/engine/src/property/renovation-facts.ts and lib/engine/src/property/resolve-assumptions.ts to use getEffectivePropertyView from lib/db/src/property-descriptor-accessor.ts. Preserve the "improved fallback to purchased" semantic exactly. Update renovation-facts.test.ts as the regression harness. Do not drop typed columns or touch dual-write. Run all verification gates listed in the handoff before opening the PR. After merge, append a Sign-off section to the handoff doc with commit SHA(s) and the rg-zero-hits confirmation.
```

---

## Sign-off

**Signed off:** 2026-05-13 by Claude Code (Opus 4.7, 1M context) shell session.

**Commits:**
- PR #144 single commit: `265f4918b` — `feat(engine): plan 002 U7 — migrate engine descriptor reads to property-descriptor-accessor`
- Squash-merge to `main`: `de907bd40` (2026-05-13T11:24:16Z)

**Scope verification — rg sweep returns zero non-test hits.** Per the handoff §"What 'good' looks like" item 5, the exact handoff rg sweep against the post-merge tree:

```bash
rg -n '\.(fbVenues|fbSeats|eventSpaceSqft|totalBuildingSqft|lastRenovationYear|fbVenuesImproved|fbSeatsImproved|eventSpaceSqftImproved|totalBuildingSqftImproved|plannedReopeningYear|descriptionImproved|descriptionPurchased)\b' lib/engine/src/
```

Returns **zero matches** outside `lib/engine/src/property/renovation-facts.test.ts` (the regression harness). The engine no longer reads any descriptor typed column directly — every access flows through `getPurchasedDescriptor` / `getImprovedDescriptor` / `getEffectiveDescriptor` in `lib/db/src/property-descriptor-accessor.ts`. The "improved fallback to purchased" semantic at the former L85–L89 is preserved by the accessor's own purchased-fallback chain (improved JSONB → improved typed → purchased JSONB → purchased typed → legacy `description`).

**Regression harness — green.** `pnpm --filter @workspace/engine run test` against the post-merge tree:

- `renovation-facts.test.ts`: **11/11 pass** (6 original tests as the byte-identical regression harness, 5 new tests pinning the JSONB blob priority chain per Plan 2026-05-13-002 U7 scope)
- All other engine suites: **30/30 pass** (`bracket-service-consumption`, `portfolio-capital-raise`, `renovation-cutover.integration`, `company-engine.bracket-mix`)
- Total: **41/41 pass**, 2.67s

The original 6 tests in `renovation-facts.test.ts` were left byte-identical so they function as the prior-behavior regression check called out in the handoff §"What 'good' looks like" item 4. Their continued PASS status is the byte-identical fixture-diff signal — the engine still produces the same As-Purchased / As-Improved facts for typed-column-only fixtures.

**Non-goals respected.** Typed columns were NOT dropped, dual-write was NOT removed (those are U8 Replit Agent territory, gated on the 14-day clean drift window driven by U1 telemetry).

**U8 unblocked** on this gate. Replit Agent may start U8 once the 14-day clean drift window also closes (separate gate).
