# Admin Section Audit — April 20, 2026

**Scope:** Vocabulary compliance, workflow patterns, menu tree / information architecture. **Not** visual design (the existing look & feel stays).
**Audience:** Replit Agent for execution; human steward for prioritization.
**Authority:** Findings are grounded in `.claude/rules/branding-vocabulary-enforcement.md`, `.claude/rules/the-analyst-persona.md`, `.claude/rules/rebecca-persona.md`, `.claude/skills/vocabulary/SKILL.md` §0 (Constants/Defaults/Assumptions master rule), `.claude/rules/admin-save-state.md`, `.claude/rules/ui-patterns.md`.

---

## Executive summary

The admin section is structurally functional but accumulates drift in three orthogonal dimensions:

1. **Vocabulary compliance** — ~40 forbidden-term instances across tab strings, toasts, dialog titles, section headers. Most common violations: "Pipeline" (forbidden, use "Norfolk AI Engine"), "Stale"/"Fresh" (forbidden, use "Due for review"/"Up to date"), "Update" as button/toast label (forbidden, use "Save"), loading-state words "Running..."/"Generating..."/"Uploading..." (forbidden, use human-action language). One blatant persona violation: `ModelConstantsTab.tsx:566` shows a button titled **"Regenerate Research and Intelligence"** — the exact phrase banned by the vocabulary-compliance test.
2. **Menu tree rot** — `AdminSidebar.tsx` defines 10 visible navigation groups covering ~16 sidebar items, but the codebase carries **30+ legacy URL aliases** in `SECTION_REDIRECTS`. Sidebar labels ("Services & Fees", "LLM Configuration", "System Health") redirect to canonically-named components ("model-defaults", "pipeline-config", "engine-dashboard"). The rename is half-finished: URLs and sidebar labels updated, component filenames + Admin.tsx switch cases still on old names. Reviewing the code, a new contributor would take ~30 minutes to figure out which name is current.
3. **Workflow pattern inconsistency** — Only **7 of 25 admin tabs** use `onSaveStateChange` (the coordinated save-state ref pattern per `.claude/rules/admin-save-state.md`). The other 18 manage save state locally. User experience: same app, different dirty-state feedback depending on which tab you're on. No unsaved-changes warning on navigation for many tabs.

**None of these require visual redesign.** All are in the strings, in the switch-case wiring, and in the save-state pattern. Each is independently fixable in ≤ 30 min of edits per tab.

---

## Part 1 — Vocabulary compliance violations

### Tier 1 — BLATANT (blocks vocabulary-compliance test if caught)

**V1.1 — `client/src/components/admin/model-defaults/ModelConstantsTab.tsx:566`**

```
title="Regenerate Research and Intelligence"
```

Exact phrase banned by `tests/audit/vocabulary-compliance.test.ts`. **Fix:** `title="Ask the Analyst"` (per `branding-vocabulary-enforcement.md` forbidden-terms table).

Risk: this may already be failing the vocab test — if the test currently passes, the string is either wrapped in a non-scanned context (prop that the test's regex doesn't catch) or it's rendered conditionally. Either way, it shouldn't exist.

### Tier 2 — "Pipeline" leakage (forbidden, use "Norfolk AI Engine")

| File | Line | String |
|---|---|---|
| `verification/HealthCheckDashboard.tsx` | 229 | toast description: "Pipeline health check finished successfully." |
| `verification/HealthCheckDashboard.tsx` | 247 | section title: "Pipeline Health" |
| `verification/HealthCheckDashboard.tsx` | 282 | loading state: "Running Pipeline Health Check..." |
| `verification/HealthCheckDashboard.tsx` | 268 | button label: "Run Health Check" (verb-violation) |
| `intelligence/PipelinePoliciesForm.tsx` | 202 | toast: "Pipeline policy saved successfully." |
| `DiagramsTab.tsx` | 44-283, 279-283 | `PipelineStep` component used 20+ times + "Four-Stage Pipeline" section header |

