# Steady State — Admin IA + Save UX Contract

**Status**: Canonical pattern (Apr 20, 2026). Applies to all assumption pages: Management Company, Property, and any future entity that exposes user-editable inputs.

This document defines (a) where Constants and Defaults live in the Admin IA, (b) the cascade rule from seed → user, and (c) the Save UX every assumption page must honor. Read alongside `.claude/skills/vocabulary/SKILL.md §0` (the Constants vs Defaults vs Assumptions three-tier rule).

---

## 1. Concept: Steady State

**Steady State** = the canonical "starting position" of the app — the values an end user sees the very first time they land on any assumption page, before they have personalized anything. It is the union of two distinct, non-overlapping data classes:

- **Constants** — values nobody edits at runtime (tax-code depreciation lives, GAAP/USALI line definitions, FX rates ingested by the engine, brand-vocabulary tokens). Sourced from external authority (IRS, GAAP, ISO, country tax agencies). Dated and cited.
- **Defaults** — admin-editable seed values that The Analyst suggests with citations and an admin approves. Applied to a user's working variables only on first encounter, never again.

Steady State exists for one reason: **nothing is ever hardcoded.** Every value, string, threshold, and parameter the app uses must be seedable in the database, editable in Admin (defaults) or a release process (constants), and overridable by the end user (defaults only — constants are never overridden by users).

---

## 2. Admin Information Architecture

```
Admin
├── …
├── Steady State                              ← new top-level section
│   ├── Defaults                              ← admin-editable seed values
│   │   ├── Management Company  (tab)         ← canonical example
│   │   ├── Property            (tab)         ← same pattern, different entity
│   │   └── …                   (tab per entity)
│   └── Constants                             ← read-mostly authority values
│       ├── Tax & Depreciation  (tab)
│       ├── GAAP / USALI        (tab)
│       ├── Macro & FX          (tab)
│       └── …                   (tab per category)
├── Analyst                                   ← see ANALYST.md
├── Rebecca                                   ← see Rebecca persona docs
└── …
```

**Why two children, not one:** Constants and Defaults are governed differently. Constants change only when an external authority publishes a new rate or a new standard (release-managed, sourced, dated). Defaults change whenever The Analyst proposes a new seed and an admin approves it (workflow-managed, citation-required). Mixing them in one screen leaks the wrong mental model into Admin.

### 2.1 Defaults page layout

Each entity tab (Management Company, Property, …) is a card grid. Each card is one logical group of seeds — for example on **Management Company**:

- Setup card (market, segment, fiscal year, country)
- Funding card (default raise size, capital-raise instrument terms, valuation seed)
- Revenue Model card (base/incentive fee bands, ramp curve seed)
- Compensation card (exec hiring schedule seed, comp-band seeds)
- Overhead card (T&E, marketing, fixed/variable mix seeds)
- Tax & Exit card (depreciation choices, exit-multiple seed, hold-period seed)
- Property Defaults card (per-ICP-type seeds: ADR, occupancy, RevPAR ranges)

Each card shows: current default value, source pointer / citation, last-updated timestamp + admin who approved, an inline "Analyst suggests" line if a fresher proposal is pending.

### 2.2 Constants page layout

Same card-grid pattern, but each card is read-mostly. Edits require a release process (versioned source pointer, dated). The only inline write action is "Refresh from source" (when an external publisher has issued a new value).

### 2.3 Vocabulary in Admin

