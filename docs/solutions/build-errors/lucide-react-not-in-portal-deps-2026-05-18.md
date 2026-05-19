---
title: lucide-react import crashes Vite dev server — portal uses @/components/icons (Phosphor)
date: "2026-05-18"
category: build-errors
module: hospitality-business-portal
problem_type: build_error
component: tooling
severity: high
symptoms:
  - Vite dev server throws "Failed to resolve import 'lucide-react' from 'src/components/ui/<component>.tsx'"
  - Hot-reload crashes on every file save touching the affected component
  - TypeScript typecheck passes silently — the error only surfaces at Vite bundle time
root_cause: wrong_api
resolution_type: code_fix
tags:
  - lucide-react
  - icons
  - vite
  - phosphor
  - portal
  - import
  - wrong-dependency
---

# lucide-react import crashes Vite dev server — portal uses @/components/icons (Phosphor)

## Problem

The `hospitality-business-portal` package does not declare `lucide-react` as a dependency. Importing from it directly (e.g. `import { X } from "lucide-react"`) causes Vite to throw a hard resolution error at dev-server start and on every subsequent hot-reload. The portal's icon system is backed by **Phosphor Icons** (`@phosphor-icons/react`) and exposed exclusively through `@/components/icons`.

## Symptoms

- `Failed to resolve import "lucide-react" from "src/components/ui/<component>.tsx"` in the Vite output
- Dev server fails to serve the page; hot-reload also crashes on save
- `pnpm run typecheck` passes without error — TypeScript resolves `lucide-react` types from the workspace's shared `node_modules` (hoisted from `mockup-sandbox`), masking the problem entirely

## What Didn't Work

- **Relying on typecheck to catch the error**: TypeScript's module resolver walks up to the monorepo root and finds `lucide-react` there (it is a direct dependency of `artifacts/mockup-sandbox`). The type check passes. Vite's bundler uses the package's own dependency graph and finds no `lucide-react` declaration in `artifacts/hospitality-business-portal/package.json` — different resolver, different failure mode.
- **Adding lucide-react to portal deps**: Tempting shortcut, but wrong. The portal already has a unified icon system with design-token-aware theming. Pulling in a second icon library creates inconsistency and bundle bloat.

## Solution

Replace any `lucide-react` import with the portal's canonical icon system:

```tsx
// ❌ Wrong — lucide-react is not a portal dependency
import { X } from "lucide-react";

// ✅ Correct — use the portal's icon barrel
import { IconX } from "@/components/icons";
```

The `IconX` export is defined in `artifacts/hospitality-business-portal/src/components/icons/status-icons.tsx` as a re-export of Phosphor's `X` component:

```tsx
export { X as IconX } from "@phosphor-icons/react";
```

It is also aliased as `IconXIcon` in `brand-icons.tsx` for contexts that need the longer name.

**Icon barrel location:** `artifacts/hospitality-business-portal/src/components/icons/index.ts`  
**Category files:** `action-icons`, `data-display-icons`, `financial-icons`, `media-icons`, `misc-icons`, `navigation-icons`, `status-icons` — all backed by `@phosphor-icons/react`.

## Why This Works

Vite resolves imports against the package's own `package.json` `dependencies` / `devDependencies`. The portal declares `@phosphor-icons/react` as a `devDependency`; `lucide-react` is not listed at all. TypeScript's module resolution algorithm walks parent directories and finds the hoisted workspace copy of `lucide-react`, so typechecks pass — but this is a false green. The Vite bundler never walks outside the package boundary, so it fails exactly where TypeScript silently succeeded.

## Prevention

- **Before importing any icon**, check `artifacts/hospitality-business-portal/package.json` — if the library is not listed there, it is not available in that package.
- Prefer `@/components/icons` over direct `@phosphor-icons/react` imports to stay within the portal's icon abstraction layer.
- If a new icon is needed that does not exist in the barrel, add it to the appropriate category file (`status-icons.tsx`, `action-icons.tsx`, etc.) rather than importing from Phosphor directly in a component.
- A future `check:portal-icon-imports` gate could statically reject direct `lucide-react` or `@phosphor-icons/react` imports outside `src/components/icons/`.

## Related Issues

- `docs/handoffs/lb-slides-replit-handoff.md` (line ~325) — explicitly states icons must come from `@/components/icons/themed-icons`
- `artifacts/hospitality-business-portal/src/components/icons/` — canonical icon barrel
- `artifacts/mockup-sandbox/` — the workspace package that _does_ declare `lucide-react`; this is the source of the hoisted type resolution that misleads TypeScript
