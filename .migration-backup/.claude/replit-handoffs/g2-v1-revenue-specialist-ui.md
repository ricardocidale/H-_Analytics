# G2-v1: Revenue Specialist UI wiring — `PropertyUnderwritingTab` AnalystButton

> **Atomic budget check:** 4 sub-steps, 2 files modified. ✅ Within budget.

## Doctrine context

- **Governing spec:** G2-v1 ships (`fe6dcbe3`) — server-side Revenue Specialist is live at `POST /api/analyst/refresh` with `{ scope: "global-assumptions", specialistId: "mgmt-co.revenue" }`.
- **Binding rules:**
  - `analyst-trigger-discipline.md` — AnalystButton press only. The hook fires on click; NOT on save, page load, or tab switch.
  - `analyst-click-saves-tab.md` — Pressing the AnalystButton on a dirty form must silently save first (this tab's existing save gate already handles it — no new logic needed).
  - `pre-commit-verification.md` — Five gates before every commit.
  - `branding-vocabulary-enforcement.md` — Never "Regenerate", "Generate", "Run". The AnalystButton label is already correct; don't add any label overrides.

## What ships in this packet

When the user presses the Analyst button on the Revenue ancillary section of Admin → Model Defaults → Property Underwriting:
1. `ModelDefaultsTab.tsx` routes the click through a dedicated `revenueRefresh` hook (`specialistId: "mgmt-co.revenue"`).
2. `PropertyUnderwritingTab.tsx` renders `<AnalystVerdictDisplay>` below the Revenue Assumptions section when `revenueVerdict` is non-null.
3. The verdict shows 5 dimensions: F&B share, Events share, Other share, Catering boost, Marketing rate — each with low/mid/high range, conviction level, and reasoning.

## What this packet does NOT change

- The existing legacy `AnalystActionButton` at the top of `PropertyUnderwritingTab` (covering all fields on that tab via the legacy guidance path) — leave it untouched.
- `CompanyAssumptions.tsx` — Revenue Specialist fields are NOT in the Company Assumptions Revenue tab; they are in Admin → Model Defaults. Do not touch `CompanyAssumptions.tsx`.
- Server-side code — already complete at `fe6dcbe3`. Do not touch any files under `server/`.

---

## Tasks

### S1 — Add `revenueRefresh` hook to `ModelDefaultsTab.tsx`

- **File:** `client/src/components/admin/ModelDefaultsTab.tsx`
- **Change:** Mount a dedicated `useAnalystRefresh` hook for the Revenue Specialist, mirroring how `fundingRefresh` is wired in `CompanyAssumptions.tsx`.
- **Add import** (if not present): `AnalystVerdictDisplay` from `"@/components/analyst/AnalystVerdictDisplay"` — check if already imported; if not, add it.
- **Add hook** (after the existing `analyst` hook, around line 110):

```typescript
// G2-v1 Revenue Specialist — routes through the v1 single-shot Opus path
// when the user presses "Ask the Analyst" in the Revenue ancillary section.
// Wired with `entityValues: saved` so the client-side preflight can detect
// missing required fields before burning the 60s server cooldown.
const revenueRefresh = useAnalystRefresh({
  scope: "global-assumptions",
  specialistId: "mgmt-co.revenue",
  invalidateKeys: [guidanceQueryKey],
  entityValues: saved as Record<string, unknown> | undefined,
  onMissingRequiredFields: (info) =>
    setMissingFieldsPrompt({
      open: true,
      specialistId: info.specialistId,
      missingFields: info.missingFields,
    }),
});
```

- **Pass new props** to `<PropertyUnderwritingTab>` (around line 270–278):

```tsx
<PropertyUnderwritingTab
  draft={draft}
  onChange={handleChange}
  guidance={guidance}
  onAnalystRefresh={analyst.triggerRefresh}
  analystRunning={analyst.running}
  analystCooldownMs={analyst.cooldownRemainingMs}
  onRevenueAnalystRefresh={revenueRefresh.triggerRefresh}
  revenueAnalystRunning={revenueRefresh.running}
  revenueAnalystCooldownMs={revenueRefresh.cooldownRemainingMs}
  revenueVerdict={revenueRefresh.lastVerdict}
/>
```

- **Acceptance criteria:**
  - [ ] TS compiles clean (`npx tsc --noEmit`)
  - [ ] `revenueRefresh` hook is declared AFTER the existing `analyst` hook (no hoisting issues)
  - [ ] New props are passed to `PropertyUnderwritingTab` without removing existing props

---

### S2 — Add new props + AnalystButton to `PropertyUnderwritingTab.tsx`

- **File:** `client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx`

**Step A — Extend the Props interface** (around line 57–64):

```typescript
interface PropertyUnderwritingTabProps {
  draft: Draft;
  onChange: (field: string, value: any) => void;
  guidance?: AnalystGuidanceRecord[];
  onAnalystRefresh?: (fields?: string[]) => void;
  analystRunning?: boolean;
  analystCooldownMs?: number;
  // G2-v1: Revenue Specialist verdict path
  onRevenueAnalystRefresh?: () => void;
  revenueAnalystRunning?: boolean;
  revenueAnalystCooldownMs?: number;
  revenueVerdict?: import("@engine/analyst/contracts/verdict").AnalystVerdict | null;
}
```

**Step B — Add imports** at the top of the file (add these after the existing analyst imports, around line 7–10):

```typescript
import { AnalystButton } from "@/components/intelligence/AnalystButton";
import { AnalystVerdictDisplay } from "@/components/analyst/AnalystVerdictDisplay";
```

> Note: `AnalystActionButton` is already imported; `AnalystButton` is a different component (the standard tab-bar CTA used by CompanyAssumptions). Both are needed.

**Step C — Destructure the new props** in the function body (around line 67–68, extend the destructure):

```typescript
const {
  draft, onChange, onAnalystRefresh, analystRunning, analystCooldownMs,
  onRevenueAnalystRefresh, revenueAnalystRunning, revenueAnalystCooldownMs,
  revenueVerdict,
} = props;
```

**Step D — Add a Revenue Analyst CTA + verdict display** in the Revenue Assumptions section.

Locate the `<Section grid title="Revenue Assumptions" ...>` block (around line 212). Just before that `<Section>` opening tag, add a row that contains the "Ask the Analyst" button for the 5 revenue dimensions. After the `</Section>` closing tag for Revenue Assumptions (around line 313), add the verdict display.

The goal structure:

```tsx
{/* Revenue Analyst CTA — fires the G2-v1 Revenue Specialist */}
{onRevenueAnalystRefresh && (
  <div className="flex items-center justify-between mb-2">
    <p className="text-sm text-muted-foreground">
      The Analyst evaluates your ancillary revenue mix (F&amp;B, Events, Other, Catering, Marketing) against boutique-luxury comp sets.
    </p>
    <AnalystButton
      onClick={onRevenueAnalystRefresh}
      isRunning={revenueAnalystRunning ?? false}
      disabled={false}
      tooltip="Ask the Analyst to review the revenue ancillary mix"
      size="sm"
      dataTestId="button-ask-analyst-revenue-mix"
    />
  </div>
)}

<Section grid title="Revenue Assumptions" description="Default revenue parameters pre-filled when adding a new hotel to the portfolio.">
  {/* ... existing fields ... */}
</Section>

{/* Revenue Specialist verdict — renders after the user runs the Analyst */}
{revenueVerdict && (
  <div data-testid="revenue-verdict-section">
    <AnalystVerdictDisplay verdict={revenueVerdict} />
  </div>
)}
```

- **Acceptance criteria:**
  - [ ] TS compiles clean
  - [ ] `data-testid="button-ask-analyst-revenue-mix"` exists in the rendered DOM when `onRevenueAnalystRefresh` is provided
  - [ ] `data-testid="revenue-verdict-section"` is rendered when `revenueVerdict` is non-null
  - [ ] Existing `AnalystActionButton` at the top of the tab is NOT removed or modified

---

### S3 — Verify gates

Run in this exact order before committing:

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary
```

All must pass. `verify:summary` must show **UNQUALIFIED**.

- **Acceptance criteria:**
  - [ ] TS: exit code 0, zero errors
  - [ ] Lint: exit code 0, zero errors, zero warnings
  - [ ] Vocab: 11/11
  - [ ] test:summary: PASS
  - [ ] verify:summary: UNQUALIFIED

---

### S4 — Commit

```
git add client/src/components/admin/ModelDefaultsTab.tsx \
        client/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx
git commit -m "$(cat <<'EOF'
feat(analyst): wire Revenue Specialist AnalystButton on PropertyUnderwritingTab (G2-v1 UI)

Adds revenueRefresh hook (specialistId:"mgmt-co.revenue") to ModelDefaultsTab
and a dedicated "Ask the Analyst" CTA in the Revenue Assumptions section of
PropertyUnderwritingTab. On click: fires POST /api/analyst/refresh with
specialistId:"mgmt-co.revenue"; verdict renders via AnalystVerdictDisplay below
the section. Legacy AnalystActionButton covering all tab fields unchanged.

Surfaces: S-admin-model-defaults, S-property-underwriting-tab
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

- **Acceptance criteria:**
  - [ ] Commit lands on `main` with the exact footer above
  - [ ] No other files staged (confirm with `git status`)

---

## Verification (E2E smoke test — do this before closing the handoff)

1. Open Admin → Model Defaults → Property Underwriting tab in the dev server.
2. Confirm the "Ask the Analyst" button appears in the Revenue section.
3. Click it — confirm the button enters loading state.
4. Wait for response — confirm `<AnalystVerdictDisplay>` renders with 5 revenue dimensions.
5. Check the browser console — no TypeScript runtime errors, no 500s.
6. Check that clicking the existing legacy `AnalystActionButton` at the top of the tab still works (legacy path, not v1 Specialist).

---

## References

- `fe6dcbe3` — G2-v1 server-side commit (Revenue Specialist: schema + prompt + runner + route branch)
- `server/routes/analyst-admin.ts` lines ~225–244 — the `mgmt-co.revenue` route branch
- `client/src/pages/CompanyAssumptions.tsx` lines ~291–309 — `fundingRefresh` hook pattern to mirror
- `client/src/components/company-assumptions/CompanyAssumptionsTabsView.tsx` lines ~276–285 — `<AnalystButton>` usage pattern
- `.claude/rules/analyst-trigger-discipline.md` — AnalystButton is the only valid trigger
- `.claude/rules/analyst-click-saves-tab.md` — button press saves tab first
