---
title: "refactor: Button/UX Focus — Full Button Sweep + Analyst Banner Removal"
type: refactor
status: completed
date: 2026-05-10
depth: standard
---

# Button/UX Focus — Full Button Sweep + Analyst Banner Removal

## Summary

Full-sweep UI standardization across the entire frontend. Two concerns in one PR: (1) remove analyst-prompt banners, colored rectangles, and gate components that tell the user to run the Analyst — the freshness dot on the Analyst button is sufficient signal; (2) comprehensive button audit — migrate 111 native `<button>` elements to shadcn `<Button>`, add missing `aria-label` attributes to all 40+ icon-only buttons, add `Loader2` loading indicators to 6–8 buttons missing them, standardize all Cancel buttons to `variant="outline"`, and consolidate the 9 `DialogFooter` className patterns to 2–3 canonical variants.

---

## Problem Frame

Two related UX issues compound each other. First, the app has grown several "you need to run the Analyst" banners (`AnalystValidationBanner`, `IntelligenceStatusBar`, `AssumptionsGate`, `SaveWithAnalystGate`, `CompanyAnalystOverlay`) that interrupt the user's flow with colored rectangles and calls-to-action. The Analyst button already carries a freshness dot (green/amber/red) — that is the correct and sufficient signal. Banners create visual noise, duplicate the button's signal, and fragment the page layout. Second, the button layer has accumulated significant inconsistency: 111 native `<button>` elements bypass shadcn's accessibility features, 40+ icon-only buttons have no `aria-label`, several async actions disable without showing a loading indicator, and dialog footer layouts use 9 different className patterns.

---

## Requirements

- R1. Remove all analyst-prompt banners, colored info rectangles, and gate components. The Analyst button's freshness dot is the only "needs research" signal.
- R2. `AnalystButton` and `AnalystActionButton` `pulse` prop must still function — pulse on the button itself is acceptable; a separate banner around it is not.
- R3. All 111 native `<button>` elements migrated to shadcn `<Button>` with appropriate variant.
- R4. All icon-only buttons (`size="icon"`) have an `aria-label` attribute.
- R5. All buttons that trigger async operations show `Loader2 animate-spin` while pending.
- R6. All dialog Cancel buttons use `variant="outline"`.
- R7. All `DialogFooter` className values use one of three canonical patterns.
- R8. `pnpm run typecheck` clean. No regressions in existing button-related tests.
- R9. `AssumptionsGate` (full-page blocker for missing Company Assumptions) is redesigned as a minimal inline message — not an amber card — since it gates page access, not Analyst activation.

---

## Scope Boundaries

- Disabled-button tooltips (150+ missing) are **not** in scope — too many, should be addressed per-feature as each page is touched.
- `AnalystUnsavedChangesDialog` button labels ("Save and analyze", "Continue with last saved") are intentional workflow-specific labels — not changed.
- `SuspiciousActivityBanner` (`admin/intelligence/SuspiciousActivityBanner.tsx`) is an admin-only security alert, not an analyst prompt — not removed.
- `RebeccaConfig.tsx` amber styling is part of the AI chat preview UI — not changed.
- Admin-only colored status indicators (health dots, freshness badges in admin tables) are appropriate in their context — not changed.

### Deferred to Follow-Up Work

