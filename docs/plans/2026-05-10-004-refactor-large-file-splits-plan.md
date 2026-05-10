# Plan: Fix File Size Issues — Large File Splits

**Date:** 2026-05-10  
**Scope:** All first-party source files >1 000 lines and the two oversized doc/memory files  
**Author:** Replit Agent (ce.plan)

---

## Problem Frame

12 files are materially oversized. The threshold for this codebase is **≤ 500 lines** for a component/page/route and **≤ 800 lines** for a complex orchestration file. Files above that threshold are hard to navigate, review, and test in isolation.

| File | Lines | Priority |
|---|---|---|
| `artifacts/api-server/src/chat/rebecca-tools.ts` | 3 571 | CRITICAL |
| `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` | 2 280 | CRITICAL |
| `artifacts/api-server/src/routes/analyst-admin.ts` | 1 603 | HIGH |
| `artifacts/api-server/src/routes/chat.ts` | 1 450 | HIGH |
| `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsPage.tsx` | 1 439 | HIGH |
| `artifacts/api-server/src/routes/admin/model-constants.ts` | 1 288 | MEDIUM |
| `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx` | 1 235 | MEDIUM |
| `artifacts/api-server/src/index.ts` | 1 084 | MEDIUM |
| `artifacts/hospitality-business-portal/src/pages/OperatingStructureComparison.tsx` | 1 079 | MEDIUM |
| `lib/db/src/schema/intelligence-v2.ts` | 1 036 | MEDIUM |
| `memory.md` | 934 | DOC |
| `CLAUDE.md` | 630 | DOC |

---

## Scope Boundary

**In scope:** Pure extraction/splitting — no behavioral change, no new features, no schema changes.  
**Out of scope (protected surface):** `lib/engine/src/`, `lib/calc/src/`. Do not touch these per ADR §9.  
**Out of scope (doc archives):** `docs/`, `references/`, `.local/tasks/` — these may grow; they are not source files.  
**Success criterion:** Every file in the table above ends the split at ≤ 600 lines (ideally ≤ 400). All typechecks green. All tests green. No behavioral diff.

---

## Implementation Units

### T1 — Split `rebecca-tools.ts` (3 571 → ~5 files)

**File:** `artifacts/api-server/src/chat/rebecca-tools.ts`

**Current structure (three logical sections):**
1. Lines 1–1 011: `getRebeccaTools()` — 63 tool JSON Schema definitions
2. Lines 1 012–1 186: `dispatchRebeccaTool()` — routing switch
3. Lines 1 187–3 571: ~30 individual `tool*` implementation functions

**Proposed split:**
```
artifacts/api-server/src/chat/
  rebecca-tool-definitions.ts      # getRebeccaTools() only (~963 lines → still big; see note)
  rebecca-tool-dispatch.ts         # dispatchRebeccaTool() + helpers (~200 lines)
  rebecca-tool-impls-property.ts   # toolListProperties, toolGetProperty, toolUpdateProperty, toolPatchProperty, toolCreateProperty, toolArchiveProperty
  rebecca-tool-impls-scenario.ts   # toolListScenarios, toolGetScenario, toolCreateScenario, toolUpdateScenario, toolUpdateScenarioAssumptions, toolLockScenario, toolDeleteScenario, toolShareScenario
  rebecca-tool-impls-research.ts   # toolTriggerResearch, toolRefreshAnalystTable, toolGetMarketRates, toolGetMarketRate, toolSetMarketRate
  rebecca-tool-impls-deck.ts       # toolGetLbDeckConfig, toolConfigureLbDeck, toolTriggerLbDeckRender, toolGetLbDeckRenderStatus, toolCreateSlideFactoryRun…toolTriggerSlideFactoryBuild (all slide/deck tools)
  rebecca-tool-impls-kb.ts         # KB, vector, knowledge base tools
  rebecca-tool-impls-iris.ts       # toolTriggerIrisRun, toolTriggerIrisHealthCheck, toolTriggerIrisReindex, toolClearIrisGaps, toolGetIrisStatus, toolWriteRetrievalGap
  rebecca-tool-impls-admin.ts      # toolRunComplianceAudit, toolGetScenarioShareList, requireAdminCtx
  rebecca-tools.ts                 # re-export barrel only (getRebeccaTools, dispatchRebeccaTool, ToolContext, DataChangedEntry, KB_CONTENT_VECTOR_PREVIEW_CHARS)
```

