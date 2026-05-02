---
title: "api-server bundle bloated to ~21 MB — externalize AI SDKs and heavy runtime deps to reach 7.5 MB"
date: 2026-05-02
category: performance-issues
module: api-server
problem_type: performance_issue
component: tooling
severity: high
symptoms:
  - "api-server dist/index.mjs was ~21 MB, well above the 10 MB target"
  - "country-state-city contributed 8.32 MB of bundled JSON (only used by geo.ts route)"
  - "AI SDK packages (@ai-sdk/*, @anthropic-ai/sdk, openai, ai) added ~1-2 MB despite tree-shaking"
  - "@sentry/* contributed ~1.4 MB; google-auth-library ~0.3 MB"
  - "esbuild metafile analysis required to identify actual dominant contributors — assumptions about AI SDK size were wrong"
root_cause: config_error
resolution_type: config_change
tags:
  - esbuild
  - bundle-size
  - externals
  - ai-sdk
  - sentry
  - country-state-city
  - pnpm
  - performance
---

# api-server bundle bloated to ~21 MB — externalize AI SDKs and heavy runtime deps to reach 7.5 MB

## Problem

The `artifacts/api-server` esbuild bundle grew to approximately 21 MB, making cold starts and deploys unnecessarily slow. The target was a bundle under 10 MB, and the initial assumption — that AI SDK clients were the dominant contributor — turned out to be wrong.

## Symptoms

- `dist/index.mjs` measured ~21 MB on disk after build
- Cold container start times were inflated due to the large bundle being parsed by Node.js at startup
- Deployed container image size was larger than necessary
- Build times slightly longer due to esbuild traversing and inlining millions of bytes of reference JSON

## What Didn't Work

- **Initial assumption**: The 8 AI SDK clients (`@ai-sdk/anthropic`, `@ai-sdk/google`, `@ai-sdk/openai`, `@anthropic-ai/sdk`, `@google/genai`, `@perplexity-ai/perplexity_ai`, `openai`, `ai`) were responsible for the bulk of the ~10 MB overage, based on the expectation that LLM SDKs are large.
- **What esbuild metafile analysis actually revealed**: The AI SDKs combined accounted for only ~1–2 MB after esbuild tree-shaking. The real offenders were:
  - `country-state-city`: **8.32 MB** — a data library that bundles JSON for every country, state, and city on earth. Only consumed by a single route (`src/routes/geo.ts`), so it added dead weight to all other request paths.
  - `@sentry/*`: ~1.4 MB of observability SDK code.
  - `google-auth-library`: ~0.3 MB.
- **Historical context** (session history): The bundle had already been reduced from ~32 MB → ~20.4 MB in a prior step (Task #942) by externalizing doc/media libraries (`@react-pdf/renderer`, `pptxgenjs`, `xlsx`, `docx`, `satori`, `jspdf`, `archiver`). The ~21 MB remaining still exceeded the target because the AI SDK assumption had not yet been tested with metafile analysis.

## Solution

Extend the `external` array in `artifacts/api-server/build.mjs` to mark these packages as runtime dependencies that esbuild should not inline. Each package must remain in `dependencies` (not `devDependencies`) so `pnpm` installs it in the deployed container.

```js
// AI SDK clients — only loaded on AI request paths. Externalizing
// keeps the production bundle small. Each must remain in
// `dependencies` so pnpm installs them at runtime.
"@ai-sdk/anthropic",
"@ai-sdk/google",
"@ai-sdk/openai",
"@anthropic-ai/sdk",
"@google/genai",
"@perplexity-ai/perplexity_ai",
"openai",
"ai",
// Heavy reference-data library (~8 MB of bundled JSON for every
// country/state/city). Only used by `src/routes/geo.ts`. Must remain
// in `dependencies` so pnpm installs it at runtime.
"country-state-city",
// Observability / auth runtime SDKs — keep external so the bundle
// stays under the 10 MB target. All remain in `dependencies` so
// pnpm installs them in the deployed container at runtime.
"@sentry/*",
"google-auth-library",
```

Result: `dist/index.mjs` dropped from ~21 MB to **7,828,640 bytes (~7.5 MB)**, well under the 10 MB target.

**Note** (session history): `express` and `pg` were later added to `external` for a different reason — Sentry's OpenTelemetry instrumentation (import-in-the-middle / IITM) requires a real runtime import to wrap these packages. When bundled inline, IITM never sees the import and Sentry request/query tracing is silently disabled.

## Why This Works

esbuild's default behavior (`bundle: true`) inlines every imported module recursively into the output file. This is normally desirable for front-end bundles (no network round-trips) but counterproductive for Node.js server bundles deployed into containers, where every package in `node_modules` is already present at runtime via `pnpm install`.

Marking a package `external` tells esbuild to emit a bare `import "package-name"` in the output instead of inlining the package's code. Node.js then resolves it from `node_modules` at startup — the same way it would work without a bundler.

The root cause of the bloat was that `country-state-city` contains ~8 MB of static JSON and esbuild cannot tree-shake a JSON import — it must inline the entire dataset regardless of how little is accessed at runtime. SDKs that are already heavily tree-shaken by their authors (like the AI SDKs) contribute far less to bundle size than expected.

The diagnostic workflow: run esbuild with `metafile: true`, write output to `dist/meta.json`, open it in the [esbuild bundle analyzer](https://esbuild.github.io/analyze/) to get a treemap showing which packages contribute the most bytes. This immediately revealed `country-state-city` as the dominant contributor.

## Prevention

- **Run the metafile analysis before assuming any package is the culprit.** Add `metafile: true` to the esbuild config during investigation, write the output to `dist/meta.json`, and open it in the bundle analyzer. One minute of analysis prevents hours of wrong-direction optimization.
- **JSON-heavy data libraries are a special risk.** Any package whose source is primarily static JSON (locale data, geographic data, currency tables, emoji lists, timezone databases) cannot be tree-shaken and will be inlined in full. These are always good externalization candidates for server bundles.
- **Consider usage breadth when externalizing.** Packages used by a single narrow route (like `country-state-city` in `geo.ts`) impose their full weight on every boot even though only one code path needs them.
- **For server-side Node.js bundles, prefer externalizing large SDK packages** that are only activated on specific request paths (AI inference, PDF rendering, spreadsheet generation). They add startup-parse cost without benefiting the hot path.
- **Maintain the `dependencies` vs `devDependencies` invariant.** Every externalized package must stay in `dependencies` in `package.json`. A post-build smoke test that imports each externalized package catches missing runtime deps before deployment.
- **Set a bundle-size gate in CI.** A `maxSize` check on `dist/index.mjs` (e.g., fail if > 10 MB) turns bundle bloat from a silent accumulation problem into an immediately visible build failure.
- **The `external` array also governs Sentry IITM instrumentation.** `express` and `pg` must remain external for Sentry OpenTelemetry to instrument them via `--import ./dist/instrument.mjs`. Bundling them makes import-in-the-middle invisible to Sentry and silently disables request/query tracing.

## Related Issues

- Task #942: First bundle-shrink step — doc/media libraries externalized, ~32 MB → ~20.4 MB
- Task #948: This fix — AI SDKs + heavy data libs externalized, ~21 MB → ~7.5 MB
- Task #949: Sentry IITM fix — required externalizing `express` for instrumentation to work
