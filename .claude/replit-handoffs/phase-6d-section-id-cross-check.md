# Phase 6d: AdminSection ↔ SPECIALIST_SECTION_TO_ID Cross-Check

Close the cross-check-invariants risk in `AdminSidebar.tsx` where the `AdminSection` union (lines 60–66) and the `SPECIALIST_SECTION_TO_ID` map (lines 74–82) both list the same 7 keys with no compile-time guarantee they remain in sync.

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-006-resources-control-plane.md`](../../docs/architecture/decisions/ADR-006-resources-control-plane.md)
- **ADR status:** `Accepted` (2026-04-21)
- **Last ADR edit:** 2026-04-22 (cosmetic — pointer migration, semantic doctrine unchanged)
- **Sessions stable since acceptance:** 1 (P5 shipped clean)
- **Gate decision:** ✅ **Cleared to execute.**

## Context (≤200 words)

Architect's P5 review (`replit.md:605`) flagged "`SPECIALIST_SECTION_TO_ID` lives in two places (centralize)" as P5-medium #4. Recon during the 2026-04-22 session showed the constant is in fact **defined exactly once** (`AdminSidebar.tsx:74`) and **consumed exactly once** (`Admin.tsx:5,205`) — there is no duplicate definition.

What the architect was likely flagging is a different drift hazard in the same file: the `AdminSection` union type (lines 60–66) and the `SPECIALIST_SECTION_TO_ID` map (lines 74–82) **independently** declare the same 7 specialist section keys. Adding an 8th Specialist requires editing both. TypeScript does not catch the mismatch — a future contributor adds a section to the union, forgets the map, and the unmapped section silently fails at runtime when clicked.

This packet derives the specialist subset of the union from the map keys via `keyof typeof`, eliminating the dual-declaration. Plus a runtime test asserting the map is bijective with the Specialist catalog, catching the catalog-vs-sidebar drift hazard too.

References:
- Skill: `.claude/skills/resources/SKILL.md` (Specialist↔Resource governance)
- Rule: `.claude/rules/cross-check-invariants.md` (the discipline this packet enforces)
- Audit inventory: `.claude/audit-inventory.md` — surfaces touched are `S-Admin-Sidebar` (definition), `S-Admin-Page` (consumer), `S-Specialist-Catalog` (truth-set under test)
- Architect note: `replit.md:605` (P5-medium #4)
- Catalog SoT: `engine/analyst/registry/specialist-catalog.ts`
- Schema: `shared/schema/specialist.ts`

## Atomic-budget check

- **Sub-step count:** 3 (≤7 ✅)
- **File count:** 2 mutated + 1 new test (≤3 ✅)
- **Capability domains touched:** 1 — UI types + matching test ✅

## Tasks

### S1: Refactor — derive `SpecialistSection` from map keys

- **Files:**
  - `client/src/components/admin/AdminSidebar.tsx` (lines 26–82)
- **Change:**
  - Convert `SPECIALIST_SECTION_TO_ID` declaration:
    - Before: `export const SPECIALIST_SECTION_TO_ID: Record<string, string> = { ... }`
    - After: `export const SPECIALIST_SECTION_TO_ID = { ... } as const satisfies Record<string, string>;`
  - Add: `export type SpecialistSection = keyof typeof SPECIALIST_SECTION_TO_ID;`
  - In the `AdminSection` union (lines 60–66): replace the 7 inline `"specialist-..."` literals with a single `| SpecialistSection`.
  - Update the comment on lines 57–59 to point at the new SoT pattern.
- **Affected dependency surfaces (S-tags):**
  - `S-Admin-Sidebar` — definition (this file).
  - `S-Admin-Page` — consumer via narrowing helper (`Admin.tsx`).
  - `S-Admin-Guards` — type re-export consumer (`app-guards.tsx`, `admin-nav.ts`, `Layout.tsx`, `SpecialistPage.tsx`, `ai/ModelRoutingPanel.tsx`). All consume the union as a whole — resulting type is identical to the prior literal union, so no consumer breaks.
- **Cross-check invariants:** This packet IS the cross-check invariant — closing the union-vs-map drift hazard. After this change, adding a Specialist section requires editing only the map; the union derives automatically.
- **Acceptance criteria:**
  - [ ] `npm run check` (tsc) returns 0 errors.
  - [ ] No new lint warnings on `AdminSidebar.tsx`.
  - [ ] Manual: dev server still routes to all 7 specialist pages from the sidebar.
- **Test impact:** Covered by S2.
- **Rollback notes:** Revert the commit. No DB or migration touched.

### S2: Contract test — keys are bijective with catalog

- **Files:**
  - `tests/client/admin-sidebar-section-map.test.ts` (NEW)
- **Change:**
  - Vitest test that imports `SPECIALIST_SECTION_TO_ID` from `client/src/components/admin/AdminSidebar.tsx` and `SPECIALIST_CATALOG` from `engine/analyst/registry/specialist-catalog.ts`.
  - Asserts:
    1. Every key matches `/^specialist-[a-z0-9-]+$/` (URL-safe-dashes invariant).
    2. Every value matches a Specialist `id` in `SPECIALIST_CATALOG`.
    3. Every Specialist in `SPECIALIST_CATALOG` has a corresponding key in the map (no Specialist is unreachable from the sidebar).
    4. The transform is reversible: replacing dots with dashes in a Specialist id produces its map key, and prefixing `specialist-` then mapping forward returns the original id.
  - Each assertion is a separate `it()` so a failure pinpoints which invariant broke.
- **Affected dependency surfaces:** AdminSidebar + Specialist Catalog.
- **Cross-check invariants:** Catches future drift where a Specialist is added to the catalog but not the sidebar map (or vice versa).
- **Acceptance criteria:**
  - [ ] All 4 test cases PASS.
  - [ ] `npm run test:summary` PASS (no regression in prior suite).
  - [ ] Removing any one map entry causes the corresponding test case to fail (manual sanity).
- **Test impact:** +4 cases in 1 new file.
- **Rollback notes:** Revert the commit.

### S3: Doc + session-memory updates

- **Files:**
  - `.claude/session-memory.md` (append ≤5-line entry)
  - `replit.md` (append Recent Changes bullet under existing 2026-04-22 block)
  - This packet's Completion Report section (filled by Replit on exit)
- **Change:** Doc-only.
- **Affected dependency surfaces:** None.
- **Cross-check invariants:** "No new live phase|status table outside `.claude/phases.md`" — verified by gate.
- **Acceptance criteria:**
  - [ ] `tsx script/check-phase-status-uniqueness.ts` PASS.
  - [ ] Session-memory entry ≤5 lines.
- **Test impact:** None.
- **Rollback notes:** Revert the commit.

## Verification

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint:summary` — PASS 0 errors
- [ ] `npm run test:summary` — PASS (incl. 4 new cases from S2)
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (19 phases)
- [ ] `npm run health` — ALL CLEAR
- [ ] `npm run parity:check` — PASS
- [ ] `tsx script/check-phase-status-uniqueness.ts` — PASS