**Note on `rebecca-tool-definitions.ts`:** 63 tool JSON schema objects is intrinsically long. If >600 lines after extraction, further split into `rebecca-tool-defs-property.ts`, `rebecca-tool-defs-scenario.ts` etc., and compose them back into `getRebeccaTools()`.

**Key constraints:**
- `dispatchRebeccaTool` must import `tool*` impls; impls import `storage`, `logger`, and domain utilities — no circular deps.
- `ToolContext` and `DataChangedEntry` types stay in `rebecca-tools.ts` (or a new `rebecca-tool-types.ts`) so both the dispatch and impls can import them without a cycle.
- `chat.ts` imports `{ getRebeccaTools, dispatchRebeccaTool }` — that import site must not change.
- `KB_CONTENT_VECTOR_PREVIEW_CHARS` is exported and used in `vector-indexing.ts` — must remain exported.

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `pnpm run check:magic-numbers` — pass
- Grep: `grep -r "from.*rebecca-tools" artifacts/api-server/src/` — all import sites still resolve

---

### T2 — Split `SlideFactoryPanel.tsx` (2 280 → ~7 files)

**File:** `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`

**Current structure:** A 6-tab wizard with all tab UIs inline, plus utility functions, hooks, and constants.

**Proposed split:**
```
artifacts/hospitality-business-portal/src/features/slide-factory/
  SlideFactoryPanel.tsx           # Shell: Tabs wrapper + routing logic only (~200 lines)
  SlideFactoryConstants.ts        # All constants (FACTORY_POLL_MS, thresholds, MAYA_VERDICT_CLASS, etc.)
  SlideFactoryTypes.ts            # FactoryTab, DinoVerdict, and other local types
  SlideFactoryUtils.ts            # Pure helpers: statusToTab, statusBadge, deriveSlotStatus, dinoPctVerdict, isValidBriefFile, propLabel, isTerminal
  SlideFactoryHooks.ts            # useActiveFactoryRun hook
  tabs/
    BriefTab.tsx                  # Tab 1 (f-brief): file upload + brief form
    LorenzoTab.tsx                # Tab 2 (f-lorenzo): ingestion progress
    PropertiesTab.tsx             # Tab 3 (f-properties): property assignment
    LuccaTab.tsx                  # Tab 4 (f-lucca): draft review
    AgentsTab.tsx                 # Tab 5 (f-agents): build progress + slot cards
    DownloadTab.tsx               # Tab 6 (f-download): PDF download + Dino verdict
```

**Key constraints:**
- `MAYA_VERDICT_CLASS` and `deriveSlotStatus` are exported — keep them exported from their new home and re-export from the barrel if needed.
- Each tab component receives the run state it needs as props — no tab reaches up to `useActiveFactoryRun` directly.
- The factory poll and mutation calls stay at the `SlideFactoryPanel.tsx` level, passed down as props.

**Verification:**
- `pnpm --filter @workspace/hospitality-business-portal run typecheck` — clean
- Visual smoke test: all 6 tabs render and transitions work

---

### T3 — Split `analyst-admin.ts` (1 603 → ~3 files)

**File:** `artifacts/api-server/src/routes/analyst-admin.ts`

**Current structure:**
- Lines 1–120: shared utilities (`gaToGlobalInput`, top-level helpers)
- Lines 121–177: `analystRefreshHandler` — main POST handler
- Lines 178–612: `register(app)` — route registration + cooldown reset export
- Lines 613–1592: 7 specialist `run*V1Path` functions (funding, portfolio, property-risk, revenue, compensation, overhead, company, property-defaults) — each 100–200 lines

