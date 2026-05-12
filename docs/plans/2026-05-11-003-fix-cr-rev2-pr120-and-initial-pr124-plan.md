---
title: "fix: CR rev2 on PR #120 + initial findings on PR #124 (U8)"
type: fix
status: completed
date: 2026-05-11
---

# CR rev2 on PR #120 + initial findings on PR #124

## Summary

Address 9 CodeRabbit findings across two open PRs: 2 rev2-major-and-minor on `feat/u6-slide6-embed` (#120) and 6 actionable + 1 nit on `feat/u8-lucca-best-shot-and-builder-substitution-map` (#124). The headline is a 🔴 Critical violation of CLAUDE.md §1 ("Integration identifier rule"): `LORENZO_VISION_MODEL` in `slides/deck-render-constants.ts:29` is a hardcoded `"claude-opus-4-7"` literal that must be relocated to `admin_resources` and fetched at runtime. The other 8 fixes are quick wins: whitespace trim, magic-number constants, fail-closed aggregate, public-API hardening.

---

## Problem Frame

CodeRabbit's rev2 of PR #120 confirmed my prior fixes worked (down from 4 → 2 findings) but flagged 2 more in adjacent code. CR's initial review of U8 (PR #124) surfaced one 🔴 Critical violation of the project's "no hardcoded model names" rule (CLAUDE.md §1) — a pre-existing constant `LORENZO_VISION_MODEL` in `slides/deck-render-constants.ts:29` that U8 referenced through Lucca's best-shot prompt. The other findings on #124 are §1 magic-number violations (raw `2`, raw `60_000`, hardcoded `/opus/i` regex), a whitespace-trimming bug in data-sufficiency rules, and a memory leak in Marco's dispatched-substitution-entries cache.

---

## Requirements

- R1. **PR #120: Fail closed on missing portfolio data.** `buildSlide6ImageSubstitutionEntry` and its callers must reject (not silently skip) when any requested property fails to load or compute. Financial aggregates that silently understate totals are worse than visible errors.
- R2. **PR #120: Apply projectionYears validation in `buildSlide6ReportDefinition` too.** The public exported builder is a second entry point and must guard against `NaN` / `Infinity` / non-positive input the same way `buildSlide6ImageSubstitutionEntry` already does.
- R3. **PR #124: Whitespace-only strings must NOT satisfy data-sufficiency checks.** `data-sufficiency-rules.ts:171` uses `value.length > 0`; must become `value.trim().length > 0` so `"   "` correctly triggers best-shot / wish-list generation.
- R4. **PR #124 (🔴 Critical): `LORENZO_VISION_MODEL` (and any other LLM model-name string constants surfaced by U8) must NOT live as TypeScript string literals.** Per CLAUDE.md §1 "Integration identifier rule", LLM model names live in `admin_resources` rows and are fetched at runtime. The constant in `slides/deck-render-constants.ts:29` is `"claude-opus-4-7"` — relocate to `admin_resources` (`kind='model'` or `kind='llm_slot'`) and fetch via the runtime helper.
- R5. **PR #124: Retry count `2` in `lucca-draft.ts:393` must be a named constant** per CLAUDE.md §1.
- R6. **PR #124: `dispatchedSubstitutionEntries` cache in `marco-tools.ts` must be cleared after `handleApplySubstitutions` reads from it.** Memory leak on long-running processes.
- R7. **PR #124: Test timeout `60_000` in `slide-6-embed-flow.test.ts:382` must be a named constant.**
- R8. **PR #124: `/opus/i` regex in `lucca-best-shot.test.ts:312` must be replaced with a neutral contract assertion.** Asserting model-family-by-name embeds an LLM identifier in source.
- R9. All 9 CR threads on PR #120 and PR #124 resolvable as `addressed` by the resulting PR(s).

---

## Scope Boundaries

- Not in scope: refactoring how `LORENZO_VISION_MODEL` was originally introduced — the relocation in U3 is the minimum change required to satisfy R4. A broader LLM-config audit (other model name literals across the repo) is a separate plan.
- Not in scope: PR #119, PR #121, PR #123 CR re-reviews — those haven't surfaced new findings yet; defer until CR re-scans those rev2 pushes.
- Not in scope: PR #122 CR-fix subagent's work — already shipped and reviewed; CR rev2 on #122 pending.
- Not in scope: U9 / U10 / U11 — these depend on U8 landing.

### Deferred to Follow-Up Work

- Audit other LLM model-name constants in the repo that may share the same §1 violation pattern as `LORENZO_VISION_MODEL`. The scope here is the U8-surfaced constant only.

---

## Context & Research

### Relevant Code and Patterns

- **`artifacts/api-server/src/slides/deck-render-constants.ts:29`** — current home of `LORENZO_VISION_MODEL = "claude-opus-4-7"`. Source of R4 critical finding.
- **`artifacts/api-server/src/slides/lucca-best-shot-prompt.ts:55`** — U8 consumer of `LORENZO_VISION_MODEL`. The CR thread is anchored here even though the root-cause violation is in the constants file.
- **`artifacts/api-server/src/slides/lucca-draft.ts:393`** — raw `2` retry literal.
- **`artifacts/api-server/src/slides/data-sufficiency-rules.ts:171`** — `value.length > 0` whitespace bug.
- **`artifacts/api-server/src/slides/marco-tools.ts:594-600`** — `dispatchedSubstitutionEntries` cache consumption point (no cleanup after read).
- **`artifacts/api-server/src/slides/slide-6-report-builder.ts:415, 540, 658, 669-699`** — fail-open property loop + secondary public-API guard gap.
- **CLAUDE.md §1 "Integration identifier rule"** — canonical rule. References `admin_resources` rows with `kind='model'` or `kind='llm_slot'` and runtime path `GET /api/llm-providers`.
- **Existing pattern for runtime-fetched model names:** look at how other slide-factory agents resolve their model identifiers. Likely candidates: `lorenzo-vision.ts`, `lucca-draft.ts`'s existing model resolution, `marco.ts`'s tool-routing model. The first one that successfully fetches a model via `admin_resources` is the pattern to mirror.

### Institutional Learnings

- `docs/solutions/conventions/section-9-vs-subagent-dispatch-guard-2026-05-11.md` — but note that §9 is about *protected file scope* not about *integration identifiers*; the §1 Integration identifier rule is a separate constraint that applies to ALL files regardless of §9 protection.
- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` (referenced from CLAUDE.md) — full rationale for the rule.

### External References

- None needed. CR provided concrete diffs and CLAUDE.md provides the canonical rule.

---

## Key Technical Decisions

- **Fail-closed on missing properties (R1) — throw, don't return a partial aggregate.** Slide-6 is a financial summary; partial aggregates that look complete are worse than a visible "deck generation failed: property X not loadable" error. The throw bubbles to Marco who surfaces it in the run record. Soft-skip behavior is preserved for non-financial slides (e.g., Slide 1 overview) — only Slide 6 demands fail-closed because of the aggregate-totals semantics.
- **`LORENZO_VISION_MODEL` becomes a runtime fetch (R4).** Replace the constant with a slug-keyed helper (e.g., `getLorenzoVisionModel()`) that queries `admin_resources` for the model row. Cache the result per-process to avoid hot-path DB hits. The seed row goes in via a runtime guard migration so production picks it up on first deploy.
- **Cache cleanup in `marco-tools.ts` (R6) — delete after read, not after terminal-error.** The existing terminal-error cleanup path remains as a safety net, but the steady-state cleanup happens at `handleApplySubstitutions` consumption time. Once Marco has emitted the substitution map, the per-entry payloads are no longer needed.
- **Test assertion change (R8) — assert non-empty model id, not regex match.** The replacement assertion should validate that the prompt's model field is a non-empty string sourced from the runtime fetch — not match the specific model family. This makes the test forward-compatible with model swaps via admin without code changes.

---

## Open Questions

### Resolved During Planning

- *Should `LORENZO_VISION_MODEL` relocation also remove the constant from `deck-render-constants.ts` entirely, or keep a stub for backward compatibility?* Remove entirely. No backward-compat stubs (per the agent contract: "Avoid backwards-compatibility hacks").
- *Should U3's `admin_resources` seed land via a Drizzle SQL migration or a runtime TS guard?* Runtime TS guard per the project's migration system architecture — `IF NOT EXISTS` idempotent insert into `admin_resources`. Matches the Costantino / minion-self-test cadence-row precedent.

### Deferred to Implementation

- *Exact slug for the LORENZO model row.* Pick during implementation. Candidates: `lorenzo-vision-model`, `lucca-best-shot-model` (depending on who the row primarily serves). Lean toward `lorenzo-vision-model` since Lorenzo is the historical owner.
- *Whether the model-fetch helper should be shared with other slide-factory agents that may have the same hardcoded-constant pattern.* If the audit during implementation finds 1 other consumer, share. If 3+, plan a separate refactor.

---

## Implementation Units

- U1. **PR #120 hardening: fail-closed + projectionYears validation in public builder**

**Goal:** Tighten `slide-6-report-builder.ts` against the 2 CR rev2 findings — convert the property-load loop from fail-open to fail-closed (R1), and apply `validateProjectionYears` inside `buildSlide6ReportDefinition` so direct callers of the public exported builder are guarded the same way `buildSlide6ImageSubstitutionEntry` already is (R2).

**Requirements:** R1, R2, R9.

**Dependencies:** None — both fixes are on PR #120's branch (`feat/u6-slide6-embed`).

**Files:**
- Modify: `artifacts/api-server/src/slides/slide-6-report-builder.ts`
- Modify: `artifacts/api-server/src/tests/slides/slide-6-report-builder.test.ts`
- Test: existing test file — add 2 new tests (fail-closed throw on missing property; projectionYears guard via `buildSlide6ReportDefinition`)

**Approach:**
- Convert the `for (const id of uniquePropertyIds)` loop's `try/catch` from "log + skip" to "throw `Slide6PropertyLoadError`". The error names the failing property id and includes the original cause. Caller (Marco) surfaces it in the run record.
- Apply `validateProjectionYears(...)` to the input passed into `buildSlide6ReportDefinition` (currently this helper is only inside `buildSlide6ImageSubstitutionEntry`). Promote the helper to module-scope or export it.
- Update existing tests to reflect the fail-closed contract (any test that previously verified "soft-skip" behavior must either be removed or rewritten to verify "throws cleanly").

**Patterns to follow:**
- The existing `Slide6PropertyLoadError` class (if present) OR define one near `validateProjectionYears`. Throw-class-with-code pattern matches `SofficeConvertError`, `SlotOverflowError`.

**Test scenarios:**
- Happy path: portfolio of 3 valid property ids → builder returns a ReportDefinition with totals matching the per-property sum.
- Error path (R1): one property id throws on load → builder rethrows as `Slide6PropertyLoadError` with the failing id surfaced. Test asserts `rejects.toThrow(/property 42/)` (or similar).
- Error path (R1): one property loads but produces undefined/null engine output → builder rethrows (don't silently coerce to zero).
- Edge case (R2): `buildSlide6ReportDefinition` called with `projectionYears: NaN` → falls back to `DEFAULT_PROJECTION_YEARS`.
- Edge case (R2): `buildSlide6ReportDefinition` called with `projectionYears: 0` → falls back to `DEFAULT_PROJECTION_YEARS`.
- Edge case (R2): `buildSlide6ReportDefinition` called with `projectionYears: Infinity` → falls back to `DEFAULT_PROJECTION_YEARS`.

**Verification:**
- Vitest suite passes; the new fail-closed test fails on `origin/feat/u6-slide6-embed` (pre-fix) and passes after this unit.
- `pnpm --filter @workspace/api-server exec tsc --noEmit` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.

---

- U2. **PR #124 quick wins: whitespace trim, retry constant, test-timeout constant, marco cache cleanup, neutral test assertion**

**Goal:** Address the 5 non-critical CR findings on PR #124 in one focused commit batch.

**Requirements:** R3, R5, R6, R7, R8, R9.

**Dependencies:** None — all 5 fixes are on PR #124's branch (`feat/u8-lucca-best-shot-and-builder-substitution-map`).

**Files:**
- Modify: `artifacts/api-server/src/slides/data-sufficiency-rules.ts` (R3 — `.trim().length > 0`)
- Modify: `artifacts/api-server/src/slides/lucca-draft.ts` (R5 — extract retry count to named constant `LUCCA_DRAFT_MAX_RETRIES`)
- Modify: `artifacts/api-server/src/slides/marco-tools.ts` (R6 — `dispatchedSubstitutionEntries.delete(runId)` after `handleApplySubstitutions` consumes the entries)
- Modify: `artifacts/api-server/src/tests/integration/slide-6-embed-flow.test.ts` (R7 — name the timeout, e.g., `SUBSTITUTION_INTEGRATION_TIMEOUT_MS`)
- Modify: `artifacts/api-server/src/tests/slides/lucca-best-shot.test.ts` (R8 — replace `/opus/i` with a non-empty / contract assertion)

**Approach:**
- **R3 (whitespace):** the cleanest implementation is to wrap the existing check in a helper `isNonEmptyText(v: unknown): v is string` that combines the type-guard with `.trim().length > 0`. Use the helper at line 171.
- **R5 (retry constant):** new export near the top of `lucca-draft.ts`: `const LUCCA_DRAFT_MAX_RETRIES = 2;` with a one-line comment explaining the choice (2 attempts = "one retry on transient LLM hiccup, surface to Marco on second failure").
- **R6 (cache cleanup):** after the `for (const entry of entries)` consumption loop in `handleApplySubstitutions`, call `dispatchedSubstitutionEntries.delete(runId)`. The existing `clearRunPayloads(runId)` terminal-error path remains intact as a safety net; this is the success-path cleanup the comment claimed to do but didn't.
- **R7 (test timeout):** named constant at the top of the test file: `const SUBSTITUTION_INTEGRATION_TIMEOUT_MS = 60_000;` with a comment ("PPTX round-trip cold start can exceed the default vitest 5s timeout"). Replace the raw 60_000 in the `it()` third argument.
- **R8 (test assertion):** replace `expect(prompt.model).toMatch(/opus/i)` with `expect(typeof prompt.model).toBe("string")` + `expect(prompt.model.length).toBeGreaterThan(0)`. After U3 lands, this assertion naturally validates that the runtime fetch returned a non-empty model id; before U3, it validates the current literal still resolves.

**Patterns to follow:**
- The named-constant pattern from the U8 commits and prior CR-fix PRs.
- Test-constant pattern from `pptx-substitution.test.ts` (post-CR-fix).

**Test scenarios:**
- R3: existing data-sufficiency tests for `"   "` (all-whitespace) → must now correctly classify as "missing" and trigger best-shot. Add a new test if not present.
- R5/R7: rename-only refactor — existing tests must continue to pass without behavioral changes.
- R6: test for `dispatchedSubstitutionEntries` cleanup — after `handleApplySubstitutions` runs successfully, the per-run cache key is gone. Inspect `dispatchedSubstitutionEntries.has(runId)` post-call.
- R8: assertion still validates Lucca's prompt has a configured model id; test passes against the current `LORENZO_VISION_MODEL` value AND against any U3-replacement value.

**Verification:**
- `pnpm --filter @workspace/api-server exec tsc --noEmit` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.
- Vitest suite passes.

---

- U3. **PR #124 🔴 Critical: relocate `LORENZO_VISION_MODEL` to admin_resources**

**Goal:** Eliminate the hardcoded `"claude-opus-4-7"` model-name literal in `slides/deck-render-constants.ts:29`. Replace with a runtime fetch helper that reads the model id from an `admin_resources` row (kind `model` or `llm_slot`). Add a runtime migration guard to seed the row on first boot.

**Requirements:** R4, R9.

**Dependencies:** None at the code level (but should ship in PR #124 to fully close the 🔴 finding before merge). U2 can land first or in the same commit batch.

**Files:**
- Modify: `artifacts/api-server/src/slides/deck-render-constants.ts` (remove `LORENZO_VISION_MODEL` constant entirely)
- Create: `artifacts/api-server/src/slides/lorenzo-vision-model.ts` (new helper module exporting `getLorenzoVisionModel(): Promise<string>` with per-process caching)
- Modify: `artifacts/api-server/src/slides/lucca-best-shot-prompt.ts` (replace `LORENZO_VISION_MODEL` import with `await getLorenzoVisionModel()`)
- Modify: any other consumer of `LORENZO_VISION_MODEL` (grep before starting — likely `lorenzo-vision.ts` + 1-2 more)
- Create: runtime migration guard in `artifacts/api-server/src/migrations/<NNNN>-seed-lorenzo-vision-model-resource.ts` — idempotent `INSERT ... ON CONFLICT DO NOTHING` into `admin_resources` with slug `lorenzo-vision-model`, value `claude-opus-4-7` (the current literal — operators can change via admin UI later).
- Test: `artifacts/api-server/src/tests/slides/lorenzo-vision-model.test.ts` (new) — unit tests for the helper's fetch + cache + fallback behavior.

**Approach:**
- **Helper API:**
  - `getLorenzoVisionModel(): Promise<string>` — checks per-process cache; if absent, queries `admin_resources` for slug `lorenzo-vision-model`; caches the result.
  - On a missing or malformed row, falls back to a documented compile-time default (kept as a named *fallback* constant in the helper module, NOT as a primary source). This is the "row absent → conservative default" pattern from U7's soffice-timeout helper.
- **Runtime migration guard:** mirrors the Costantino / minion-self-test cadence-row precedent. Idempotent (`ON CONFLICT DO NOTHING`). Run during the existing migration phase on boot.
- **Consumer update:** every `LORENZO_VISION_MODEL` import becomes `await getLorenzoVisionModel()` at the call site. Async boundary may force minor refactors in the calling functions — surface in implementation if disruptive.
- **§1 compliance check:** the *fallback default* in the helper module is still a string constant containing the model name. Document this as "fallback for first-boot before the runtime guard seeds the row; not the primary source of truth". The runtime fetch path is the canonical source. This pattern matches U7's soffice-timeout helper precedent.

**Execution note:** Grep `LORENZO_VISION_MODEL` across the entire repo BEFORE starting — there may be more consumers than just `lucca-best-shot-prompt.ts`. Each consumer needs the async refactor.

**Patterns to follow:**
- `artifacts/api-server/src/slides/soffice-convert.ts`'s `resolveSofficeTimeoutMs(...)` — same shape: runtime fetch from `admin_resources` with a compile-time fallback.
- The Costantino / minion-self-test cadence-row migration guard for the `INSERT ... ON CONFLICT DO NOTHING` pattern.

**Test scenarios:**
- Happy path: `admin_resources` has a `lorenzo-vision-model` row with value `"claude-opus-4-7"` → helper returns `"claude-opus-4-7"`.
- Cache: second call to `getLorenzoVisionModel()` within the same process does NOT hit the DB again.
- Fallback: `admin_resources` row missing → helper returns the documented fallback default.
- Malformed row: row exists but `value` is empty string / null → helper returns the fallback default.
- Migration guard: running the guard against an `admin_resources` table that already has the row is a no-op (`ON CONFLICT DO NOTHING`).
- Migration guard: running against a table missing the row inserts it with the expected slug + value.
- Integration: Lucca's best-shot prompt resolves the model id via the helper, not via a top-level constant import.

**Verification:**
- `grep -r "claude-opus-4-7" artifacts/api-server/src/` returns only the helper's fallback default + the migration guard's seed value (no other usage). Document this as the acceptance check.
- `grep -r "LORENZO_VISION_MODEL" artifacts/api-server/src/` returns only the migration guard's slug string (no TS const).
- `pnpm --filter @workspace/api-server exec tsc --noEmit` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.
- Magic-numbers gate is unaffected (no new numbers); the integration-identifier rule is the relevant gate but isn't currently automated.
- Vitest: new helper-test file passes; existing tests that used to import `LORENZO_VISION_MODEL` either updated to use the helper or replaced with neutral assertions.

---

## System-Wide Impact

- **Interaction graph:** U1's fail-closed change propagates errors up through Marco. Marco must surface `Slide6PropertyLoadError` in the run record as an error status, not let it fall through silently. Verify Marco's error-handling path catches and records the error.
- **Error propagation:** All three units throw (or rethrow) more aggressively than the current code does. Verify the slide-factory pipeline correctly marks the run as `error` and writes the error message + property id to the run record so admins can triage.
- **State lifecycle risks:** U2's cache cleanup (`dispatchedSubstitutionEntries.delete`) changes the lifecycle from "until terminal-error" to "until apply_substitutions consumes". Tests must verify both paths still cleanup correctly when applicable.
- **API surface parity:** U3 changes a synchronous constant import into an async runtime fetch. Callers that currently use the constant in synchronous contexts may need refactor. Most likely impacted: any prompt-building code that's currently top-level constant assembly.
- **Integration coverage:** The fail-closed change (U1) and the model-fetch refactor (U3) both warrant integration tests, not just unit tests, because they cross layers (storage → engine → renderer).
- **Unchanged invariants:** U8's existing dual-output Builder pattern, Marco's `apply_substitutions` tool, Lucca's best-shot detection logic, and `getAssembledSubstitutionMap(runId)` consumption seam are all unchanged. Only the things named in the requirements above change.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| U3's async refactor cascades into more callers than expected, blowing up scope. | Time-box the grep + refactor pass to 30 min. If more than 3 non-test callers need async-conversion refactors, defer U3 to a separate PR (one with broader async-plumbing scope) and leave a `TODO(LLM-model-fetch-relocation)` comment in lucca-best-shot-prompt.ts pointing at this plan. |
| Fail-closed (R1) may break runs that currently complete on partial data. | Acceptable — partial financial aggregates are exactly the failure mode CR flagged. Surface in the run record as an explicit error; admins can see which property failed and retry. |
| Fallback-default for the model-fetch helper is itself a string constant containing the model name, which CR could flag again. | Documented as "fallback for first-boot before runtime guard seeds the row". Same pattern as U7's soffice-timeout helper. Cite that precedent in the PR description. |
| U3's migration guard runs on every boot — make sure the `IF NOT EXISTS` / `ON CONFLICT DO NOTHING` is correct. | Test the migration guard idempotency explicitly (running twice produces the same DB state). Mirrors prior runtime-guard discipline. |

---

## Documentation / Operational Notes

- PR descriptions: separate PRs per the affected branches. PR-on-#120 ships U1 only; PR-on-#124 ships U2 + U3. Each PR description lists the CR threads it closes by file:line.
- After U3 merge, operators may want to swap the seeded model via the admin UI without redeploy — confirm the admin UI surfaces `admin_resources` rows of kind `model` / `llm_slot` (likely yes per the existing pattern; verify before declaring U3 complete).
- Update `docs/discipline/agent-native-parity-map.md` if Lucca's model swap is now an admin-tunable knob; otherwise no parity update needed.

---

## Sources & References

- PR #120 (U6 — slide-6 income-statement embed flow): https://github.com/Norfolk-Group/H-Analytics/pull/120
- PR #124 (U8 — Lucca best-shot + Builder substitution-map): https://github.com/Norfolk-Group/H-Analytics/pull/124
- CR rev2 findings on #120: comments on `slide-6-report-builder.ts:415` and `:540`
- CR findings on #124: `data-sufficiency-rules.ts:173`, `lucca-best-shot-prompt.ts:55`, `lucca-draft.ts:395`, `marco-tools.ts:77`, `tests/integration/slide-6-embed-flow.test.ts:383`, `tests/slides/lucca-best-shot.test.ts:313`
- Prior CR-fix plan precedent: `docs/plans/2026-05-11-002-fix-coderabbit-pr117-pr118-followups-plan.md`
- CLAUDE.md §1 (no hardcoded values + integration identifier rule)
- Helper pattern precedent: `artifacts/api-server/src/slides/soffice-convert.ts`'s `resolveSofficeTimeoutMs(...)` (PR #121)