### Behavioral verification

- [ ] Dev server: all 7 specialist sidebar entries route correctly (Funding, Revenue, ICP Intelligence, Risk Intelligence, Executive Summary, Photo Enhancer, Watchdog).
- [ ] No browser console errors during navigation.

### Surface-specific verification

- [ ] Tests/sanity: removing one map entry surfaces a clear test failure (verified manually before reverting).

## Out of scope

- Changing the section name format (still URL-safe dashes; still "specialist-{subject}-{name}").
- Refactoring the OTHER ~70 entries in the `AdminSection` union (canonical sections, legacy aliases, navigation aliases — not the subject of this packet).
- Auto-generating section keys from the catalog at build time (over-engineering; the map literal is the right size).
- Extracting the constant to a `shared/` location (no server-side consumer; client-only is correct).

## Surfaces footer template

Every commit emitted from this packet must end with:

```
Surfaces: S-Admin-Sidebar, S-Specialist-Catalog
Packet: .claude/replit-handoffs/phase-6d-section-id-cross-check.md
```

(Pull exact S-tags from `.claude/audit-inventory.md` during execution; if missing, file BLOCKED.md.)

## Completion report (filled by Replit on exit)

- **Commits:** `<sha1>`, `<sha2>`, `<sha3>`
- **Sub-steps PASSED:**
- **Sub-steps SKIPPED with reason:**
- **Verification gates PASSED:**
- **Verification gates SKIPPED with reason:**
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):**
- **Session-memory entry added:** ☐
