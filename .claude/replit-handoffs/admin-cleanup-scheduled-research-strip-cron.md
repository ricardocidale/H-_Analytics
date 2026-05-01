# Phase Admin-Cleanup-3: Scheduled Research → manual-run-only console

`ScheduledResearchPanel.tsx` lets admins create cron-like schedules (`frequencyHours`) that auto-execute Specialist runs. Per `analyst-trigger-discipline.md`, **The Analyst must evaluate ONLY when the user explicitly presses `<AnalystButton />`** — cron triggers are forbidden. This packet strips the schedule mechanic and converts the panel to a manual-run-only console with a registered-task list + per-task "Run Now" button.

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** None — enforcement of existing rule
- **ADR status:** N/A
- **Last ADR edit:** N/A
- **Sessions stable:** N/A
- **Gate decision:** ✅ Cleared — bug-fix-against-shipped-code lane

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` flagged System → Scheduled Research as a `analyst-trigger-discipline.md` violation. The rule exists because Tier-1 Specialist runs are real LLM cost ($/run × N+1 vendors) — auto-triggering on cron burns budget the user did not authorize.

The fix preserves operator value (admins want to be able to kick off a research task on demand) without violating trigger discipline. Convert the panel from "schedule editor" → "task launcher": list registered tasks, give each a "Run Now" button, log each run.

References:
- Audit: `.claude/audits/admin-intelligence-inventory.md` (System → Scheduled Research row)
- Rule: `.claude/rules/analyst-trigger-discipline.md`
- Panel file: `client/src/components/admin/intelligence/ScheduledResearchPanel.tsx` (490 lines)

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 2 ✅
- **File count:** 1 ✅
- **Capability domains touched:** UI ✅ (server-side cron-removal is CC's follow-up)

## Tasks (MANDATORY)

### S1: Strip scheduling UI; preserve task list + manual run

- **Files:**
  - `client/src/components/admin/intelligence/ScheduledResearchPanel.tsx`
- **Change:**
  1. Keep `useQuery` for `/api/scheduled-research/workflows` (or whatever the existing query key is — the GET stays).
  2. Remove `createMutation` (creates new schedules), `updateMutation` (edits `frequencyHours`), `deleteMutation`, and `toggleEnabled` (enabling auto-runs).
  3. Remove the "Add workflow" form including the `frequencyHours` input, the `researchType` selector, the `promptInstructions` textarea — anything that lets an admin DEFINE a new auto-running task.
  4. Render the existing tasks (workflows fetched from GET) as a read-only list, each row showing: task name, last run timestamp, last run status (success/failure), and a "Run Now" button.
  5. The "Run Now" button should call the existing manual-trigger endpoint (search the file for the existing `triggerNow` or similar mutation and keep that one). If no such endpoint exists, file a `BLOCKED.md` — CC will add the manual-trigger route before you proceed.
  6. Add a top-level `<Alert>`:
     ```tsx
     <Alert>
       <AlertTitle>Manual runs only</AlertTitle>
       <AlertDescription>
         Per <code>analyst-trigger-discipline.md</code>, scheduled
         (cron-triggered) Specialist runs are forbidden. Tasks below
         are dev-registered; click "Run Now" to launch one on demand.
       </AlertDescription>
     </Alert>
     ```
- **Affected dependency surfaces:** S1 (UI), S5 (research pipeline — manual-trigger is preserved, scheduled trigger removed)
- **Cross-check invariants:** Per `cross-check-invariants.md` — when removing the schedule editor, grep for `frequencyHours` across `client/src/` and remove any UI references. The DB column can stay (CC's follow-up handles schema cleanup); UI just stops touching it.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] No `frequencyHours` editing UI in the file
  - [ ] No "Add workflow" / "New schedule" affordance
  - [ ] Each task has a "Run Now" button wired to the manual-trigger endpoint
  - [ ] Manual-runs-only banner present
- **Test impact:** None new today. CC will add a proof test in follow-up that asserts no `frequencyHours` form input exists in the panel file.
- **Rollback notes:** Restore from git.

### S2: BLOCKED-handling check

- **Files:** None (this is a process step — only file `BLOCKED.md` if step S1 fails)
- **Change:** If during S1 you discover the panel has NO existing manual-trigger endpoint (only schedule-create + auto-run), STOP. Do NOT improvise — file a `BLOCKED.md` sibling next to this packet listing the missing endpoint. CC will add the manual-trigger route, then you resume S1.
- **Acceptance criteria:**
  - [ ] If unblocked: S1 verification passes
  - [ ] If blocked: BLOCKED.md exists naming the missing endpoint

## Verification (MANDATORY)

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — 0 errors / 0 warnings on the edited file
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification

- [ ] AI Intelligence → System → Scheduled Research renders task list with Run Now buttons; no Add/Edit forms; no `frequencyHours` field anywhere
- [ ] Banner explains manual-runs-only policy
- [ ] Clicking Run Now triggers the manual endpoint; response toast appears
- [ ] No console errors

## Out of scope (MANDATORY)

- **Server-side route removal.** POST/PATCH/DELETE on `/api/scheduled-research/workflows` (or equivalent) and the cron worker that consumes `frequencyHours` stay live for now. CC removes them in a follow-up commit.
- **Schema column drop.** The `frequencyHours` DB column stays until CC's follow-up.
- **Renaming the panel.** "Scheduled Research" stays as the title for now; renaming to "Research Console" or similar is a separate decision (the audit flagged this as a possible follow-up).

## Surfaces footer template (MANDATORY)

```
Surfaces: S1, S5
Packet: .claude/replit-handoffs/admin-cleanup-scheduled-research-strip-cron.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Out-of-scope items discovered:** _
- **Session-memory entry added:** ❌
