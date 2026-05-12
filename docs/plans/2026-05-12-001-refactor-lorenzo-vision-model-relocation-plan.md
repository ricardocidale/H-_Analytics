---
title: "refactor: Relocate LORENZO_VISION_MODEL from TS literal to admin_resources runtime fetch"
type: refactor
status: completed
date: 2026-05-12
---

# refactor: Relocate LORENZO_VISION_MODEL from TS literal to admin_resources runtime fetch

## Summary

`deck-render-constants.ts` currently exports `LORENZO_VISION_MODEL = "claude-opus-4-7"` as a
TypeScript string literal — a direct violation of CLAUDE.md §1 (LLM model names must live in
`admin_resources`, not source code). This plan converts all 9 direct non-test consumers and the
`LUCCA_DRAFT_MODEL` / `LUCCA_BEST_SHOT_MODEL` alias chain (5 additional call sites in
`lucca-draft.ts`) to call a new `resolveLorenzoVisionModelId()` async helper backed by an
`llm_slot` admin_resources row. All changes land in one PR — an atomic single-pass refactor.

---

## Problem Frame

`CLAUDE.md §1` prohibits LLM model identifiers as TypeScript string literals or constants
anywhere in source. CodeRabbit thread 3222853600 (🔴 critical) on PR #124 flagged this. The
fix was deferred because 9 direct consumers exceeded the 3-consumer safe threshold for inline
repair; it now needs its own plan. A `TODO(LLM-model-fetch-relocation)` comment at
`artifacts/api-server/src/slides/lucca-best-shot-prompt.ts` marks the primary seam.

---

## Requirements

- R1. `LORENZO_VISION_MODEL`, `LUCCA_DRAFT_MODEL`, and `LUCCA_BEST_SHOT_MODEL` are removed
  from source — no TypeScript constant in the slides surface holds these specific model identifier
  strings. (`MARCO_MODEL`, `MAYA_MODEL`, `SWARM_BUILDER_MODEL` remain — they are CLAUDE.md §1
  violations deferred to separate plans; this plan does not touch them.)
- R2. Every prior consumer of the three deleted constants resolves the model identifier at runtime
  via an `llm_slot` admin_resources row, following the `resolveLlmFor` pattern established in
  `artifacts/api-server/src/ai/llm-config-resolver.ts`.
- R3. The new `factory-v2-lorenzo-vision` llm_slot row is seeded idempotently on every boot via
  a new runtime migration registered in `artifacts/api-server/src/startup/seeds.ts`.
- R4. `check-magic-numbers` gate passes (regression check for adjacent numeric work).
  `pnpm run typecheck` is clean. All existing slide pipeline tests pass.
- R5. The resolver uses dependency-injection-free storage access (matching the existing
  `resolveLlmFor` call pattern) so it integrates without breaking test isolation.

---

## Scope Boundaries

- This plan does NOT change which model is used — the llm_slot row seeds the same model the
  literal currently resolves to. Changing the model itself is an admin operation.
- This plan does NOT touch `lib/shared/src/constants*.ts` or any financial engine surface
  (CLAUDE.md §9). All changes are within `artifacts/api-server/src/slides/` and
  `artifacts/api-server/src/migrations/` + `src/startup/seeds.ts`.
- The `DEPRECATED_MODEL_MAP` concern (whether `claude-opus-4-7` is still active vs deprecated
  per `admin-resources-010`) is an implementation-time verification item — see Deferred to
  Implementation.

### Deferred to Follow-Up Work

- U9/U10/U11 Factory v2 Phase C: not started; separate plan once this PR merges.

---

## Context & Research

### Relevant Code and Patterns

- **Pattern to follow — `resolveSofficeTimeoutMs`:**
  `artifacts/api-server/src/slides/soffice-convert.ts:250`
  Async function that calls `getAdminResourceBySlug(kind, slug)` and falls back to a named
  compile-time default. DI-injected deps for testability.

- **Pattern to follow — `resolveLlmFor`:**
  `artifacts/api-server/src/ai/llm-config-resolver.ts`
  Two-level lookup: `llm_slot` row → `model` row → `{ vendor, modelId }`. Imports `storage`
  directly (not DI-injected). Use `resolveLlmFor(FACTORY_V2_LORENZO_VISION_LLM_SLOT).then(r => r.modelId)`
  as the core of the new resolver.