**Proposed split:**
```
artifacts/api-server/src/routes/
  analyst-admin.ts                # register(), analystRefreshHandler, __resetAnalystCooldown (~400 lines)
  analyst-admin-utils.ts          # gaToGlobalInput, shared prep helpers
  analyst-admin-runners.ts        # All 7 runXV1Path functions (~1 000 lines → still large)
```

**Or, if runners file would still exceed 800 lines:**
```
  analyst-admin-runners-mgmt.ts   # runFundingV1Path, runRevenueV1Path, runCompensationV1Path, runOverheadV1Path, runCompanyV1Path, runPropertyDefaultsV1Path
  analyst-admin-runners-portfolio.ts  # runPortfolioRaiseV1Path, runPropertyRiskIntelligenceV1Path
```

**Key constraints:**
- `analystRefreshHandler` is exported and imported by `legacyRoutes.ts` — must stay exported.
- `__resetAnalystCooldown` is used in tests — must stay exported from `analyst-admin.ts`.
- Runners currently share cooldown/cache/prompt state defined in `analyst-admin.ts` — extract shared state helpers before splitting.

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean
- `pnpm run check:magic-numbers` — pass

---

### T4 — Split `chat.ts` (1 450 → ~3 files)

**File:** `artifacts/api-server/src/routes/chat.ts`

**Current structure:**
- Lines 1–57: imports + `DataChangedEntry` type (duplicated with `rebecca-tools.ts` — should share)
- Lines 58–141: `resolveDefaultModel`, `resolveResponseMode`
- Lines 142–355: `callLlm` (non-streaming LLM call)
- Lines 356–482: `callLlmStream` (streaming LLM call)
- Lines 483–554: SSE helpers + `executeTool`
- Lines 555–1450: `register(app)` — route handler

**Proposed split:**
```
artifacts/api-server/src/routes/
  chat.ts                   # register(app) only (~550 lines)
  chat-llm.ts               # resolveDefaultModel, resolveResponseMode, callLlm, callLlmStream
  chat-sse.ts               # sseWrite, appendToolResults, executeTool SSE helpers
```

**Key constraints:**
- `callLlm` and `callLlmStream` are exported and used in at least one other file (check with grep before splitting).
- `resolveResponseMode` is exported — verify all import sites.
- `DataChangedEntry` type should be imported from `rebecca-tools.ts` not re-declared; verify and consolidate.

**Pre-split check:**
```bash
grep -r "from.*routes/chat\b" artifacts/api-server/src/
```

**Verification:**
- `pnpm --filter @workspace/api-server run typecheck` — clean

---

### T5 — Split `UnifiedRunsPage.tsx` (1 439 → ~5 files)

**File:** `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedRunsPage.tsx`

**Current structure:**
- Lines 1–210: imports + constants + utility functions (formatRelativeTime, formatDuration, normalizeStatus, etc.)
- Lines 211–336: `RunTypeIcon`, `RunRow` components
- Lines 337–441: `SlideFactoryDetail` detail panel (sub-component, 249 lines)
- Lines 442–689: `IrisDetail` detail panel (247 lines)
- Lines 690–812: `AnalystDetail` detail panel (352 lines + sub-components)
- Lines 813–1039: `RunDetailPanel` — dispatcher for above details
- Lines 1040–1136: data hooks (useIrisRun, useSlideFactoryRuns, useSchedulerRuns)
- Lines 1137–1439: `UnifiedRunsPage` default export — list + layout

**Proposed split:**
```
artifacts/hospitality-business-portal/src/pages/intelligence/
  UnifiedRunsPage.tsx              # Default export, list layout + RunDetailPanel (~300 lines)
  unified-runs-utils.ts            # Pure helpers: formatRelativeTime, normalizeStatus, statusVariant, etc.
  unified-runs-hooks.ts            # useIrisRun, useSlideFactoryRuns, useSchedulerRuns
  UnifiedRunsRow.tsx               # RunTypeIcon + RunRow components
  UnifiedRunsDetails/
    SlideFactoryDetail.tsx
    IrisDetail.tsx
    AnalystDetail.tsx
```