- Disabled-button tooltip coverage: addressed per-feature page
- Remaining `text-rose-600` ghost buttons that should use `variant="destructive"`: small count, low visibility impact

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/hospitality-business-portal/src/components/analyst/AnalystValidationBanner.tsx` — REMOVE
- `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceStatusBar.tsx` — REMOVE (banner portion; freshness logic may move to button dot)
- `artifacts/hospitality-business-portal/src/components/intelligence/AssumptionsGate.tsx` — REDESIGN (minimal inline message, remove amber card)
- `artifacts/hospitality-business-portal/src/components/analyst/SaveWithAnalystGate.tsx` — REMOVE
- `artifacts/hospitality-business-portal/src/components/company-assumptions/CompanyAnalystOverlay.tsx` — REMOVE
- `artifacts/hospitality-business-portal/src/components/ui/button.tsx` — canonical button component
- `artifacts/hospitality-business-portal/src/components/ui/save-button.tsx` — canonical save button
- `artifacts/hospitality-business-portal/src/components/analyst/AnalystButton.tsx` — canonical analyst button (has `freshnessStatus` prop + dot)
- `artifacts/hospitality-business-portal/src/components/analyst/AnalystActionButton.tsx` — secondary analyst button

### Institutional Learnings

- `docs/solutions/design-patterns/admin-sidebar-navigation-design-2026-05-05.md` — design system conventions
- `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` — canonical severity levels; `AnalystRangeIndicator`, `AnalystVerdictDisplay`, `AnalystCheckDialog` are the canonical intelligence display components. Banners are not.
- `.agents/skills/analyst-intelligence-display/SKILL.md` — "No component may hard-code a range, write its own advice, or derive a suggestion locally." The `AnalystValidationBanner` violates this by showing inline field-range advice — the `AnalystCheckDialog` is the correct component for that.
- `.agents/skills/analyst-research-buttons/SKILL.md` — button label and icon conventions

---

## Key Technical Decisions

- **Banners removed, not replaced.** The freshness dot on `AnalystButton` already communicates "research needed" with green/amber/red. No replacement UI is introduced. Where the banner also contained the Analyst trigger button, that button stays (inline, in the section header or toolbar row).
- **`AssumptionsGate` redesigned, not removed.** It gates page access (no Company Assumptions saved yet), which is a legitimate blocker. But the amber rectangle is heavy. Replace with a compact inline notice: icon + one-line message + link chip, no colored card background.
- **`IntelligenceStatusBar` removed.** Its freshness signal is fully covered by the `AnalystButton` `freshnessStatus` prop. Remove all `IntelligenceStatusBar` usages.
- **Native `<button>` migration uses `variant="ghost"` as default.** Most native buttons are in map controls, autocomplete dropdowns, filter chips — all non-primary actions. Ghost is the correct variant. Destructive actions use `variant="destructive"`.
- **DialogFooter canonical patterns defined once in a comment, not a new component.** Creating a `<CanonicalDialogFooter>` wrapper adds indirection without payoff — the canonical classNames are documented and applied directly.

---

## Open Questions

### Resolved During Planning

- *Is IntelligenceStatusBar used on property or company pages, or only admin?* — Used in `CompanyAssumptionsTabsView.tsx`. Its freshness logic feeds the `AnalystButton` `freshnessStatus` prop. Remove the banner rendering; keep the `computeFreshnessStatus` utility function as it feeds the button dot.
- *Does AssumptionsGate show only for missing Company Assumptions tabs, or also for Analyst not-yet-run?* — Only for missing saves. It is a data-gate, not an Analyst-gate. Redesign as minimal, keep the blocking behavior.

### Deferred to Implementation

- *Which callers of `AnalystValidationBanner` use its `onAcceptRange` callback?* — Inventory during U1; if `onAcceptRange` is meaningful, migrate to `AnalystCheckDialog` instead of simply deleting.
- *Does `SaveWithAnalystGate` gate saving or just show a prompt?* — Read fully during U2; if it wraps Save behavior, extract the Save behavior and delete the gate wrapper.

---

## Implementation Units

- U1. **Remove `AnalystValidationBanner` and migrate callers**

**Goal:** Delete `AnalystValidationBanner` and its three render states (pending_validation, flagged, stale banners). Migrate callers: the Analyst button in-section handles the trigger; `AnalystCheckDialog` handles flagged-field display if needed.

**Requirements:** R1, R2

**Dependencies:** None

**Files:**
- Delete: `artifacts/hospitality-business-portal/src/components/analyst/AnalystValidationBanner.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/PropertyEdit.tsx` (remove import + render)
- Modify: any other caller found during inventory (grep for `AnalystValidationBanner`)

**Approach:**
- Grep for all `AnalystValidationBanner` usages; each caller already has an `AnalystActionButton` or `AnalystButton` in the same section header — the trigger is preserved
- If `onAcceptRange` is used by a caller, wire the flagged-field list to the existing `AnalystCheckDialog` component instead
- The `validationStatus === "flagged"` state that the banner displayed now manifests only as the red freshness dot on the Analyst button

**Test scenarios:**
- Happy path: `PropertyEdit.tsx` renders without banner; Analyst button still present and functional
- Edge case: `validationStatus === "flagged"` — no banner rendered; Analyst button shows red dot
- Edge case: `validationStatus === "pending_validation"` — no banner; Analyst button shows missing dot

**Verification:**
- No `AnalystValidationBanner` import anywhere in the codebase
- `pnpm run typecheck` clean

---

- U2. **Remove `SaveWithAnalystGate`, `CompanyAnalystOverlay`, and `IntelligenceStatusBar` banner rendering**

**Goal:** Delete `SaveWithAnalystGate` and `CompanyAnalystOverlay` entirely. Remove the banner-rendering portion of `IntelligenceStatusBar`; preserve `computeFreshnessStatus` utility as it feeds the `AnalystButton` `freshnessStatus` prop.

**Requirements:** R1, R2

**Dependencies:** None (parallel with U1)

**Files:**
- Delete: `artifacts/hospitality-business-portal/src/components/analyst/SaveWithAnalystGate.tsx`
- Delete: `artifacts/hospitality-business-portal/src/components/company-assumptions/CompanyAnalystOverlay.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/intelligence/IntelligenceStatusBar.tsx` — remove banner JSX, keep `computeFreshnessStatus` and `FreshnessStatus` type exports
- Modify: callers of the deleted components (grep before deleting)

**Approach:**
- `SaveWithAnalystGate`: if it wraps the Save button, remove the gate wrapper; the inner Save button renders directly
- `CompanyAnalystOverlay`: if it overlays the company assumptions form, remove the overlay; the form renders directly
- `IntelligenceStatusBar`: the component becomes a utility-only module (no JSX export); if it exported a rendered component, callers are updated to use the `AnalystButton` `freshnessStatus` prop directly

**Test scenarios:**
- Happy path: Company Assumptions page renders without overlay banner
- Happy path: Save button in gated context works directly without wrapper component
- Edge case: freshness dot on `AnalystButton` still shows correct color after `computeFreshnessStatus` utility is preserved

**Verification:**
- No `SaveWithAnalystGate`, `CompanyAnalystOverlay`, or `IntelligenceStatusBar` (as a rendered banner) in the component tree
- `computeFreshnessStatus` still exported and usable

---

- U3. **Redesign `AssumptionsGate` as minimal inline blocker**

**Goal:** Replace the full-page amber card with a compact, neutral inline notice: icon + single line message + tab chips. No colored background rectangle.

**Requirements:** R1, R9

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/intelligence/AssumptionsGate.tsx`