- **Slug constants pattern:**
  `artifacts/api-server/src/slides/factory-v2-constants.ts` — `FACTORY_V2_SOFFICE_TIMEOUT_PARAM_SLUG`
  is the slug constant for the soffice parameter row. Follow this exact pattern: a named constant
  for the lookup slug lives in `factory-v2-constants.ts`, the async resolver lives in a new
  co-located file.

- **Literal to remove:**
  `artifacts/api-server/src/slides/deck-render-constants.ts:29`
  `export const LORENZO_VISION_MODEL = "claude-opus-4-7";`
  `artifacts/api-server/src/slides/deck-render-constants.ts:45`
  `export const LUCCA_DRAFT_MODEL = LORENZO_VISION_MODEL;`
  `artifacts/api-server/src/slides/lucca-best-shot-prompt.ts:61`
  `export const LUCCA_BEST_SHOT_MODEL = LORENZO_VISION_MODEL;`

- **8 direct API call sites that use `LORENZO_VISION_MODEL` in `model:` fields:**
  1. `slides/lorenzo-vision.ts:220`
  2. `slides/lorenzo-inspector.ts:98`
  3. `slides/swarms/sofia/inspector.ts:106`
  4. `slides/swarms/bianca/inspector.ts:106`
  5. `slides/swarms/chiara/inspector.ts:115`
  6. `slides/swarms/dario/inspector.ts:105`
  7. `slides/swarms/elisa/inspector.ts:111`
  8. `slides/swarms/felix/inspector.ts:105`

- **1 re-exporter (no API call):** `slides/lucca-best-shot-prompt.ts:51` — imports
  `LORENZO_VISION_MODEL` and re-exports it as `LUCCA_BEST_SHOT_MODEL`. No Anthropic call here;
  treated in U3 as an alias definition to delete.

- **5 alias call sites in `lucca-draft.ts`:**
  - Line 408: `model: LUCCA_BEST_SHOT_MODEL` (imported from `lucca-best-shot-prompt.ts`)
  - Lines 492, 551, 614, 681: `model: LUCCA_DRAFT_MODEL` (imported from `deck-render-constants.ts`)

- **Runtime migration registration:**
  `artifacts/api-server/src/startup/seeds.ts:220–225`
  Sequential LLM slot migration loop: `[admin-resources-008, admin-resources-010]`.
  Next number is **011**.

- **Model rows already seeded:**
  `artifacts/api-server/src/migrations/admin-resources-005.ts` — model row
  `slug: "claude-opus-4-7"` already exists. The new llm_slot row points to this slug.

### Institutional Learnings

- **CLAUDE.md §1** — integration identifiers (LLM model names) must never appear as TS
  literals; they live in `admin_resources` and are fetched at runtime.
- **Plan-003 U3 deferral note** — 9 consumers exceeded the 3-consumer parallel-subagent
  threshold; deferred to this dedicated plan. Confirmed in memory file and PR #124 description.
- **admin-resources-010 context** — previous migrations upgraded/downgraded llm_slot model
  targets. The implementer must verify at implementation time whether `claude-opus-4-7` is
  the correct target or whether the slot should point to a current model slug.

### External References

- CLAUDE.md §1 (hardcoded value gate), §9 (financial engine authoring authority)

---

## Key Technical Decisions

- **Use `resolveLlmFor` (two-level llm_slot → model lookup), not a custom single-level fetch:**
  The established LLM resolution path in this codebase is `llm_slot` → `model` row. Following
  this keeps all LLM resolution in one code path and allows admins to retarget the model via
  the existing Admin UI llm_slot editor. The `parameter` kind is reserved for tuneable numeric
  or config values, not model identifiers.

- **New file `factory-v2-llm-resolver.ts` (not inlined into `factory-v2-constants.ts`):**
  `factory-v2-constants.ts` is pure compile-time constants with no imports. Adding an async
  resolver that imports `resolveLlmFor` (which imports `storage`) would violate that contract.
  A dedicated `factory-v2-llm-resolver.ts` co-located in `slides/` mirrors the `soffice-convert.ts`
  precedent (resolver lives alongside its domain module).

- **Slug constant in `factory-v2-constants.ts`, resolver function in `factory-v2-llm-resolver.ts`:**
  Keeps the slug name addressable without importing the DB-backed resolver in tests that only
  need the constant.

- **Execution order: additive first, then consumers, then removal:**
  U2 (create resolver) → U3 (update consumers) → U4 (remove dead constants). This prevents
  any intermediate broken-build state during implementation.

