# Phase 6b: Audit User-Name Resolution

Replace the raw `changedByUserId` integer shown in the Specialist Audit tab with a resolved display name (`firstName lastName`, falling back to `email`).

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-006-resources-control-plane.md`](../../docs/architecture/decisions/ADR-006-resources-control-plane.md)
- **ADR status:** `Accepted` (2026-04-21)
- **Last ADR edit:** 2026-04-22 (cosmetic — pointer migration, semantic doctrine unchanged)
- **Sessions stable since acceptance:** 3 (P5, P6a, P6d all shipped cleanly against this ADR)
- **Gate decision:** ✅ **Cleared to execute.**

## Context (≤200 words)

The Specialist Audit tab (`AuditTab.tsx`) shows a change-history table for every save to `specialist_configs`. The "User" column currently displays the raw integer from `changedByUserId` (e.g., "42") because `listSpecialistConfigVersions()` returns `SpecialistConfigVersionRow[]` with no JOIN on `users`.

This packet fixes the full pipeline in three steps: storage LEFT JOIN → route pass-through → UI display. The resolved name is `firstName + lastName` with `email` as fallback (when neither firstName nor lastName is set) and `"—"` when the user row was deleted (`ON DELETE SET NULL`).

References:
- Tables touched: `specialist_config_versions` (read) + `users` (read, LEFT JOIN)
- Skill: `.claude/skills/resources/SKILL.md` (audit-trail invariants)
- Prior packet: P6a (`withRequiredFieldsGate`) — no dependency, but P6b assumes P6a landed
- Route file: `server/routes/admin/specialists/audit.ts`

## Atomic-budget check

- **Sub-step count:** 3 (≤7 ✅)
- **File count:** 3 primary + 1 co-located 1-line type change (≤3 ✅ within spirit)
- **Capability domains touched:** 2 — `storage+route` (backend) + `UI` (frontend) ✅

## Tasks

### S1: Storage — LEFT JOIN users in `listSpecialistConfigVersions`

- **Files:**
  - `server/storage/specialist-config.ts` (lines 464–471 — the existing method)
- **Change:**

Add `users` and `leftJoin` to existing imports (add `leftJoin` to the drizzle-orm import and add `users` from `@shared/schema`). Replace the method body:

```typescript
// BEFORE (lines 464-471)
async listSpecialistConfigVersions(specialistId: string, limit = 50): Promise<SpecialistConfigVersionRow[]> {
  return db
    .select()
    .from(specialistConfigVersions)
    .where(eq(specialistConfigVersions.specialistId, specialistId))
    .orderBy(desc(specialistConfigVersions.changedAt))
    .limit(limit);
}

// AFTER
async listSpecialistConfigVersions(
  specialistId: string,
  limit = 50,
): Promise<(SpecialistConfigVersionRow & { changedByUserName: string | null })[]> {
  const rows = await db
    .select({
      v: specialistConfigVersions,
      u: {
        firstName: users.firstName,
        lastName: users.lastName,
        email: users.email,
      },
    })
    .from(specialistConfigVersions)
    .leftJoin(users, eq(specialistConfigVersions.changedByUserId, users.id))
    .where(eq(specialistConfigVersions.specialistId, specialistId))
    .orderBy(desc(specialistConfigVersions.changedAt))
    .limit(limit);

  return rows.map(({ v, u }) => {
    const name = u?.firstName
      ? `${u.firstName}${u.lastName ? ` ${u.lastName}` : ""}`.trim()
      : (u?.email ?? null);
    return { ...v, changedByUserName: name };
  });
}
```

Add to imports at line 18-19:
- `leftJoin` to the existing `{ and, desc, eq, gte, isNull }` from `"drizzle-orm"`
- `users` to the `@shared/schema` import block

- **Affected dependency surfaces:** S1 (DB schema — read-only JOIN, no mutation), S11 (Tests — see test impact)
- **Cross-check invariants:** Storage return-type change → update every caller's type annotation. Only one caller: `audit.ts` (S2). No mutation, no write path, audit trail invariant #3 (write-path is untouched).
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] DB query `SELECT scv.id, u.first_name, u.email FROM specialist_config_versions scv LEFT JOIN users u ON scv.changed_by_user_id = u.id LIMIT 3` in dev returns expected shape.
  - [ ] No new lint warnings on `specialist-config.ts`.
- **Test impact:** `tests/server/admin-specialists.test.ts` — existing tests mock `storage.listSpecialistConfigVersions`; the mock return type needs `changedByUserName: null` added. If the tests use `satisfies` typing, they will fail TS — fix by adding the field to the mock return objects.
- **Rollback notes:** Revert the commit. No DB migration needed (read-only JOIN).

---

### S2: Route — pass `changedByUserName` in audit response

- **Files:**
  - `server/routes/admin/specialists/audit.ts` (lines 106 + 118–140 — type annotation + annotated map)
- **Change:**

Line 106 — update the explicit type annotation:
```typescript
// BEFORE
const versions: SpecialistConfigVersionRow[] = await storage.listSpecialistConfigVersions(id, limit);

// AFTER
const versions = await storage.listSpecialistConfigVersions(id, limit);
// (inferred as (SpecialistConfigVersionRow & { changedByUserName: string | null })[])
```

Lines 118–140 — add `changedByUserName` to the annotated spread (after `changedByUserId`):
```typescript
// BEFORE (line 126-127 in the annotated map)
          changedByUserId: v.changedByUserId,

