---
name: hplus-form-actions
description: >
  Save / Cancel / Analyst button discipline for H+ Analytics. Defines when
  each button appears, their canonical order and visual treatment, how to
  handle three-button density on constrained layouts, and the exact behavior
  of Cancel at each assumption lifecycle state. Load for any work that adds
  or modifies Save, Cancel, or Analyst buttons on any page or component.
---

# H+ Analytics — Form Action Buttons

Related skills: `hplus-assumption-lifecycle` (the CONFIRMED lifecycle that Save
enforces), `hplus-variable-taxonomy` (what each button is confirming).

---

## The three action types

Every editable section in H+ can have up to three action buttons. Each has a
distinct role. Never merge them or use one in place of another.

| Button | Purpose | When present |
|---|---|---|
| **Save** | Confirms the user accepts the current values, transitioning fields from DEFAULT-POPULATED → CONFIRMED | Always present on any section where the user can view or edit assumption variables |
| **Cancel** | Discards unsaved edits, restoring the last committed state | Present whenever Save is present and the user may have made edits |
| **Analyst** | Triggers an AI agent to research, regenerate, or propose new values for the section | Present on sections where AI-driven research or generation is available |

---

## Save — confirmation, not mutation

Save in H+ is not a form submission. It is the user's explicit confirmation
that the values they see are what they want, whether or not they changed
anything. This distinction matters:

- **Always enabled.** Never disable Save because "nothing changed." The user
  must be able to confirm the pre-populated defaults. Disabling Save teaches
  the user that the app already agreed for them — it does not.
- **No "nothing to save" state.** Do not show "No changes to save" toasts or
  disable the button based on dirty-state detection.
- **What pressing Save does:** for each field in the section, the DB value is
  written (or re-written) and its provenance transitions to CONFIRMED. Future
  admin changes to DEFAULT_* constants will no longer affect this field.

See `hplus-assumption-lifecycle` for the full UNSET → DEFAULT-POPULATED →
CONFIRMED lifecycle.

---

## Cancel — restore, not clear

Cancel discards unsaved edits and restores the last committed state:

| Field state | What Cancel restores |
|---|---|
| CONFIRMED | The last value the user pressed Save on (the DB value) |
| DEFAULT-POPULATED (never saved) | The current admin default as it was when the page loaded |
| UNSET | The field reverts to empty / placeholder state |

**Cancel does not clear fields to blank.** It restores. A user who opens a
form, changes a number, then presses Cancel should see exactly what they saw
when the form first loaded — not a blank input.

**Cancel should not navigate away.** It is an inline action that resets the
form state. Navigation away from a page with unsaved changes uses the
`AnalystUnsavedChangesDialog` component, not Cancel.

---

## Analyst — always named "Analyst"

The Analyst button always:
- Uses the `AnalystActionButton` component from `@/components/analyst`
- Carries the label "Analyst" (idle) / "Studying…" (running)
- Uses the amber/gold visual treatment (built into the component)
- Shows a tooltip describing what the Analyst will do for this specific section

Never rename it. Never use a different icon. The consistent name is load-bearing
for user mental models: "Analyst = AI proposes values, Save = I confirm values."

---

## Canonical button order

When all three buttons are present, left-to-right order is:

```
[Analyst]  [Cancel]  [Save]
```

- **Save** — rightmost. Primary action. The destination the user is moving toward.
- **Cancel** — left of Save. Escape. Keeps Save and Cancel spatially paired so
  the user's eye tracks the confirm/discard decision as a unit.
- **Analyst** — leftmost. A different category of action (AI, not data). Visual
  separation from the Save/Cancel pair signals it does something different.

---

## Handling button density

Three buttons in a row can crowd narrow layouts. Preferred solutions in order:

### 1. Icon-only Analyst button on tight rows

The `AnalystActionButton` supports being rendered icon-only by callers when
space is constrained. Show only the Sparkles icon with a tooltip; drop the
"Analyst" label. The tooltip must describe the action. Use this on inline
field rows (e.g., a single number input with Save alongside it).