- **`llm_slot` row kind, not `model` kind directly:**
  Admins can retarget the Lorenzo slot to a different model without touching code — that's the
  `llm_slot` pattern's value. A direct `model` kind lookup would hardcode the slug.

---

## Open Questions

### Resolved During Planning

- **Which admin-resources migration number?** → 011 (008 and 010 are in the sequential loop;
  009 is retired as a no-op; 011 is next).
- **Where does the resolver live?** → New `factory-v2-llm-resolver.ts` in `slides/`.
- **What kind for the new row?** → `llm_slot` (consistent with all other LLM model resolution).

### Resolved During Implementation

- **Which model slug to seed in the new llm_slot row?** → `"claude-opus-4-7"`.
  Rationale: (a) this is a pure refactor — the Scope Boundaries commit to not changing the model;
  (b) CLAUDE.md names `claude-opus-4-7` as the current Opus model ID; (c) `admin-resources-005.ts`
  already seeds a `model` row with `slug: "claude-opus-4-7"`; (d) `admin-resources-010` retired
  claude-opus-4-7 from five named llm_slots (`vision`, `executive-summary-*`, etc.) that were
  previously managed via the llm_slot mechanism — those five slots were downgraded to Sonnet.
  The Lorenzo pipeline has always bypassed llm_slot and read the literal directly; it was never
  part of the 010 migration scope. The correct seed is `modelSlug: "claude-opus-4-7"`, pointing
  to the already-existing model row.

### Deferred to Implementation

- **Does `resolveLlmFor` need a fallback for the Lorenzo slot?** — **Closed.**
  No extra check required. `resolveLlmFor` throws a descriptive error on missing rows. U1's
  `ON CONFLICT DO NOTHING` migration runs inside the sequential `modelMigrationTask` loop in
  `seeds.ts` before the API accepts any slide-pipeline requests. A boot assertion would duplicate
  error behavior that `resolveLlmFor` already provides. The implementer should rely on the
  existing seed ordering — no additional fail-fast probe is needed.

---

## Implementation Units

- U1. **Seed `factory-v2-lorenzo-vision` llm_slot row + register in boot**

**Goal:** Insert the runtime-editable `llm_slot` admin_resources row that backs
`resolveLorenzoVisionModelId()`. Row is guaranteed present on every boot before the
slide pipeline runs.

**Requirements:** R3

**Dependencies:** None

**Files:**
- Create: `artifacts/api-server/src/migrations/admin-resources-011.ts`
- Modify: `artifacts/api-server/src/startup/seeds.ts`

**Approach:**
- `admin-resources-011.ts` exports `runAdminResources011()` — inserts one row:
  `kind: "llm_slot"`, `slug: "factory-v2-lorenzo-vision"`, `config.modelSlug: "<current-opus-slug>"`.
  `ON CONFLICT (kind, slug) DO NOTHING` — idempotent.
- Add to the sequential `modelMigrationTask` loop in `seeds.ts` after `admin-resources-010`.
- Follow `admin-resources-010.ts` exactly for structure (TAG, logger, exports).

**Patterns to follow:**
- `artifacts/api-server/src/migrations/admin-resources-010.ts` — structure, TAG pattern, logger
- `artifacts/api-server/src/startup/seeds.ts:220-225` — insertion point in sequential loop

**Test scenarios:**
- Happy path: `runAdminResources011()` called on a clean DB inserts the row; calling again
  (idempotent re-run) does not error and does not create a duplicate row.
- Edge case: row already exists with a different modelSlug (admin modified) — `DO NOTHING`
  leaves the admin override intact.

**Verification:**
- `runAdminResources011()` runs without error in isolation.
- After calling, `SELECT * FROM admin_resources WHERE kind='llm_slot' AND slug='factory-v2-lorenzo-vision'`
  returns exactly one row with the correct modelSlug in config.
- `pnpm run typecheck` clean on `artifacts/api-server`.

---

- U2. **Create `factory-v2-llm-resolver.ts` with `resolveLorenzoVisionModelId()`**

**Goal:** Expose a single async resolver that consumers call instead of reading the deleted
literal. Keep the slug constant addressable from tests without triggering DB imports.

**Requirements:** R1, R2, R5

**Dependencies:** U1 (the row must exist; the resolver is not safe without U1 on first boot)

