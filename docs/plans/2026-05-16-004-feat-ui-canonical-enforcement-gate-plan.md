---
title: UI Canonical Enforcement Gate — Analyst CTA + Horizontal Tabs
type: feat
status: active
date: 2026-05-16
deepened: 2026-05-17
---

# UI Canonical Enforcement Gate — Analyst CTA + Horizontal Tabs

## Summary

Lock the *literal-string* and *import-shape* recurrence vectors for two UI consistency rules behind a mechanical CI gate parallel to CLAUDE.md §1 (magic-numbers). A new `scripts/src/check-ui-canonical.ts` checker fails the build on (a) literal-string variants of the "Analyst" CTA label outside the canonical surface, and (b) any horizontal menu that bypasses the canonical `CurrentThemeTab` wrapper in `components/ui/tabs.tsx`. Cleanup of the 3 clear-violation files (2 Rule A + 1 Rule B) + 11 gray-zone files ships in the same PR; `CurrentThemeTab` is rebuilt on top of Radix primitives so a11y semantics are preserved; CLAUDE.md §13 codifies the rule; documentation harmonizes with `replit.md` and the existing `analyst-research-buttons` + `ui-page-patterns` skills.

### What this plan does NOT solve

The user's framing was "solve once and for all." This plan delivers a meaningful reduction in surface area but is honest about two recurrence vectors it does not close:

1. **Dual canonical Analyst buttons.** `components/intelligence/AnalystButton.tsx` and `components/analyst/AnalystActionButton.tsx` both advertise themselves as canonical. The new checker accepts either import. Future agents still choose between them when picking the right component for a new callsite — and one of those choices will eventually be wrong. Consolidating to a single canonical is a 32-file migration tracked as a follow-up plan (see `### Deferred to Follow-Up Work`).
2. **Expression-resolved label values.** The regex checker scans literal-string JSX prop values: `<AnalystActionButton label="Refresh" />` is caught. But `<AnalystActionButton label={ctaLabel} />`, template literals, and `t('cta.analyst')` i18n keys are NOT caught — they're idiomatic React patterns the regex cannot see through. Closing this loophole requires either removing the `label?` prop entirely (compile-time enforcement, deferred) or migrating Rule A enforcement to a TypeScript-aware AST tool (ESLint plugin). See Key Technical Decisions § "Known Limitations of the Regex Approach."

Both vectors are surfaced explicitly in Risks & Dependencies. The plan ships a partial fix with honest framing; full closure requires the deferred follow-up work.

---

## Problem Frame

H+ Analytics has two zero-tolerance UI consistency rules already documented across `.agents/skills/analyst-research-buttons/SKILL.md`, `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md`, and the docstring of `components/intelligence/AnalystButton.tsx`. The rules keep getting violated anyway — `ReferenceRangesTab.tsx` + `FilterBar.tsx` ship "Ask The Analyst" text; `PropertyDetailDrawer.tsx` hand-rolls a `<button>` tab strip; ~11 page-level files use bare `Tabs/TabsList/TabsTrigger` with one-off styling instead of `CurrentThemeTab`. The institutional learning at `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` and `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` is unambiguous: prose-only rules in CLAUDE.md drift across multi-agent workflows (CC + Replit Agent + auto-checkpoint) without a mechanical gate. The fix mirrors the well-established §1 / §5 magic-numbers pattern: a checker script, a gate command in CLAUDE.md, and a one-shot cleanup so the gate flips clean.

---

## Requirements

- R1. Every "Analyst" CTA in `artifacts/hospitality-business-portal/src/` reads exactly `Analyst` (or canonical suffix variant `Analyst — <Tab>`, or running-state `Studying…`). Variants `Ask Analyst`, `Ask the Analyst`, `Ask The Analyst`, and identifier variants `onAskAnalyst`, `askTheAnalyst`, `askAnalyst` are forbidden.
- R2. Every horizontal menu in the portal renders through the canonical `CurrentThemeTab` wrapper from `@/components/ui/tabs`. Direct imports of `TabsList`, `TabsTrigger`, or `TabsContent` from `@/components/ui/tabs` outside `tabs.tsx` itself are forbidden. Hand-rolled `<button>` rows with `activeTab` toggling are forbidden.
- R3. A CI checker `pnpm --filter @workspace/scripts run check:ui-canonical` (or direct `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts`) fails with a non-zero exit code on any R1 or R2 violation. No baseline / ratchet — zero tolerance after cleanup lands.
- R4. CLAUDE.md §13 codifies both rules with the same shape as §1 (rule statement, gate command, skill link, violation examples). The §5 Verification Gate Checklist gains the new gate line. `replit.md` harmonizes with the same content where shared.
- R5. After the cleanup unit lands, the checker reports `PASS` on `main`. The PR that flips the gate on must also be the PR that lands the cleanup.

---

## Scope Boundaries

- Visual redesign of `AnalystButton` / `AnalystActionButton` / `CurrentThemeTab` — only consistency enforcement, no design changes.
- Vertical navigation surfaces (`IntelligenceSidebar`, `AdminSidebar`, dropdown menus, breadcrumbs) — out of scope.
- Other vocabulary rules beyond Analyst CTA text (consistent "Save"/"Cancel"/"Run" labels, brand voice on copy) — covered by the `copywriting` skill. Note: the existing `scripts/src/check-analyst-copy.ts` is narrowly scoped — it only matches the formal status copy pattern `/\bThe Analyst is [a-z][\w-]*/i` (e.g., "The Analyst is studying"). It does NOT overlap with Rule A's "Ask Analyst" patterns; the new checker fills a non-overlapping gap, not a duplicated one.
- Mockup sandbox (`artifacts/mockup-sandbox/`) and `attached_assets/` — both excluded from the checker scan, mirroring `check-analyst-copy.ts` line 127 exclusions.
- Test files (`*.test.ts`, `*.test.tsx`, `*.spec.ts`, `*.spec.tsx`) and `__tests__/` directories — exempt from the checker, mirroring §1's exception.

### Deferred to Follow-Up Work

- **Consolidate the two Analyst button components into one canonical surface.** `components/intelligence/AnalystButton.tsx` and `components/analyst/AnalystActionButton.tsx` both advertise themselves as canonical. They have non-overlapping features (freshness dot + sizes vs. cooldown + variants). Picking one and deleting the other is a 32-file migration that should ride a dedicated plan, not this enforcement work. The checker accepts either import.
- **Tighten `AnalystActionButton.label` prop.** The `label?: string` default `"Analyst"` is a misuse loophole. Removing the prop entirely (making the label hardcoded) would close it permanently — but requires a sweep of every caller. Out of scope; the new checker scans `<AnalystActionButton label="X">` JSX usage and flags non-canonical values as a defense-in-depth substitute.
- **Migrate `check-analyst-copy.ts` to share the cache/skip helpers with the new checker.** Both will use `scripts/src/lib/check-cache.ts`; further DRY work is a follow-up.

---

## Context & Research

### Relevant Code and Patterns