```tsx
// Compact: icon-only Analyst + text Save/Cancel
<AnalystActionButton onClick={...} size="sm" label="" />
<Button variant="ghost" size="sm">Cancel</Button>
<Button size="sm">Save</Button>
```

### 2. Overflow menu for secondary actions

If a section has more than three actions, promote the two most common to
the button row (typically Save + Analyst) and move the rest (Export, Clone,
Reset to Default) into a `...` overflow `DropdownMenu`. Cancel stays in
the primary row — it is always a first-class escape action.

### 3. Sticky action bar for long forms

For full-page edit forms (PropertyEdit, CompanyAssumptions) where the Save
button would scroll off screen, render the button row in a sticky bar at the
bottom of the page:

```tsx
<div className="sticky bottom-0 border-t bg-background px-6 py-3 flex items-center justify-between">
  <AnalystActionButton ... />
  <div className="flex gap-2">
    <Button variant="ghost">Cancel</Button>
    <Button>Save</Button>
  </div>
</div>
```

The Analyst button stays left-anchored; Save/Cancel are right-anchored so
the primary action is near the user's scroll thumb.

### 4. "Save" with context noun — only when ambiguous

Use bare "Save" by default. Add a context noun only when multiple Save buttons
coexist on the same viewport (e.g., multi-tab pages where each tab has its own
Save). In that case: "Save Slide 4", "Save Slide 6", etc.

**Do not add the noun just because the section has a title.** Next to a
platform fee input labeled "Platform Fee Rate," the button "Save" is
unambiguous. "Save Platform Fee Rate" is redundant.

---

## What NOT to do

- **Do not disable Save** based on dirty state. See Save section above.
- **Do not rename Analyst** to "Generate", "Refresh", "Run", "Regenerate",
  or any other verb. The name is a product contract, not a description of the
  current action.
- **Do not put Cancel before Analyst** in the button row. Analyst is always
  leftmost.
- **Do not use Cancel to navigate away.** Navigation-away warnings use
  `UnsavedExitDialog` (see below), not Cancel and not `AnalystUnsavedChangesDialog`.
- **Do not show all three buttons on sections where Analyst is not available.**
  If the section has no AI research capability, omit Analyst entirely — do not
  show a disabled Analyst button as a placeholder.

---

## Navigation-exit dialogs — two distinct components, never conflated

### `AnalystUnsavedChangesDialog`
- **When:** User clicks the **Analyst** button while the form is dirty.
- **Why:** The Analyst reads from the database, not from in-flight edits. The
  user must decide whether to save first or run on the last-saved state.
- **Buttons (3):** Save & Analyze / Continue with last saved / Cancel
- **Component:** `@/components/analyst/AnalystUnsavedChangesDialog`

### `UnsavedExitDialog`
- **When:** User navigates **away from the page** (sidebar, breadcrumb, route
  change, admin section switch, tab switch within Model Defaults) while dirty.
- **Why:** Prevents silent data loss when the user leaves without endorsing.
- **Buttons (2):** Save / Leave without saving
- **Component:** `@/components/ui/unsaved-exit-dialog` (new — 2026-05-17 plan)
- **Hook:** `useUnsavedExitGuard({ isDirty, onSave })` — wraps navigation
  triggers with `confirmLeave(callback)`; also registers `beforeunload` as a
  secondary safety net for browser tab-close.

**Never use `AnalystUnsavedChangesDialog` for a navigation exit.** Its 3-button
layout implies the Analyst will run — confusing when the user just clicked Back.

---

## Quick reference — common patterns

**Inline field row (compact):**
```
[✦]  [Cancel]  [Save]
  ↑ icon-only Analyst
```

**Section card (standard):**
```
[Analyst]  [Cancel]  [Save]
```

**Full-page form (sticky footer):**
```
[Analyst]          [Cancel] [Save]
  ↑ left-anchored    ↑ right-anchored
```

**Multi-tab page with per-tab saves:**
```
[Analyst]  [Cancel]  [Save Slide 4]
```
