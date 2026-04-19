# Lint Warning Cleanup — Plan

**Status:** Proposed. Execute incrementally across sessions.
**Owner:** Claude Code (cross-cutting refactor, per `.claude/rules/claude-replit-split.md`).
**Last audit:** 2026-04-20 (Claude Code).

---

## Why this plan exists

`npm run lint` reports **0 errors, 348 warnings**. All are legitimate rule violations flagged by `.claude/rules/financial-safety.md` and style rules in `eslint.config.js`. The five-gate verification passes because warnings are not blocking — but that's cover, not justification. Each warning is a real latent bug or type hole.

The warnings are pre-existing. Nothing this session caused them. But if we leave them indefinitely they rot into the accepted baseline and new warnings sneak in unnoticed. The cheapest time to clean them up is now, with a deliberate plan.

**Why not bulk-fix blindly?** Two of the three dominant rules (`|| 0` silent fallback, `fetch() without timeout`) *intentionally* mask bugs or change behavior when fixed. Blind replacement risks:
- `NaN || 0 → 0` becoming `NaN ?? 0 → NaN` because `??` does not coerce NaN. Silent financial error turns into loud financial error. That's **good** — but each site needs a check that the caller can handle NaN or that `Number.isFinite` guards are wired in.
- `fetch(url)` becoming `fetchWithTimeout(url, DEFAULT_TIMEOUT)` requires picking a timeout. Too short = breaks real-world slow networks; too long = no protection. Each call site's semantics differ.

So: plan-driven, batch-verified, with rollback.

---

## The inventory

As of 2026-04-20 (run on commit `9051add6`):

| Rule | Count | Risk per fix |
|---|---:|---|
| `\|\| 0` silent numeric fallback | 195 | Medium — can expose latent NaN bugs |
| `as any` banned | 109 | Low–Medium — needs correct type discovery |
| `Math.pow` banned | 15 | Low — `dPow` drop-in for financial math; disable-comment for non-financial |
| `defined but never used` | 9 | Zero — mechanical deletion |
| `fetch()` without timeout | 6 | Medium — timeout value per-site |
| Other `no-restricted-syntax` | ~14 | Varies |

**Top files by count (>= 5 warnings):**

1. `client/src/pages/CompanyIcpDefinition.tsx` — 35
2. `client/src/lib/audits/auditBalanceSheet.ts` — 20
3. `client/src/lib/audits/gaapComplianceChecker.ts` — 16
4. `client/src/lib/verification/known-value-runner.ts` — 15
5. `client/src/pages/PropertyEdit.tsx` — 9
6. `server/routes/icp-research-helpers.ts` — 8
7. `client/src/lib/audits/auditCashFlow.ts` — 8
8. `client/src/components/admin/AssetDefinitionTab.tsx` — 8
9. `server/ai/research-tool-prompts.ts` — 7
10. `server/ai/research-value-extractor.ts` — 6
11. `client/src/lib/audits/auditIncomeStatement.ts` — 6
12. `server/routes/geospatial.ts` — 5
13. `server/calculation-checker/index.ts` — 5
14. `client/src/lib/exports/propertyExportShared.ts` — 5
15. `client/src/components/portfolio/AddPropertyDialog.tsx` — 5
16. `client/src/components/admin/DatabaseTab.tsx` — 5
17. `client/src/components/admin/AgentPersonasTab.tsx` — 5

---

## Batching strategy

Batches are chosen to be:
1. **Small** — ≤ 25 warnings per batch so review burden is tractable.
2. **Single-rule-dominant** — each batch fixes one rule class per file so git blame stays useful.
3. **Proof-verifiable** — `npm run verify:summary` must stay UNQUALIFIED after every batch. That's the rollback gate.

### Batch 1 — Zero-risk cleanup (unused vars + safe Math.pow) [~24 warnings]

