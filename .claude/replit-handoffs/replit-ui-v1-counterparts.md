# Replit UI Queue — G1.5c-v1 counterparts + cleanup

> **Replit's lane** per `.claude/rules/claude-replit-split.md` (2026-04-27 revision: UI/UX only). CC is building the v1 server-side Funding Specialist in parallel; this packet covers the UI counterparts that v1 needs to ship + two independent cleanup items.
>
> **Read first:** `.claude/rules/design-standards.md`, `.claude/rules/branding-vocabulary-enforcement.md`, `.claude/rules/the-analyst-persona.md`, `.claude/replit-handoffs/g1.5c-v1-funding-specialist.md` (the server-side packet CC is executing).

## Tier 1 — Direct counterparts to v1 (block v1 ship if not ready)

### A. `<AnalystCheckDialog />` verification + polish

**What:** When AnalystButton is pressed but the saved `globalAssumptions` row is missing required fields, the server returns `400 { code: "REQUIRED_FIELDS_MISSING", specialistId, missingFields: [{ key, label, surface, surfaceAnchor }] }`. The client renders a dialog so the user knows what's needed.

**Verify:**
1. Component exists at `client/src/components/analyst/AnalystCheckDialog.tsx` (or wherever it lives — locate via `grep -rln "AnalystCheckDialog" client/src/`).
2. Renders the structured `missingFields[]` from the 400 response.
3. Each missing field has an anchor link back to its source tab/section using `surfaceAnchor` (e.g., `#funding-section` scrolls to the Funding section on the Company Assumptions page).
4. Voice on the dialog headline + body matches `the-analyst-persona.md`:
   - **OK:** *"The Analyst needs these to proceed: [list]. Set them, save, then ask again."* + **[OK]** button
   - **NOT OK:** *"Required fields missing"*, *"Please fill in"*, *"Form validation failed"*
5. Visual polish per `design-standards.md`:
   - Animated entrance (framer-motion fade + scale-in)
   - Glass card aesthetic (`bg-white/80 backdrop-blur-xl border-primary/20`)
   - Lucide icon (likely `AlertCircle` or `Info`, NOT `XCircle` — this is informational, not an error)
   - Staggered list reveal for the missing-fields array
   - Single CTA button with hover state
6. Vocabulary test continues to pass (`tests/audit/vocabulary-compliance.test.ts`).

**If gaps:** fix them. If component doesn't exist: build it. Acceptance: a manual browser test where saving the Funding tab without `runwayBufferMonths` and clicking AnalystButton produces a polished dialog.

**Files (likely):** `client/src/components/analyst/AnalystCheckDialog.tsx`, possibly `client/src/components/analyst/useAnalystRefresh.ts` (response handler).

### B. Unsaved-changes dialog (new behavior)

**What:** When the user has dirty form state on the Funding tab and presses AnalystButton, show a 3-button dialog confirming what they want.

**Pattern:**
> 💬 *"There are unsaved changes on this tab. The Analyst will analyze your last-saved values, not the current edits. Save first, or continue with last-saved?"*
>
> **[Save and analyze]**  &nbsp;&nbsp;  **[Continue with last-saved]**  &nbsp;&nbsp;  **[Cancel]**

**Behavior:**
- **[Save and analyze]** — triggers the form's save handler, then on save success fires AnalystButton again automatically.
- **[Continue with last-saved]** — fires AnalystButton against the existing saved state. The form's dirty state is preserved (user can still save later).
- **[Cancel]** — closes the dialog. No-op.

**Files:**
- `client/src/components/analyst/AnalystButton.tsx` (or wherever the button lives) — pre-press hook to check `formIsDirty` and intercept before `/api/analyst/refresh` POST.
- New `client/src/components/analyst/UnsavedChangesDialog.tsx` (or similar) for the dialog component.
- The form's `isDirty` flag plumbed via `useCompanyAssumptionsForm` (already exposed; verify wiring).

**Visual:** glass card, framer-motion entrance, three-button row, premium feel per `design-standards.md`. Vocabulary check on the copy.

### C. Verdict rendering on Funding tab

**What:** When v1's `/api/analyst/refresh` returns an `AnalystVerdict` (200 response with body `{ verdict: { ... } }`), render it inline on the Funding tab.

**Pattern (per dimension card, 5 cards total — one per funding key):**
- **Range badge** — `{low}–{high}` with `{mid}` highlighted; unit-aware (`mo` for time, `%` for percentages, `$` for dollars)
- **Conviction marker** — color-coded: high = primary green, moderate = amber, developing = muted gray. Tooltip on hover.
- **Reasoning text** — 1-2 sentences from `verdict.dimensions[i].reasoning` (max 500 chars per S1 schema)
- **Evidence references** — list of comparable rows referenced by `verdict.dimensions[i].evidenceRefs` (indexes into `verdict.evidence[]`). Hoverable cite chips.
- **Stagger reveal** — cards animate in with framer-motion `delayChildren: 0.1, staggerChildren: 0.06` per `design-standards.md`

**Look for existing patterns:**
- Property research already has `<AnalystRangeIndicator />` (or similar). Mirror the look-and-feel for funding's 5 dimensions.
- Color tokens: use theme-resolved colors (no raw hex), per `design-standards.md`.
- Layout: 5 cards on a 2-column grid (or single column on narrow screens), placed below the funding inputs, above the SummaryFooter.