**Verification:**
- `pnpm --filter @workspace/hospitality-business-portal run typecheck` — clean

---

### T6 — Split `model-constants.ts` (1 288 → ~3 files)

**File:** `artifacts/api-server/src/routes/admin/model-constants.ts`

**Investigation needed:** Read the file to identify the main logical sections before splitting. Expected groupings:
- Constants freshness scheduler + watchdog logic
- Route handlers (GET/PUT endpoints)
- Storage/DB helpers

**Proposed target:** 3 files, each ≤ 450 lines.  
**Constraint:** `register(app)` stays in `model-constants.ts`.

---

### T7 — Split `RebeccaPanel.tsx` (1 235 → ~4 files)

**File:** `artifacts/hospitality-business-portal/src/components/rebecca/RebeccaPanel.tsx`

**Current structure:**
- Top: constants, local helpers, mode configs (~155 lines)
- `RebeccaPanel` component body (~1 080 lines of logic + render)

**Proposed split:**
```
artifacts/hospitality-business-portal/src/components/rebecca/
  RebeccaPanel.tsx              # Component body only, slimmed (~500 lines)
  rebecca-panel-constants.ts    # RESPONSE_MODES, DEFAULT_CHIPS, BACKGROUND_TOOL_LABELS, constants
  rebecca-panel-utils.ts        # nextMsgId, getStoredMode, getStoredShowTiming, derivePageLabel, parseObservationField, syncChatPrefsToServer
  RebeccaMessageList.tsx        # Message list render (extract the message-rendering JSX block)
  RebeccaInputBar.tsx           # Input textarea + send button + mode selector
```

**Key constraint:** The SSE streaming logic in `RebeccaPanel` is intricate (abort refs, tool timing). Extract display-only sub-components; keep streaming state at the `RebeccaPanel` level.

---

### T8 — Trim `index.ts` (1 084 → ~600 lines)

**File:** `artifacts/api-server/src/index.ts`

**Investigation needed:** Grep for the boot sequence blocks. Likely candidates to extract:
- Phase 1–4 boot hooks (likely 200+ lines of sequential `await` calls)
- CSP/middleware setup
- Static serving setup

**Proposed split:**
```
artifacts/api-server/src/
  index.ts              # Express init, middleware chain, route mounts, server.listen (~500 lines)
  boot.ts               # Phase 1–4 startup sequence (extracted from the startServer() function)
```

---

### T9 — Split `OperatingStructureComparison.tsx` (1 079 → ~3 files)

**File:** `artifacts/hospitality-business-portal/src/pages/OperatingStructureComparison.tsx`

**Investigation needed:** Read structure to find natural component boundaries. Expected split: comparison table component, chart component, assumptions panel, page shell.

---

### T10 — Split `intelligence-v2.ts` schema (1 036 → ~3 files)

**File:** `lib/db/src/schema/intelligence-v2.ts`

**Approach:** Split by domain table groupings (e.g., runs/results, specialist metadata, guidance/analysis). Keep `schema/index.ts` barrel exporting all.

**Constraint:** Schema splits require running `pnpm --filter @workspace/db run generate` — verify no unintended migration is generated (this is a rename, not a structural change, so Drizzle should see no diff).

---

### T11 — Archive `memory.md` (934 → ~150 lines active state)

**File:** `memory.md`

**Problem:** 79 completed `### Task/Phase — COMPLETED` entries from April 2026 are still inline. These are historical record, not working state.

**Approach:**
1. Create `docs/memory-archive/2026-04-archive.md` — move all sections dated April 2026 that are marked `— COMPLETED` into it.
2. Keep in `memory.md`: Project Identity, Critical Rules, Forward-Discipline Playbook pointer, any sections that describe current active state (Feature Flags, Current Test Count, Current Admin Structure, etc.).
3. Target: ~150 lines of genuinely active working state.

