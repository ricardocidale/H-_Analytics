# Phase Admin-Cleanup-5: Remove Rebecca dual-mounts (Knowledge Base + Conversations)

`Knowledge Base` and `Conversations` are reachable via TWO routes today: from the AI Intelligence sidebar leaf (`knowledge-base`, `conversations`) AND from inside `RebeccaAdminTabs` as sub-tabs. Two clicks, one surface. This packet collapses to one route — the sidebar leaves stay; the sub-tabs inside RebeccaAdminTabs are removed.

## Doctrine Freeze Gate Check (MANDATORY)

- **Gate decision:** ✅ Cleared — UX cleanup, no doctrine

## Context (MANDATORY)

`.claude/audits/admin-intelligence-inventory.md` flagged this as dual-mount UX bug. The proof test `tests/proof/admin-surface-coverage.test.ts` T3 currently allow-lists `knowledge-base`, `conversations`, and `ai-agents` as known dual-mounts pending fix.

The sidebar entries are the canonical access points (they're listed under the Rebecca group). The duplicate sub-tabs inside RebeccaAdminTabs are leftover from when the page tried to be self-contained. Remove them.

## Atomic-budget check (MANDATORY)

- **Sub-step count:** 2 ✅
- **File count:** 2 ✅
- **Capability domains touched:** UI ✅

## Tasks (MANDATORY)

### S1: Remove Knowledge Base + Conversations sub-tabs from RebeccaAdminTabs

- **Files:**
  - `client/src/components/admin/ai/RebeccaAdminTabs.tsx`
- **Change:**
  1. Remove the `<TabsTrigger value="knowledge-base">` and its corresponding `<TabsContent value="knowledge-base">`.
  2. Remove the `<TabsTrigger value="conversations">` and its `<TabsContent value="conversations">`.
  3. The remaining tabs are: Personas, Configuration, Guardrails, Feedback, Analytics (5 tabs, down from 7).
  4. Search the file for any prop drilling that fed the removed tabs (e.g., `initialTab="knowledge-base"`); remove those branches from the `initialTab` switch logic if present.
  5. Update the comment block at the top of the file if it references "7 tabs" or similar.
- **Affected dependency surfaces:** S1 (UI)
- **Cross-check invariants:** Per `cross-check-invariants.md` — search `client/src/` for `initialTab="knowledge-base"` or `initialTab="conversations"` callers. They should all be from `Admin.tsx` or `AiIntelligence.tsx` REBECCA_SUB_TAB maps, both of which point to the canonical sidebar leaves. If any other caller routes through RebeccaAdminTabs to those sub-tabs, that caller needs updating to use the sidebar leaves instead.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors
  - [ ] `npm run lint` 0 errors / 0 warnings
  - [ ] RebeccaAdminTabs renders 5 tabs (not 7)
  - [ ] No `value="knowledge-base"` or `value="conversations"` in RebeccaAdminTabs.tsx
- **Rollback notes:** Restore from git.

### S2: Update proof-test allow-list

- **Files:**
  - `tests/proof/admin-surface-coverage.test.ts` (the `KNOWN_DUAL_MOUNTS` constant)
- **Change:** Remove `knowledge-base` and `conversations` from the AI Intelligence allow-list set. After this packet, only `ai-agents` should remain (it's still routed both ways — that's the actual Rebecca config tab, no dual-mount per se but the case statement returns the same component).
  ```ts
  const KNOWN_DUAL_MOUNTS: Record<string, Set<string>> = {
    "AiIntelligence.tsx": new Set(["ai-agents"]),
  };
  ```
- **Affected dependency surfaces:** S8 (test)
- **Cross-check invariants:** Test must pass after the change — runs T3 against the now-deduped routing.
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` PASS (8/8)
- **Rollback notes:** Restore from git.

## Verification (MANDATORY)

- [ ] `npm run check` — 0 errors
- [ ] `npm run lint` — 0/0
- [ ] `npm run test:file -- tests/proof/admin-surface-coverage.test.ts` — 8/8 PASS
- [ ] `npm run test:summary` — PASS
- [ ] `npm run verify:summary` — UNQUALIFIED
- [ ] AI Intelligence → Rebecca → Configuration loads (5 tabs visible: Personas, Configuration, Guardrails, Feedback, Analytics)
- [ ] AI Intelligence → Rebecca → Knowledge Base loads (sidebar leaf — KnowledgeBaseTab content)
- [ ] AI Intelligence → Rebecca → Conversations loads (sidebar leaf — RebeccaConversationsTab content)
- [ ] No console errors

## Out of scope (MANDATORY)

- The "ai-agents" dual-route stays — that's intentional (sidebar lands on RebeccaAdminTabs's Configuration sub-tab).

## Surfaces footer template (MANDATORY)

```
Surfaces: S1, S8
Packet: .claude/replit-handoffs/admin-cleanup-rebecca-dual-mounts.md
```