**Files (likely):**
- `client/src/components/company-assumptions/FundingSection.tsx` — add a new section for the verdict display
- New `client/src/components/analyst/AnalystVerdictDisplay.tsx` (or rename existing if a similar component is reusable)
- Type the response handler against the `AnalystVerdict` contract from `engine/analyst/contracts/verdict.ts`

**Acceptance:** with mocked verdict data (paste a fixture into a dev component), all 5 dimension cards render correctly with proper styling, animations, and content. Once v1 server lands, end-to-end test against the live API.

## Tier 2 — Cleanup (independent of v1)

### D. Lint warning fix

**File:** `client/src/components/company-assumptions/CompanyAssumptionsTabsView.tsx`
**Line:** 80, col 44
**Warning:** `'isAdmin' is assigned a value but never used. Allowed unused vars must match /^_/u`
**Fix:** Either rename to `_isAdmin` (preserves the destructure for future use) or remove the destructure entirely if `isAdmin` is no longer needed anywhere in the file.
**Acceptance:** `npm run lint` reports 0 errors AND 0 warnings.

### E. G1.5b Funding input polish

**Files:** `client/src/components/company-assumptions/FundingSection.tsx:327-418`
**The 4 inputs:** `runwayBufferMonths`, `sizingOvershootPct`, `revenueRampDelayMonths`, `burnFlexDownPct` (shipped in commit `1bb965e2`).

**Polish opportunities per `design-standards.md`:**
1. **Animated number transitions** — when admin-Default values flow in (after the user's first save inherits the cascade), the input value should animate from 0 (or empty) to the resolved value. Use a `<AnimatedNumber />` or framer-motion `MotionValue` pattern.
2. **Cascade-source indicator** — a small badge or icon next to each input showing where the current value came from:
   - "Your value" (user explicitly set; primary color)
   - "Admin Default" (inherited from `model_defaults`; muted color)
   - "System default" (hardcoded `DEFAULT_*` constant; warning amber)
3. **Tooltip per field** — hovering the field name shows a 1-2 sentence explanation aimed at investors. Example for `runwayBufferMonths`:
   > *"Months of runway past operations start. LPs use this to gauge cushion against ramp lag. Boutique-luxury hospitality typically targets 14-18 months."*
4. **Slider sync polish** — verify the slider + numeric input stay in sync (they appear to use a controlled pattern; check for jitter on rapid edits).
5. **Field-level Analyst Note placeholder** — small badge area below each input where v1's per-dimension verdict will land (rendering handled by item C above; this is just reserving the visual slot).

**Acceptance:** browser inspection shows premium feel — no flat cards, no static numbers, deliberate transitions, clear cascade-source signal.

## Tier 3 — Browser smoke (after v1 lands)

### F. End-to-end verification

After CC ships v1 (S1-S5 of `g1.5c-v1-funding-specialist.md`), run a full browser walk-through in dev server:

1. Open Company Assumptions → Funding tab. Note all 4 fields show admin-Default values (cascade working).
2. Change one value. Click Save. Confirm row persists (Network tab → 200).
3. Click "Ask the Analyst" (the AnalystButton). Confirm:
   - If all required fields set → verdict appears with 5 dimension cards (item C rendering)
   - Verdict references your specific inputs (not boilerplate)
   - Reasoning is investor-grade (per `the-analyst-persona.md` voice)
   - Evidence cites real LP comparables
4. Change a value but DON'T save. Click AnalystButton. Confirm unsaved-changes dialog (item B) appears. Test all three buttons.
5. Clear a required field, save. Click AnalystButton. Confirm `<AnalystCheckDialog />` (item A) appears with the missing field listed and an anchor link back to the field.
6. Browser console: 0 errors during the flow.
7. Vocabulary test continues to pass (`npm run test:file -- tests/audit/vocabulary-compliance.test.ts`).
8. Visual screenshot: dimension cards stagger-reveal, conviction colors render, evidence chips hover, range badges look premium.

**If F surfaces issues:** file a follow-up packet with the specific gap.

## Out of scope for this packet

- Any server-side / engine code (CC's lane).
- Modifying the route handler `/api/analyst/refresh` (CC's lane).
- Building the cognitive logic (`runFundingSpecialist`, prompt design, output schema — CC's lane).
- N+1 panels, vendor breadth, cache, regress (deferred to G6-P2/P3/P4 — CC's lane when those phases land).
- Changes outside `client/src/`, `client/public/`, or any non-UI surface.

## Surfaces footer template (for each commit)

```
Surfaces: S-Analyst-UI, S-Funding-Tab
Packet: .claude/replit-handoffs/replit-ui-v1-counterparts.md
```

## Completion report (filled by Replit on exit)

- **Tier 1 items completed (A, B, C):** [list]
- **Tier 2 items completed (D, E):** [list]
- **Tier 3 (F):** [done after CC's v1 ships; report observations]
- **Visual screenshots / smoke result:** [link or note]
- **Vocabulary test:** ✅ / ❌
- **Browser console errors during F:** [list]
