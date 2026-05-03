---
title: "Mirror Shared Package Sync: api-server/src/shared must stay identical to lib/shared/src"
date: 2026-05-01
category: tooling
module: shared-constants
problem_type: logic_error
component: tooling
symptoms:
  - "A constant added to lib/shared/src/X.ts is undefined when imported in api-server via @shared/X"
  - "TypeScript compiles fine in lib/engine but api-server throws at runtime"
  - "Magic-number ratchet counts the same literal in both shared mirrors, inflating duplication scores"
root_cause: missing_workflow_step
resolution_type: code_fix
severity: high
tags: [shared-package, mirror, api-server, constants, ratchet]
related_components: [lib/shared/src, artifacts/api-server/src/shared]
---

# Mirror Shared Package Sync: api-server/src/shared must stay identical to lib/shared/src

## Problem

`lib/shared/src/` is the canonical source of shared constants and types. `artifacts/api-server/src/shared/` is a byte-for-byte mirror consumed via the `@shared/*` tsconfig alias inside the api-server package. When a new constant is added only to `lib/shared/src/`, it compiles correctly for `lib/engine` consumers but is silently missing for api-server consumers.

## Symptoms
- `SPECIALIST_RAW_QUALITY_SEED` was added to `lib/shared/src/analyst-conviction.ts` and referenced in 7 `lib/engine` specialist files, but `artifacts/api-server/src/shared/analyst-conviction.ts` did not receive the change — api-server would fail at runtime when any api-server code imported it via `@shared/analyst-conviction`.

## What Didn't Work
- TypeScript compilation alone cannot catch this: each package's tsconfig resolves `@shared/*` to its local copy, so both sides compile independently without error.

## Solution
After adding any export to `lib/shared/src/<file>.ts`, apply the identical change to `artifacts/api-server/src/shared/<file>.ts` in the same commit. The two files should remain byte-for-byte identical for all but ~4 files that legitimately diverge.

To verify sync status at any time:
```bash
for f in lib/shared/src/*.ts; do
  fname=$(basename "$f")
  mirror="artifacts/api-server/src/shared/$fname"
  [ -f "$mirror" ] && diff -q "$f" "$mirror" > /dev/null || echo "DIVERGED: $fname"
done
```

## Why This Works

The api-server's `tsconfig.json` maps `@shared/*` to `./src/shared/*` (i.e., `artifacts/api-server/src/shared/`), NOT to `lib/shared/src/`. Until the workspace packages are unified under a single tsconfig path alias, both copies must be kept in sync manually. The content-hash deduplication in `scripts/src/check-magic-numbers.ts` reduces ratchet false positives when the files ARE in sync.

## Prevention
- Any PR that touches `lib/shared/src/*.ts` must also update the corresponding file in `artifacts/api-server/src/shared/` (use the diff loop above).
- The magic-numbers ratchet's content-hash deduplication (`canonicalPath()` in `scripts/src/check-magic-numbers.ts`) will detect when these files diverge by suddenly counting constants in both mirrors as distinct — a visible jump in the suspect count.
- Long-term: consolidate to a single tsconfig path alias so both packages resolve `@shared/*` to `lib/shared/src/`.

## Related Issues
- `docs/solutions/tooling/magic-numbers-ratchet-improvements.md` — ratchet content-hash deduplication that leverages the mirror sync invariant