**Checker templates** (use both as reference, but `check-analyst-copy.ts` is the closer pattern — string scanning, no baseline):
- `scripts/src/check-magic-numbers.ts` — ratchet pattern, baseline JSON, `--show`/`--init`/`--strict` flags
- `scripts/src/check-analyst-copy.ts` — pure pattern check, no baseline, `stripComments()` per code file, `SKIP_DIRS` + `SKIP_PATH_PATTERNS_CODE` + `ALLOWED_FILES` exemption layers
- `scripts/src/lib/check-cache.ts` — `computeInputsHash` / `tryCacheHit` / `writeCacheHit` shared helper (cache name namespacing per checker)
- `scripts/package.json` lines 9-29 — existing 18 `check:*` script entries; new entry slots in alphabetically
- `scripts/tsconfig.json` — ESM, tsx runner, vitest for unit tests, plain `node:fs` + regex (no AST tooling in scripts/)

**Canonical components**:
- `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx` — exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`, **`CurrentThemeTab`** (the canonical convenience wrapper), and `CurrentThemeTabItem` type
- `artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx` — self-described canonical, no `label` prop (mechanically forbids misuse), supports `freshnessStatus` + `pulse` + `suffix`
- `artifacts/hospitality-business-portal/src/components/analyst/AnalystActionButton.tsx` — skill-blessed canonical, supports `cooldownRemainingMs` + `variant: header|save-row|modal`, has `label?: string` prop (loophole)
- `artifacts/hospitality-business-portal/src/components/analyst/index.ts` — barrel for `AnalystActionButton`

**Canonical archetype pages** (use the canonical pattern; check against these for visual reference):
- `artifacts/hospitality-business-portal/src/pages/PropertyDetail.tsx` lines 11, 385-523 — Report/Presentation archetype, `<Tabs>` + `<CurrentThemeTab>` + `<TabsContent>` pattern
- `artifacts/hospitality-business-portal/src/pages/CompanyAssumptions.tsx` (via `components/company-assumptions/CompanyAssumptionsTabsView.tsx` lines 11, 223) — Form/Editor archetype, same pattern
- `artifacts/hospitality-business-portal/src/pages/Dashboard.tsx` lines 41, 382-439 — main dashboard, same pattern
- `artifacts/hospitality-business-portal/src/pages/intelligence/AnimationsPage.tsx` lines 5-6, 26-29, 225 — recently shipped (2026-05-16), uses `CurrentThemeTab` correctly

**Rule A violations to refactor** (2 files, 5 occurrences):
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/reference-ranges/FilterBar.tsx` lines 44, 65, 94-100 — hand-rolled `<Button>` with `<IconSparkles>` and label "Ask The Analyst", `onAskAnalyst` prop, `data-testid="button-ask-analyst"`
- `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceRangesTab.tsx` lines 131, 191 — `askTheAnalyst` async function, `onAskAnalyst` prop value

**Rule B violations to refactor**:
- **Clear violation** (1 file): `artifacts/hospitality-business-portal/src/components/property-finder/PropertyDetailDrawer.tsx` lines 44, 49-55, 79-94 — hand-rolled `<button>` row, local `tabs` array, no import from `@/components/ui/tabs`
- **Gray-zone violations** (11 files using bare `Tabs/TabsList/TabsTrigger` with one-off `className` overrides instead of `CurrentThemeTab`):
  - `artifacts/hospitality-business-portal/src/pages/PropertyMarketResearch.tsx` lines 9, 208-234
  - `artifacts/hospitality-business-portal/src/pages/LbSlides.tsx` lines 22, 382-403
  - `artifacts/hospitality-business-portal/src/pages/Analysis.tsx` lines 40-99
  - `artifacts/hospitality-business-portal/src/pages/CompanyResearch.tsx` lines 8, 204-262
  - `artifacts/hospitality-business-portal/src/pages/analysis/FinancingAnalysis.tsx` lines 8, 76-93
  - `artifacts/hospitality-business-portal/src/pages/admin/specialist/SpecialistPage.tsx` lines 21, 245-292
  - `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedLogsPage.tsx` lines 30, 501-511
  - `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` lines 19, 80-93
  - `artifacts/hospitality-business-portal/src/features/design-themes/ThemeManager.tsx` lines 5, 182-199
  - `artifacts/hospitality-business-portal/src/components/research/GuidanceSideSheet.tsx` lines 4, 167-181
  - `artifacts/hospitality-business-portal/src/components/data-table/index.tsx` lines 65-66, 142, 164-166

**Compliant hand-rolled buttons** (DO NOT touch — they conform to the escape-hatch pattern of the `analyst-research-buttons` skill: label `Analyst`/`Studying…`, `IconSparkles`, `data-testid="button-analyst-*"`):
- `artifacts/hospitality-business-portal/src/components/admin/MarketRatesTab.tsx` lines 250-262 (popover constraint)
- `artifacts/hospitality-business-portal/src/components/admin/model-defaults/constants/RefreshResearchPopover.tsx` lines 113-126 (popover constraint)

**Anchor docs**:
- `CLAUDE.md` lines 13-46 — §1 template structure; new §13 inserts at line ~281 (before `# Project Source of Truth` divider)
- `CLAUDE.md` lines 152-164 — §5 Plan Verification Gate Checklist (add new gate line)
- `replit.md` — must harmonize per the existing "memory-file harmonization (mandatory shipping gate)" rule
- `.agents/skills/analyst-research-buttons/SKILL.md` — already prescribes Rule A; the new checker is its missing mechanical reinforcement
- `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` — Rule B source of truth, lists the 9 already-migrated admin components

### Institutional Learnings

- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — canonical shape of the zero-tolerance gate. Three mechanics to copy: scanner under `scripts/src/`, ALLOWLIST with one-line citation comments, `SKIP_FILE_SUFFIXES` for test files. Notes the masking-literal anti-pattern: `const ASK_ANALYST_CTA = "Ask Analyst"` is the same violation as the bare string — the checker must scan both.
- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` — direct precedent that "a checker that scans strings rather than numbers" is the missing class of gate. Explicitly notes the magic-numbers checker can't detect string-typed violations, which is why a sibling checker is needed.
- `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` — establishes `AnalystActionButton` as the canonical trigger; introduces the `VoiceRenderedString` branded-type trick as a compile-time "mini mechanical gate." Worth considering as a future hardening pass.
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — confirms `.agents/skills/analyst-research-buttons/SKILL.md` is the source of truth for analyst-button naming convention. New checker cites this skill in violation messages.
- `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` — Rule B canonical authority. Companion gate `check:flex-label-overflow` already exists with the ratchet idiom applied to UI concerns — direct structural precedent.
- `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` — direct evidence that CLAUDE.md rules drift without a mechanical gate. "Most dangerous drift" is when prose reads authoritative but contradicts code; agents trust the dated rule.
- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` — exact failure mode the user is asking about: Replit Agent reads §X, honors the letter, recreates the forbidden pattern anyway. Fix shape: name the protected surface AND name the canonical destination in the violation message.
- `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` — three documented Replit-Agent silent-regression cases. The pre-merge author-identity scope check catches a different class than text-vocabulary; both are needed.
- `docs/solutions/integration-issues/replit-ide-auto-checkpoint-captures-cc-edits-2026-05-11.md` — auto-checkpoint mechanism that surfaces forbidden patterns silently. CI text-vocabulary scanning is immune to this because it runs on file contents regardless of authorship.
- `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md` — when a canonical doesn't fit a new need, **add a variant prop, don't fork**. Worth including in the checker's failure message so devs know the escape route.
- `docs/solutions/security-issues/csrf-coverage-rollout-2026-05-11.md` — seven-PR "report mode → migrate callsites → flip to enforce" rollout. Not needed here (only 3 clear + 11 gray-zone violations, all touchable in one PR) but documented as the fallback if the gray-zone refactor turns out larger than expected.

