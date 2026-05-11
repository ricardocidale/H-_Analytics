---
title: "fix: CodeRabbit follow-ups from PR-117 (U5) and PR-118 (U4)"
type: fix
status: active
date: 2026-05-11
---

# CodeRabbit follow-ups from PR-117 and PR-118

## Summary

Address all 6 actionable CodeRabbit findings + 1 nitpick on the U4 (PPTX substitution engine, PR #118) and U5 (`ReportDefinition → PNG` renderer, PR #117) PRs. Ship as one follow-up PR mirroring the PR #116 → PR #114 precedent: same scope discipline, same dual-PR-source title pattern.

---

## Problem Frame

PRs #117 and #118 merged with open CodeRabbit threads. Three are 🟠 Major (one SSRF, one substitution-contract bug, one disk leak), one 🟠 Major is an unbounded-allocation surface, and two are 🟡 Minor schema/test cleanups. Leaving them unresolved (a) lets the contract bug silently turn `skipShapeLookup` into a no-op for any future caller, (b) leaves a tmpdir leak that grows per slide-factory run, and (c) leaves Playwright susceptible to SSRF-style outbound fetches via attacker-controlled `ReportDefinition.dataUrl` values. The fixes are small and well-localized; we land them as one PR before U6 (which consumes the substitution engine for slide-6 image embedding) is reviewed, so U6 reviewers see the hardened API.

---

## Requirements

- R1. Restrict `ImagePayloadSchema.mimeType` to the codecs the substitution engine actually branches on, so Carlo rejects unsupported MIME strings at parse time instead of routing them to the JPEG-vs-other fallback.
- R2. Bound `TableCellPayloadSchema.rowIndex` / `columnIndex` so a malformed or adversarial substitution map cannot trigger oversized nested-array allocations downstream.
- R3. Make `substituteSlots`' `skipShapeLookup: true` mode honor its name — it must skip the *shape lookup* (and the pptx-automizer round-trip), not the substitution itself; the overflow-rule validation that already lives in that branch is the correct behavior; the early `return { pptx: template, warnings }` is what makes it act as a no-op.
- R4. Image substitution must clean up its per-substitution `/tmp/factory-v2-media-*` directories on both success and failure paths so repeated slide-factory runs don't accumulate disk junk.
- R5. Restrict `<img src>` in the rendered HTML to the `data:image/` scheme so server-side Playwright cannot be coerced into outbound fetches via an attacker-controlled `ReportDefinition.dataUrl`.
- R6. Replace the remaining raw numeric literals in `pptx-substitution.test.ts` (`slideNumber: 5`, `toBeGreaterThan(1000)`, `60_000` timeout) with named test constants per CLAUDE.md §1 spirit.
- R7. Address the PR #117 nitpick: add a failure-path cleanup test for the PNG renderer so we have regression coverage for the Playwright-context cleanup contract.
- R8. All 7 open CodeRabbit threads on PR #117 / PR #118 are resolvable as `addressed` by the merged follow-up PR.

---

## Scope Boundaries

- Not in scope: any change to behavior outside the 7 CR threads enumerated above.
- Not in scope: U6 (slide-6 embed flow) or U7 (`soffice` convert + R2 upload) — both are in-flight in parallel worktrees.
- Not in scope: the 10 unpushed Replit-Agent commits on local `main` (admin UI / agent roster / company-assumptions reorgs). User-owned triage.
- Not in scope: refactoring the substitution engine's image-payload code path beyond the cleanup fix (the U4 doc comment already notes "Image-swap is wired but tested only as a payload-schema contract" — a deeper hardening pass belongs in a separate plan after U6 surfaces real-world issues).
- Not in scope: changing the magic-numbers gate to scan tests. CLAUDE.md §1 currently targets `src/`; this plan applies the §1 spirit to the one test file CR flagged, not the gate itself.

---

## Context & Research

### Relevant Code and Patterns

- `artifacts/api-server/src/slides/pptx-substitution-types.ts` — `ImagePayloadSchema`, `TableCellPayloadSchema` (U4 / PR #118). Already exports `SlotOverflowError` and named overflow thresholds; new schema bounds follow the same constants pattern.
- `artifacts/api-server/src/slides/pptx-substitution.ts` — `substituteSlots` and the image-substitution path at line ~483 that creates `/tmp/factory-v2-media-*`. Reuse the existing `mkdtempSync` / `rmSync` pattern from the function (the `cleanup: false` Automizer flag is intentional and orthogonal — see U1 decision doc).
- `artifacts/api-server/src/slides/render-report-png.ts` — `renderSection` switch for `case "image"` at line ~187. Adds a `sanitizeImageSrc` gate.
- `artifacts/api-server/src/tests/slides/pptx-substitution.test.ts` — test suite for U4.
- `artifacts/api-server/src/tests/slides/render-report-png.test.ts` — test suite for U5; the failure-path cleanup test lives here.
- Precedent: PR #116 (`fix/coderabbit-pr114-followups`) — same shape as this plan's eventual PR.

### Institutional Learnings

- `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md` — applies to runtime integration identifiers (R2 keys, model slugs). Does not apply to schema enums like `["image/png", "image/jpeg"]`, which are codec discriminators internal to the substitution engine. Inline `z.enum([...])` is correct; no `admin_resources` row needed.
- CLAUDE.md §1 — named constants for numeric literals, including in tests when CR explicitly flags them.

### External References

- None needed; all fixes are local and CR provided concrete diffs.

---

## Key Technical Decisions

- **`mimeType` becomes an enum, not a `mimeType` registry lookup.** The substitution engine's image path only branches on JPEG vs non-JPEG; we ship the minimum codec set (`image/png`, `image/jpeg`) and grow it when a real case appears. Avoids speculative generality.
- **Table-index bounds are pragmatic, named constants.** Use `MAX_TABLE_ROW_INDEX = 200` and `MAX_TABLE_COLUMN_INDEX = 50` (CR's suggestion). Generous enough that no realistic slide-3 / slide-5 table approaches them; tight enough that adversarial input can't OOM. Both exported so tests reference the same constants.
- **`skipShapeLookup` fix: delete the early return, keep the overflow validation.** The branch's intent (skip the expensive Automizer round-trip when callers only need overflow validation) is sound; the bug is the unconditional `return template`. After deletion, the function falls through to the existing substitution path. If a caller genuinely wants overflow-only mode, that's a new option — not the same flag.
- **Image-tmpdir cleanup uses `try/finally`.** Wrap the per-image tmpdir lifetime in a `try { … } finally { rmSync(dir, { recursive: true, force: true }); }` block so the cleanup runs on both happy path and any thrown error. Idempotent against missing dirs because of `force: true`.
- **SSRF mitigation: scheme allow-list, not URL parsing.** The renderer is hermetic by contract — only `data:image/...` URLs are valid here. A `startsWith("data:image/")` check is sufficient and avoids the URL-parser surface area. Non-matching values render a "[image]" placeholder section so the renderer never silently emits an `<img src>` that can fetch.
- **Test-magic-numbers fix: named constants in the same file.** Don't move them to a shared `test-constants.ts` — they're test-local. Two examples already exist in the file (`OVERFLOW_TIGHTEN_THRESHOLD_PCT` is re-exported from src); follow that pattern.
- **Single PR delivery.** Title: `fix(factory-v2): N CodeRabbit follow-ups from PR-117 + PR-118 (U4/U5)`. Mirrors PR #116.

---

## Open Questions

### Resolved During Planning

- *Should the failure-path cleanup test (PR #117 nitpick) ship in this PR?* Yes — it's a 1-test addition in the same renderer test file. Including it closes all 7 CR threads in one PR.
- *Should we tighten the magic-numbers gate to scan tests?* No — out of scope. The gate's current `src/` scope is intentional; broadening it is a CLAUDE.md-level discussion.
- *Should `image/webp` be in the mime-enum?* No — the engine only branches JPEG vs non-JPEG; adding `webp` now is speculative. Add when a real caller needs it.

### Deferred to Implementation

- *Exact named-constant identifiers for the test magic numbers.* Pick during implementation (`SLIDE_NUMBER_FIXTURE`, `MIN_PPTX_BUFFER_SIZE_BYTES`, `TEST_TIMEOUT_MS` are reasonable defaults).
- *Whether the SSRF fix needs to allow `image/svg+xml` data URLs.* `renderReportToPng` is called only with engine-generated content; SVG isn't on the current emit path. Tighten to `data:image/` (covers PNG/JPEG/SVG-data-URL); if a caller needs to block SVG specifically, that's a follow-up. Leaving as a soft default in implementation.

---

## Implementation Units

- U1. **Tighten `pptx-substitution-types.ts` schemas**

**Goal:** Restrict `ImagePayloadSchema.mimeType` to the codec enum the engine branches on, and bound `TableCellPayloadSchema.rowIndex` / `columnIndex` to named maxima.

**Requirements:** R1, R2.

**Dependencies:** None.

**Files:**
- Modify: `artifacts/api-server/src/slides/pptx-substitution-types.ts`
- Modify: `artifacts/api-server/src/tests/slides/pptx-substitution.test.ts` — update any fixtures whose `mimeType` was a non-enum string; add table-index out-of-bounds rejection test.

**Approach:**
- Add `SUPPORTED_IMAGE_MIME_TYPES = ["image/png", "image/jpeg"] as const` near `ImagePayloadSchema`; switch `mimeType` field to `z.enum(SUPPORTED_IMAGE_MIME_TYPES)`.
- Add `MAX_TABLE_ROW_INDEX = 200` and `MAX_TABLE_COLUMN_INDEX = 50` exported constants; add `.max(...)` to the `TableCellPayloadSchema` index fields with named error messages.
- Export both new constant groups so tests reference them by name.
- Re-check the doc comment at the top of the file — the "Numeric literals in this file are limited to" paragraph needs the new constants listed.

**Patterns to follow:**
- The existing `OVERFLOW_TIGHTEN_THRESHOLD_PCT` / `OVERFLOW_ABORT_THRESHOLD_PCT` pattern in `pptx-substitution.ts` for exported, test-referenceable thresholds.

**Test scenarios:**
- Happy path: a fixture with `mimeType: "image/png"` and `mimeType: "image/jpeg"` parses successfully; a `table_cell` entry at `rowIndex: 0, columnIndex: 0` parses.
- Error path: `mimeType: "image/webp"` is rejected with a clear "unsupported codec" message.
- Error path: `mimeType: ""` is still rejected (existing behavior).
- Error path: `rowIndex: 201` is rejected with the `MAX_TABLE_ROW_INDEX` message; `columnIndex: 51` is rejected with the `MAX_TABLE_COLUMN_INDEX` message.
- Edge case: `rowIndex: 200` and `columnIndex: 50` (boundary) are accepted.

**Verification:**
- Vitest suite passes for `pptx-substitution.test.ts`.
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.

---

- U2. **Fix `substituteSlots` skipShapeLookup contract + image-tmpdir leak**

**Goal:** Remove the early `return` that turns `skipShapeLookup: true` into a no-op, and wrap each image-substitution's tmpdir in a `try/finally` so it's always cleaned up.

**Requirements:** R3, R4.

**Dependencies:** None (functionally independent of U1, but lives in the same module — sequence after U1 so the test file's fixtures are already enum-correct).

**Files:**
- Modify: `artifacts/api-server/src/slides/pptx-substitution.ts`
- Modify: `artifacts/api-server/src/tests/slides/pptx-substitution.test.ts` — add tests for both fixes.

**Approach:**
- **skipShapeLookup fix:** in the `if (options.skipShapeLookup)` block (around line 247-264), delete the trailing `return { pptx: template, warnings };`. Keep the overflow-validation loop. After the block, control falls through to the existing pptx-automizer path which actually applies substitutions. Re-read the surrounding code to confirm no other branches assume the early return (they shouldn't — the early return was the bug).
- **Tmpdir cleanup:** locate the image-substitution path (around line 483) that calls `mkdtempSync(path.join(tmpdir(), "factory-v2-media-"))`. Wrap the body that uses the dir in `try { … } finally { rmSync(dir, { recursive: true, force: true }); }`. Verify all early-return / throw paths from inside the `try` flow through the `finally`. If multiple image entries share a parent media dir, decide on per-entry vs per-call cleanup — per-call is simpler and matches the per-run lifetime.

**Patterns to follow:**
- Existing `mkdtempSync` / `rmSync` usage already in the file (the substitution function's outer tmpdir handling is the analog).

**Test scenarios:**
- Happy path: call `substituteSlots(template, map, { skipShapeLookup: true })` and assert the returned PPTX differs from the input — i.e., substitutions were applied. (Prior to this fix the test would pass against the input buffer.)
- Edge case: call `substituteSlots` with `skipShapeLookup: true` and an entry that exceeds the overflow abort threshold — assert `SlotOverflowError` still throws (overflow validation must not regress).
- Happy path (cleanup): after a successful image-substitution run, assert no `factory-v2-media-*` directories remain under `os.tmpdir()`. Use `fs.readdirSync(tmpdir())` filtered by prefix.
- Error path (cleanup): inject a synthetic error mid-image-substitution (e.g., a stub that throws after the tmpdir is created); assert the tmpdir is still cleaned up.

**Verification:**
- Vitest suite passes; both new tests fail on `origin/main` and pass after this unit's changes.
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.

---

- U3. **SSRF-harden `render-report-png.ts` `<img src>` + failure-path cleanup test**

**Goal:** Restrict the rendered HTML's `<img src>` to `data:image/` URLs; add a regression test for Playwright-context cleanup on the failure path.

**Requirements:** R5, R7.

**Dependencies:** None.

**Files:**
- Modify: `artifacts/api-server/src/slides/render-report-png.ts`
- Modify: `artifacts/api-server/src/tests/slides/render-report-png.test.ts`

**Approach:**
- Add a module-local `sanitizeImageSrc(src: string): string | null` helper: returns `src` when it starts with `"data:image/"`, else `null`.
- In `renderSection` at the `case "image":` branch, call `sanitizeImageSrc(section.dataUrl)`. When `null`, render a `<section class="report-image"><h4>{title}</h4><div class="placeholder">[image]</div></section>` instead of an `<img>` tag. Add a comment naming the SSRF threat model and pointing at the CR finding.
- The `escapeHtml` call on the sanitized src remains (defense in depth).
- For the nitpick failure-path cleanup test: identify the existing Playwright/render path. After `renderReportToPng` throws (e.g., feed a payload that exceeds renderer constraints), assert no leaked browser context remains. If the renderer already lacks visible cleanup hooks, document what "cleanup" means in this codebase (likely the singleton `getBrowser()` keeps a process alive across runs; the test should assert the singleton survives a render error and that page-level resources are released).

**Patterns to follow:**
- Existing `escapeHtml` usage in the same file for defense-in-depth on attribute values.
- Existing render-error tests in `render-report-png.test.ts` for the failure-path test structure.

**Test scenarios:**
- Happy path: a `ReportSection` of kind `"image"` with `dataUrl: "data:image/png;base64,…"` renders as `<img src="data:image/png;base64,…">`.
- Error path: a `ReportSection` of kind `"image"` with `dataUrl: "https://attacker.example/x.png"` renders as the placeholder div; the rendered HTML contains no `<img>` tag and no `attacker.example` substring.
- Error path: a `ReportSection` of kind `"image"` with `dataUrl: "javascript:alert(1)"` renders as the placeholder div.
- Edge case: `dataUrl: ""` renders as the placeholder div.
- Integration: feed the renderer a `ReportDefinition` containing a mix of valid and invalid image sections; assert the output PNG renders successfully and the placeholder text appears in the rendered image (visual proof, or via DOM inspection before screenshot).
- Failure-path cleanup (the nitpick): trigger a render error inside `renderReportToPng`; assert the browser singleton is still usable for a subsequent call (no leaked context).

**Verification:**
- Vitest suite passes; SSRF-rejection tests fail on `origin/main` and pass after this unit's changes.
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.

---

- U4. **Replace magic numbers in `pptx-substitution.test.ts` with named constants**

**Goal:** Lift the three CR-flagged literals (`slideNumber: 5`, `toBeGreaterThan(1000)`, `60_000` timeout) into named constants per CLAUDE.md §1 spirit. Sweep the file for any additional CR-style violations CodeRabbit may have under-reported.

**Requirements:** R6.

**Dependencies:** U1, U2 (so the test file has already been touched by the schema and engine fixes and we don't conflict).

**Files:**
- Modify: `artifacts/api-server/src/tests/slides/pptx-substitution.test.ts`

**Approach:**
- Near the top of the file (after imports, before the first `describe`), add a `// Test constants` block:
  - `const SLIDE_NUMBER_FIXTURE = 5;` (with comment: "an arbitrary mid-deck slide for substitution-map fixtures; nothing about the test depends on this being slide 5 specifically")
  - `const MIN_SUBSTITUTED_PPTX_BYTES = 1000;` (with comment: "PPTX templates produced by pptx-automizer are >1KB even for empty slides; tightening this only matters as a sanity check, not a contract")
  - `const SUBSTITUTION_TEST_TIMEOUT_MS = 60_000;` (with comment: "soffice/pptx-automizer round-trip is heavyweight on cold start; 60s is the U2 LibreOffice-image budget")
- Sweep for additional raw integers in the file. Each should either become a named constant, get an inline `// structural: <reason>` comment if it's a zero/index, or get a math-derivation comment.

**Patterns to follow:**
- The named-constant pattern from `pptx-substitution.ts` (`OVERFLOW_TIGHTEN_THRESHOLD_PCT = 5`).

**Test scenarios:**
- Test expectation: none — this unit is a pure rename refactor. The existing test suite must continue to pass with identical assertions.

**Verification:**
- Vitest suite passes for `pptx-substitution.test.ts` (unchanged behavior).
- `pnpm run typecheck` clean.
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS.
- Manual grep: no `slideNumber: 5\b`, no `toBeGreaterThan(1000)\b`, no `60_000` raw literal remaining in the file.

---

## System-Wide Impact

- **Interaction graph:** `substituteSlots` is consumed by U6 (slide-6 embed flow, in-flight) and will be consumed by U8 (Builders' substitution-map output). The skipShapeLookup contract fix changes behavior for any caller passing `{ skipShapeLookup: true }` — confirm no existing caller relies on the bug. Grep `skipShapeLookup` across the repo before merging; expected hits are tests only.
- **Error propagation:** SSRF placeholder renders silently instead of throwing. Alternative: throw on non-`data:image/` and let the caller decide. Stick with silent placeholder because `ReportDefinition` is engine-generated; an unexpected scheme is a bug to surface in logs, not a runtime failure. Add a `console.warn` in `sanitizeImageSrc`'s rejection branch with the rejected scheme so it surfaces in Sentry.
- **State lifecycle risks:** Image-tmpdir cleanup must run on all error paths. The `try/finally` is the contract; verify there's no `process.exit` path inside the try that would skip the finally.
- **API surface parity:** No external-API change. `SubstitutionMap` schema becomes stricter (mimeType enum, table-index bounds); callers building maps in TypeScript get a compile-time error if they violated the old looser schema. This is the intended outcome — surfaces bugs at the call site.
- **Integration coverage:** Existing slide-factory smoke tests should still pass. If any fixture uses `mimeType: "image/webp"` or unbounded table indices, it'll fail; treat as a defect to fix in that fixture, not a reason to loosen the schema.
- **Unchanged invariants:** `SlotOverflowError` shape, `SubstitutionResult` shape, and `substituteSlotsFromAdminResource`'s public surface are unchanged. The R7 overflow guardrail thresholds are unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| The skipShapeLookup early-return bug may have masked a real caller-side reliance on no-op behavior (someone calling it as a "validate-only" mode and relying on the input buffer being returned unchanged). | Grep `skipShapeLookup` across the repo before merge; only `tests/slides/pptx-substitution.test.ts` should reference it (U4 internal). If a non-test caller is found, escalate — possibly add an explicit `validateOnly` option as a separate flag. |
| Schema tightening on `mimeType` could break U6 (in-flight) if its slide-6 image payload uses anything other than `image/png` / `image/jpeg`. | U6's PNG output from `renderReportToPng` is PNG by Playwright contract → `image/png`. Confirm in U6's PR review. If U6 lands first, this PR rebases cleanly because file scope is disjoint. |
| The `try/finally` cleanup may obscure a real bug if a thrown error is swallowed by `finally`. | Don't swallow — `finally` does cleanup only; the error continues to propagate. Re-confirm via code review. |
| Magic-numbers sweep in tests may find additional violations CR didn't flag, expanding scope. | Time-box the sweep to ~5 minutes; if more than 3 additional violations surface, document them in a follow-up issue and ship only the 3 CR-named ones. |
| SSRF placeholder silently degrades output when an unexpected URL appears. Operators may not notice. | `console.warn` in the rejection path surfaces it in Sentry; PR description calls this out so reviewers know to monitor first deploy. |

---

## Documentation / Operational Notes

- PR description: title `fix(factory-v2): N CodeRabbit follow-ups from PR-117 + PR-118 (U4/U5)`; body lists each CR thread with its severity and a one-line description of the fix; closes all 7 CR threads as `addressed`.
- After merge, paste the merge SHA into the memory file (`memory/project_factory_v2_u1_session.md`) under the Phase A/B tracking table — same row pattern as PR #116.
- No user-facing change; no docs site update.

---

## Sources & References

- PR #117 (U5 — `ReportDefinition → PNG`): https://github.com/<owner>/<repo>/pull/117
- PR #118 (U4 — PPTX substitution engine): https://github.com/<owner>/<repo>/pull/118
- PR #116 (precedent for CR-followup PR shape): https://github.com/<owner>/<repo>/pull/116
- Parent plan: `docs/plans/2026-05-11-001-feat-factory-v2-pptx-substitution-plan.md`
- CLAUDE.md §1 (no magic numbers) — repo project instructions
- Related: `docs/solutions/conventions/no-hardcoded-integration-identifiers-convention-2026-05-09.md`
