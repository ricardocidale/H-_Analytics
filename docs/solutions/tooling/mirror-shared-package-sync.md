---
title: "Mirror Shared Package Sync: api-server/src/shared must stay identical to lib/shared/src"
date: 2026-05-01
last_updated: 2026-05-04
category: tooling
module: shared-constants
problem_type: logic_error
component: tooling
symptoms:
  - "A constant added to lib/shared/src/X.ts is undefined when imported in api-server via @shared/X"
  - "TypeScript compiles fine in lib/engine but api-server throws at runtime"
  - "Magic-number ratchet counts the same literal in both shared mirrors, inflating duplication scores"
  - "API server fails to start after a task agent adds new constants to lib/shared but not the mirror"
  - "TS2440 'Import declaration conflicts with local declaration' when a task agent imports from @shared AND re-declares the same name locally"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
tags: [shared-package, mirror, api-server, constants, ratchet, ts2440, task-agent, build-error]
related_components: [lib/shared/src, artifacts/api-server/src/shared]
---

# Mirror Shared Package Sync: api-server/src/shared must stay identical to lib/shared/src

## Problem

`lib/shared/src/` is the canonical source of shared constants and types. `artifacts/api-server/src/shared/` is a byte-for-byte mirror consumed via the `@shared/*` tsconfig alias inside the api-server package. When a new constant is added only to `lib/shared/src/`, it compiles correctly for `lib/engine` consumers but is silently missing for api-server consumers — either throwing at runtime or crashing the api-server on startup.

## Symptoms

**Instance 1 (2026-05-01):** `SPECIALIST_RAW_QUALITY_SEED` was added to `lib/shared/src/analyst-conviction.ts` and referenced in 7 `lib/engine` specialist files, but `artifacts/api-server/src/shared/analyst-conviction.ts` did not receive the change — api-server would fail at runtime when any api-server code imported it via `@shared/analyst-conviction`.

**Instance 2 (2026-05-04):** Seven `VISION_*` constants (`VISION_DRAFT_MAX_TOKENS`, `VISION_BADGE_MAX_CHARS`, `VISION_BULLET_MAX_CHARS`, `VISION_PARAGRAPH_MAX_CHARS`, `VISION_CAPTION_MAX_CHARS`, `VISION_LABEL_MAX_CHARS`, `VISION_CLOSING_MAX_CHARS`) were added to `lib/shared/src/constants-benchmarks.ts` by a task agent, but `artifacts/api-server/src/shared/constants-benchmarks.ts` was not updated. The api-server failed to start — `property-vision.ts` imported them via `@shared/constants-benchmarks` but the mirror exported nothing for those names.

**Compounding TS2440 pattern:** The same task agent that introduced the constants also locally re-declared four of them inside `artifacts/api-server/src/ai/property-vision.ts` (as `const VISION_DRAFT_MAX_TOKENS = …`), producing TS2440 "Import declaration conflicts with local declaration" errors. Both bugs (missing mirror + local re-declaration) must be fixed together:

1. Append the new constants to the api-server mirror file.
2. Remove the local re-declarations that shadow the now-present imports.

## What Didn't Work

- TypeScript compilation alone cannot catch the missing-mirror bug: each package's tsconfig resolves `@shared/*` to its local copy, so both sides compile independently without error — the gap only surfaces at runtime or server startup.
- Task agents that add exports to `lib/shared/src/` frequently also re-declare those constants locally in the consuming file (as a convenience) — this works if the mirror is never updated, but breaks with TS2440 once the mirror is correctly populated.

## Solution

After adding any export to `lib/shared/src/<file>.ts`, apply the identical change to `artifacts/api-server/src/shared/<file>.ts` in the same commit. The two files should remain byte-for-byte identical for all but ~4 files that legitimately diverge.

**For constants-benchmarks.ts specifically:** append the new `export const VISION_*` lines to both files simultaneously.

To verify sync status at any time:

```bash
for f in lib/shared/src/*.ts; do
  fname=$(basename "$f")
  mirror="artifacts/api-server/src/shared/$fname"
  [ -f "$mirror" ] && diff -q "$f" "$mirror" > /dev/null || echo "DIVERGED: $fname"
done
```

The `shared-mirror-sync` skill (`.agents/skills/shared-mirror-sync/SKILL.md`) documents the full invariant and has a more complete diff procedure.

## Why This Works

The api-server's `tsconfig.json` maps `@shared/*` to `./src/shared/*` (i.e., `artifacts/api-server/src/shared/`), NOT to `lib/shared/src/`. Until the workspace packages are unified under a single tsconfig path alias, both copies must be kept in sync manually. The content-hash deduplication in `scripts/src/check-magic-numbers.ts` reduces ratchet false positives when the files ARE in sync.

## Prevention

- Any PR or task-agent commit that touches `lib/shared/src/*.ts` must also update the corresponding file in `artifacts/api-server/src/shared/` (use the diff loop above or the `shared-mirror-sync` skill).
- When reviewing task-agent output, check for TS2440 errors in files under `artifacts/api-server/src/` — they signal a task agent added imports from `@shared/*` but also kept local re-declarations. Remove the local re-declarations.
- After syncing the mirror and adding new constants, re-lock the magic-numbers baseline so the new exports are accounted for:
  ```bash
  pnpm --filter @workspace/scripts exec tsx ./src/check-magic-numbers.ts --init
  ```
- The `check:types-mirror` Replit workflow guards a *different* mirror pair (`artifacts/api-server/src/slides/types.ts` ↔ `artifacts/hospitality-business-portal/src/features/internal-deck/types.ts`). It does **not** cover `lib/shared/src` ↔ `artifacts/api-server/src/shared/`. Run the bash diff loop above for the shared-constants mirror.
- The magic-numbers ratchet's content-hash deduplication (`canonicalPath()` in `scripts/src/check-magic-numbers.ts`) will detect when these files diverge by suddenly counting constants in both mirrors as distinct — a visible jump in the suspect count.
- Long-term: consolidate to a single tsconfig path alias so both packages resolve `@shared/*` to `lib/shared/src/`.

## Related Issues

- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — ratchet content-hash deduplication that leverages the mirror sync invariant
- `.agents/skills/shared-mirror-sync/SKILL.md` — full invariant spec and diff procedure