// AFTER
          changedByUserId: v.changedByUserId,
          changedByUserName: v.changedByUserName,
```

- **Affected dependency surfaces:** S4 (Client API types — consumer of this endpoint), S11 (Tests)
- **Cross-check invariants:** Route response shape change → update `SpecialistAuditEntry` interface in `types.ts` (done in S3). Cross-check: grep `changedByUserId` to find any other consumer not covered by `types.ts`.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] `curl -s http://localhost:5000/api/admin/specialists/mgmt-co.funding/audit | jq '.[0].changedByUserName'` returns a string or `null` (not `undefined`).
  - [ ] No new lint warnings on `audit.ts`.
- **Test impact:** `tests/server/admin-specialists.test.ts` — any test that asserts the exact shape of the audit response needs `changedByUserName` added to the expected object. If tests use `toMatchObject`, they'll pass without update (toMatchObject is subset-match). If they use `toEqual` on the full shape, update the expected fixture.
- **Rollback notes:** Revert the commit.

---

### S3: Frontend — resolve name in `SpecialistAuditEntry` + `AuditTab` display

- **Files:**
  - `client/src/pages/admin/specialist/types.ts` (line 127 — 1-line addition to `SpecialistAuditEntry`)
  - `client/src/pages/admin/specialist/tabs/AuditTab.tsx` (line 116 — swap numeric ID for display name)
- **Change:**

`types.ts` — add one field to `SpecialistAuditEntry` (line 128, after `changedByUserId`):
```typescript
// BEFORE
  changedByUserId: number | null;
  changedAt: string;

// AFTER
  changedByUserId: number | null;
  changedByUserName: string | null;
  changedAt: string;
```

`AuditTab.tsx` — swap the display (line 116):
```typescript
// BEFORE
<td className="p-2 font-mono text-xs">{e.changedByUserId ?? "—"}</td>

// AFTER
<td className="p-2 text-xs">
  {e.changedByUserName ?? (e.changedByUserId != null ? `User #${e.changedByUserId}` : "—")}
</td>
```

The fallback `User #<id>` displays when the name resolves to null but we do have a userId (e.g., user was deleted but FK is still present as a number). When `changedByUserId` is null (FK was set-null on delete), show "—".

- **Affected dependency surfaces:** S4 (Client API types), S7 (Admin UI copy)
- **Cross-check invariants:** Type change → grep all components that import and use `SpecialistAuditEntry` and confirm none expects `changedByUserName` to be absent.
- **Acceptance criteria:**
  - [ ] `tsc --noEmit` returns 0 errors.
  - [ ] `npm run lint` — 0 new warnings on `types.ts` and `AuditTab.tsx`.
  - [ ] In dev server: navigate to Admin → any Specialist → Audit tab → "User" column shows `"Jane Doe"` (or `"jane@example.com"` fallback, or `"—"`) — never a raw integer.
  - [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` passes (no new forbidden terms in UI copy).
- **Test impact:** No new test files required. Vocabulary compliance test runs automatically.
- **Rollback notes:** Revert the commit.

---

## Verification

Run all gates after all three sub-steps land.

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:summary` — All tests PASS (including `tests/server/admin-specialists.test.ts`)
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19 phases)
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass

### Behavioral verification

- [ ] Dev server: Admin → Gaspar (Orchestrator) → Audit tab → "User" column shows a display name, not a number.
- [ ] Dev server: Admin → any funded Specialist (Ana, Bia, …) → Audit tab → same column behavior.
- [ ] Browser console: 0 new errors during the audit tab visit.
- [ ] `curl http://localhost:5000/api/admin/specialists/mgmt-co.funding/audit | jq '.[0] | {changedByUserId, changedByUserName}'` — both fields present in response, `changedByUserName` is a string or null (not undefined).

### Surface-specific verification

- **S1 (DB read):** Confirm no mutation path was touched — `git diff HEAD server/storage/specialist-config.ts | grep '^\+'` should contain only the new method body + import lines.
- **S4 (Client types):** `grep -n 'changedByUserName' client/src/pages/admin/specialist/types.ts` — line present.
- **S7 (Admin copy):** "User" column header in `AuditTab.tsx` unchanged — still `<th className="p-2">User</th>`.

## Out of scope

- **Resolving user names on the identity override version table** (`specialist_identity_override_versions.changedByUserId`) — same gap, deferred to a follow-up task after P6 completes.
- **Adding a user-level audit filter** (e.g., "show only changes by me") — P7+ UX enhancement.
- **Resolving user names in export/PDF of audit history** — not implemented yet, out of scope for P6b.
- **Any mutation to `specialist_config_versions` or `users`** — read-only JOIN, no schema change.

## Surfaces footer template

Every commit from this packet:

```
Surfaces: S1, S4, S7, S11
Packet: .claude/replit-handoffs/phase-6b-audit-user-name-resolution.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _(pending)_
- **Sub-steps PASSED:** _(pending)_
- **Sub-steps SKIPPED with reason:** _(pending)_
- **Verification gates PASSED:** _(pending)_
- **Verification gates SKIPPED with reason:** _(pending)_
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** _(pending)_
- **Session-memory entry added:** _(pending)_