**Files:**
- Create: `artifacts/api-server/src/slides/factory-v2-llm-resolver.ts`
- Modify: `artifacts/api-server/src/slides/factory-v2-constants.ts` (add slug constant)

**Approach:**
- In `factory-v2-constants.ts`: export `FACTORY_V2_LORENZO_VISION_LLM_SLOT = "factory-v2-lorenzo-vision"`.
- In `factory-v2-llm-resolver.ts`: import `resolveLlmFor` from `../ai/llm-config-resolver`
  and `FACTORY_V2_LORENZO_VISION_LLM_SLOT` from `./factory-v2-constants`. Export:
  `resolveLorenzoVisionModelId(): Promise<string>` — calls
  `resolveLlmFor(FACTORY_V2_LORENZO_VISION_LLM_SLOT)` and returns `modelId`.
- This module has no fallback — if the slot row is absent, `resolveLlmFor` throws. The U1 boot
  seed guarantees the row is present before any pipeline run.

**Patterns to follow:**
- `artifacts/api-server/src/ai/llm-config-resolver.ts` — `resolveLlmFor` call pattern
- `artifacts/api-server/src/slides/factory-v2-constants.ts` — slug constant naming convention

**Test scenarios:**
- Unit test (with `resolveLlmFor` mocked): `resolveLorenzoVisionModelId()` returns the
  `modelId` string from the mock result.
- Error path: if `resolveLlmFor` rejects (slot missing), `resolveLorenzoVisionModelId()`
  propagates the error without swallowing it.

**Verification:**
- `factory-v2-llm-resolver.ts` compiles cleanly.
- Test suite for the new resolver passes (may be lightweight — the function is a thin wrapper).

---

- U3. **Update all 9 consumer files to call `resolveLorenzoVisionModelId()`**

**Goal:** Remove `LORENZO_VISION_MODEL` import from the 8 files that use it directly in API
calls, and update `lucca-best-shot-prompt.ts` (re-exporter only) to no longer import or
re-export the model constant. Replace `model: LORENZO_VISION_MODEL` with
`model: await resolveLorenzoVisionModelId()` at each API call site.

**Requirements:** R1, R2

**Dependencies:** U2

**Files:**
- Modify: `artifacts/api-server/src/slides/lorenzo-vision.ts`
- Modify: `artifacts/api-server/src/slides/lorenzo-inspector.ts`
- Modify: `artifacts/api-server/src/slides/lucca-best-shot-prompt.ts`
- Modify: `artifacts/api-server/src/slides/swarms/sofia/inspector.ts`
- Modify: `artifacts/api-server/src/slides/swarms/bianca/inspector.ts`
- Modify: `artifacts/api-server/src/slides/swarms/chiara/inspector.ts`
- Modify: `artifacts/api-server/src/slides/swarms/dario/inspector.ts`
- Modify: `artifacts/api-server/src/slides/swarms/elisa/inspector.ts`
- Modify: `artifacts/api-server/src/slides/swarms/felix/inspector.ts`
- Test (update): `artifacts/api-server/src/tests/slides/lucca-best-shot.test.ts` — remove
  `LUCCA_BEST_SHOT_MODEL` import and `describe("LUCCA_BEST_SHOT_MODEL", ...)` block that will
  fail to compile after U3 removes the export; replace with a runtime assertion mocking
  `resolveLorenzoVisionModelId`
- Test (update): `artifacts/api-server/src/tests/swarms/sofia.test.ts` — add
  `vi.mock('../../../slides/factory-v2-llm-resolver', ...)` to stub
  `resolveLorenzoVisionModelId` (currently mocks `../../providers/storage` which is the R2 file
  storage, not the DB storage that `resolveLlmFor` uses; the new resolver needs its own mock)
- Test (update): `artifacts/api-server/src/tests/swarms/bianca.test.ts` — same mock addition
- Test (update): `artifacts/api-server/src/tests/swarms/chiara.test.ts` — same mock addition
- Test (update): `artifacts/api-server/src/tests/swarms/dario.test.ts` — same mock addition
- Test (update): `artifacts/api-server/src/tests/swarms/elisa.test.ts` — same mock addition
- Test (update): `artifacts/api-server/src/tests/swarms/felix.test.ts` — same mock addition

