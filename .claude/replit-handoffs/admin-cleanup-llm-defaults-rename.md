# Phase Admin-Cleanup-10: Rename "LLM Defaults" → "Research LLM Config"

The audit item "LLM Defaults vs Specialist LlmConfig vs Resources→Models" was resolved: the three surfaces are a cascade, not duplicates. The only needed UI change is a rename to clarify what the "LLM Defaults" tab actually governs: per-research-tab global model defaults stored in `research_config.tabDefaults`. It does NOT govern the model inventory (that's Resources → Models) or Specialist-specific overrides (now disabled).

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — 1-line label rename, no behavior change

## Context (MANDATORY)

The 3-tier model cascade: **Resources → Models** = inventory (what providers/models exist), **LLM Defaults** = global research-tab defaults (which one to use per tab), **Specialist LlmConfig** = per-Specialist override (now disabled).

"LLM Defaults" is ambiguous — it reads as the system-wide model default, not specifically the per-research-tab setting. Renaming to "Research LLM Config" makes the scope immediately clear.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 2 ✅
- **File count:** 2 ✅ (sidebar + model-defaults)
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Rename the sub-tab label inside ModelDefaultsTab

- **Files:**
  - `client/src/components/admin/ModelDefaultsTab.tsx`
- **Change:** Find the `<TabsTrigger value="llm-defaults" ...>LLM Defaults</TabsTrigger>` line (around line 243) and change the label text from `"LLM Defaults"` to `"Research LLM Config"`.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` 0 errors
  - [ ] `npm run lint` 0 errors/warnings
  - [ ] Sub-tab renders with new label "Research LLM Config"

### S2: Update the sidebar leaf description in AdminSidebar

- **Files:**
  - `client/src/components/admin/AdminSidebar.tsx`
- **Change:** The Steady State group's sections include `{ value: "defaults-management-company", label: "Management Company", ... }`. The group `description:` field currently says "Defaults applied to new entities and immutable model constants". Update to:
  ```
  description: "Defaults applied to new entities, model constants, and research LLM config"
  ```
  This surfaces the 3-tier distinction at the group level.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` 0 errors
  - [ ] `npm run lint` 0 errors/warnings
  - [ ] Steady State group description updated

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 PASS
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] Admin → Steady State → Management Company sub-tab shows "Research LLM Config" (not "LLM Defaults")

## Out of scope (MANDATORY)

- Renaming the component file itself (`LlmDefaultsTab.tsx`). File renames cause unnecessary churn in git history. Label change only.
- Changing any backend routes or DB columns. Pure UI label.

## Surfaces footer template (MANDATORY)

```
Surfaces: S1
Packet: .claude/replit-handoffs/admin-cleanup-llm-defaults-rename.md
```
