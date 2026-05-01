# Pressing the Analyst button saves the tab

> **Binding UX rule.** When the user presses `<AnalystButton />` on
> any assumption tab, the click MUST persist the current tab's
> in-flight edits BEFORE running the Specialist. The user does not
> need to click Save first. There is no "unsaved changes" gate
> between editing and asking The Analyst.

## Why

The Analyst evaluates whatever the user just typed. A separate Save
step before pressing the Analyst button creates three failure modes
the user has to think about:

1. **Forgotten Save.** User edits a field, presses the Analyst button,
   gets a verdict that reflects the *prior* value. The verdict is
   technically correct but contextually wrong, and the user can't tell
   the difference.
2. **Modal interruption.** A "you have unsaved changes" dialog blocks
   the click and forces a 3-button decision (Cancel / Continue with
   last-saved / Save and analyze). That dialog is a UX tax for a
   decision the system can make on the user's behalf — they pressed
   Analyst, of course they want their current edits considered.
3. **Two-button cognitive load.** "Save then Analyst" is two muscle
   movements where one suffices. A real-estate analyst reading their
   own model doesn't separate "save my spreadsheet" from "look at the
   numbers" — neither should we.

## What this requires

On any assumption tab where `<AnalystButton />` lives:

1. **Click handler order is fixed.** Press → validate → save → run
   Analyst → render verdict. Save and Analyst-trigger are part of one
   logical action, not two.
2. **Save is silent on success.** No toast that says "Saved" before the
   verdict appears. The verdict appearing IS the success signal. A
   toast only appears if save FAILED, in which case the Analyst run is
   aborted and the user sees a clear "couldn't save your edits — fix
   X and try again" message.
3. **No unsaved-changes dialog.** Any modal that asks the user to
   choose between "save first" / "ignore edits" / "cancel" before the
   Analyst runs is forbidden. Delete it.
4. **The standalone Save button stays.** Users who want to save
   without invoking The Analyst (e.g. they're mid-edit and stepping
   away) still need a Save affordance. The rule is that pressing
   Analyst makes Save *implicit*, not that Save disappears.
5. **Validation errors block both.** If the form has invalid input
   (e.g. negative occupancy), pressing Analyst surfaces the same
   validation errors as pressing Save would, and does NOT run The
   Analyst. The user fixes the errors and presses Analyst again.

## What's still allowed

- A loading spinner / progress indicator on the Analyst button while
  the save + run is in flight.
- A single combined error toast if save OR analyst-run fails (with
  enough detail to act on — "couldn't save: <field> required" vs
  "couldn't reach The Analyst: try again").
- The pre-run "missing required information" prompt (different
  surface — that's about *unfilled* fields the Specialist needs, not
  *unsaved* edits to filled fields). The required-info prompt fires
  AFTER the silent save completes, BEFORE the Analyst runs.

## How to verify

1. Edit a field on any assumption tab. Don't press Save.
2. Press the Analyst button.
3. Observe:
   - No unsaved-changes dialog appears.
   - The verdict that comes back reflects the value you just typed,
     not the prior saved value.
   - The Save button (if present) shows the tab as saved (not dirty)
     after the verdict appears.

A proof test under `tests/proof/` should assert that no
`AnalystUnsavedChangesDialog`-style component is mounted under any
Analyst-button click handler in `client/src/`.

## Related

- `.claude/rules/the-analyst-persona.md` — voice and trust posture
- `.claude/rules/analyst-trigger-discipline.md` — *what* triggers
  evaluation (only the button); this rule covers what *else* the
  button does (saves first)
- `.claude/rules/recalculate-on-save.md` — engine-side save semantics
- `.claude/rules/admin-save-state.md` — tab-dirty patterns
