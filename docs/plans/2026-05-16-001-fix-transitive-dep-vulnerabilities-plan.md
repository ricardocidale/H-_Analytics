---
title: "fix: Resolve transitive Dependabot vulnerabilities — esbuild + @google-cloud/storage"
type: fix
status: active
date: 2026-05-16
---

# fix: Resolve transitive Dependabot vulnerabilities — esbuild + @google-cloud/storage

## Summary

Closes Dependabot alerts #20 (esbuild < 0.25.0, medium) and #21 (@tootallnate/once, low) via two targeted changes: a `pnpm.overrides` entry for esbuild following the repo's established pattern, and removal of the unused `@google-cloud/storage` dependency that is the sole root pulling in the `@tootallnate/once` chain.

---

## Requirements

- R1. Dependabot alert #20 (`esbuild` < 0.25.0) is resolved — no `esbuild@0.18.x` in the lockfile.
- R2. Dependabot alert #21 (`@tootallnate/once@2.0.1`) is resolved — no `@tootallnate/once` in the lockfile.
- R3. `pnpm run typecheck` passes clean after lockfile regeneration.
- R4. `pnpm run build` produces a working api-server bundle (esbuild build step succeeds).

---

## Scope Boundaries

- No changes to `artifacts/api-server/build.mjs` or any build script.
- No drizzle-kit version bump (latest still carries the same `@esbuild-kit` transitive chain; override is the right layer).
- No changes to any engine, calc, or finance surface.

---

## Context & Research

### Relevant Code and Patterns

- `package.json` (root): existing `pnpm.overrides` block with `fast-uri` and `fast-xml-builder` — exact pattern to follow.
- `artifacts/api-server/package.json`: `"esbuild": "^0.27.3"` (direct, already safe); `"@google-cloud/storage": "^7.19.0"` (unused — no import in `artifacts/api-server/src/`; only a comment in `canonical-asset-url.ts` referencing a legacy GCS bucket that no longer exists).
- `lib/db/package.json`: `"drizzle-kit": "^0.31.9"` — pulls in `@esbuild-kit/esm-loader@2.6.5` → `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20`. Bumping to 0.31.10 (latest) does not remove this chain.
- `pnpm-lock.yaml`: three esbuild versions present — 0.18.20 (via `@esbuild-kit/core-utils`), 0.25.12 (drizzle-kit direct), 0.27.3 (api-server direct). Override collapses 0.18.20 → ≥0.25.4.

### Key Technical Decisions

- **Override target version `>=0.25.4`** (drizzle-kit's own direct esbuild pin, not just the minimum 0.25.0): keeps all esbuild instances on a consistent recent version, avoids the `@esbuild-kit/core-utils` version ceiling being the weakest link.
- **Remove, not override, `@google-cloud/storage`**: the package is genuinely unused in source. Removal is cleaner than adding a deep transitive override for `@tootallnate/once` or `http-proxy-agent`, which would require a major-version jump (2.x → 3.x).
- **`@esbuild-kit/core-utils` uses only `transform()`/`build()` APIs** — the esbuild vulnerability is about the `serve()` dev-server API only. The override is a belt-and-suspenders fix; there is no actual exposure through this dependency path.

---

## Implementation Units

- U1. **Add esbuild pnpm override**

**Goal:** Force all transitive esbuild resolutions to ≥0.25.4, collapsing the `@esbuild-kit/core-utils@3.3.2` → `esbuild@0.18.20` path.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `package.json` (root)

**Approach:**
- Add `"esbuild": ">=0.25.4"` to the existing `pnpm.overrides` block alongside `fast-uri` and `fast-xml-builder`.
- Run `pnpm install` to regenerate `pnpm-lock.yaml`. Verify `esbuild@0.18.20` no longer appears in the lockfile.

**Patterns to follow:**
- Existing `pnpm.overrides` entries in `package.json` (root): `fast-uri`, `fast-xml-builder`.

**Test scenarios:**
- Happy path: `grep "esbuild@0.18" pnpm-lock.yaml` returns no matches after install.
- Happy path: `grep "esbuild@0.25\|esbuild@0.27" pnpm-lock.yaml` shows the remaining versions are both ≥0.25.

**Verification:**
- `pnpm-lock.yaml` contains no `esbuild@0.18.x` entry.

---

- U2. **Remove unused @google-cloud/storage**

**Goal:** Eliminate the `teeny-request` → `http-proxy-agent@5` → `@tootallnate/once@2.0.1` chain by removing its only root.

**Requirements:** R2

**Dependencies:** None (can run in parallel with U1, but both feed the same `pnpm install` run)

**Files:**
- Modify: `artifacts/api-server/package.json`

**Approach:**
- Remove the `"@google-cloud/storage"` entry from `dependencies`.
- Run `pnpm install` (same run as U1 — a single install covers both changes).
- Verify `@tootallnate/once` no longer appears in `pnpm-lock.yaml`.

**Patterns to follow:**
- Standard `pnpm install` lockfile regeneration after dependency removal.

**Test scenarios:**
- Happy path: `grep "@tootallnate/once" pnpm-lock.yaml` returns no matches after install.
- Edge case: `grep "@google-cloud/storage" artifacts/api-server/src/` returns no matches (confirms no live import was missed).

**Verification:**
- `pnpm-lock.yaml` contains no `@tootallnate/once` entry.
- `artifacts/api-server/src/` has no import of `@google-cloud/storage`.

---

- U3. **Verify build and typecheck**

**Goal:** Confirm the lockfile change doesn't break the api-server bundle or TypeScript compilation.

**Requirements:** R3, R4

**Dependencies:** U1, U2

**Files:**
- No file changes — verification only.

**Approach:**
- Run `pnpm run typecheck` across all packages.
- Run `pnpm run build` (or scoped `pnpm --filter @workspace/api-server run build`) to confirm esbuild still bundles correctly.

**Test scenarios:**
- Happy path: typecheck exits 0 with no new errors.
- Happy path: build exits 0 and produces `artifacts/api-server/dist/index.mjs`.

**Verification:**
- `pnpm run typecheck` — clean.
- `pnpm run build` — clean, bundle produced.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `@esbuild-kit/core-utils@3.3.2` incompatible with esbuild ≥0.25.4 | The package only uses `transform()`/`build()` — stable APIs. If incompatibility surfaces, scope the override to `>=0.25.0` (minimum CVE threshold) instead of `>=0.25.4`. |
| `@google-cloud/storage` is imported somewhere not caught by grep | U2 verification step explicitly checks `artifacts/api-server/src/` for any live import before declaring done. |