### External References

External research skipped — local patterns are dense and well-established (`check-magic-numbers.ts`, `check-analyst-copy.ts`, `check-flex-label-overflow.ts` are all direct templates).

---

## Key Technical Decisions

- **Single combined checker `check-ui-canonical.ts` over two split checkers.** One CLAUDE.md gate line is easier to police than two; the checker's internal structure already supports orthogonal rule sets (separate ALLOWLIST and SKIP lists per rule). Rationale: existing repo precedent (`check-analyst-copy.ts` packs multiple banned-text patterns into one script).
- **Zero tolerance — no baseline JSON file.** User explicitly asked to "solve once and for all." Cleanup unit refactors every known violation in the same PR before the checker is wired in, so the gate flips with no allowance. Rationale: a baseline allows existing violations to remain indefinitely; the user's prior zero-tolerance rules already had that property (prose only) and that's what failed.
- **Strict Rule B — bare `TabsList`/`TabsTrigger`/`TabsContent` imports outside `tabs.tsx` itself are forbidden.** Loose interpretation would only catch the 1 hand-rolled violator (`PropertyDetailDrawer.tsx`) but leave the 11 gray-zone files as a separate visual-inconsistency problem the user explicitly called out ("all horizontal menus should use same UI design and CSS"). Strict aligns with `currentthemetab-migration-convention-2026-05-16.md` shipped today. Rationale: same canonical primitive everywhere; visual consistency is the user's stated goal.
- **Refactor all 14 files (2 Rule A + 12 Rule B) in this plan.** Bundle the refactor and the gate-flip in the same PR so reviewers see them together. Rationale: `csrf-coverage-rollout-2026-05-11.md` documents the staged rollout for cases where there are dozens of violations; 14 is small enough for a single coherent PR.
- **Both Analyst button components remain canonical for the checker's purpose.** `AnalystButton` and `AnalystActionButton` consolidation is deferred. Checker accepts either import; cleanup unit picks whichever fits each callsite's context. Rationale: consolidation is a 32-file migration with non-trivial API merge work — distinct from the enforcement-gate plan and would dilute its scope. **This deferral is a known partial fix** — Summary § "What this plan does NOT solve" surfaces the recurrence-vector cost.
- **No AST tooling — plain `node:fs` + regex + minimal JSX-fragment parsing.** Scripts package has no AST deps installed (no `ts-morph`, no `@babel/parser`); existing checkers all use regex. The checker uses targeted regex for: (a) banned text patterns, (b) banned imports from `@/components/ui/tabs`, (c) `<AnalystActionButton label="X">` JSX prop scanning with **multi-line JSX buffering** — scan from `<AnalystActionButton` through the matching `>` / `/>` (not per-line) so multi-line callsites are reached. Rationale: matches repo convention; avoids dependency expansion. Multi-line buffering is required because every real callsite in the repo opens the tag on one line and lists props on subsequent lines — a strict per-line regex would fire on zero callsites.
- **Wire into `pnpm` workspace scripts and direct-`tsx` invocation.** CLAUDE.md §13's gate command uses the direct path (`scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts`) to mirror §1. `package.json` adds `check:ui-canonical` script for convenience and CI workflow integration.
- **`CurrentThemeTab` rebuilt on Radix primitives in this plan.** The current implementation in `components/ui/tabs.tsx` lines 86-116 renders plain `<button>` elements — no `role="tab"`, no `aria-selected`, no arrow-key navigation. Migrating 11 pages from `Radix TabsTrigger` to this primitive would silently regress accessibility. U8 rebuilds `CurrentThemeTab` to wrap `Radix.Tabs.List` + `Radix.Tabs.Trigger` internally so ARIA semantics and keyboard nav are preserved. Visible styling unchanged. Rationale: every other shadcn primitive in the repo wraps Radix; `CurrentThemeTab` is the outlier — bring it back into the canonical pattern.

### Known Limitations of the Regex Approach

The Rule A checker enforces *literal-string* violations only. The following patterns are knowingly outside its detection surface and remain enforced by code review / follow-up tooling:

| Bypass pattern | Example | Why regex can't catch it |
|---|---|---|
| Variable-resolved label | `<AnalystActionButton label={ctaLabel} />` | Regex sees the expression form, not the resolved value |
| Template literal | `` <Button>{`Ask${" "}Analyst`}</Button> `` | Per-line regex doesn't follow concatenation |
| Cross-line concatenation | `const s = "Ask " + \n "Analyst"` | Multi-line value construction |
| i18n key | `<Button>{t('cta.ask_analyst')}</Button>` | Bundle resolves at runtime; regex doesn't scan en.json |
| Prop drilling | `<MyWrapper label="Ask Analyst" />` then forwarded | Regex sees `MyWrapper`, not the inner button |

The honest framing: this gate raises the cost of literal-string violations from zero to "blocked by CI." Resolved-string violations cost the same as before (require code review). Closing the resolved-string class requires either (a) removing the `label?` prop from `AnalystActionButton` so misuse is a TypeScript error (deferred — 32-file caller sweep) or (b) an ESLint plugin using `@typescript-eslint/parser` (deferred — see Open Questions § "ESLint vs custom-regex").

---

## Open Questions

### Resolved During Planning

- **Single checker vs two checkers?** → One combined `check-ui-canonical.ts` with two internal rule sets. (Documented above.)
- **Strict or loose Rule B interpretation?** → Strict; CurrentThemeTab is the canonical wrapper per the convention doc shipped 2026-05-16.
- **Which Analyst button is canonical?** → Both are accepted by the checker; consolidation deferred to a follow-up plan. The recurrence-vector cost is surfaced in Summary § "What this plan does NOT solve."
- **Where to insert the new CLAUDE.md section?** → §13, immediately after §12 ("Model Cost Optimization") and before the `# Project Source of Truth` divider (around line 281).
- **Skill location?** → Extend the existing `.agents/skills/analyst-research-buttons/SKILL.md` for Rule A enforcement details; **extend the existing `.agents/skills/ui-page-patterns/SKILL.md` for Rule B** rather than creating a sibling skill (that skill is the one agents already read when scaffolding a new page; teaching the canonical there avoids the "agents read skill X but rule lives in skill Y" failure mode documented at `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`). Single CLAUDE.md §13 entry links both.
- **ESLint vs custom-regex for Rule B.** → Stay with the custom-regex checker for this plan (matches `check-magic-numbers.ts` / `check-analyst-copy.ts` precedent; ships in one PR without new tooling). An ESLint `no-restricted-imports` rule would handle Rule B declaratively with IDE squiggles and would be more idiomatic for an import-shape constraint; tracked as a follow-up. **For Rule A specifically**, the regex approach has documented bypasses (Key Technical Decisions § "Known Limitations") — a future TypeScript-AST-aware pass (ESLint with `@typescript-eslint/parser`) is the more durable closure but is deferred to keep this plan's scope bounded.
- **Compound `docs/solutions/` doc redundancy.** → Fold the enforcement-gate documentation into the existing `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` (which already covers Rule B in detail) rather than creating a new sibling at `ui-canonical-enforcement-2026-05-16.md`. U7 revised to add a "Mechanical enforcement" subsection to the existing doc plus a one-line cross-link. Avoids the multi-location-drift failure mode for the rule itself.

### Deferred to Implementation