- All 9 unused-var warnings. Mechanical deletions.
- 15 `Math.pow` sites. Each is either:
  - Financial math → replace with `dPow` from `calc/shared/decimal-helpers.ts`.
  - Non-financial (exponential backoff, tile zoom, animation easing) → add `// eslint-disable-next-line no-restricted-syntax` with one-word rationale.

Verification: five gates. This batch cannot break anything because `dPow` is decimal-safe (slightly more precise than `Math.pow`) and unused-var deletion is trivially safe.

### Batch 2 — `as any` by file, starting with lowest count [~30 warnings]

Target files with 2–4 `as any` warnings (high-ratio, low-risk per session). Each `as any` gets one of:
- A specific type assertion (preferred) — discover the real shape.
- `as unknown as X` with a one-line comment explaining *why* the type is genuinely opaque (external API response, legacy interface, etc.).
- Deletion if the cast was unnecessary.

Files in scope:
- `client/src/components/admin/IcpLocationTab.tsx` (1)
- `client/src/components/admin/NotificationsTab.tsx` (1)
- `client/src/components/dashboard/usePortfolioFinancials.ts` (2)
- `client/src/components/property-edit/CapitalStructureSection.tsx` (2)
- (continue down the file list until batch size ~30)

Verification: five gates. Special care: `as unknown as X` casts preserve runtime behavior — only type-level change. Proof suite must still pass.

### Batch 3 — `as any` in high-count files [~30 warnings]

- `CompanyIcpDefinition.tsx` subset (tackle `as any` slice first)
- `AssetDefinitionTab.tsx` (7 warnings, all `as any`)
- `AgentPersonasTab.tsx` (4–5 `as any`)

### Batch 4 — `|| 0` in non-financial client contexts [~40 warnings]

The safest `|| 0` sites are cosmetic rendering and UI state where the fallback just protects against undefined. Examples:
- `DatabaseTab.tsx` displaying row counts (5 sites)
- Activity log counters (4 sites)
- Sharing log dates (2 sites)
- Dashboard overview props (4 sites)

Replacement pattern:
```ts
// before
const count = data.length || 0;

// after (when value type is number | undefined)
const count = data.length ?? 0;

// after (when value might actually be NaN-producing)
const raw = data.length ?? 0;
const count = Number.isFinite(raw) ? raw : 0;
```

### Batch 5 — `|| 0` in financial calculators and builders [~60 warnings]

Highest-risk batch. Every site in this batch could hide a real financial bug. Approach:
1. Read the file's context.
2. For each `|| 0`:
   - If the upstream type is `number | undefined` (optional config, missing seed), change to `?? 0`.
   - If the upstream could produce NaN (computed value from division, exponentiation), wrap in `assertFinite(value, "fieldName")` — which will *throw* rather than silently coerce. This is the whole point of the rule.
3. Run `npm run test:file -- tests/engine/` after each file. If a test fails, we just caught a bug — fix the bug, don't mask it.

Files in scope:
- `client/src/lib/audits/auditBalanceSheet.ts` (20)
- `client/src/lib/audits/auditCashFlow.ts` (8)
- `client/src/lib/audits/auditIncomeStatement.ts` (6)
- `client/src/lib/audits/gaapComplianceChecker.ts` (16)
- `server/calculation-checker/index.ts` (5)

### Batch 6 — `|| 0` remaining client components [~50 warnings]

CompanyIcpDefinition.tsx remaining after Batch 3, PropertyEdit.tsx, portfolio dialogs, property-edit sections. Lower risk than Batch 5 because these are view layers reading already-computed numbers.

### Batch 7 — `fetch()` without timeout [6 warnings]

Per-site decision. Each becomes `fetchWithTimeout(url, timeoutMs)`. Timeout heuristics:
- External API call (LLM, market data, geospatial) → 30s
- Replit object storage sidecar → 10s
- Internal `/api/` fetches → 15s

