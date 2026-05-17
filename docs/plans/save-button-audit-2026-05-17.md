# Save Button Discipline Audit — 2026-05-17

## Objective

Enforce the assumption lifecycle contract across every financial/assumption input screen:

1. **Save is never disabled on assumption screens.** Even unchanged values can be endorsed (DEFAULT-POPULATED → CONFIRMED).
2. **Exit without saving triggers an in-app dialog**, not a browser `beforeunload` popup.
3. **Button order is always `[Analyst] [Cancel] [Save]`** — one Analyst button per section.
4. **No duplicate Analyst buttons** in the same visible area.

Scope: `PropertyEdit`, `CompanyAssumptions`, `ModelDefaultsTab`, `CompanyBracketMix` / ICP.

Not in scope: admin-only config screens (LLM Workflows, Brand Assets, etc.).

---

## Design Decisions (confirmed by product owner 2026-05-17)

| Question | Decision |
|---|---|
| PropertyEdit post-save UX | Stay on page + success toast (no navigate-away) |
| BracketMix invalid-save | Keep disabled while `selectedCount === 0 \|\| !weightSumOk` (validation gate only — not a dirty gate; current behaviour preserved) |
| ModelDefaults unsaved warning scope | Fire on: (a) leaving /admin entirely, (b) switching admin sidebar sections, AND (c) switching tabs within Model Defaults itself |

---

## Current State vs. Required State

| Screen | File | Save disabled when clean? | Exit warning | Notes |
|---|---|---|---|---|
| **Property Edit** | `pages/PropertyEdit.tsx` | ❌ Yes — `!isDirty` disables + dims | ❌ Browser `beforeunload` only | Also: Save navigates away — must be removed |
| **Company Assumptions** | `pages/CompanyAssumptions.tsx` | ✅ `alwaysActive` | ⚠️ Analyst intercept only; no nav-exit guard | Already correct for Save; needs `useUnsavedExitGuard` |
| **Model Defaults** | `components/admin/ModelDefaultsTab.tsx` | ✅ `alwaysActive` on header Save | ❌ None | Needs guard on section switch + tab switch within MD |
| **Bracket Mix / ICP** | `pages/CompanyBracketMix.tsx` | ✅ Validation-gated only (acceptable) | ❌ None | Needs `useUnsavedExitGuard` |

---

## Implementation Plan

### Step 1 — Shared infrastructure (build first; everything else depends on it)

#### 1a. `UnsavedExitDialog` component
- **File:** `src/components/ui/unsaved-exit-dialog.tsx` (new)
- Two-button layout: **[Leave without saving]** (destructive/ghost) and **[Save]** (primary)
- Voice: factual, not scolding. Example: "You have unsaved changes. Save before leaving or your edits will be lost."
- Distinct from `AnalystUnsavedChangesDialog` — that dialog is for Analyst→dirty intercept (3 buttons). This one is for navigation exit only (2 buttons).
- Accept props: `open`, `onOpenChange`, `onSave`, `onLeave`, `isSaving?`

#### 1b. `useUnsavedExitGuard` hook
- **File:** `src/hooks/useUnsavedExitGuard.ts` (new)
- Signature: `useUnsavedExitGuard({ isDirty, onSave, enabled?: boolean })`
- Returns: `{ dialogOpen, confirmLeave(callback), cancelLeave() }`
- Registers a `window.beforeunload` listener when dirty (browser tab close)
- Exposes `confirmLeave(callback)` for programmatic navigation: shows dialog, calls `callback()` only after user confirms
- Does NOT register a React Router blocker directly (avoids conflicts with any app-level guard); callers wrap their navigation triggers with `confirmLeave`
- Replace existing `beforeunload` effects in `PropertyEdit.tsx` and `useCompanyAssumptionsForm.ts` with this hook

---

### Step 2 — Fix `PropertyEdit.tsx`

**File:** `artifacts/hospitality-business-portal/src/pages/PropertyEdit.tsx`

**Changes:**
1. Pass `alwaysActive` to both `<SaveButton>` instances (header and sticky footer). Remove `hasChanges={isDirty}` prop (or keep for visual hint only — see note).
2. Remove the navigate-away call inside `finishSave` / the `updateProperty.onSuccess` handler. Replace with a success toast: `"Changes saved"` or `"Values confirmed"`.
3. Remove the inline `beforeunload` `useEffect` (lines 417–423). Replace with `useUnsavedExitGuard`.
4. Wrap every navigation trigger (back button, breadcrumb, sidebar click) with `confirmLeave(navigateCallback)`.
5. Fix button order if not already `[Analyst] [Cancel] [Save]` — architect flagged two Analyst CTAs (header + sticky footer); pick the sticky footer as the canonical one and remove the header duplicate.

**Note on `hasChanges`:** The `SaveButton` can still visually highlight when dirty (a subtle style cue) as long as it is never `disabled` or `opacity-50` when clean. Remove `alwaysActive=false` / ensure `alwaysActive={true}` is passed explicitly.