- **Should the checker scan `attached_assets/`?** Defaulting to no (existing convention excludes it) but verify no `attached_assets/*.tsx` files are referenced by production code. The pattern-recognition pass during cleanup will catch this.
- **CI workflow integration.** Where exactly in `.github/workflows/` (or equivalent) the new gate slots in. The existing magic-numbers gate's wiring is the template; deferred until checker is implemented and confirmed PASS on `main`.
- **§N graduation criterion** (deferred to a follow-up strategy plan). Every new always-loaded CLAUDE.md rule adds context tax to every session — at what N does the §1-§N stack become its own friction? This plan adds §13; the next zero-tolerance rule could add §14, §15, … . A tier-2 "Operational Conventions" doc that some §X items could migrate to is a candidate. Out of scope for this plan; surface as a strategy question.

---

## Implementation Units

- U1. **Refactor Rule A violations — ReferenceRangesTab + FilterBar**

**Goal:** Replace the hand-rolled "Ask The Analyst" button + handlers in `ReferenceRangesTab.tsx` and `FilterBar.tsx` with the canonical `AnalystButton` from `@/components/intelligence/AnalystButton`. Rename the prop and handler so no "ask"-shaped identifier survives.

**Requirements:** R1, R5

**Dependencies:** None — direct refactor.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/admin/intelligence/reference-ranges/FilterBar.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/admin/intelligence/ReferenceRangesTab.tsx`

**Approach:**
- Replace the hand-rolled `<Button>` block in `FilterBar.tsx` lines 94-100 with `<AnalystButton onClick={onAnalystClick} … />`.
- Rename the prop `onAskAnalyst` → `onAnalystClick` in both files (call site + definition + interface).
- Rename `askTheAnalyst` async function in `ReferenceRangesTab.tsx:131` → `runAnalyst` (keeps the function name aligned with the canonical "run/study" verb canon from the `analyst-research-buttons` skill).
- Update header doc comment in `FilterBar.tsx` to remove the stale "Ask The Analyst" reference.
- Keep the existing rotating in-flight UX (`ANALYST_STEPS` lines 159-169) as-is — out of scope for this unit.

**Patterns to follow:**
- `components/intelligence/IntelligenceStatusBar.tsx` — `AnalystButton` usage with `freshnessStatus` and `pulse` props
- `pages/Company.tsx` / `pages/CompanyAssumptions.tsx` — canonical `AnalystButton` callsites for reference

**Test scenarios:**
- Happy path: `FilterBar` renders the canonical `AnalystButton` with label "Analyst" (verify via `data-testid="button-analyst"`).
- Happy path: clicking the button fires the renamed `onAnalystClick` callback.
- Edge case: while running, the button label switches to "Studying…" (canonical loading state from `AnalystButton`).
- Test expectation: existing `analyst-refresh-dialog-rendering.test.tsx` should keep passing; if it asserts the old "Ask The Analyst" text, update the assertion to "Analyst".

**Verification:**
- Both files reference `AnalystButton` from `@/components/intelligence/AnalystButton`.
- `grep -rE "Ask Analyst|Ask the Analyst|Ask The Analyst|onAskAnalyst|askAnalyst|askTheAnalyst"` against `artifacts/hospitality-business-portal/src/` returns zero matches.
- `pnpm run typecheck` clean.

---

- U8. **Extend `CurrentThemeTab` API + rebuild on Radix primitives**

**Goal:** Bring `CurrentThemeTab` back into the canonical shadcn pattern (wraps Radix internals like every other primitive in `tabs.tsx`) and add the per-item affordances the gray-zone migration needs. Visible styling unchanged — this is a structural rebuild plus API additions, not a visual redesign.

**Requirements:** R2 (a11y preservation prerequisite); enables U3.

**Dependencies:** None — independent foundation for U3.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx`
- Modify: `artifacts/hospitality-business-portal/src/tests/` — add `current-theme-tab.test.tsx` (a11y + new affordances)