**Approach:**
- Remove `border-amber-500/30 bg-amber-500/5 p-6` card wrapper
- Replace with a simple `<div className="flex flex-col gap-4 py-8 text-center">` layout
- Icon + heading: `IconAlertTriangle` replaced with a neutral `IconInfo` or removed; heading font-display, no color emphasis
- Tab chips: keep the clickable tab chips (they're navigational, not decorative)
- The page content area remains gated — only the visual treatment changes

**Test scenarios:**
- Happy path: visiting a gated page shows the minimal notice without amber background
- Happy path: clicking a tab chip navigates to the correct Company Assumptions tab
- Edge case: all tabs saved — gate renders nothing (existing behavior preserved)

**Verification:**
- No amber/yellow background classes in `AssumptionsGate.tsx`
- Gate still blocks access when tabs are missing

---

- U4. **Add `aria-label` to all icon-only buttons**

**Goal:** Every `<Button size="icon">` (and custom `h-7 w-7` icon button) has an `aria-label` describing its action.

**Requirements:** R4

**Dependencies:** None (parallel with U1–U3)

**Files:**
- Modify: (all files identified in audit — ~40 files)
  - `src/components/admin/MarketRatesTab.tsx`
  - `src/components/admin/AdminSidebar.tsx`
  - `src/components/admin/research/SourcesSection.tsx`
  - `src/components/company-assumptions/ServiceTemplateCard.tsx`
  - `src/components/property-edit/PropertyLinksSection.tsx`
  - `src/components/Favorites.tsx`
  - (full list from audit — grep `size="icon"` without `aria-label`)

**Approach:**
- `aria-label` should describe the action, not the icon: "Edit" not "Pencil icon", "Delete photo" not "Trash icon"
- For toggle buttons (show/hide password): `aria-label="Show password"` / `aria-label="Hide password"` with dynamic swap

**Test scenarios:**
- Test expectation: none — label additions are declarative, not behavioral. Verified by audit grep.

**Verification:**
- `grep -r 'size="icon"' src/ | grep -v 'aria-label'` returns zero results
- `pnpm run typecheck` clean

---

- U5. **Add `Loader2` loading indicators to async buttons missing them**

**Goal:** Every button that triggers an async operation (mutation or fetch) shows `Loader2 animate-spin` while pending.

**Requirements:** R5

**Dependencies:** None (parallel)

**Files:**
- Modify: (6–8 files identified in audit)
  - `src/components/DocumentExtractionPanel.tsx` (line ~938, "Apply selections")
  - `src/components/admin/DatabaseTab.tsx` (line ~305, "Check Sync Status")
  - `src/components/admin/ai-agents/RebeccaFixturesPanel.tsx` (Save button)
  - `src/components/admin/ai/KnowledgeBaseEditor.tsx` (Create/Edit KB buttons)
  - `src/components/admin/model-defaults/constants/OverrideDialog.tsx` (Save button)

**Approach:**
- Pattern: `{isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <IconAction className="w-4 h-4" />}` + `disabled={isPending}`
- For `SaveButton`-wrapped cases, use the `isPending` prop instead of inline spinner

**Test scenarios:**
- Test expectation: none — loading state additions are purely visual. Manual verification: trigger the async action, observe spinner.

**Verification:**
- Each listed button shows spinner when its mutation is in-flight
- `pnpm run typecheck` clean

---

- U6. **Migrate 111 native `<button>` elements to shadcn `<Button>`**

**Goal:** Replace every raw `<button` element with `<Button>` from `@/components/ui/button`.

**Requirements:** R3

**Dependencies:** None (parallel — but do after U1–U3 to avoid conflicts)

**Files:**
- Modify: (all ~30 files with native buttons — audit grep: `grep -rn "<button" src/ --include="*.tsx"`)
  - `src/components/admin/ComplianceTab.tsx` — filter chip buttons
  - `src/components/admin/resources/ResourcesTab.tsx` — jump-to-resource buttons
  - `src/components/PropertyMap.tsx` — map control buttons
  - `src/components/AddressAutocomplete.tsx` — autocomplete items
  - `src/components/research/StarRatingInput.tsx` — star rating buttons
  - (full list from audit)

**Approach:**
- Default migration: `<button onClick={...} className="...">` → `<Button variant="ghost" onClick={...}>` (most native buttons are non-primary)
- Map controls: `variant="outline" size="icon"`
- Star rating: `variant="ghost" size="icon"` with `aria-label="Rate N stars"`
- Autocomplete items: `variant="ghost"` with full-width styling
- Remove all custom hover/focus CSS from migrated elements — shadcn handles it

**Test scenarios:**
- Happy path: ComplianceTab filter chips render identically and are clickable
- Happy path: StarRatingInput selects rating on click
- Edge case: map controls do not break map interaction (test on live preview)

**Verification:**
- `grep -rn "<button" src/ --include="*.tsx"` returns zero results (or only comments/attributes)
- `pnpm run typecheck` clean
- Visual smoke test: star rating, map controls, autocomplete still functional

---

- U7. **Standardize Cancel to `variant="outline"` and consolidate DialogFooter patterns**

**Goal:** All Cancel buttons in dialog footers use `variant="outline"`. All `DialogFooter` className values use one of three canonical patterns.

**Requirements:** R6, R7

**Dependencies:** None (parallel)

**Files:**
- Modify: (~35 dialog files with ghost Cancel buttons and non-canonical footer classNames)
  - Files identified by audit: grep `variant="ghost"` in `DialogFooter` context

**Approach:**
- Canonical DialogFooter patterns (document in a comment block in `dialog.tsx` or as a code comment near the first usage):
  1. Default (responsive stack): `"flex-col sm:flex-row gap-2"`
  2. With top border: `"flex-col sm:flex-row gap-2 border-t border-border pt-4"`
  3. Right-aligned: `"flex-col sm:flex-row gap-2 sm:justify-end"`
- Change all `variant="ghost"` Cancel buttons inside `DialogFooter` to `variant="outline"`
- Collapse `"gap-2 sm:gap-2"` (redundant) → `"gap-2"`
- Collapse `"border-t border-border pt-3"` → `"border-t border-border pt-4"` (standardize to pt-4)

**Test scenarios:**
- Test expectation: none — visual-only changes. Verified by grep.

**Verification:**
- `grep -rn 'variant="ghost"' src/components --include="*.tsx" | grep -i "cancel"` returns zero results
- All `DialogFooter` className values match one of the three canonical patterns

---

## System-Wide Impact

- **Interaction graph:** Removing `AnalystValidationBanner` and `IntelligenceStatusBar` affects `CompanyAssumptionsTabsView.tsx`, `PropertyEdit.tsx`, and any component that imported them. Removing `SaveWithAnalystGate` affects the Company Assumptions save flow. All are rendering-only changes with no data or state impact.
- **Error propagation:** No change. Banner removal does not affect error handling.
- **State lifecycle risks:** `computeFreshnessStatus` is preserved and continues to drive the `AnalystButton` freshness dot. No state regression.
- **API surface parity:** No API changes. Purely frontend rendering.
- **Unchanged invariants:** `AnalystButton` `freshnessStatus` prop and freshness dot behavior are untouched. The Analyst trigger functionality is preserved in every location — only the surrounding banner is removed.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U6 (111 native button migrations) touches many files — high chance of Replit Agent auto-commits contaminating the branch | Create a dedicated CC branch immediately; apply CC branch hygiene check before merge |
| A caller of `AnalystValidationBanner.onAcceptRange` loses that functionality without replacement | Inventory callers in U1 before deleting; if used, wire to `AnalystCheckDialog` |
| `AssumptionsGate` redesign (U3) could make the missing-tab notice less visible and confuse users | Keep the tab chips (navigational), use bold heading font; test on both light and dark theme |
| Native button migration (U6) may affect keyboard navigation or focus rings in map/autocomplete contexts | Smoke test map controls and autocomplete on live preview after migration |

---

## Sources & References

- Button audit: conducted 2026-05-10 (this session) — 833+ buttons surveyed
- Analyst button skills: `.agents/skills/analyst-research-buttons/SKILL.md`, `.agents/skills/analyst-intelligence-display/SKILL.md`
- Canonical display pattern: `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md`
- Branch hygiene: `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md`
