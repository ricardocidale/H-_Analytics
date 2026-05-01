# Phase Admin-Cleanup-1: Specialist tabs → read-only display

Per the audit at `.claude/audits/admin-intelligence-inventory.md`, four Specialist tabs let admins edit data that `specialists-are-dev-defined-only.md` says must be code-defined. This packet converts the four tabs to read-only display: keep the data fetching (admins still SEE catalog/override state), remove the form mutations (admins cannot WRITE).

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** None — enforcement of existing rule `specialists-are-dev-defined-only.md`
- **ADR status:** N/A
- **Last ADR edit:** N/A
- **Sessions stable:** N/A
- **Gate decision:** ✅ Cleared — bug-fix-against-shipped-code lane (rule was always binding; UI just didn't enforce it)

## Context (MANDATORY)

`.claude/rules/specialists-are-dev-defined-only.md` §3 forbids admin runtime edits to Specialist persona, prompts, models, field requirements, or routing. The 2026-05-01 inventory audit found four tabs that allow these edits today: `IdentityTab.tsx` (humanName + gender), `RequiredFieldsTab.tsx` (3-way required-field toggle), `LlmConfigTab.tsx` (prompt + model selection + workflow overrides), and `RuntimeTab.tsx` (free-form JSON config). Each violation is mirrored across all 12 Specialists, so 48 surfaces are out of compliance.

The fix is **UI-only**: keep the GET reads (admins still observe state), remove the form inputs and mutations. Server-side endpoint removal is CC's separate work — those endpoints stay live until this UI packet ships, then CC removes them in a follow-up commit.

The proof test `tests/proof/admin-surface-coverage.test.ts` T2 already baselines edit-affordance counts at infinity for these four tabs; once this packet ships, lower the baseline to `0` for each remediated tab to lock the rule.

References:
- Audit: `.claude/audits/admin-intelligence-inventory.md`
- Rule: `.claude/rules/specialists-are-dev-defined-only.md`
- Proof test: `tests/proof/admin-surface-coverage.test.ts`

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 5 ✅
- **File count:** 5 ✅ (4 tabs + the proof test baseline) — one tab per sub-step keeps each diff reviewable
- **Capability domains touched:** UI ✅ (single domain)

This exceeds the 3-file budget but is single-domain (all UI, all in `client/src/pages/admin/specialist/tabs/`) and the changes are uniform across the four tabs (same pattern: read-only display, remove mutations). If you prefer to split, do it as `-a` (Identity + RequiredFields) and `-b` (LlmConfig + Runtime + proof test); both halves are independent.

## Tasks (MANDATORY)

### S1: IdentityTab → read-only display

- **Files:**
  - `client/src/pages/admin/specialist/tabs/IdentityTab.tsx`
- **Change:**
  1. Keep the `useQuery` for `/api/admin/specialists/:id/identity` (admins still see catalog vs override state).
  2. Remove the `useMutation` and the `<SaveButton>`.
  3. Replace the editable `<Input>` (humanName) and `<RadioGroup>` (gender) with read-only display:
     - Show the current resolved value (override OR catalog) as plain text.
     - If an override exists, show a subtle badge "Override active" next to the field.
  4. Remove the per-field "Use factory default" `<Checkbox>` — there's nothing to clear because admins can no longer set anything.
  5. Add an `<Alert>` at the top:
     ```tsx
     <Alert>
       <AlertTitle>Read-only — dev-defined</AlertTitle>
       <AlertDescription>
         Specialist identity is defined in source code per
         <code>specialists-are-dev-defined-only.md</code>. To change persona,
         edit the Specialist catalog and redeploy.
       </AlertDescription>
     </Alert>
     ```
  6. Remove the `useToast` import if no longer used.
- **Affected dependency surfaces:** S1 (page-level UI)
- **Cross-check invariants:** Per `.claude/rules/cross-check-invariants.md` §"contract drift" — search for any code that relied on the Identity edit endpoint emitting toast events; none should exist (the endpoint stays live, just unreachable from this tab).
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] Tab renders with no `<Input>`, `<RadioGroup>`, `<Checkbox>`, `<SaveButton>`, or `useMutation` references
  - [ ] Tab still calls `useQuery` for the identity endpoint (display-only)
  - [ ] Read-only banner is visible at top
- **Test impact:** Drives the T2 baseline to 0 for this file in S5.
- **Rollback notes:** Restore the file from git.

### S2: RequiredFieldsTab → read-only display

- **Files:**
  - `client/src/pages/admin/specialist/tabs/RequiredFieldsTab.tsx`
- **Change:**
  1. Keep the `useQuery` for `/api/admin/specialists/:id/required-fields` (admins still see what fields the Specialist requires).
  2. Remove every `useMutation` (the toggle handlers).
  3. Replace the 3-way toggle UI with a static badge per field:
     - Off → no badge
     - Recommended → `<Badge variant="secondary">Recommended</Badge>`
     - Hard-required → `<Badge variant="default">Required</Badge>`
  4. Add the same read-only banner as S1.
  5. Remove `useToast` if unused.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Same as S1.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] No `<Switch>`, `<RadioGroup>`, `<Select>`, or mutation hook in the file
  - [ ] Field state visible as static badges
  - [ ] Read-only banner present