**Fix pattern:**
- "Pipeline Health" → "Norfolk AI Engine Health" (or just "Engine Health" in admin context)
- "Pipeline health check" → "Engine diagnostic"
- "Run Health Check" → "Run Diagnostic" (verb "Run" for user-actions on admin tooling is OK in admin context; avoid in user-facing)
- "Pipeline policy saved" → "Engine policy saved"
- "Four-Stage Pipeline" → "Four-Stage Norfolk AI Engine"
- `PipelineStep` component name: internal code, not user-facing → KEEP (renaming would be churn without value)

### Tier 3 — "Stale" / "Fresh" leakage (forbidden, use "Due for review" / "Up to date")

| File | Line | String |
|---|---|---|
| `verification/TestingDashboard.tsx` | 318 | label: "Staleness" |
| `verification/TestingDashboard.tsx` | 320-321 | StatCard labels: "Fresh" / "Stale" |
| `verification/TestingDashboard.tsx` | 326 | label: "Critically Stale:" |
| `intelligence/CoverageAnalyticsDashboard.tsx` | 163-164 | StatCard labels: "Fresh" / "Stale" |
| `intelligence/EngineDashboard.tsx` | 90, 289-290 | StatCard labels: "Fresh" / "Stale" |
| `intelligence/EngineDashboard.tsx` | 246 | feature description: "Freshness Tracking" |
| `intelligence/PipelinePoliciesForm.tsx` | 109 | field label: "Staleness Threshold" |

**Fix pattern:**
- "Fresh" (as a StatCard label) → "Up to date"
- "Stale" (as a StatCard label) → "Due for review"
- "Staleness" (as a section label) → "Review status" or "Review tracking"
- "Freshness Tracking" → "Review tracking"
- "Staleness Threshold" → "Review interval"

### Tier 4 — "Update" as button/toast label (forbidden, use "Save")

| File | Line | String |
|---|---|---|
| `ai/RebeccaFeedbackTab.tsx` | 128 | toast title: "Updated" |
| `ScenariosTab.tsx` | 81 | toast title: "Scenario Updated" |
| `ScenariosTab.tsx` | 268 | dialog description: "Update scenario name or description." |
| `users/EditUserDialog.tsx` | 43 | dialog description: "Update user information" |
| `hooks.ts` | 114 | toast title: "Default Updated" |
| `hooks.ts` | 148 | toast title: "App Branding Updated" |
| `SourcesTab.tsx` | 321 | dialog description: "Update the source details" |
| `ResearchTab.tsx` | 99 | tooltip: "Use Update LLM List to pull the latest available models from OpenAI, Anthropic, Google, and xAI." |

**Fix pattern:** "Update" → "Save" in all cases. Toast titles become "Saved" / "Scenario saved" / "Default saved" / "App branding saved" / etc.

