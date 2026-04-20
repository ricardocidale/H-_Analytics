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

Steady State sits **near the bottom of the Admin sidebar** (last position, or just above Testing & Verification / Reports & Exports). It is foundational reference data, not daily-use; surfacing it at the top would over-emphasize it relative to operational pages.

```
Admin
├── Management Company
├── Properties
├── Analyst                                   ← see ANALYST.md
├── Users
├── Scenarios
├── Rebecca                                   ← see Rebecca persona docs
├── Themes & Appearance
├── App Settings
├── Reports & Exports
├── Testing & Verification
└── Steady State                              ← bottom of sidebar
    ├── Defaults                              ← admin-editable seed values
    │   ├── Management Company  (tab)         ← canonical example
    │   ├── Property            (tab)         ← same pattern, different entity
    │   └── …                   (tab per entity)
    └── Constants                             ← admin-editable with strong advisory; never user-editable
        ├── Tax & Depreciation  (tab)
        ├── GAAP / USALI        (tab)
        ├── Macro & FX          (tab)
        └── …                   (tab per category)
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

**Constants are never user-editable.** End users see a constant only as **FYI** — a small inline reference next to the assumption field whose calculation it informs (e.g., next to a depreciation input: *"IRS publishes 39.5 years for non-residential real property — applied automatically unless overridden in Admin."*). The user has no editing affordance for the constant itself.

**Admins can edit constants** in the Constants tab, but the card UI must:

- Display the **source name** (e.g., "IRS Publication 946"), the **URL**, the **date the value was acquired**, the **publisher's stated effective date**, and the **publisher's version**.
- Show an **advisory line** above the input: *"This value is published by an external authority. Editing it makes your model deviate from authority guidance. Document why before saving."*
- Provide a **required reason field** that captures why the admin is overriding the authority. The reason persists with the override and shows in audit logs.
- Surface a **"Refresh from source"** action for cases where the external publisher has issued an update.

The Save semantic is universal: even on a Constants edit, the admin must click Save to confirm "I have seen this and want this change effected." Save is never automatic.

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

When the user attempts to leave a tab or page with unsaved changes (route change, tab switch, browser back, page close), the app opens a dialog with **two** options:

- **Save** — commit the edits, run the analyst, then proceed with the navigation.
- **Cancel** — discard the in-flight edits, **revert every field on this tab to the values that were in place when the user entered the tab**, then proceed with the navigation. "As the user found them" means the entry-state snapshot — *not* the original defaults, *not* an empty form. If the user came back to a tab they had previously saved, Cancel returns them to their previously-saved state, not to factory seeds.

The dialog uses neutral wording ("You have unsaved changes on this tab — Save or Cancel?") — never a scare prompt. The Save semantic is universal: Save = "I have seen these values and want this change effected."

### 4.4 First-entry vs return-entry behavior is identical

The Save button behavior, the reminder dialog, and the revert semantics are the same whether this is the user's first visit to a tab or their hundredth. The only difference is what "the values at entry" resolves to:

- First visit: the admin-set defaults.
- Return visit: the user's last-saved assumptions.

The page does not distinguish in UI; the underlying state machine handles it.

---

## 4a. The hardcoding exception — math and physics only

**Default rule: nothing is hardcoded.** Every value, threshold, label, and parameter is seeded in the database, editable by admin (or release-managed for Constants), and overridable by the user (Defaults only).

**The narrow exception** — values that may be hardcoded in code:

- **Mathematical identities** — `Math.PI`, `1/12 months per year`, `100 cents per dollar`. They are not subject to publisher disagreement.
- **Physical constants** — speed of light, gravity. Not relevant to this domain but the principle is the same.
- **Pure code structure** — array lengths, loop bounds, regex patterns governing string parsing.

**The disqualifier**: if any reasonable admin might want to set the value differently, it is not eligible for hardcoding. The clearest test:

- ✅ **30.5 days per month** (GAAP convention for monthly accounting averages) — *can* be hardcoded. Math/convention, no admin will rationally override it.
- ❌ **39.5 years for non-residential depreciation** (IRS Pub 946) — *cannot* be hardcoded. An admin may have a legitimate reason to deviate from authority guidance; the value must live as a Constant in the DB with full source provenance and an advisory.
- ❌ **A "default" inflation rate of 2.5%** — *cannot* be hardcoded. It is a Default; it must be admin-set in Steady State → Defaults.

**Why the line matters**: hardcoding an authority-dictated value silently locks the model into one publisher's opinion. The first time an admin asks "can we use a different depreciation life for this scenario?" and the answer is "we'd have to ship a code change" is the moment the architecture has failed.

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
- [ ] "Save" commits and proceeds with the navigation.
- [ ] "Cancel" restores the entry snapshot exactly (every field) and proceeds with the navigation.
- [ ] On a Constants edit, the admin must supply the required override-reason before Save will commit.

---

## 7. Defaults — locked tree

This is the authoritative tree under Steady State → Defaults. Anything not in this tree is not a Default and must live elsewhere (Constants, Themes & Appearance, Reports & Exports, Users, Analyst, App Settings, or as a runtime user artifact).

```
Steady State
└── Defaults
    │   PRIMARY TABS  (horizontal, sticky, ?tab= URL param)
    │
    ├── 1. Management Company         ← canonical example, mirrors front-of-app exactly
    │   SUB-TABS  (mirror the 6 front-of-app CompanyAssumptions tabs verbatim)
    │   ├── Company             [card grid]
    │   ├── Funding             [card grid]   ← includes cost of equity, exit revenue multiple
    │   ├── Revenue Model       [card grid]
    │   ├── Compensation        [card grid]
    │   ├── Overhead            [card grid]
    │   └── Property Defaults   [card grid]   ← per-property template seeds the MC applies
    │
    ├── 2. Property                   ← collection-level concerns; per-type seed values live under MC → Property Defaults
    │   SUB-TABS
    │   ├── Type Catalogue      [card grid]   ← what property types exist (luxury, upper-upscale, etc.)
    │   ├── Service Catalogue   [card grid]   ← services / amenities that can be attached
    │   ├── Asset Defaults      [card grid]   ← default photos, hero images, brand placeholders
    │   └── Lifecycle           [card grid]   ← acquisition, hold, disposition seeds per type
    │
    └── 3. Macro & Market             ← only Norfolk-curated seeds; authority feeds (FRED, Treasury, STR) live on the Constants page
        SUB-TABS
        ├── Macro                [card grid]   ← inflation seed, WACC component weights
        └── Market               [card grid]   ← comp-set catalogue, seasonality curves, market benchmark seeds