- **Test impact:** Drives the T2 baseline to 0 in S5.
- **Rollback notes:** Restore from git.

### S3: LlmConfigTab → read-only display

- **Files:**
  - `client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx`
- **Change:**
  1. Keep the `useQuery` for `/api/admin/specialists/:id/llm-config`.
  2. Remove every form input (`<Textarea>` for prompt template, `<Select>` for model picks, `<Switch>` for synthesis toggle, all `<Input>` numeric overrides), every mutation, and the save button.
  3. Display each value as static text inside `<Card>` blocks. Pretty-print the prompt template inside a `<pre className="text-xs">` block (read-only, scrollable).
  4. Add the read-only banner as S1.
  5. If "synthesis enabled" is currently a toggle, render it as a badge: `Synthesis: enabled` / `Synthesis: disabled`.
  6. Workflow-behavior overrides (staleness, concurrency, token budgets) → label/value pairs.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Same as S1.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] No editable form inputs in the file (zero `<Input>`, `<Textarea>`, `<Select>`, `<Switch>` instances per the T2 detector)
  - [ ] Prompt template still visible as preformatted text
  - [ ] Read-only banner present
- **Test impact:** Drives T2 baseline to 0.
- **Rollback notes:** Restore from git.

### S4: RuntimeTab → read-only display

- **Files:**
  - `client/src/pages/admin/specialist/tabs/RuntimeTab.tsx`
- **Change:**
  1. Keep the `useQuery` for `/api/admin/specialists/:id/runtime`.
  2. Remove the `<Textarea>` JSON editor and the save mutation.
  3. Display the current runtime config as a syntax-highlighted JSON block (`<pre>` is fine; no syntax highlighting required for this pass).
  4. Add the read-only banner with a slightly different message:
     ```
     Runtime config is set in code. This view is read-only —
     edits are forbidden per specialists-are-dev-defined-only.md.
     ```
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Same as S1.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] No `<Textarea>` or mutation hook in the file
  - [ ] JSON config visible as `<pre>` block
  - [ ] Read-only banner present
- **Test impact:** T2 baseline to 0.
- **Rollback notes:** Restore from git.

### S5: Lower the proof-test baselines

- **Files:**
  - `tests/proof/admin-surface-coverage.test.ts` (lines around `SPECIALIST_TAB_BASELINE`)
- **Change:** Replace each `Number.POSITIVE_INFINITY` entry with `0`:
  ```ts
  const SPECIALIST_TAB_BASELINE: Record<string, number> = {
    "client/src/pages/admin/specialist/tabs/IdentityTab.tsx": 0,
    "client/src/pages/admin/specialist/tabs/RequiredFieldsTab.tsx": 0,
    "client/src/pages/admin/specialist/tabs/LlmConfigTab.tsx": 0,
    "client/src/pages/admin/specialist/tabs/RuntimeTab.tsx": 0,
  };
  ```
- **Affected dependency surfaces:** S8 (test infrastructure)
- **Cross-check invariants:** None — this is a tightening of an existing test.
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` PASS (8/8)
  - [ ] If any tab still has an edit affordance, this test fails with the file:count breakdown — investigate which sub-step (S1-S4) wasn't fully completed and finish it before lowering this baseline.
- **Test impact:** This IS the locking step. Once these baselines are 0, no future commit can re-add edit affordances on these tabs without explicit baseline bump + justification.
- **Rollback notes:** Restore from git.

## Verification (MANDATORY)

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — 0 errors / 0 warnings on the four edited tabs
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` — 8/8 PASS (with the lowered baselines)
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification

- [ ] Open AI Intelligence → any Specialist → Identity tab → confirm read-only banner + no edit affordances + current values still visible
- [ ] Same check on Required Fields, LLM Config, Runtime tabs
- [ ] No console errors during navigation across all four tabs

## Out of scope (MANDATORY)

- **Server-side endpoint removal.** The PUT endpoints `/api/admin/specialists/:id/{identity,required-fields,llm-config,runtime}` stay live for now. CC will remove them in a follow-up commit once this packet's UI changes have shipped and verified — that ordering avoids breaking the UI mid-refactor.
- **Migration of existing override rows.** Any existing override values in `specialist_identity_overrides`, `field_toggles`, `specialist_configs`, etc., stay in the database. CC's follow-up will decide whether to migrate them into catalog source code or drop them.
- **Rebecca → Guardrails read-only conversion.** Same rule violation, same pattern, but separate packet (`admin-cleanup-rebecca-guardrails-readonly.md`).
- **Scheduled Research strip-cron.** Separate packet.
- **ExportsTab kill.** Separate packet.

## Surfaces footer template (MANDATORY)

Every commit emitted from this packet must end with:

```
Surfaces: S1, S8
Packet: .claude/replit-handoffs/admin-cleanup-specialist-readonly.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Verification gates SKIPPED with reason:** _
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** _
- **Session-memory entry added:** ❌