**Nuance:** `ResearchTab.tsx:99` is talking about a button that says "Update LLM List" — the BUTTON label ALSO needs to change to "Refresh LLM List" or similar (the button fetches new data, doesn't save user edits). Then the tooltip reference auto-aligns.

### Tier 5 — Loading state language violations

Rule: use human-action language ("Studying...", "Cross-referencing...", "Checking..."). Never "Processing...", "Generating...", "Loading...", "Computing...", "Running...".

| File | Line | String | Fix |
|---|---|---|---|
| `verification/HealthCheckDashboard.tsx` | 268 | "Running..." | "Checking engine health..." |
| `verification/HealthCheckDashboard.tsx` | 282 | "Running Pipeline Health Check..." | "Checking Norfolk AI Engine health..." |
| `research-center/IcpSourcesPanel.tsx` | 129 | "Uploading..." | "Uploading sources..." (specific, not generic) |
| `research-center/IcpResearchSection.tsx` | 415 | "Generating..." | "The Analyst is studying..." or "Drafting ICP research..." |
| `intelligence/QASandbox.tsx` | 290 | "Running..." | "Running QA scenarios..." (QA admin context — specific OK) |
| `LogosTab.tsx` | 388 | "Uploading..." | "Uploading logo..." |

### Tier 6 — Rebecca persona violations

Rule: Rebecca is always "Rebecca." "AI Assistant" / "the chatbot" / "the bot" / "AI helper" forbidden.

| File | Line | String |
|---|---|---|
| `NavigationTab.tsx` | 64 | sidebar item label: "AI Assistant" |
| `DiagramsTab.tsx` | 101 | section: "AI Assistants" items list |
| `AdminSidebar.tsx` | 170 | nav group label: "Rebecca AI Assistant" — mixed, has name but redundant "AI Assistant" |
| `model-defaults/LlmDefaultsTab.tsx` | 18 | description: "Default vendor and model for AI assistants (Rebecca)." |

**Fix pattern:**
- "AI Assistant" (alone) → "Rebecca"
- "AI Assistants" (plural, listing agents) → "AI Agents" (which IS an allowed term for the internal dashboard title showing both The Analyst + Rebecca) — OR list them by name: "The Analyst, Rebecca"
- "Rebecca AI Assistant" nav group → just "Rebecca" (she IS the AI assistant; tautological)
- "AI assistants (Rebecca)" in the LlmDefaults description → "Rebecca chat" or "Rebecca's conversations"

### Tier 7 — "Regenerate" violations (forbidden, per vocabulary rule)

| File | Line | String |
|---|---|---|
| `model-defaults/ModelConstantsTab.tsx` | 566 | button title: "Regenerate Research and Intelligence" *(T1 blatant, also listed above)* |
| `research-center/IcpResearchSection.tsx` | 415 | button: "Regenerate" (when ICP research exists) |

**Fix:**
- `ModelConstantsTab.tsx:566` → "Ask the Analyst"
- `IcpResearchSection.tsx:415` → "Consult again" or "Refresh" (admin context, more mechanical)

### Tier 8 — "the system" / "the engine" ambiguous usage

Per rule: "the system" (as subject doing things) is banned. "Norfolk AI Engine" is the canonical term for the research engine specifically.

| File | Line | Context |
|---|---|---|
| `research/EventConfigSection.tsx` | 123 | "Appended to the system prompt as additional context." |

**Judgment:** "system prompt" in admin/technical context (LLM terminology) is arguably OK — this is admin-deep config where the user IS touching LLM internals. Not a clear violation. **Flag for review, not hard fix.**

---

## Part 2 — Menu tree / information architecture issues

### MT.1 — Legacy redirect accumulation

`AdminSidebar.tsx` has `SECTION_REDIRECTS` with ~30 entries mapping legacy URL names → canonical section names. This is technical debt from an incomplete rename pass.

**Observed legacy aliases with live redirects:**

| Legacy name | Redirects to | Reason |
|---|---|---|
| `icp` | `engine-dashboard` | ICP tab was folded into engine dashboard |
| `logos` | `brand` | Logos merged into brand tab |
| `themes` | `brand` | Themes merged into brand tab |
| `icons` | `brand` | Icons merged into brand tab |
| `llms` | `data-sources` | LLM list now under data sources |
| `sources` | `data-sources` | Rename |
| `model-routing` | `pipeline-config` | Rename |
| `cache-services` | `engine-dashboard` | Folded |
| `integrations` | `data-sources` | Folded |
| `api-dashboard` | `data-sources` | Folded |
| `coverage-analytics` | `engine-dashboard` | Folded |
| `pipeline-policies` | `pipeline-config` | Rename |
| `source-registry` | `data-sources` | Rename |
| `system-intelligence` | `engine-dashboard` | Rename |
| `research` | `engine-dashboard` | Rename |
| `conversations` | `ai-agents` | Folded |
| `knowledge-base` | `ai-agents` | Folded |
| `groups` | `users` | Groups removed |
| `companies` | `users` | Companies removed |

**Plus 10-block navigation aliases** (`services-fees`, `company-profile`, `financial-defaults`, `hotel-defaults`, `rental-defaults`, `required-fields`, `sources-apis`, `llm-config`, `engine-health`, `user-management`, `default-assignments`, `rebecca-config`, `themes-appearance`, `app-settings`, `testing-verification`, `reports-exports`) — these are the NEW sidebar labels but redirect to OLD canonical section names.

**The half-finished state:** sidebar labels and URLs use new friendly names; Admin.tsx switch cases + component filenames still use old technical names. Every section rendering requires a redirect hop.

**Fix option A (complete the rename, recommended):** Rename the component files + switch cases to match sidebar labels. Drop all legacy redirects. One PR per section group. ~6-8 commits total (one per nav group).

**Fix option B (revert sidebar):** Change sidebar labels back to technical names ("Model Defaults" instead of "Services & Fees"). Keeps code simple but sacrifices UX clarity. Not recommended.

**Fix option C (bookmark-preservation middle-ground):** Keep redirects for URLs that external users might have bookmarked (assume none — this is internal admin). Drop the rest. Rename components. ~4 commits.

**My recommendation:** option A. Preserve only `icp`, `logos`, `themes`, `llms`, `sources` as legacy redirects (plausibly bookmarked); drop the rest; rename components to match sidebar labels. Clean diff, clear code.

### MT.2 — Sidebar hierarchy unclear

Current nav groups:
1. Management Company (Services & Fees, Financial Statement Lines)
2. Properties (Defaults, Required Fields, Photos & Renders)
3. AI Research (Sources & APIs, LLM Configuration, System Health, Scheduled Research, Hospitality Benchmarks, Analyst Tables, Vector Search Latency)
4. Users (User Management)
5. Scenarios (All Scenarios, Default Assignments)
6. Rebecca AI Assistant (Configuration, Knowledge Base, Conversations)
7. Themes & Appearance (Brand & Appearance)
8. App Settings (Notifications, Navigation, Database)
9. Testing & Verification (Verification, QA Sandbox)
10. Reports & Exports (Reports & Exports)

**Issues:**
- Group 3 "AI Research" has 7 sub-items — disproportionate. Group 5 "Scenarios" has 2. Group 10 "Reports & Exports" has 1 (single-item groups look empty in nav).
- Group 7 "Themes & Appearance" wraps a single tab "Brand & Appearance" — collapse.
- Group 10 "Reports & Exports" same — collapse.
- Group 4 "Users" has one item. Collapse.
- Group 6 "Rebecca AI Assistant" has redundant naming (nav group says "Rebecca AI Assistant", sub-items are "Configuration", "Knowledge Base", "Conversations" — prefix them: "Rebecca Configuration" etc., OR strip the group title to just "Rebecca").
- Group 3 "AI Research" — split into two: "Data Sources & Models" (Sources/LLM/Health/Scheduled) + "Intelligence Library" (Benchmarks/Analyst Tables/Vector latency).

**Proposed simplified structure (7 groups, ~13 items total):**

1. **Company & Properties** — Services & Fees, Financial Lines, Property Defaults, Required Fields, Photos
2. **Intelligence Engine** — Sources & APIs, LLM Configuration, System Health, Scheduled Research
3. **Intelligence Library** — Hospitality Benchmarks, Analyst Tables, Vector Search Latency (diagnostics)
4. **Users & Scenarios** — User Management, All Scenarios, Default Assignments
5. **Rebecca** — Configuration, Knowledge Base, Conversations
6. **App Appearance & System** — Brand & Appearance, Notifications, Navigation, Database
7. **Testing & Exports** — Verification, QA Sandbox, Reports & Exports

Drops from 10 → 7 groups. Collapses single-item groups. Groups related concerns that were artificially split.

### MT.3 — `NavigationTab` self-reference

`NavigationTab.tsx` is the admin tab that configures the **sidebar visibility toggles** for the main app (not admin sidebar). Naming overlap with the admin sidebar itself is confusing. Rename to `SidebarVisibilityTab` or `NavigationVisibilityTab`.

---

## Part 3 — Workflow pattern inconsistency

### WF.1 — Save-state ref pattern compliance (7/25)

Per `.claude/rules/admin-save-state.md`, tabs that report save state to the parent must use a ref-based save handler (stable identity) to avoid infinite re-render loops.

**Tabs correctly using `onSaveStateChange` with ref pattern:**
1. `ModelDefaultsTab`
2. `AIAgentsTab`
3. `AssetDefinitionTab`
4. `IcpLocationTab`
5. `KnowledgeBaseTab`
6. `PipelineConfigTab`
7. `SourcesTab`

**Tabs NOT using it (local save-state, no parent coordination):**
`PeopleTab`, `ActivityTab`, `ScenariosTab`, `BrandTab`, `ExportsTab`, `DataSourcesTab`, `QASandbox`, `ScheduledResearchPanel`, `FinancialLinesTab`, `HospitalityBenchmarksTab`, `AnalystTablesTab`, `VectorBenchTrendsTab`, `NotificationsTab`, `NavigationTab`, `VerificationTab`, `DatabaseTab`, `PhotosRendersTab`, `EngineDashboard` — 18 tabs.

**Impact:**
- User navigates away from a "dirty" tab without warning.
- Parent `Admin.tsx` `saveState` bar doesn't activate.
- Inconsistent dirty-state feedback across the admin section.

**Fix pattern:** For each tab that has editable state:
1. Add `onSaveStateChange` prop.
2. Implement via `draftRef` pattern (see `admin-save-state.md` §The Safe Pattern).
3. Wire into Admin.tsx SectionContent props.

For tabs that are purely read-only (dashboards, logs, status views), no change needed — they don't have dirty state.

**Read-only tabs (legitimate no-save-state):** `ActivityTab`, `QASandbox`, `FinancialLinesTab` (view-only), `HospitalityBenchmarksTab` (view-only), `AnalystTablesTab` (view-only), `VectorBenchTrendsTab`, `VerificationTab`, `DatabaseTab` (dashboard-ish), `EngineDashboard`, `PhotosRendersTab` (mostly view-only).

**Tabs that NEED save-state added:** `PeopleTab`, `ScenariosTab`, `BrandTab`, `ExportsTab`, `DataSourcesTab`, `ScheduledResearchPanel`, `NotificationsTab`, `NavigationTab`. ~8 tabs.

### WF.2 — Unsaved-changes navigation warning

Even where save-state is reported correctly, I don't see a `beforeUnload` or router-intercept hook on the admin parent. User who edits a field and navigates to another tab loses changes silently. Low-severity but frequent.

**Fix:** Add `usePrompt`-style hook in `Admin.tsx` that intercepts navigation when `saveState?.isDirty === true`.

### WF.3 — Empty states

Per `.claude/rules/design-standards.md` §Edge cases: "Empty states — Beautiful illustrated placeholders with CTAs, not blank pages or 'No data' text."

Spot-checked tabs that can legitimately be empty (no users yet, no scenarios yet, no uploaded logos, etc.). Needs full pass — not every "No X" literal was audited. Flag as audit item.

### WF.4 — Toast inconsistency

Tabs use different toast title conventions:
- Some use past-tense ("Saved", "Deleted")
- Some use action-label ("Save successful", "Entry deleted")
- Some use generic ("Updated" — which is also a vocab violation)
- Error toasts: mix of "Failed to X" / "Error" / "Could not X"

**Fix pattern:** canonical toast style from `ui-patterns.md`:
- Success title: past-tense bare verb ("Saved", "Deleted", "Restored")
- Success description: what was affected ("Model defaults saved" etc.)
- Error title: "Couldn't save" / "Couldn't delete"
- Error description: reason or next action

---

## Ranked fix list (for execution)

### P0 — Block-the-commit violations (fix first, no scope debate)

1. **ModelConstantsTab.tsx:566** — replace "Regenerate Research and Intelligence" with "Ask the Analyst" [1-line fix]
2. **All `"Update" → "Save"` replacements** — 8 sites listed in T4 above [1 commit]
3. **All loading-state language violations** — 6 sites listed in T5 [1 commit]

### P1 — Systematic vocabulary cleanup (1-2 commits, Replit)

4. **"Pipeline" → "Norfolk AI Engine" in user-facing strings** — 6 sites (leave `PipelineStep` component internals alone) [1 commit]
5. **"Stale" / "Fresh" → "Due for review" / "Up to date"** — 8 sites [1 commit]
6. **Rebecca persona cleanup** — 4 sites in T6 [1 commit]

### P2 — Menu tree consolidation (3-5 commits, Replit)

7. **Drop legacy redirects for non-bookmarked aliases** — keep 5 plausibly-bookmarked ones, drop 25 others [1 commit]
8. **Rename components to match sidebar labels** — e.g., `ModelDefaultsTab` → `ServicesFeesTab` (if labels stay as "Services & Fees"). ~10 components [3-4 commits]
9. **Collapse 10 nav groups → 7** per §MT.2 proposed structure [1 commit]
10. **Rename `NavigationTab` → `SidebarVisibilityTab`** to disambiguate from admin sidebar [1 commit]

### P3 — Workflow pattern consistency (longer cycle)

11. **Add `onSaveStateChange` to 8 tabs that need it** (PeopleTab, ScenariosTab, BrandTab, ExportsTab, DataSourcesTab, ScheduledResearchPanel, NotificationsTab, NavigationTab) [~8 commits, one per tab]
12. **Add `usePrompt`-style unsaved-changes hook in Admin.tsx** [1 commit]
13. **Toast title canonicalization** — sweep all toasts to the canonical pattern [1 commit]
14. **Empty-state audit** — walk tabs that can be empty, add illustrated CTAs [~5 commits depending on scope]

### P4 — Documentation (Claude Code)

15. **Update `.claude/skills/admin/SKILL.md`** to reflect the simplified 7-group structure if §MT.2 proposal is accepted
16. **Update `docs/architecture/SYSTEM-MODEL.md`** Admin section if the reorg is substantive

---

## Estimated effort

| Priority | Items | Agent | Est. time |
|---|---|---|---|
| P0 | 3 items | Replit | ~2 hours |
| P1 | 3 items | Replit | ~3 hours |
| P2 | 4 items | Replit + Claude Code coordination (rename + sidebar) | ~1 day |
| P3 | 4 items | Replit | ~2 days (spread) |
| P4 | 2 items | Claude Code | ~30 min |

**Total:** ~4 days spread over 1-2 weeks, committable incrementally. Each commit independently verifiable via the existing `tests/audit/vocabulary-compliance.test.ts` — if P0 + P1 + P2 land, the test should flag zero forbidden terms in admin files.

---

## What this audit did NOT cover

- **Visual design compliance.** Not in scope per user directive.
- **Functional correctness** of admin features (does the knob actually change the thing?). Assumed working; this audit is cosmetic + structural.
- **Permission / role checks** on each route. `.claude/rules/security.md` territory — separate audit.
- **Performance** of the admin dashboard query patterns.
- **Mobile responsiveness** of the 19-tab sidebar.
- **Sub-component internals** of complex tabs (ModelDefaultsTab has sub-tabs for Company/Property/LLM/ModelConstants — audited as one unit; sub-tab-level audit is a separate pass).

---

## Related

- `.claude/rules/branding-vocabulary-enforcement.md` — the binding vocabulary rule
- `.claude/rules/the-analyst-persona.md` — Analyst singular/capitalized
- `.claude/rules/rebecca-persona.md` — Rebecca naming discipline
- `.claude/skills/vocabulary/SKILL.md` §0 — Constants/Defaults/Assumptions master rule
- `.claude/rules/admin-save-state.md` — ref-pattern save state
- `.claude/rules/ui-patterns.md` — button labels, accordion summaries, entity cards
- `.claude/rules/design-standards.md` — edge-case handling (empty states, errors, NaN)
- `tests/audit/vocabulary-compliance.test.ts` — the build-time enforcement