```

### 7.1 Excluded from Defaults — and where each lives instead

| Concept | Lives in | Reason |
|---|---|---|
| Scenarios (named snapshots of assumptions + properties) | Front-of-app `Scenarios` page | User-created runtime artifact, not a seed value |
| Report layouts, KPI surfacing, export formats | Reports & Exports sidebar block | Presentation preference, not a model assumption |
| Theme colors, fonts, dark/light | Themes & Appearance | Presentation, not a model assumption |
| Default user role, RBAC | Users sidebar block | Governance, not a model assumption |
| Rebecca persona / voice | Rebecca sidebar block | Operational behavior, not a seed value |
| Analyst model selection, conviction thresholds | Analyst sidebar block | Engine config, not a seed value |
| FX rates (FRED), risk-free rate (Treasury), STR/CBRE benchmarks (licensed) | Steady State → Constants | Authority-published, sourced and dated; admin-overridable only with reason field |

### 7.2 Counts and sizing targets

- 3 primary tabs · 12 sub-tabs total · target ≈30–45 cards.
- Each card has 2–6 fields.
- Each sub-tab has at least 2 cards.

### 7.3 Open design questions still to resolve before build

- **Save granularity** — per-card vs per-sub-tab. Unresolved.
- **Macro & Market splits** — final per-row constants/defaults assignment when we draft the Constants page (FRED feeds, Treasury, STR licensing) is provisional until source-by-source verification.
- **Provenance display density** — full provenance line on every card vs collapsed-by-default.
- **Analyst-suggests UX** — inline accept on the card vs a separate Pending Proposals queue.

---

## 8. Why this pattern is the canonical example

The Management Company Defaults tab is built first because it is the simplest case (single entity, no sub-collections, all seeds are scalar or short list values). Once that is shipped:

- **Property** uses the same pattern with one twist — Property is a collection (the HMC manages multiple SPVs), so the Property Defaults tab in Admin sets the seed *template* applied to each new property the user creates. Per-property edits on the front-of-app then follow the same Save contract per property.
- **Future entities** (e.g., Brands, Markets, Comp Sets) inherit the same pattern unchanged.

The contract above is the template. Anything that diverges from it must file an ADR explaining why.