**Approach:**
- For each of the 8 inspector/vision files (`lorenzo-vision.ts`, `lorenzo-inspector.ts`,
  6 swarm inspectors): remove `LORENZO_VISION_MODEL` from the import list, add
  `resolveLorenzoVisionModelId` from `./factory-v2-llm-resolver` (or the appropriate
  relative path), and add `const modelId = await resolveLorenzoVisionModelId();` immediately
  before the `anthropic.messages.create()` call, replacing `model: LORENZO_VISION_MODEL`
  with `model: modelId`.
- For `lucca-best-shot-prompt.ts`: remove the `LORENZO_VISION_MODEL` import and the
  `export const LUCCA_BEST_SHOT_MODEL = LORENZO_VISION_MODEL` line. Remove the
  `TODO(LLM-model-fetch-relocation)` comment block. Any remaining exports in this file are
  unaffected.
- All 8 inspector functions are already `async` — no signature changes needed.

**Patterns to follow:**
- `artifacts/api-server/src/slides/swarms/sofia/inspector.ts` — canonical inspector shape;
  the `await resolveLorenzoVisionModelId()` call goes just before `anthropic.messages.create()`

**Test scenarios:**
- Each swarm inspector test: add `vi.mock('../../../slides/factory-v2-llm-resolver', () => ({ resolveLorenzoVisionModelId: vi.fn().mockResolvedValue('test-model-id') }))` (path relative to each test file). Verify the mock `modelId` value is passed to the Anthropic client `model` field. Note: existing swarm tests mock `../../providers/storage` (R2 file storage) — that mock is unrelated to `resolveLlmFor`'s DB storage; the new mock must be added alongside the existing one, not replace it.
- Error path: if `resolveLorenzoVisionModelId` rejects, the inspector propagates the error
  (does not silently approve).
- `lucca-best-shot.test.ts`: import and `describe` block that referenced `LUCCA_BEST_SHOT_MODEL`
  are replaced by a mock-based assertion on `resolveLorenzoVisionModelId`.
- Existing inspector happy-path and block-verdict tests continue to pass after the refactor.

**Verification:**
- `pnpm run typecheck` clean — no references to `LORENZO_VISION_MODEL` in any non-test file.
- `grep -rn "LORENZO_VISION_MODEL" artifacts/api-server/src --include="*.ts" | grep -v ".test."` returns zero results.

---

- U4. **Update `lucca-draft.ts` (5 call sites) + remove orphaned constants + gate**

**Goal:** Replace the 5 `LUCCA_DRAFT_MODEL` / `LUCCA_BEST_SHOT_MODEL` call sites in
`lucca-draft.ts` with `await resolveLorenzoVisionModelId()`, then delete the now-orphaned
constant definitions from `deck-render-constants.ts`. Run verification gates.

**Requirements:** R1, R2, R4

**Dependencies:** U2, U3

**Files:**
- Modify: `artifacts/api-server/src/slides/lucca-draft.ts`
- Modify: `artifacts/api-server/src/slides/deck-render-constants.ts` (delete `LORENZO_VISION_MODEL`, `LUCCA_DRAFT_MODEL`; update jsdoc on `SWARM_INSPECTOR_MAX_TOKENS` at line 123 which references the deleted symbol)
- Test: `artifacts/api-server/src/tests/slides/lucca-best-shot.test.ts` (already updated in U3; confirm assertions on model string are updated to neutral non-empty-string contract)

**Approach:**
- In `lucca-draft.ts`: remove `LUCCA_DRAFT_MODEL` import from `./deck-render-constants` and
  `LUCCA_BEST_SHOT_MODEL` import from `./lucca-best-shot-prompt`. Add
  `resolveLorenzoVisionModelId` import from `./factory-v2-llm-resolver`. At each of the 5
  `anthropic.messages.create()` call sites (lines 407–408, 491–492, 550–551, 613–614,
  680–681), add `const modelId = await resolveLorenzoVisionModelId();` and replace the model
  field. Each site is in its own async function — the `await` is safe and isolated.
- In `deck-render-constants.ts`: delete the `LORENZO_VISION_MODEL = "claude-opus-4-7"` line
  (line 29) and the `LUCCA_DRAFT_MODEL = LORENZO_VISION_MODEL` line (line 45) and any
  associated jsdoc comment. Verify no remaining imports reference these names.
