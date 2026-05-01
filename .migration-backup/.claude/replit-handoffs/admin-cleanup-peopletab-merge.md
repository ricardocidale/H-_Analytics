# Phase Admin-Cleanup-9: Merge PeopleTab wrapper into UsersTab

`PeopleTab.tsx` is a 21-line file whose entire body is a header + `<UsersTab />`. Pointless indirection. Merge the header into UsersTab and delete the wrapper.

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — refactor cleanup

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` row "Users → All Users" — `PeopleTab` is a thin wrapper, recommended merge.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 2 ✅
- **File count:** 3 ✅ (UsersTab edit + PeopleTab delete + Admin.tsx import update)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Move the header into UsersTab + delete PeopleTab

- **Files:**
  - `client/src/components/admin/UsersTab.tsx` (add the page header from PeopleTab)
  - `client/src/components/admin/PeopleTab.tsx` (DELETE)
- **Change:**
  1. Read PeopleTab.tsx — copy the header markup (the `<h2>` + `<p>` block).
  2. Open UsersTab.tsx — paste the header at the very top of the rendered JSX, inside the existing wrapper. Match UsersTab's existing styling conventions.
  3. `git rm client/src/components/admin/PeopleTab.tsx`.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Per `cross-check-invariants.md` — TypeScript compile fails until S2 (Admin.tsx still imports PeopleTab).
- **Acceptance criteria:**
  - [ ] PeopleTab.tsx no longer exists
  - [ ] UsersTab.tsx renders with the new header at top
- **Rollback notes:** Restore both files from git.

### S2: Update Admin.tsx import

- **Files:**
  - `client/src/pages/Admin.tsx`
- **Change:**
  1. Replace `import PeopleTab from "@/components/admin/PeopleTab"` with `import UsersTab from "@/components/admin/UsersTab"`.
  2. Replace `case "users": return <PeopleTab />;` with `case "users": return <UsersTab />;`.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** TS compiles cleanly after this; lint passes.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` 0 errors
  - [ ] `npm run lint` 0/0
  - [ ] No `PeopleTab` reference anywhere in `client/src/`
- **Rollback notes:** Restore from git.

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] Admin → Users → All Users renders identically to before (header + user table)
- [ ] No console errors

## Out of scope (MANDATORY)

- Renaming the route or sidebar entry. "Users" stays.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-peopletab-merge.md
```
