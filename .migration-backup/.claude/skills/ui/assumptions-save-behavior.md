---
domain: ui
scope: global
audience: all-ai-coders
priority: critical
---

# Assumptions Save Behavior — Mandatory Rules

Every page in the app that contains inputs, selections, or assumptions MUST follow these rules.
No exceptions. This skill defines the save contract between the user and the app.

---

## 1. The Save Contract

When a user visits a page with editable values — whether default/seed values or previously
saved values — the act of viewing means endorsement. The app treats every visit as a
potential acceptance of the values shown.

### Core Principle
> Default values become a solid part of the scenario once the user has seen them.
> The app must capture that endorsement, either via explicit Save or auto-save.

---

## 2. Save Button (Always Present)

Every page with inputs, assumptions, or selections MUST have a visible Save button.

- Use the `SaveButton` component from `client/src/components/ui/save-button.tsx`
- Label is always **"Save"** (never "Update", "Submit", or "Apply")
- Button should be enabled whenever the page has values — not only when dirty
- On first visit (no prior save), the button should pulse or glow to encourage the user

---

## 3. First-Visit Behavior

Track whether a user has ever saved a given page. Stored per-user per-page in the database.

### First Visit Detection
- If no save record exists for this user + page combination, treat as first visit
- On first visit, the page should:
  1. Display a gentle banner or toast: "These are the default values. Review them and save to confirm."
  2. Pulse the Save button (use `animate-intelligence-pulse` CSS class)
  3. Encourage "Ask the Analyst" so ranges are updated and defaults are refreshed

### After First Save
- The page is marked as "visited and endorsed" in the database
- Subsequent visits show the saved values without the first-visit banner
- The Save button still appears but no longer pulses unless there are changes

### Non-Visit Rule
- If compulsory fields are NOT completed and the user leaves, the visit does NOT count
- The app behaves as if the user was never there
- Next time they arrive, it's still treated as a first visit

---

## 4. Compulsory Fields

Pages may have fields that must be completed before the user can proceed.

### Rules
- Compulsory fields are visually marked (e.g., red asterisk, highlighted border)
- Downstream fields on the same page are disabled/locked until compulsory fields are filled
- The Save button is disabled until all compulsory fields have values
- If the user leaves without completing compulsory fields → non-visit (see above)
- The app should not allow partial saves when compulsory fields are empty

### Examples of Compulsory Fields
- Property name, location, business model type (on property creation)
- Room count, ADR, occupancy (on property assumptions)
- Company name (on management company page)

---

## 5. Auto-Save on Navigate Away

If the user navigates away from a page with unsaved changes (and compulsory fields ARE complete):

### Behavior
1. **Show a toast notification**: "Your changes have been saved automatically"
2. **Auto-save the values** — no confirmation dialog, no blocking
3. The save happens silently in the background
4. This applies to both browser navigation (clicking sidebar links) and browser close

### Implementation
- Use `wouter` route change detection or `beforeunload` for browser close
- Call the same save mutation that the Save button uses
- Log the auto-save in the activity log for audit trail

### When NOT to Auto-Save
- If compulsory fields are incomplete → do not save, do not mark as visited
- If the page data failed validation → show an error toast instead

---

## 6. Intelligence Regeneration ("Ask the Analyst")

After the user clicks "Ask the Analyst" and new intelligence arrives:

### Compulsory Save
- The app MUST save the page after intelligence is applied
- Show a toast: "The Analyst's recommendations applied and saved"
- This is non-negotiable — regenerated intelligence always triggers a save

### Nudging the User to Ask the Analyst
The app should actively encourage users to "Ask the Analyst":

- **Glowing button**: Use `animate-intelligence-pulse` CSS class on the "Ask the Analyst" button
  when the intelligence status is "Not yet reviewed" or "Due for review"
- **Status indicator**: Use `IntelligenceStatusBar` to show review status
- **First-visit prompt**: On first visit, show a prompt like:
  "The Analyst can review your assumptions and suggest ranges based on comparable properties.
  Click 'Ask the Analyst' to get started."
- **Stale data nudge**: If intelligence is older than 24 hours, show a subtle animated icon
  next to the button to draw attention

### Intelligence Staleness Thresholds
- **Up to date**: < 24 hours since The Analyst last reviewed
- **Due for review**: 1-30 days
- **Overdue**: > 30 days
- **Not yet reviewed**: The Analyst hasn't reviewed these yet

---

## 7. Scenario Integration

Saved assumption values become part of the active scenario.

### Save Flow
1. User edits values on an assumptions page
2. User clicks Save (or auto-save triggers)
3. Values are persisted to the database immediately
4. When the user saves a scenario (or logs out), the current state is captured
5. The scenario snapshot includes all endorsed values from all pages

### Auto-Save on Logout
- When the user logs out or the session expires, auto-save any dirty pages
- This ensures no work is lost

---

## 8. Compliance Checklist

For every page with inputs, verify:

- [ ] Has a Save button (using `SaveButton` component)
- [ ] Save button label is "Save" (not "Update")
- [ ] First-visit detection implemented (per-user per-page tracking)
- [ ] First-visit banner/toast shown on initial visit
- [ ] Save button pulses on first visit (`animate-intelligence-pulse`)
- [ ] "Ask the Analyst" button present (if page has researchable assumptions)
- [ ] "Ask the Analyst" button glows when intelligence is stale/missing
- [ ] Compulsory fields marked and enforced (downstream fields disabled)
- [ ] Auto-save triggers on navigate away (with toast)
- [ ] Compulsory save after intelligence regeneration
- [ ] Non-visit rule enforced (incomplete compulsory fields = no visit recorded)
- [ ] `data-testid` attributes on Save button and "Ask the Analyst" button

---

## 9. Pages That Must Comply

| Page | Route | Key Compulsory Fields |
|------|-------|----------------------|
| Property Assumptions | `/property/:id/edit` | name, location, businessModel, roomCount, adr, occupancy |
| Company Assumptions | `/company/assumptions` | companyName |
| Management Company | `/company` | companyName (display), logo |
| ICP Definition | `/icp` | At least one criterion selected |
| Admin Model Defaults | Admin > Model Defaults | None (all have defaults) |
| Simulation | `/analysis` | At least one property selected |

---

## 10. Key Files

| File | Purpose |
|------|---------|
| `client/src/components/ui/save-button.tsx` | Reusable Save button component |
| `client/src/lib/scenario-dirty-state.ts` | Global dirty-state tracking (Zustand) |
| `client/src/components/intelligence/IntelligenceStatusBar.tsx` | Review status + "Ask the Analyst" |
| `client/src/index.css` | `.animate-intelligence-pulse` keyframes |
| `client/src/pages/PropertyEdit.tsx` | Primary example of assumptions page |
| `client/src/pages/CompanyAssumptions.tsx` | Company-level assumptions page |