- Run `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — must PASS.
- Run `pnpm run typecheck` — must be clean.
- Run `pnpm --filter @workspace/api-server run test` (or the slide-specific vitest scope) —
  must pass.

**Patterns to follow:**
- `artifacts/api-server/src/slides/lucca-draft.ts:491-492` — existing call site shape;
  `resolveLorenzoVisionModelId()` call mirrors how `LUCCA_DRAFT_MODEL` was previously used

**Test scenarios:**
- Happy path: in each of the 5 async functions, when `resolveLorenzoVisionModelId` resolves to
  a model ID string, `anthropic.messages.create` is called with that model ID in the `model`
  field.
- Existing `lucca-draft.test.ts` assertions that referenced `LUCCA_DRAFT_MODEL` or checked
  for a specific model string (e.g., `/opus/i`) must be updated to use neutral non-empty string
  contract assertions (matching the pattern applied in PR #124's plan-003 U2 fix).
- Error path: if `resolveLorenzoVisionModelId` rejects in the best-shot path, the error
  propagates out of `runLuccaBestShot`.

**Verification:**
- `grep -rn "LORENZO_VISION_MODEL\|LUCCA_DRAFT_MODEL\|LUCCA_BEST_SHOT_MODEL" artifacts/api-server/src --include="*.ts" | grep -v ".test."` returns zero results.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS.
- `pnpm run typecheck` — clean across all workspace packages.
- All slide pipeline tests pass (149+ tests, 0 regressions).

---

## System-Wide Impact

- **Interaction graph:** `resolveLorenzoVisionModelId()` reaches `storage.getAdminResourceBySlug`
  on every call — adds one DB read per Anthropic API call for Lorenzo-type pipelines. In practice
  these calls are rare (slide deck generation is operator-triggered) and the DB round-trip is
  negligible vs. the LLM call latency. No caching is introduced — this matches the existing
  `resolveLlmFor` pattern.
- **Error propagation:** If the llm_slot row is missing (U1 not run yet), `resolveLlmFor` throws.
  This surfaces as an error in the slide pipeline rather than a silent wrong-model fallback — the
  desired fail-closed behavior. The boot-time seed (U1) prevents this in normal operation.
- **State lifecycle risks:** None — `resolveLorenzoVisionModelId()` is stateless; no cache, no
  module-level singleton.
- **API surface parity:** The function is an internal helper, not a Rebecca tool or HTTP route.
  No parity changes required.
- **Integration coverage:** The Lorenzo inspector / Lucca draft paths already have integration
  tests; those tests must be updated to mock or stub `resolveLorenzoVisionModelId` rather than
  relying on the old static constant.
- **Unchanged invariants:** The `SWARM_INSPECTOR_MAX_TOKENS`, `LUCCA_MAX_TOKENS`, and all other
  constants in `deck-render-constants.ts` are unaffected. The Anthropic API call shapes are
  unchanged — only the `model:` field source changes.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `admin-resources-010` labels `claude-opus-4-7` as `DEPRECATED` for the 5 slots it migrated | Resolved during planning: Lorenzo was never part of 010's scope (bypassed llm_slot entirely); seeding `claude-opus-4-7` preserves the existing model behavior. The admin can retarget via the Admin UI llm_slot editor after the slot is provisioned. |
| DB round-trip on every inspector call adds latency | Latency is negligible vs. LLM call; no caching needed. Revisit only if profiling shows otherwise. |
| Tests that assert on a specific model string break | Update affected tests to neutral non-empty string assertions (per plan-003 U2 precedent). |
| Missed call site leaves a residual literal | Post-refactor grep gate in U3 and U4 verification catches any missed files. |
| `resolveLlmFor` not available in test environments | Tests mock at the `resolveLlmFor` boundary or at `resolveLorenzoVisionModelId` boundary directly. |

---

## Sources & References

- Related code: `artifacts/api-server/src/ai/llm-config-resolver.ts`
- Related code: `artifacts/api-server/src/slides/soffice-convert.ts` (`resolveSofficeTimeoutMs` pattern)
- Related code: `artifacts/api-server/src/slides/factory-v2-constants.ts` (slug constant pattern)
- Related code: `artifacts/api-server/src/startup/seeds.ts` (boot registration)
- Related PRs: #124 (deferred this work), #119–#124 (Factory v2 Phase A+B, now merged)
- Deferred from: `docs/plans/2026-05-11-003-fix-cr-rev2-pr120-and-initial-pr124-plan.md` (U3 LORENZO relocation)
- CLAUDE.md §1 (no hardcoded integration identifiers), §9 (financial engine authoring authority)
