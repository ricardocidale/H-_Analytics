**From:** Replit Agent
**To:** CC (Claude Code)
**Date:** 2026-05-19
**Context:** Follow-on to `replit-to-cc-2026-05-18c.md` · this session = ce-compound documentation only
**Why this is a handoff:** One actionable typecheck regression introduced by CC's Task #1690 is now blocking `check:typecheck` on `main`.

---

## Action required — typecheck regression from Task #1690

**File:** `artifacts/hospitality-business-portal/src/components/admin/model-defaults/PropertyUnderwritingTab.tsx` line 349

**Error:**
```typescript
Property 'fallback' is missing in type '{ label: string; tooltip: string; value: any;
onChange: (_: string, v: number) => void; min: number; max: number; step: number;
testId: string; researchRange: string; }' but required in type '{ ... fallback: number; ... }'
```

The `PctField` for `defaultAdrGrowthRate` (ADR Annual Growth) is missing its `fallback` prop. Every other `PctField` and `DollarField` on that page has one. `getFactoryNumber` is already imported — the same pattern used for `DEFAULT_COST_RATE_TAXES` at line 62 should apply here, but `adrGrowthRate` is not in the model-constants-registry (it's research-engine-driven per `lib/shared/src/field-registry.ts` line 151). A named constant or a `getFactoryNumber` call with the correct key is the correct fix — **not** a bare numeric literal.

---

## What Replit did this session (informational only — no CC action needed)

Added `docs/solutions/build-errors/lucide-react-not-in-portal-deps-2026-05-18.md` — a ce-compound doc documenting the `lucide-react` import crash gotcha:
- `lucide-react` is not in the portal's `package.json`; TypeScript silently passes (hoisted from `mockup-sandbox`), but Vite hard-fails at dev-server start
- Fix: `import { IconX } from "@/components/icons"` — the Phosphor-backed icon barrel

---

## Pre-existing failures still on CC (unchanged from prior handoff)

- `check:taxonomy-mirror` — `Could not find section "### Canonical definitions" in CLAUDE.md`
- `test:api-server` — builder-substitution-map, ai/dispatch, slide-6-embed-flow (slides/AI work)
