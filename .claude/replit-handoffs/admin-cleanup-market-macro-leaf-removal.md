# Phase Admin-Cleanup-6: Remove Steady State → Market & Macro sidebar leaf

The sidebar entry `defaults-market-macro` redirects to `model-defaults` and selects the "Market & Macro" sub-tab inside ModelDefaultsTab. The same sub-tab is already reachable by clicking Steady State → Management Company and switching tabs. Two paths to the same content. Drop the leaf.

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — UX cleanup

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` row "Steady State → Market & Macro (sidebar leaf)" — recommended kill, not a duplicate of Mgmt Co (different sub-tab) but a direct duplicate of the same sub-tab reachable via the parent Steady State page.

This is the smallest packet in the cleanup queue.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 1 ✅
- **File count:** 1 ✅ (sidebar; the page route stays — it's a redirect target)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Remove the leaf from AdminSidebar

- **Files:**
  - `client/src/components/admin/AdminSidebar.tsx`
- **Change:**
  1. In the Steady State group's `sections` array (search for `label: "Steady State"`), remove the entry:
     ```tsx
     { value: "defaults-market-macro",       label: "Market & Macro",     icon: IconGlobe },
     ```
  2. Leave `defaults-management-company` and `defaults-property` in place — those are different sub-tabs.
  3. Leave the `AdminSection` union and `SECTION_REDIRECTS` entries for `defaults-market-macro` — they remain as redirect targets for plausibly-bookmarked deep links (per the existing comment at line 48-51 of AdminSidebar.tsx). Removing them would break old bookmarks; keeping them is harmless.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Per `cross-check-invariants.md` — TypeScript compiles cleanly because the union still includes the literal (kept for redirects). The proof test still passes because the redirect map covers it.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] `npm run lint` 0 errors / 0 warnings
  - [ ] AdminSidebar.tsx no longer renders "Market & Macro" as a leaf under Steady State
  - [ ] Direct URL `?section=defaults-market-macro` still works (redirects to `model-defaults` + selects the right sub-tab via existing `MODEL_DEFAULTS_SUB_TAB`)
  - [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` PASS (8/8)
- **Rollback notes:** Restore the one-line entry from git.

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] Steady State group shows: Management Company, Property, Constants, Analyst Tables, Reference Ranges (5 leaves, down from 6 — Market & Macro removed)
- [ ] Steady State → Management Company → Market & Macro tab still shows the same content
- [ ] Old bookmark `?section=defaults-market-macro` still resolves (test by direct URL nav)

## Out of scope (MANDATORY)

- Renaming the sub-tab inside ModelDefaultsTab. "Market & Macro" stays as the sub-tab label.
- Removing the redirect map entry. It stays for legacy URL support.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-market-macro-leaf-removal.md
```
