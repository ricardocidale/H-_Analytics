# Phase Admin-Cleanup-4: Admin → Reports & Exports tab kill (orphan)

The audit confirmed `ExportsTab.tsx` is an orphan: admins toggle which sections render in PDF/PNG exports, the value persists to `global_assumptions.exportConfig`, but **production export code never reads it** — `export-generate.ts` ignores it entirely; `ExportDialog.tsx` falls back to localStorage. The UI lies. This packet kills the tab and the sidebar entry.

## Doctrine Freeze Gate Check (MANDATORY)

- **Governing ADR(s):** None — orphan removal
- **ADR status:** N/A
- **Last ADR edit:** N/A
- **Sessions stable:** N/A
- **Gate decision:** ✅ Cleared — bug-fix-against-shipped-code lane

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` (Admin → Reports & Exports row) confirmed via static trace that `global_assumptions.exportConfig` is written by this tab and never read by any production code path. The user explicitly authorized killing it ("if it was needed, it would be wired").

If the toggles are ever needed in the future, rebuilding correctly is cheaper than rewiring dead code.

References:
- Audit: `.claude/audits/admin-intelligence-inventory.md`
- Tab: `client/src/components/admin/ExportsTab.tsx` (384 lines)
- Sidebar entry: `client/src/components/admin/AdminSidebar.tsx` (Reports & Exports group)
- Page route: `client/src/pages/Admin.tsx` (case `"exports":`)

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 3 ✅
- **File count:** 3 ✅ (tab file + sidebar + page route)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Delete the tab component file

- **Files:**
  - `client/src/components/admin/ExportsTab.tsx` — DELETE
- **Change:** `git rm` the file. Also delete `client/src/lib/exportConfig.ts` IF AND ONLY IF nothing outside `ExportsTab.tsx` and the export pipeline imports `loadExportConfig` / `saveExportConfig` / `DEFAULT_EXPORT_CONFIG`. If the export pipeline still uses it (`exportRenderersPdfComprehensive.ts` was flagged in the audit as a localStorage consumer), keep `exportConfig.ts` for now and let CC's server-side follow-up decide.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Per `cross-check-invariants.md` — before deleting, run `grep -rn "ExportsTab\|/api/admin/export-config" client/src/` and ensure only Admin.tsx + AdminSidebar.tsx reference them. Any other reference is a hidden coupling.
- **Acceptance criteria:**
  - [ ] File no longer exists
  - [ ] Grep for "ExportsTab" returns 0 results in `client/src/`
- **Rollback notes:** `git checkout HEAD -- client/src/components/admin/ExportsTab.tsx`

### S2: Remove sidebar entry + page route

- **Files:**
  - `client/src/components/admin/AdminSidebar.tsx` (the "Reports & Exports" group)
  - `client/src/pages/Admin.tsx` (the `case "exports":` branch + the import)
- **Change:**
  - In `AdminSidebar.tsx`: remove the entire `"reports"` NavGroup object (the one with `label: "Reports & Exports"`). Adjust the `AdminSection` union type to drop `"exports"` (search the union for `"exports"` and remove that literal).
  - In `Admin.tsx`: remove the `case "exports": return <ExportsTab />;` branch and the `import` of `ExportsTab`.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** TypeScript will fail compilation if `"exports"` is referenced anywhere else — that's the intended forcing function. Fix the call sites.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] `npm run lint` 0 errors / 0 warnings
  - [ ] AdminSidebar.tsx no longer contains "Reports & Exports" or "All Exports"
  - [ ] Admin.tsx no longer imports `ExportsTab` or has an `"exports"` case
- **Rollback notes:** Restore both files from git.

### S3: Verify the proof test still passes

- **Files:**
  - `tests/proof/admin-surface-coverage.test.ts` — should pass without modification because the deleted entry is no longer in the sidebar to need a case branch
- **Change:** None (the proof test checks "every sidebar value resolves to a case"; removing the value AND the case keeps the relationship satisfied).
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` PASS (8/8)
- **Rollback notes:** N/A.

## Verification (MANDATORY)

### Gate commands

- [ ] `npm run check` — TypeScript: 0 errors
- [ ] `npm run lint` — 0 errors / 0 warnings
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` — 8/8 PASS
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED

### Behavioral verification

- [ ] Admin sidebar no longer has a "Reports & Exports" group
- [ ] Direct navigation to `?section=exports` (legacy bookmark) does NOT render the deleted tab; it should fall through to the default admin section
- [ ] Real export flows (Property → Export PDF / Excel / CSV) still work — they use `/api/exports/generate`, not the killed admin-config endpoint
- [ ] No console errors

## Out of scope (MANDATORY)

- **Server-side endpoint removal.** `GET/PUT /api/admin/export-config` at `server/routes/admin/exports.ts` stays live for now (zero callers after this packet, but CC removes the route + the `global_assumptions.exportConfig` schema column in a follow-up).
- **Migration of saved exportConfig values.** Any rows currently in DB stay; CC's follow-up decides drop vs migrate.
- **Renaming or restructuring real export flows.** Property/Company/Portfolio export menus are unaffected — they consume `/api/exports/generate` directly.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1, S8
Packet: .claude/replit-handoffs/admin-cleanup-exports-tab-kill.md
```

## Completion report (filled by Replit on exit)

- **Commits:** _
- **Sub-steps PASSED:** _
- **Sub-steps SKIPPED with reason:** _
- **Verification gates PASSED:** _
- **Out-of-scope items discovered:** _
- **Session-memory entry added:** ❌