**Approach:**
- **Rebuild on Radix.** Refactor `CurrentThemeTab` internals to render `<TabsList>` (Radix-wrapped) at the container and `<TabsTrigger>` per item, with the existing visual styling (background, border, active state classes) applied via `className` on those primitives — no plain `<button>` elements. This inherits `role="tab"` / `role="tablist"`, `aria-selected`, arrow-key navigation, Home/End jump, and focus-ring out of the box.
- **Extend `CurrentThemeTabItem`** with these per-item affordances driven by the gray-zone audit:
  - `suffix?: ReactNode` — arbitrary React node rendered after the label (covers `LbSlides.tsx`'s embedded `<ReadinessTabBadge>`).
  - `trailingIcon?: ReactNode` — secondary icon (covers `ThemeManager.tsx`'s dual `<Star>` + `<Lock>` requirement; combine with primary `icon` for two slots).
  - `disabled?: boolean` + `tooltipTitle?: string` per item (covers `SlideFactoryPanel.tsx`'s per-tab disabling).
- **Add a `responsive?: { fallback: "select" }` shape to `CurrentThemeTab`** so a single component can render a `<Select>` below the `@4xl/main` breakpoint and the tab strip above it (covers `data-table/index.tsx`'s paired pattern). Internal state stays in sync because both controls dispatch the same `onTabChange`.
- Re-export `CurrentThemeTab` from the existing module path; no public-API change beyond additive props.

**Patterns to follow:**
- `components/ui/tabs.tsx` current `Tabs/TabsList/TabsTrigger` shadcn-style Radix wrappers (lines 11-51) — the canonical shape every other primitive in this file follows.
- `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md` — additive-prop extension over default-mutation.

**Test scenarios:**
- Happy path: existing `CurrentThemeTab` callsites (the 9 already-migrated admin components per the convention doc) continue to render and behave identically — no visible regression. Verified by manual smoke on three admin pages.
- A11y — keyboard navigation: left/right arrows cycle tabs; Home jumps to first, End jumps to last; tab key moves to next focusable element outside the tablist.
- A11y — screen reader: `role="tablist"` is announced; active tab announces `aria-selected="true"`; verified via `axe-core` assertion or manual VoiceOver/NVDA pass.
- A11y — focus: tab triggers receive a visible focus ring on `:focus-visible`.
- New affordance — `suffix`: an item with `suffix={<Badge>3</Badge>}` renders the badge after the label.
- New affordance — `trailingIcon`: an item with `trailingIcon={<Lock />}` renders the icon at the trailing edge.
- New affordance — `disabled` + `tooltipTitle`: a disabled item is non-clickable; hovering shows the tooltip.
- New affordance — `responsive`: at viewports below `@4xl/main`, a `<Select>` is shown and the tab strip is hidden; above the breakpoint, the strip is shown and the Select is hidden; selection in either control updates the active value.

**Verification:**
- `pnpm run typecheck` clean.
- New `current-theme-tab.test.tsx` passes.
- Manual smoke on 3 existing admin callsites + 3 new gray-zone migrations: no visible regression, keyboard navigation works.

---

- U2. **Refactor Rule B clear violation — PropertyDetailDrawer**

**Goal:** Replace the hand-rolled `<button>` tab row in `PropertyDetailDrawer.tsx` with the canonical `CurrentThemeTab` wrapper from `@/components/ui/tabs`.

**Requirements:** R2, R5

**Dependencies:** None — direct refactor.

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/components/property-finder/PropertyDetailDrawer.tsx`

**Approach:**
- Delete the local `tabs` array at line 44 (or convert it to the `CurrentThemeTabItem[]` shape).
- Replace the `flex gap-1 bg-muted/50 rounded-lg p-1` container block (lines 79-94) with `<CurrentThemeTab tabs={…} activeTab={activeTab} onTabChange={setActiveTab} />`.
- If `CurrentThemeTab` needs a new visual variant for the drawer context, add a `variant?: "default" | "drawer"` prop to `components/ui/tabs.tsx` per the variant-graduation pattern (`docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md`). Default behavior unchanged.

**Patterns to follow:**
- `pages/PropertyDetail.tsx` lines 385-523 — canonical `CurrentThemeTab` usage in a Report/Presentation archetype
- `components/company-assumptions/CompanyAssumptionsTabsView.tsx` lines 11, 223 — `CurrentThemeTab` in a Form/Editor archetype

**Test scenarios:**
- Happy path: drawer renders three tabs (or whatever count the local `tabs` array has), one is active, others are inactive.
- Happy path: clicking a tab calls `setActiveTab` and updates the active styling.
- Edge case: opening the drawer for the first time defaults to the first tab in the list (existing behavior preserved).

**Verification:**
- `PropertyDetailDrawer.tsx` imports `CurrentThemeTab` from `@/components/ui/tabs`.
- No raw `<button>` elements in the file render tab-toggle styling.
- `pnpm run typecheck` clean.
- Manual smoke test: open the drawer in dev, click each tab, verify styling matches the main dashboard.

---

- U3. **Migrate gray-zone files to CurrentThemeTab**

**Goal:** Convert the 11 page-level files that use bare `Tabs/TabsList/TabsTrigger` with one-off styling to the canonical `CurrentThemeTab` wrapper, leveraging the new affordances added in U8. After this unit, the only place `TabsList`/`TabsTrigger`/`TabsContent` are imported is the `tabs.tsx` file itself (and `TabsContent` for panel rendering remains permitted — see Approach).

**Requirements:** R2, R5

**Dependencies:** U8 (the new `suffix`, `trailingIcon`, `disabled`+`tooltipTitle`, `responsive` affordances must exist before the migrations land).

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/pages/PropertyMarketResearch.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/LbSlides.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/Analysis.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/CompanyResearch.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/analysis/FinancingAnalysis.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/admin/specialist/SpecialistPage.tsx`
- Modify: `artifacts/hospitality-business-portal/src/pages/intelligence/UnifiedLogsPage.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`
- Modify: `artifacts/hospitality-business-portal/src/features/design-themes/ThemeManager.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/research/GuidanceSideSheet.tsx`
- Modify: `artifacts/hospitality-business-portal/src/components/data-table/index.tsx`

**Approach:**
- For each file: keep the outer `<Tabs value={…} onValueChange={…}>` wrapper (state plumbing stays). Replace the `<TabsList>…<TabsTrigger />…</TabsList>` block with `<CurrentThemeTab tabs={…} activeTab={…} onTabChange={…} />`. Keep `<TabsContent value="…">…</TabsContent>` for each panel — that import remains permitted because `CurrentThemeTab` is a tab strip, not a content router.
- Six-step migration mechanic is documented in `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` — follow it verbatim.
- **Per-file affordance map** (each callsite uses the affordance added in U8):
  - `pages/LbSlides.tsx` — uses `suffix` on each item to embed `<ReadinessTabBadge staleMissingCount={…} />`.
  - `components/data-table/index.tsx` — uses `responsive={{ fallback: "select" }}` to render `<Select>` below `@4xl/main` and tab strip above.
  - `features/design-themes/ThemeManager.tsx` — uses `icon` (leading) + `trailingIcon` (conditional `<Star>` / `<Lock>`).
  - `features/slide-factory/SlideFactoryPanel.tsx` — uses per-item `disabled` + `tooltipTitle` for non-clickable tabs with hover explanation.
  - The remaining 7 files (`PropertyMarketResearch`, `Analysis`, `CompanyResearch`, `analysis/FinancingAnalysis`, `admin/specialist/SpecialistPage`, `intelligence/UnifiedLogsPage`, `research/GuidanceSideSheet`) migrate with the base API — no new affordances needed.
- **Per-file pre-migration audit gate.** For each file, confirm by direct inspection that the audited affordance covers the existing behavior before applying the migration. If a file reveals a new affordance need not in U8, surface it as a follow-up (do not allow-list at the checker level — that would contradict the zero-tolerance promise).

**Patterns to follow:**
- `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` — the six-step migration recipe and the list of 9 already-migrated admin components for comparison
- `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md` — when to add a variant prop vs. modify default behavior

**Test scenarios:**
- Happy path (per file): each migrated page renders the same number of tabs as before, the same one is active by default, click handlers work.
- Edge case: responsive breakpoints in `components/data-table/index.tsx` continue to show/hide tabs at the right viewport widths (now driven by `responsive={{ fallback: "select" }}` instead of bare `@4xl/main:flex hidden`).
- Edge case: any page that lazy-loads tab content (e.g., `pages/LbSlides.tsx`) continues to load only the active panel.
- Integration — visual: manual smoke on three migrated pages in dev — tab strip looks identical to `Dashboard.tsx` / `PropertyDetail.tsx`.
- Integration — a11y: on three migrated pages, verify left/right arrows cycle tabs, Home/End jump to ends, active tab is announced as `aria-selected="true"`. The Radix-wrap rebuild in U8 provides these for free; this scenario confirms they propagated.

**Verification:**
- `grep -E "from ['\"]@/components/ui/tabs['\"]" artifacts/hospitality-business-portal/src` shows imports of `Tabs`, `TabsContent`, `CurrentThemeTab` only — no imports of `TabsList` or `TabsTrigger` outside `tabs.tsx`.
- `pnpm run typecheck` clean.
- Manual smoke test: visit each migrated page in dev, click through tabs, verify no visible regressions.
- Manual a11y smoke: on 3 migrated pages, keyboard-only navigation reaches and activates every tab; screen-reader announces `tab` role and `aria-selected` correctly. If any callsite fails this check, the U8 Radix-wrap rebuild needs a follow-up fix — do not allow-list at the checker level.

---

- U4. **Add the `check-ui-canonical.ts` checker script**

**Goal:** New TypeScript checker at `scripts/src/check-ui-canonical.ts` that fails on any Rule A or Rule B violation. Pure pattern check (no baseline, no AST), modeled on `check-analyst-copy.ts`.

**Requirements:** R3

**Dependencies:** U1, U2, U3 (cleanup must precede the checker so it passes on `main` from day one).

**Files:**
- Create: `scripts/src/check-ui-canonical.ts`
- Create: `scripts/src/check-ui-canonical.test.ts`
- Modify: `scripts/package.json` (add `check:ui-canonical` script)

**Approach:**
- Scan dir set: `artifacts/hospitality-business-portal/src` (frontend portal only; mockup-sandbox and api-server are exempt because they don't render production UI).
- Code files (`.ts`, `.tsx`, `.js`, `.jsx`): run `stripComments()` borrowed from `check-analyst-copy.ts` (preserves line numbers); per-line tests against the rule regexes.
- Two rule sets:
  - **Rule A — banned identifiers/text** (pattern-based):
    - Banned text patterns (case-insensitive): `\bask\s+(the\s+)?analyst\b` as substring of any string literal or JSX text.
    - Banned identifiers (case-sensitive): `onAskAnalyst`, `askAnalyst`, `askTheAnalyst`, `ASK_ANALYST_*` (catches the masking-literal pattern from `magic-numbers-ratchet-improvements.md`).
    - Banned `<AnalystActionButton label="X" />` where `X` is anything other than `"Analyst"`. **Multi-line JSX buffer:** when the scanner encounters `<AnalystActionButton`, it buffers all subsequent lines until the matching `>` or `/>` closer, then runs `\blabel\s*=\s*"([^"]*)"` against the buffered fragment. A strict per-line regex (`<AnalystActionButton[^>]*\blabel="…"`) would fire on zero callsites because every real callsite is multi-line — see Key Technical Decisions § "Known Limitations of the Regex Approach" for what this catches and what it can't.
  - **Rule B — banned imports**:
    - `import\s*\{[^}]*\b(TabsList|TabsTrigger)\b[^}]*\}\s*from\s*['"]@/components/ui/tabs['"]` — flag if the file path is not `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx` itself.
    - `TabsContent` import remains permitted (it's used to wrap panel content, not the tab strip).
    - Hand-rolled tab pattern (heuristic): `<button` followed within 5 lines by `activeTab\s*===\s*` toggle styling. Flag as `Rule B / hand-rolled`. Heuristic; only fires on truly hand-rolled rows.
- Exclusions mirror `check-analyst-copy.ts`:
  - `SKIP_DIRS`: `node_modules`, `.git`, `.cache`, `.claude`, `dist`, `build`, `.local`, `vendor`, `attached_assets`, `screenshots`, `tmp`, `__generated__`, `generated`, `artifacts/mockup-sandbox`, `artifacts/api-server`
  - `SKIP_PATH_PATTERNS`: `/\.test\.tsx?$/`, `/\.spec\.tsx?$/`, `/__tests__\//`, `/\/tests\//`
  - `ALLOWED_FILES`: empty initially — every file should comply after cleanup. Add entries only with citation comments naming the canonical home, per `magic-numbers-ratchet-improvements.md`.
- Output format mirrors `check-analyst-copy.ts`: `VIOLATION  <relpath>:<lineNum>  <Rule N> — <one-line description>`; final `PASS`/`FAIL` line; `process.exit(1)` on failure.
- Violation messages name BOTH the forbidden pattern AND the canonical destination, per `section-9-vs-subagent-dispatch-guard-2026-05-11.md`: e.g., `Rule A: "Ask Analyst" text. Use <AnalystButton> from @/components/intelligence/AnalystButton or <AnalystActionButton> from @/components/analyst/AnalystActionButton.`
- Caching: reuse `scripts/src/lib/check-cache.ts` (`computeInputsHash` / `tryCacheHit` / `writeCacheHit`) with cache name `"ui-canonical"`.

**Patterns to follow:**
- `scripts/src/check-analyst-copy.ts` lines 1-200 — file-walking, `stripComments`, `SKIP_DIRS` / `SKIP_PATH_PATTERNS` structure
- `scripts/src/check-magic-numbers.ts` — error reporting format, exit code semantics
- `scripts/src/check-spinner-contrast.test.ts` — co-located unit test pattern

**Test scenarios:**
- Happy path: running the checker on a clean tree (after U1-U3 land) exits 0 with `PASS`.
- Rule A — text variant: fixture file containing `<Button>Ask The Analyst</Button>` fails with the right line number and message.
- Rule A — identifier variant: fixture file containing `function askTheAnalyst()` fails.
- Rule A — masking-literal: fixture file containing `const FOO_CTA = "Ask Analyst"` fails (the masking pattern from `magic-numbers-ratchet-improvements.md`).
- Rule A — JSX label prop: `<AnalystActionButton label="Refresh" />` fails; `<AnalystActionButton label="Analyst" />` and `<AnalystActionButton />` (no label) pass.
- Rule B — banned import: fixture importing `TabsList` from `@/components/ui/tabs` outside `tabs.tsx` fails.
- Rule B — hand-rolled tab heuristic: fixture with `<button …>` followed by `activeTab === …` toggle pattern fails.
- Edge case — false-positive guard: a file at `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx` importing `TabsList` from itself does NOT fail (self-reference allowed).
- Edge case — test file exclusion: `*.test.tsx` file with `<Button>Ask Analyst</Button>` does NOT fail (excluded by `SKIP_PATH_PATTERNS`).
- Edge case — comment exclusion: `// Avoid the "Ask Analyst" pattern; use AnalystButton instead.` does NOT fail (comments stripped before scanning).
- Integration: running the checker against the actual codebase post-cleanup (U1-U3 complete) returns 0 violations.

**Verification:**
- `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts` exits 0.
- `pnpm --filter @workspace/scripts run check:ui-canonical` exits 0.
- `pnpm --filter @workspace/scripts test -- check-ui-canonical` passes.

---

- U5. **Wire the new check into typecheck script and CI workflow**

**Goal:** Make the new gate run alongside the existing checkers in any pre-merge workflow, so a violation blocks merge automatically.

**Requirements:** R3

**Dependencies:** U4

**Files:**
- Modify: `scripts/package.json` (already updated in U4 with the `check:ui-canonical` entry; verify it's also added to any aggregate `check:all`-style script if one exists)
- Modify: `.github/workflows/*` (or `replit.toml` / equivalent CI config — verify during implementation which file is the canonical CI gate authority)

**Approach:**
- Inspect existing CI config to see how `check:magic-numbers` and `check:flex-label-overflow` are wired. Add `check:ui-canonical` next to them.
- If a single aggregate script runs all checks in CI (e.g., `pnpm run check:all`), update it to include the new entry.

**Test scenarios:**
- Test expectation: none specific — verification is "the new check runs in CI on a test PR and fails on a synthetic violation."

**Verification:**
- Push a synthetic-violation branch and observe the CI job fail on the new gate.
- Revert the synthetic violation; CI passes again.

---

- U9. **Gate health check — verify the gate stays wired**

**Goal:** Detect accidental disablement of the new gate. A tiny CI assertion confirms (a) the script file exists, (b) the CI workflow references `check:ui-canonical`, (c) a synthetic embedded violation returns exit code 1. Runs on every CI build. Prevents the "authoritative prose contradicts dead code" failure mode documented at `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`.

**Requirements:** R3 (durability beyond initial wiring).

**Dependencies:** U4, U5.

**Files:**
- Create: `scripts/src/check-gate-health.ts` (or extend the existing magic-numbers job's CI script — pick whichever fits the CI infra discovered in U5)
- Modify: `scripts/package.json` (add `check:gate-health` script if a new file is created)
- Modify: CI workflow file (add the gate-health step alongside `check:ui-canonical`)

**Approach:**
- The check has three assertions:
  1. **File-exists:** `scripts/src/check-ui-canonical.ts` is present and `> 0` bytes.
  2. **Wired:** the CI workflow file (`.github/workflows/*` or equivalent) contains the literal string `check:ui-canonical`.
  3. **Effective:** an embedded test fixture with a known synthetic violation (a tiny `.tsx` snippet containing `Ask The Analyst`) is fed to the checker via a one-shot invocation, and the exit code is asserted to be `1`. If the checker's `exit(1)` is silently broken (e.g., a refactor that swallows the exit code), this assertion fires.
- Generalize the script so future zero-tolerance gates (§14, §15, …) can register themselves in a list — the gate-health check then iterates the registry. Initial registry has only `check:ui-canonical`; the structure is the prototype for "check the check" durability.

**Patterns to follow:**
- Existing CI scripts under `scripts/src/` — same ESM/tsx invocation pattern.
- Failure-mode-as-feedback-loop pattern: the gate-health check is itself a gate, so the same disablement-detection logic applies recursively — but at one level of meta it's adequate; turtles-all-the-way-down is out of scope.

**Test scenarios:**
- Happy path: with the checker file present, CI wiring intact, and the checker's `exit(1)` working, gate-health exits 0.
- Failure path — file missing: temporarily rename the checker file; gate-health exits 1 with a clear message.
- Failure path — CI not wired: remove the `check:ui-canonical` line from the CI workflow file; gate-health exits 1.
- Failure path — exit code broken: temporarily modify the checker to always exit 0 (synthetic), feed it the embedded violation; gate-health exits 1 because the violation was not caught.

**Verification:**
- `scripts/node_modules/.bin/tsx scripts/src/check-gate-health.ts` exits 0 in normal state.
- All three failure-mode test scenarios produce non-zero exit codes when synthesized.
- CI workflow shows the gate-health step running on every build.

---

- U6. **CLAUDE.md §13 + §5 Verification Gate update + replit.md harmonize**

**Goal:** Codify both rules at the same severity as §1 in CLAUDE.md, with the gate command and skill links. Add the new gate to the §5 Verification Gate Checklist. Harmonize the same content into `replit.md` per the existing memory-file harmonization rule.

**Requirements:** R4

**Dependencies:** U4 (the gate command in §13 must reference the script that exists).

**Files:**
- Modify: `CLAUDE.md` (insert new §13 around line 281, before `# Project Source of Truth`; add gate line to §5 Verification Gate Checklist around line 158)
- Modify: `replit.md` (mirror the §13 content per the memory-file harmonization rule; reference the same gate command)
- Modify: `.agents/skills/analyst-research-buttons/SKILL.md` (add a "Mechanical enforcement" paragraph naming the new checker; remove the stale `tests/audit/analyst-button-convention.test.ts` reference and replace with the new checker path)
- Modify: `.agents/skills/ui-page-patterns/SKILL.md` — line 84 (replace `<TabsList>/<TabsTrigger>` references with `CurrentThemeTab`) and lines 116-119 (rewrite JSX scaffold to use `<Tabs>` + `<CurrentThemeTab>` + `<TabsContent>` as in `pages/PropertyDetail.tsx`). This is the load-bearing edit — agents reading this skill currently see the *forbidden* pattern as canonical, and would write immediately-failing code after the gate ships.
- Modify: `artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx` header doc — update the stale `.claude/skills/vocabulary/SKILL.md` reference (which doesn't exist) to point at the live `.agents/skills/analyst-research-buttons/SKILL.md` skill.

**Approach:**
- Mirror the structure of CLAUDE.md §1 (lines 13-46) for §13: heading with "MANDATORY GATE" suffix, one-line lead, code fence with gate command, one-sentence rule statements for Rule A and Rule B, violation examples, skill links.
- **Add a "Relationship to §1 and §11" one-line subsection in §13** clarifying that §13 is mechanical (CI-enforced, no judgment), §11 is qualitative (`/post-coding-design-review`), §1 is structural. They run independently and do not substitute. Addresses the §N-coordination concern without inventing a graduation framework here (the broader §N graduation question is logged in Open Questions § "Deferred to Implementation").
- Use CLAUDE.md §11 (lines 263-269) as a shorter precedent if the §13 content fits in 3-4 sentences.
- For `replit.md`: copy the §13 content verbatim (per the agent-memory-file-divergence learning: shared sections must have identical wording in both files). File-specific extras like Replit's `Do Not Touch` list stay only in `replit.md`.
- Don't write a new section into `replit.md` if it already has a section covering the rule — verify with a search before adding.
- **Do NOT create a new `.agents/skills/canonical-horizontal-tabs/SKILL.md`** — the existing `ui-page-patterns` skill is where agents look for tab patterns, so the canonical lives there. Creating a sibling skill increases the multi-location-drift risk documented in `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`.

**Patterns to follow:**
- `CLAUDE.md` §1 lines 13-46 — heading style, gate command shape, skill link format
- `CLAUDE.md` §11 lines 263-269 — short-form mandatory-gate precedent (`/post-coding-design-review`)
- `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` — the harmonization rule and its failure modes

**Test scenarios:**
- Test expectation: none — these are documentation edits. Verification is structural.

**Verification:**
- CLAUDE.md §13 exists between §12 and `# Project Source of Truth`, including the "Relationship to §1 and §11" subsection.
- CLAUDE.md §5 Verification Gate Checklist has the new gate line.
- `replit.md` contains the same §13 content (wording identical for the shared parts).
- `AnalystButton.tsx` header doc no longer references the non-existent `.claude/skills/vocabulary/SKILL.md` path.
- `.agents/skills/ui-page-patterns/SKILL.md` line 84 and lines 116-119 no longer teach the bare-`TabsList`/`TabsTrigger` pattern; the scaffold uses `<CurrentThemeTab>` and the body links to `.agents/skills/analyst-research-buttons/SKILL.md` for Rule A.
- `.agents/skills/analyst-research-buttons/SKILL.md` references `scripts/src/check-ui-canonical.ts` instead of the missing legacy guard test path.

---

- U7. **Fold enforcement-gate documentation into the existing CurrentThemeTab convention doc**

**Goal:** Surface the mechanical-enforcement pattern alongside the existing Rule B convention doc — single source of truth — so future agents discover both the rule and its CI enforcement from one file. Adding a new sibling doc would re-create the multi-location-drift risk documented at `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md`.

**Requirements:** R4

**Dependencies:** U4, U6 (the additions should reference the live script and §13 text).

**Files:**
- Modify: `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` — add a "Mechanical enforcement" section.

**Approach:**
- Add a new "Mechanical enforcement" section to the existing convention doc covering:
  - The new gate command: `scripts/node_modules/.bin/tsx scripts/src/check-ui-canonical.ts`.
  - What it catches (Rule A literal-string violations, Rule B import-shape violations) and the documented limitations (link to Key Tech Decisions § "Known Limitations of the Regex Approach").
  - The CLAUDE.md §13 anchor.
  - Cross-links to `.agents/skills/analyst-research-buttons/SKILL.md` (Rule A skill) and `.agents/skills/ui-page-patterns/SKILL.md` (Rule B skill, now updated in U6).
- Update the existing doc's frontmatter tags if needed (add `ci-gate`, `zero-tolerance`, `checker` to whatever is there).
- **Do NOT create `docs/solutions/conventions/ui-canonical-enforcement-2026-05-16.md`** — folded into the existing doc per scope-guardian SG-003.

**Patterns to follow:**
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — how the magic-numbers checker docs the enforcement layer alongside the rule.

**Test scenarios:**
- Test expectation: none — documentation file.

**Verification:**
- `currentthemetab-migration-convention-2026-05-16.md` contains a "Mechanical enforcement" section referencing the new gate command and §13.
- No new sibling file is created under `docs/solutions/conventions/` for this work.

---

## System-Wide Impact

- **Interaction graph:** the new checker runs in CI alongside `check:magic-numbers`, `check:analyst-copy`, `check:flex-label-overflow`, `check:migration-guards`. No runtime code paths are added — only build-time checks.
- **Error propagation:** a violation produces a non-zero exit code and a multi-line stderr report. CI surfaces this as a failed status check; PRs cannot merge until violations are fixed.
- **State lifecycle risks:** none — checker is stateless, no DB / file writes (other than the optional cache file at `.cache/check-ui-canonical-*.json` for inputs-hash caching, which is gitignored alongside the other checker caches).
- **API surface parity:** rendering parity between `Dashboard.tsx` / `PropertyDetail.tsx` and the 12 migrated pages must be verified visually — the gate enforces structural parity, not pixel parity.
- **Integration coverage:** the checker's own unit tests cover the rule-detection logic; integration coverage is the existing typecheck + manual smoke pass across the 14 refactored files.
- **Unchanged invariants:**
  - `AnalystButton.tsx` and `AnalystActionButton.tsx` APIs are unchanged. The plan does not consolidate them.
  - `tabs.tsx` exports (Tabs/TabsList/TabsTrigger/TabsContent/CurrentThemeTab) are unchanged. The plan does not rename or remove anything; it only forbids external callers from importing `TabsList`/`TabsTrigger` directly.
  - The compliant hand-rolled buttons in `MarketRatesTab.tsx` and `RefreshResearchPopover.tsx` are unchanged — they conform to the escape-hatch pattern from the `analyst-research-buttons` skill.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Gray-zone migration (U3) reveals a 12th file (beyond the 4 audited) that needs a new `CurrentThemeTab` affordance | Surface as a follow-up plan extending U8's API. Do NOT allow-list at the checker level — that would re-introduce the prose-rule-drift failure mode the gate is designed to prevent. The U3 per-file pre-migration audit gate catches this before the migration commit lands. |
| `CurrentThemeTab` Radix-wrap rebuild (U8) regresses a callsite that relies on the current plain-`<button>` rendering | Existing 9 admin callsites are smoke-tested first; visible styling is unchanged by the rebuild (only internals shift to Radix). The Radix primitives accept the same `className` overrides — visual parity is mechanically achievable. If a regression surfaces, U8 ships as a follow-on PR before U3 begins. |
| New checker has a false positive that blocks unrelated PRs | Unit tests in U4 cover the false-positive guards explicitly. If a false positive surfaces in production, the response is to tighten the regex — not allow-list — because allow-listing re-creates the multi-location-drift problem the plan is designed to prevent. (See Key Technical Decisions § "Known Limitations" for the bypass classes this is NOT a defense for.) |
| Two Analyst button components remain a deferred ambiguity; future agents pick the "wrong" one for a new callsite | **Acknowledged partial fix.** This is surfaced in Summary § "What this plan does NOT solve" and in the follow-up plan. The checker accepts either import, so the *literal-string* recurrence is closed. The *component-choice* recurrence remains until consolidation ships separately. |
| Expression-resolved label (`<AnalystActionButton label={variable} />`) bypasses the regex by design | **Acknowledged partial fix.** Closing requires removing the `label?` prop entirely (32-file caller sweep — deferred) or migrating Rule A to a TypeScript-AST tool (ESLint plugin — deferred). Surfaced in Key Technical Decisions § "Known Limitations" so reviewers calibrate expectations. |
| Replit Agent reads CLAUDE.md §13 but recreates a hand-rolled button anyway | The new mechanical gate fires regardless of authorship — see `replit-ide-auto-checkpoint-captures-cc-edits-2026-05-11.md`. Replit Agent's auto-checkpoint cannot bypass the CI check for literal-string violations. The §13 + skill update is for the human-reading and agent-prompt-reading audience; the gate is for everyone. |
| Gate is later disabled (CI step removed, `exit(1)` silently broken, cache returns stale PASS) | U9 (gate health check) detects all three failure modes on every CI build. Without U9, the §13 prose would become the next "authoritative-doc contradicting dead code" case. |
| The cleanup PR's diff is too large for thorough review | The 14 files are mechanical migrations following a documented six-step recipe. Split into U1 + U2 + U3 (and U8 as a foundational pre-commit) within the PR so each commit reviews independently. Reviewers can confirm structural parity via grep after each commit. |
| `check-analyst-copy.ts` overlap with the new checker | Confirmed non-overlapping by the planning research: `check-analyst-copy.ts`'s sole banned regex is `/\bThe Analyst is [a-z][\w-]*/i` (formal status copy only). The new checker fills a non-overlapping gap. No belt-and-suspenders work needed. |

---

## Documentation / Operational Notes

- The new skill `.agents/skills/canonical-horizontal-tabs/SKILL.md` should follow the structure of existing skills under `.agents/skills/analyst-research-buttons/` and `.agents/skills/ui-page-patterns/`. Frontmatter: `name`, `description`, `metadata.type: convention`.
- The compounded solution at `docs/solutions/conventions/ui-canonical-enforcement-2026-05-16.md` should be searchable by tags `ui`, `analyst-button`, `tabs`, `canonical-components`, `ci-gate`, `zero-tolerance`.
- After the PR merges, monitor the next 10 CC + Replit sessions for any agent attempting to reintroduce a forbidden pattern. The gate should catch it; the violation message should redirect them to the canonical component. If an agent reports the checker is "too strict," that's a signal the variant-graduation pattern wasn't followed — the canonical needs a new variant, not a checker exception.
- No runbook update needed — the gate command is documented inline in CLAUDE.md §5 and §13.

---

## Sources & References

- **Existing checker templates:**
  - `scripts/src/check-magic-numbers.ts` — ratchet/baseline architecture; CLAUDE.md §1 source of authority
  - `scripts/src/check-analyst-copy.ts` — string-scanning pattern; closer template
  - `scripts/src/lib/check-cache.ts` — shared caching helper
- **Canonical components:**
  - `artifacts/hospitality-business-portal/src/components/intelligence/AnalystButton.tsx`
  - `artifacts/hospitality-business-portal/src/components/analyst/AnalystActionButton.tsx`
  - `artifacts/hospitality-business-portal/src/components/ui/tabs.tsx` (canonical `CurrentThemeTab` wrapper)
- **Anchor docs:**
  - `CLAUDE.md` §1 (lines 13-46), §5 (lines 152-164), §11 (lines 263-269) — structural precedent for §13
  - `replit.md` — harmonization target per the memory-file harmonization rule
  - `.agents/skills/analyst-research-buttons/SKILL.md` — already prescribes Rule A
- **Institutional learnings:**
  - `docs/solutions/tooling/magic-numbers-ratchet-improvements.md`
  - `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md`
  - `docs/solutions/conventions/currentthemetab-migration-convention-2026-05-16.md` (Rule B source of truth, shipped 2026-05-16)
  - `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` (the violation-message-must-name-canonical pattern)
  - `docs/solutions/documentation-gaps/agent-memory-file-divergence-2026-05-04.md` (CLAUDE.md drift risk)
  - `docs/solutions/architecture-patterns/variant-graduation-shared-component-pattern-2026-05-11.md` (escape-hatch for new visual needs)
  - `docs/solutions/architecture-patterns/analyst-intelligence-display-pattern-2026-05-05.md` (canonical analyst surfaces)
  - `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` (skill-as-source-of-truth pattern)
  - `docs/solutions/workflow-issues/cc-replit-branch-hygiene-2026-05-10.md` (Replit Agent silent-regression evidence)
  - `docs/solutions/integration-issues/replit-ide-auto-checkpoint-captures-cc-edits-2026-05-11.md` (auto-checkpoint failure mode)
  - `docs/solutions/security-issues/csrf-coverage-rollout-2026-05-11.md` (fallback rollout shape if scope expands)