Sites:
- `server/routes/uploads.ts:196` — external upload flow → 30s
- `server/routes/geospatial.ts:50` (2 sites) — geospatial API → 30s
- `server/scripts/backfill-photo-image-data.ts` — one-off script → 60s (batch script, tolerant)
- (remaining 2 TBD on inspection)

### Batch 8 — Remaining misc `no-restricted-syntax` [~14 warnings]

Whatever's left after categorized batches — typically one-offs (banned APIs, deprecated patterns).

---

## Per-batch verification protocol

For every batch:

1. Before edits: note the current lint count with `npm run lint 2>&1 | grep "problems" | tail -1`. Commit clean baseline.
2. Edit the files in the batch.
3. Run:
   ```
   npx tsc --noEmit --skipLibCheck
   npm run lint
   npm run test:file -- tests/audit/vocabulary-compliance.test.ts
   npm run test:summary
   npm run verify:summary
   ```
4. Confirm warning count dropped by ≥ batch size (not just shifted). No new errors introduced.
5. If a proof test fails that was passing before → **the batch caught a real bug**. Stop, root-cause, fix code, re-run. Do NOT revert the lint fix.
6. If a proof test fails that was already failing (pre-existing breakage) → investigate, likely revert just that site; flag to user.
7. Commit with message referencing batch number + rule + file count.

## Rollback criterion

Rollback (individual file or whole batch) iff:
- A proof test or engine test goes from PASS → FAIL and root cause is not an obvious bug the lint fix exposed.
- Verify UNQUALIFIED → ADVERSE/QUALIFIED.
- A behavior change visible in UI that wasn't expected (unlikely — `||` vs `??` only differs for zero/empty-string/false, rarely behavior-changing in financial code but worth eyeballing Dashboard + Balance Sheet after Batch 5).

Rollback is cheap because each batch is a single commit.

## Commit message convention

```
chore(lint): batch N — <rule> in <file count> files

- <file 1> (<count> sites)
- <file 2> (<count> sites)
...

Total: -<N> warnings (<before> → <after>)
Verified: TS 0, Lint 0 errors / <warning count> warnings, Vocab 11/11,
test:summary PASS, Verify UNQUALIFIED

Surfaces: <affected>
```

## Non-goals

- **No new rules, no stricter config.** This plan reduces warnings under existing rules. Tightening rules is a separate decision.
- **No touching the `348 warnings` eslint baseline marker** if one exists — we're not silencing, we're fixing.
- **No refactoring beyond the minimum.** Each batch's diff should be narrowly targeted. Drive-by refactors go in separate commits.

## Done criteria

The plan ends when `npm run lint` reports **0 errors, 0 warnings**. Realistic: 6–10 sessions at 1–2 batches per session, depending on how much real bug surfacing happens in Batch 5.

When we're done we'll optionally discuss whether to upgrade the rules from warning to error in `eslint.config.js`, which would be the natural follow-up once the baseline is clean.

---

## Progress tracker

| Batch | Warnings targeted | Status | Commit |
|---|---:|---|---|
| 1 — unused vars + Math.pow | 24 | ✅ done (348 → 324) | `3e51bd46` |
| 2 — `as any` low-count files | 18 | ✅ done (324 → 306) | `06b36838` |
| 3 — `as any` in CompanyIcpDefinition.tsx | 35 | ✅ done (306 → 271) | `af259deb` |
| 4 — `\|\| 0` non-financial (admin UI + metadata + charts) | 34 | ✅ done (271 → 237) | (this commit) |
| 5 — `\|\| 0` financial calculators | ~60 | ⏸ **pause for review — expected to surface NaN bugs** | — |
| 6 — `\|\| 0` remaining client | ~50 | — | — |
| 7 — `fetch()` timeouts | 6 | ✅ done (237 → 231) | (this commit) |
| 8 — misc `as any` + misc | ~24 | — | — |
| **Total** | **~348** | **117 / 348 complete (34%)** | — |

Update this table when a batch commits. Copy the exact SHA and warning delta.
