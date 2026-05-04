# `@workspace/api-zod`

**Status: unused stub.** This package is an orval-generated scaffold from a placeholder OpenAPI spec (`version: 0.1.0`). It contains a single schema (`HealthCheckResponse`) and is not imported by any source file in the workspace.

## What this means in practice

- The api-server (`artifacts/api-server`) does **not** consume this package — it was removed from its `dependencies` after the May 2026 API/SDK contract audit.
- The portal frontend does **not** consume this package either.
- API contracts between backend and frontend are **TypeScript-only** today: route handlers expose response shapes via TS types; clients infer them ad-hoc. There is no runtime contract enforcement at the HTTP boundary.

## Why we kept the package directory

The package and its generated scaffolding remain in place so that a future "real OpenAPI spec" project can:

1. Replace the stub `0.1.0` spec with one generated from current routes (e.g. via `zod-to-openapi` or hand-authored).
2. Re-run `orval` to regenerate `src/generated/`.
3. Add `@workspace/api-zod` back as a dependency wherever runtime validation is wanted.

Until that project happens, this package is dead code in the workspace graph.

## Do not import from this package

If you find yourself wanting to add an import here, that is the signal to do the OpenAPI-spec project properly — don't half-wire the stub.