---

### Step 3 — Wire `useUnsavedExitGuard` into `CompanyAssumptions.tsx`

**File:** `artifacts/hospitality-business-portal/src/pages/CompanyAssumptions.tsx`

**Changes:**
1. Replace the `beforeunload` effect in `useCompanyAssumptionsForm.ts` with `useUnsavedExitGuard`.
2. Wrap any in-app navigation triggers (tab bar, back, breadcrumb) with `confirmLeave`.
3. The existing `AnalystUnsavedChangesDialog` stays — it fires on Analyst button click when dirty. This is separate from the new exit guard.

---

### Step 4 — Wire `useUnsavedExitGuard` into `ModelDefaultsTab.tsx`

**File:** `artifacts/hospitality-business-portal/src/components/admin/ModelDefaultsTab.tsx`

**Changes:**
1. Expose an `isDirty` prop or derive it from the form state already tracked in `isDirty` state (line 155).
2. Use `useUnsavedExitGuard`. Call `confirmLeave` on:
   - Admin sidebar section changes (intercept the `onSectionChange` prop passed down from `Admin.tsx`)
   - Tab switches within Model Defaults (`onTabChange` of the inner tab group)
   - Any route-level navigation away from `/admin`
3. `Admin.tsx` must pass a `requestSectionChange` callback that Model Defaults can intercept via `confirmLeave` before the actual section change fires.

---

### Step 5 — Wire `useUnsavedExitGuard` into `CompanyBracketMix.tsx`

**File:** `artifacts/hospitality-business-portal/src/pages/CompanyBracketMix.tsx`

**Changes:**
1. Track a dirty state: form is dirty when `selectedBrackets` or `weights` differ from the last-saved values.
2. Use `useUnsavedExitGuard` with the dirty state.
3. Wrap navigation triggers (breadcrumb, sidebar) with `confirmLeave`.
4. **No change to Save button behaviour** — it remains disabled when `selectedCount === 0 || !weightSumOk`. This is validation-gating, not dirty-gating; the product owner confirmed it is correct.

---

### Step 6 — Duplicate Analyst button cleanup

From the architect's audit:

| Screen | Issue | Fix |
|---|---|---|
| `PropertyEdit.tsx` | Analyst CTA in both header AND sticky footer | Remove header Analyst CTA; keep sticky footer only |
| `ModelDefaultsTab.tsx` → `PropertyUnderwritingTab` | Two Analyst buttons (general + revenue-specific) | Collapse to one entry-point; use a mode selector or relegate secondary to a text link (not an `AnalystActionButton`) |

---

### Step 7 — Update `save-button.tsx` doc comment

Remove the line that says PropertyEdit intentionally leaves `alwaysActive` off. After Step 2, that exception no longer exists.

---

## Files to touch (summary)

| File | Change type |
|---|---|
| `src/components/ui/unsaved-exit-dialog.tsx` | **New** |
| `src/hooks/useUnsavedExitGuard.ts` | **New** |
| `src/pages/PropertyEdit.tsx` | Edit — `alwaysActive`, remove navigate-away, swap beforeunload, fix Analyst duplication |
| `src/hooks/useCompanyAssumptionsForm.ts` | Edit — swap beforeunload for hook |
| `src/pages/CompanyAssumptions.tsx` | Edit — wire exit guard, wrap nav triggers |
| `src/components/admin/ModelDefaultsTab.tsx` | Edit — wire exit guard, expose section-change intercept |
| `src/pages/Admin.tsx` | Edit — pass `requestSectionChange` interception point |
| `src/pages/CompanyBracketMix.tsx` | Edit — track dirty state, wire exit guard |
| `src/components/ui/save-button.tsx` | Edit — remove stale doc comment |

---

## Skill text additions (minimal)

### `hplus-assumption-lifecycle` — add to "Save behaviour" section:
> Save must not trigger navigation. After a successful save the user stays on the page and sees a brief success toast. A separate "close / back" affordance (e.g. the breadcrumb or sidebar) handles leaving. Never conflate Save with Close.

### `hplus-form-actions` — add to "Navigation exit" section:
> **Two distinct dialogs — never conflate:**
> - `AnalystUnsavedChangesDialog` — shown when the user clicks the **Analyst** button while the form is dirty. Three actions: Save & Analyze / Continue with last saved / Cancel.
> - `UnsavedExitDialog` — shown when the user **navigates away** from a dirty assumption screen (via sidebar, breadcrumb, or route change). Two actions: Save / Leave without saving.
>
> The canonical hook for wiring exit guards is `useUnsavedExitGuard({ isDirty, onSave })`.

---

## Out of scope

- Admin-only config screens (LLM Workflows, Brand Assets, etc.) — no exit guard required.
- `CompanyBracketMix` Save button validation (weights sum) — confirmed correct behaviour by product owner; no change.
- Backend changes — all fixes are purely frontend state management.