Inside Admin (and only inside Admin), the words **"default"** and **"constant"** are allowed and expected. Outside Admin, the rule from `vocabulary/SKILL.md §0` holds: user-facing copy never says "default" — it says "assumption" (the user's working variable) or names the field directly.

---

## 3. Cascade rule (constant → default → assumption)

The flow, in order, is **always**:

1. **Constant** — engine reads the constant via `getEffectiveConstant` (resolution order: `manual > analyst > factory`).
2. **Default** — first time a user lands on an assumption page, the unset working variables are seeded from the admin-approved defaults (`model_constant_overrides` and the seed tables).
3. **Assumption** — the instant the user clicks **Save** on a tab, every field on that tab becomes the user's assumption — even fields they never touched. The defaults no longer apply to that user; the user's working variables are now the source of truth for downstream calculations and for The Analyst's grading.

The cascade is **one-directional and never collapses to two tiers**. A "default" is never an "assumption" and never a "constant"; an "assumption" is never a "default."

**The Analyst grades assumptions, not seeds.** Once the user has saved, the verdict is computed against the user's working variables. Telling the user "your default is wrong" is a vocabulary bug — it should say "your assumption for X looks low against the comp set," because once they saved, it's their assumption.

**During development, the engineer sees defaults.** Because no environment ships with prior user assumptions, every dev run starts from Steady State. This is intentional — it gives an honest preview of what a brand-new user will see. Engineers must not hardcode test values to "skip past" Steady State.

---

## 4. Save UX contract

This applies to every assumption page and every tab inside an assumption page (Management Company tabs, Property tabs, future entity tabs). The pattern has four mandatory behaviors:

### 4.1 Save button is never disabled on entry

**Wrong:** the Save button starts greyed-out and only enables after a field changes.

**Right:** the Save button is active the moment the page renders. The reason: the user must affirmatively confirm the values on the page, even if they haven't changed anything. On first entry, the values shown are the admin-set defaults — the user clicking Save is the act that converts them to the user's assumptions. Without an active Save button, the user can't perform that conversion without first making (and undoing) a phantom edit.

### 4.2 Save is per tab

Each tab's Save commits **that tab's fields only** and triggers The Analyst for that tab's specialist. A user editing the Funding tab and then clicking the Funding Save does not commit pending edits on other tabs.

### 4.3 Navigation-away triggers a save reminder dialog

When the user attempts to leave a tab or page with unsaved changes (route change, tab switch, browser back, page close), the app opens a dialog with three options:

- **Save** — commit the edits, run the analyst, then proceed with the navigation.
- **Don't save** — discard the in-flight edits, **revert every field on this tab to the values that were in place when the user entered the tab**, then proceed. The reverted state is what was on the page at entry — *not* the original defaults, *not* an empty form. This matters: if the user came back to a tab they had previously saved, "don't save" returns them to their previously saved state, not to factory seeds.
- **Cancel** — close the dialog and stay on the page with the edits intact.

The dialog uses neutral wording ("You have unsaved changes on this tab") — never a scare prompt.

### 4.4 First-entry vs return-entry behavior is identical

The Save button behavior, the reminder dialog, and the revert semantics are the same whether this is the user's first visit to a tab or their hundredth. The only difference is what "the values at entry" resolves to:

- First visit: the admin-set defaults.
- Return visit: the user's last-saved assumptions.

The page does not distinguish in UI; the underlying state machine handles it.

---

## 5. Implementation contract checklist

Any page or tab in scope must:

- [ ] Render initial values from a server-fetched seed (defaults on first visit, last-saved assumptions otherwise) — **no hardcoded fallbacks**.
- [ ] Expose a Save button that is enabled on initial render.
- [ ] Treat Save as committing all fields on the tab, not just dirty fields.
- [ ] Trigger the matching Analyst Surface Specialist on Save.
- [ ] Capture an "entry snapshot" of all field values when the tab mounts, for revert-on-decline.
- [ ] Intercept route changes, tab switches, and unload events when there are unsaved edits.
- [ ] Show the three-option save reminder dialog (Save / Don't save / Cancel).
- [ ] On "Don't save," restore every field to the entry snapshot, then proceed.
- [ ] Never use the word "default" in user-facing copy. Use "assumption" or the field name.

## 6. Test contract

Each page in scope must ship with tests that prove:

- [ ] Initial render shows admin-set defaults on a fresh user account.
- [ ] Initial render shows last-saved assumptions on a returning user.
- [ ] Save button is enabled on initial render with no edits.
- [ ] Clicking Save with no edits still commits the values as assumptions and triggers the specialist.
- [ ] Editing a field and navigating away opens the save reminder dialog.
- [ ] "Don't save" restores the entry snapshot exactly (every field).
- [ ] "Save" commits and proceeds with the navigation.
- [ ] "Cancel" stays on the page with edits intact.

---

## 7. Why this pattern is the canonical example

The Management Company Defaults tab is built first because it is the simplest case (single entity, no sub-collections, all seeds are scalar or short list values). Once that is shipped:

- **Property** uses the same pattern with one twist — Property is a collection (the HMC manages multiple SPVs), so the Property Defaults tab in Admin sets the seed *template* applied to each new property the user creates. Per-property edits on the front-of-app then follow the same Save contract per property.
- **Future entities** (e.g., Brands, Markets, Comp Sets) inherit the same pattern unchanged.

The contract above is the template. Anything that diverges from it must file an ADR explaining why.
