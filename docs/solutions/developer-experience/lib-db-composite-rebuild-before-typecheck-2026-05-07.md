---
title: "lib/db composite project must be rebuilt before api-server typecheck when new schema types are added"
date: 2026-05-07
category: developer-experience
module: lib-db-build
problem_type: developer_experience
component: tooling
severity: medium
applies_when:
  - Adding new schema files to lib/db/src/schema/
  - Exporting new types from lib/db/src/schema/index.ts
  - Running pnpm --filter @workspace/api-server run typecheck after a lib/db schema change
tags:
  - typescript
  - composite-project
  - project-references
  - lib-db
  - dist
  - typecheck
  - build-error
  - drizzle-schema
---

# lib/db composite project must be rebuilt before api-server typecheck when new schema types are added

## Context

When a new schema file is added to `lib/db/src/schema/` and exported from `lib/db/src/schema/index.ts`, running `pnpm --filter @workspace/api-server run typecheck` fails with:

```
error TS2305: Module '"@workspace/db"' has no exported member 'slideFactoryRuns'.
error TS2305: Module '"@workspace/db"' has no exported member 'SlideFactoryRun'.
```

This happens even though:
- The file exists at the correct path
- It is exported from `lib/db/src/schema/index.ts`
- `lib/db/src/index.ts` has `export * from "./schema"`
- The `@workspace/db` path mapping in api-server's tsconfig points to `../../lib/db/src`

## Guidance

Run `npx tsc` inside `lib/db` to regenerate declaration files before typechecking the api-server:

```bash
cd /path/to/workspace/lib/db && npx tsc
cd /path/to/workspace && pnpm --filter @workspace/api-server run typecheck
```

This rebuilds `lib/db/dist/schema/slide-factory-runs.d.ts` (and all other declarations). The api-server typecheck then resolves the new types correctly.

## Why This Matters

`lib/db/tsconfig.json` has `"composite": true`. The `artifacts/api-server/tsconfig.json` declares a project reference to `lib/db`:

```json
"references": [{ "path": "../../lib/db" }]
```

When TypeScript processes a project with `references`, it reads declaration files from the referenced project's `outDir` (`lib/db/dist/`) — **not** from `src/` — regardless of the `paths` mapping. The `dist/` directory is in `.gitignore`, so it is never committed and must be rebuilt per-workspace.

The `paths` mapping alone is insufficient:
```json
// api-server tsconfig.json
"paths": {
  "@workspace/db": ["../../lib/db/src"]  // ← overridden by project references
}
```

TypeScript project references take precedence over `paths` for packages declared in `references[]`.

## When to Apply

Every time a new file is added to `lib/db/src/schema/` or a new type is exported from the schema index, any developer who pulls those changes must run `cd lib/db && npx tsc` before running the api-server typecheck. The `dist/` rebuild is also required:

- After `git pull` when `lib/db/src/schema/` changed
- After switching branches that add schema files
- After creating a new schema file in the current branch

## Examples

```bash
# ❌ Fails with TS2305 if lib/db/dist/ is stale or missing
pnpm --filter @workspace/api-server run typecheck

# ✅ Rebuild lib/db first, then typecheck api-server
cd lib/db && npx tsc
cd ../..
pnpm --filter @workspace/api-server run typecheck
```

Alternatively, from the repo root:

```bash
(cd lib/db && npx tsc) && pnpm --filter @workspace/api-server run typecheck
```

## Related

- `lib/db/tsconfig.json` — `composite: true`, `outDir: dist/`
- `artifacts/api-server/tsconfig.json` — `references: [{ path: "../../lib/db" }]`
- `.gitignore` — `lib/db/dist/` is ignored and never committed