**Do not delete:** Keep `docs/memory-archive/2026-04-archive.md` — it's an audit trail.

---

### T12 — Trim `CLAUDE.md` (630 → ~450 lines)

**File:** `CLAUDE.md`

**Bloat sources (lines that duplicate skill content verbatim):**

1. **§2 "Number Taxonomy"** (lines 48–61): the 4-row table is fine; trim the trailing "Full law…" pointer — it's already in §"Architecture Notes" `### Number taxonomy`.
2. **§"Architecture Notes" › "Number taxonomy — the permanent law"** (lines 395–419): This 25-line deep-dive is nearly identical to the summary in the `hplus-variable-taxonomy` skill. Replace with a 4-line pointer: "Full taxonomy: `.agents/skills/hplus-variable-taxonomy/SKILL.md`. The three recurring violations: [list inline]."
3. **§"Architecture Notes" › "Inflation policy"** (lines 421–433): trim to 3-line pointer to the `inflation-cascade` skill.
4. **§"Architecture Notes" › "`reference_brands` AI pipeline wiring"** (lines 444–447): narrow to 2-line pointer.
5. **§"Architecture Notes" › "Known issues to address"** (lines 460–463): archive or move to `docs/issues/known-issues.md` which presumably already has this.
6. **§"Agent & Skill System"** (lines 519–553): this mirrors content already in `replit.md`. Trim to a pointer block.

**Constraint:** Do not remove any of the §1–§12 inviolable rule headers — those are load-bearing. Only trim the Architecture Notes section and the appendix.

---

## Sequencing & Dependencies

```
T11 (memory.md archive)     ← no code deps, do first — unblocks doc hygiene
T12 (CLAUDE.md trim)        ← no code deps, do alongside T11

T1 (rebecca-tools split)    ← must come before any feature that adds Rebecca tools
T4 (chat.ts split)          ← after T1 (DataChangedEntry consolidation)

T3 (analyst-admin split)    ← independent, do in parallel with T1
T5 (UnifiedRunsPage split)  ← independent
T6 (model-constants split)  ← independent
T2 (SlideFactoryPanel split) ← independent
T7 (RebeccaPanel split)     ← independent

T8 (index.ts split)         ← after T1, T3, T4 (may reference extracted modules)
T9 (OperatingStructure)     ← independent, lowest priority
T10 (intelligence-v2 schema) ← independent, requires schema regeneration check
```

**Recommended task agent batches:**
- **Batch A** (parallel, pure extraction): T1, T3, T5
- **Batch B** (parallel, after A): T2, T4, T6, T7
- **Batch C** (parallel, frontend): T9, T10
- **Batch D** (serial, requires careful review): T8 (server entry)
- **Batch E** (doc-only, any time): T11, T12

---

## Verification Gates (all units)

- [ ] `pnpm run typecheck` — clean (no new errors)
- [ ] `pnpm run check:magic-numbers` — pass
- [ ] `pnpm run check:lint` — pass
- [ ] `grep -r "from.*<original-file-stem>" <search-root>` — all import sites resolve to new paths or to the re-export barrel
- [ ] Behavioral smoke test for any split that touches a live UI component (navigate to the page, verify no blank/error render)

---

## Risk Notes

- **`rebecca-tools.ts` circular deps:** Impls import `storage`, `logger`, and each other's types. Define `ToolContext`/`DataChangedEntry` in a dedicated `rebecca-tool-types.ts` to break potential cycles.
- **`SlideFactoryPanel.tsx` exported constants:** `MAYA_VERDICT_CLASS` and `deriveSlotStatus` are used in test fixtures — their export path must stay resolvable. Use a re-export in the barrel.
- **`intelligence-v2.ts` schema split:** Drizzle's migration diffing is schema-content-based, not file-based. Moving table definitions between files does not generate a migration as long as table names and columns are unchanged. Verify with `pnpm --filter @workspace/db run generate` before committing.
- **`index.ts` boot sequence:** The Phase 1–4 startup is stateful and order-dependent. Extract it only as a called function, not a module with top-level side effects.
