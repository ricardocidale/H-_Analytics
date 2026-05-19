**From:** Replit Agent (session 29)
**To:** CC (Claude Code Shell)
**Date:** 2026-05-19
**Context:** `docs/plans/sidebar-ux-restructure-2026-05-19.md`
**Why this is a handoff:** Replit owns frontend presentation files; CC owns the off-limits engine/calc/db surfaces. This handoff is informational — no CC action required on the sidebar work itself. The main items are (1) a pull to pick up 7 new local commits, and (2) the two pre-existing test failures flagged for awareness.

---

## What Replit shipped this session

Commit `304255a36` — `refactor(ui): sidebar UX restructure — labels, groups, Iris removal`

Three files changed, zero backend or schema changes:

### `AdminSidebar.tsx`
- "AI" nav landmark → **"Intelligence"**
- "Testing & Verification" → **"Quality & Audit"**; `required-fields` moved here from Portfolio as first item
- "Configuration" → **"Preferences"**
- Brand Assets: "Other Graphics" → **"Graphics"**; `brand-themes` moved here from System
- System: `observability` → "Monitoring", `activity` → "Audit Log", `login-settings` → "Authentication"
- Group descriptions updated

### `IntelligenceSidebar.tsx`
- Back-link icon: `IconShield` → `IconArrowLeft`; both unused icons removed from imports
- Iris removed as nav row; `?section=iris` deep-link still resolves via the existing `agent-roster` fallback in `getGroupForSection`
- `id: "agents"` group renamed `id: "rebecca"`, label "Conversational" → "Rebecca"; Iris SectionItem dropped; `getGroupForSection` final fallback updated `return "agents"` → `return "rebecca"`
- "Knowledge & Resources" split into **"Knowledge & Data"** (registry, country data, market data, benchmark bands, analyst tables, assumption guidance) and **"Resources"** (catalog only)
- Assumption Guidance moved System → Knowledge & Data
- Animations moved Knowledge & Resources → Agent Roster (4th item)
- "LLMs" group label → **"Models"**; `llms-other` label "Other" → **"Operations"**
- `vector-bench` label → **"Search Performance"**
- Block comment updated

### `Breadcrumbs.tsx`
- `AI_INTEL.label`: "AI Intelligence" → "Intelligence"
- All `"LLMs · *"` breadcrumb labels → `"Models · *"`; `llms-other` → "Models · Operations"
- `vector-bench` → "Search Performance"
- Admin: `observability` → "Monitoring", `activity` → "Audit Log", `login-settings` → "Authentication"
- Duplicate `"required-fields"` key removed from Portfolio section (now under Quality & Audit only)

---

## State of `origin/main` vs local `main`

```
origin/main  →  8f269d059  chore(status): update cc.md for session 28
local main   →  45057422b  fix(loop-iter-4): apply CodeRabbit review findings
```

**7 commits ahead of origin.** You need to pull before starting work:

```bash
git pull origin main
```

Commits in order (oldest first):
```
2c67b52b6  fix(loop-iter-1): apply CodeRabbit review findings
1b8377937  chore: remove stray --help file created by CodeRabbit review command
0f2121b2d  fix(loop-iter-2): apply CodeRabbit review findings
914e14fd8  fix(loop-iter-3): apply CodeRabbit review findings
529ebe62b  Outline changes to restructure admin and intelligence sidebars
304255a36  refactor(ui): sidebar UX restructure — labels, groups, Iris removal
45057422b  fix(loop-iter-4): apply CodeRabbit review findings
```

---

## Pre-existing test failures (not introduced by this session)

Two tests were already failing before this session and are in CC-owned surfaces:

| Test suite | Failing test | File |
|---|---|---|
| `test:report` | "large multi-year table, landscape > compiler produces multiple table chunks from a 60-row section" — **timeout** | `artifacts/api-server/src/tests/` |
| `test:api-server` | "buildSlide1SubstitutionEntries > emits text ops for headerSubtitle + a single text op for visionBullets joined by newlines" — expected length 2 got 4 | `artifacts/api-server/src/slides/` |
| `test:api-server` | "llm-sections.ts — generateLLMPropertySections vendor dispatch > calls the Anthropic client when vendor=anthropic" — **timeout** | `artifacts/api-server/src/tests/` |

These are in the slide factory / LLM dispatch domain. Replit did not touch those surfaces. Flagging so CC can investigate.

---

## What CC does NOT need to do

- Re-examine AdminSidebar, IntelligenceSidebar, or Breadcrumbs — the restructure is complete and merged.
- Run a code review on the sidebar changes — they are label/group renames only, no logic.
- Update `getGroupForSection` fallbacks — the `"iris"` fallback already returns `"agent-roster"` (unchanged); only the Rebecca group fallback string was updated.

---

## Remaining §2 violations from CC's prior session notes

These were flagged by CC in session 22 and are still open:

1. `lib/engine/src/property/resolve-assumptions.ts:219-220` — `arDays ?? 30`, `apDays ?? 45`. `PropertyInput.arDays/apDays` still typed `number | null`; tightening has `~16 test fixture` blast radius.
2. `artifacts/api-server/src/slides/build-payload.ts:93` — `inflationRate ?? 0.03` — likely dead `??` since `GlobalInput.inflationRate` is required.
3. Route-layer `?? 0.05`/`?? 0.03` in `scenario-helpers.ts` and `analyst-admin-utils.ts`.

---

## Definition of done for this handoff

CC has pulled, confirmed all CI gates green on their local main, and updated `.agents/status/cc.md` with the pull SHA. No further artifacts expected.
