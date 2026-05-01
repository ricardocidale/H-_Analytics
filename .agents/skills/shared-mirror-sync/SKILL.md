---
name: shared-mirror-sync
description: "Verify and repair the lib/shared/src ↔ artifacts/api-server/src/shared mirror. Use whenever you add a new export to lib/shared/src — the api-server resolves @shared/* to its own local copy and will not see changes made only to lib/shared/src."
---

# Shared Mirror Sync

`lib/shared/src/` is the canonical source of shared constants, types, and utilities. `artifacts/api-server/src/shared/` is a byte-for-byte mirror — the api-server's tsconfig maps `@shared/*` to `./src/shared/*`, so changes made only to `lib/shared/src` are invisible to api-server consumers.

## When to use

Run this skill whenever you:
- Add or modify an export in `lib/shared/src/*.ts`
- See a TypeScript error in api-server that references a symbol from `@shared/*`
- Notice the magic-numbers ratchet suddenly showing more suspects for a constant that only exists in one place

## Sync check

```bash
for f in lib/shared/src/*.ts; do
  fname=$(basename "$f")
  mirror="artifacts/api-server/src/shared/$fname"
  if [ -f "$mirror" ]; then
    diff -q "$f" "$mirror" > /dev/null || echo "DIVERGED:  $fname"
  else
    echo "ONLY-IN-LIB: $fname"
  fi
done
```

A clean run prints nothing. Any `DIVERGED` line requires immediate attention.

## Repair

For each diverged file, inspect the diff:
```bash
diff lib/shared/src/<file>.ts artifacts/api-server/src/shared/<file>.ts
```

Then apply the lib/shared version to the mirror. In most cases the mirror should be byte-for-byte identical. The four files that legitimately diverge are:
- `constants.ts` — api-server has server-specific additional exports (HTTP codes, DB pool, etc.)
- `get-effective-constant.ts` — api-server version imports from Drizzle; lib version uses a different DB layer
- `market-intelligence-pipeline.ts` — api-server version references server-only pipeline types
- `risk-types.ts` — minor type extension for api-server risk scoring

Do not blindly overwrite these four — inspect the diff and apply only the shared changes.

## Rule

> Every export added to `lib/shared/src/<file>.ts` must be applied to `artifacts/api-server/src/shared/<file>.ts` in the same commit — unless the file is one of the four legitimately-diverged files, in which case apply the new export to both versions manually.

## Why this exists

The workspace has two tsconfig path resolution chains:
- `lib/engine` and `lib/calc` resolve `@shared/*` → `lib/shared/src/*`
- `artifacts/api-server` resolves `@shared/*` → `artifacts/api-server/src/shared/*`

Until the packages share a single monorepo tsconfig alias, the mirror must be maintained manually. The `canonicalPath()` content-hash deduplication in `scripts/src/check-magic-numbers.ts` leverages the sync invariant — when the files are identical, it counts them as one; when they diverge, both get counted and suspects spike, providing a visible signal.

## Long-term resolution

Consolidate to a single tsconfig path alias pointing at `lib/shared/src/`. This requires:
1. Updating `artifacts/api-server/tsconfig.json` to point `@shared/*` at `lib/shared/src/*`
2. Reconciling the 4 diverged files (likely: extend lib/shared types for server-specific needs, remove the diverged copies)
3. Deleting `artifacts/api-server/src/shared/` (after confirming all 144 affected imports resolve correctly)

## See also
- `docs/solutions/tooling/mirror-shared-package-sync.md` — post-mortem for the analyst-conviction sync bug
- `no-magic-numbers` — the ratchet whose content-hash deduplication depends on this sync invariant
