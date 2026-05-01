# Phase Admin-Cleanup-2: Rebecca Guardrails → read-only display

`GuardrailEditor.tsx` lets admins create / edit / delete Rebecca guardrails at runtime, persisting to the `rebecca_guardrails` table. Per `specialists-are-dev-defined-only.md` §3, agent guardrails must be code-defined. This packet converts the editor to a read-only display.

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** None — enforcement of existing rule
- **ADR status:** N/A
- **Last ADR edit:** N/A
- **Sessions stable:** N/A
- **Gate decision:** ✅ Cleared — bug-fix-against-shipped-code lane

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` flagged Rebecca → Guardrails as a runtime-config rule violation. Same pattern as the Specialist-tabs packet (`admin-cleanup-specialist-readonly.md`): keep GET reads (admins still observe state), remove form mutations.

CC will follow up by removing the POST/PATCH/DELETE routes at `server/routes/rebecca.ts:243-309` and migrating the seed guardrail set into source code.

References:
- Audit: `.claude/audits/admin-intelligence-inventory.md` (Rebecca → Guardrails row)
- Rule: `.claude/rules/specialists-are-dev-defined-only.md`
- Editor file: `client/src/components/admin/ai/GuardrailEditor.tsx` (420 lines)

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 1 ✅
- **File count:** 1 ✅
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: GuardrailEditor → read-only list

- **Files:**
  - `client/src/components/admin/ai/GuardrailEditor.tsx`
- **Change:**
  1. Keep the `useQuery` for `/api/rebecca/guardrails`.
  2. Remove `createMutation`, `updateMutation`, `deleteMutation` and all their UI affordances (Add button, edit form, delete confirm dialog, isActive toggle).
  3. Render each guardrail as a static card showing label + rule text + an `Active` / `Inactive` badge. No form inputs anywhere.
  4. Add a top-level `<Alert>`:
     ```tsx
     <Alert>
       <AlertTitle>Read-only — dev-defined</AlertTitle>
       <AlertDescription>
         Rebecca's guardrails are defined in source code per
         <code>specialists-are-dev-defined-only.md</code>. To add or change a
         guardrail, edit the code and redeploy.
       </AlertDescription>
     </Alert>
     ```
  5. Remove `useToast` import if unused.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** No guardrail-mutation-event consumers exist outside this file (verified by grep). Per `cross-check-invariants.md` §"contract drift": before deleting the mutation, grep for any cache key the mutation invalidated and confirm no other consumer relies on that invalidation timing.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] `npm run lint` 0 errors / 0 warnings on this file
  - [ ] No `useMutation`, `<Input>`, `<Textarea>`, `<Switch>`, or `<Button>`-with-mutation-handler in the file (the only Buttons allowed are display-only, e.g. a refresh icon if you want)
  - [ ] Read-only banner is visible when admin opens AI Intelligence → Rebecca → Guardrails
- **Test impact:** None today (no proof test gates this surface yet — CC will add one in a follow-up).
- **Rollback notes:** Restore from git.

## Verification (MANDATORY)

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — 0 errors / 0 warnings
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification

- [ ] AI Intelligence → Rebecca → Guardrails renders without Add button, edit forms, or delete buttons
- [ ] Each guardrail visible with label + rule + active badge
- [ ] Read-only banner present
- [ ] No console errors

## Out of scope (MANDATORY)

- **Server-side route removal.** POST/PATCH/DELETE at `server/routes/rebecca.ts:243-309` stay live for now. CC removes them in a follow-up commit.
- **Migration of existing guardrails into source code.** CC's follow-up.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-rebecca-guardrails-readonly.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Verification gates PASSED:** _
- **Out-of-scope items discovered:** _
- **Session-memory entry added:** ❌
