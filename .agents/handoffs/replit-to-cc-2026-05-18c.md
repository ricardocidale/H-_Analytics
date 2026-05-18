**From:** Replit Agent
**To:** CC (Claude Code)
**Date:** 2026-05-18
**Context:** `docs/plans/2026-05-18-001-feat-agent-processing-card-plan.md` · canvas mockup approved in prior session · checkpoint `39132101ec`
**Why this is a handoff:** Replit completed all frontend-safe units (U1–U7). Remaining work is either CC-owned surfaces or no further work is required.

---

## Scope of work

Units U1–U7 from the plan are **complete and committed to `main`**. The `AgentProcessingCard` floating wait-state component is live in the production portal. This handoff is informational — CC has no required action unless the `check:taxonomy-mirror` or `test:api-server` pre-existing failures need attention (they are CC-owned).

---

## What was delivered

### New files

| File | Purpose |
|---|---|
| `artifacts/hospitality-business-portal/src/lib/processing-card.ts` | Zustand store — `useProcessingCardStore` with `spawn`, `update`, `dismiss`. `ProcessingCardJob` type: `id`, `title`, `captions[]`, optional `caption`, `animation`, `progress`, `onCancel`. |
| `artifacts/hospitality-business-portal/src/components/ui/agent-processing-card.tsx` | Production component. Rendered via `createPortal` into `document.body`. Fixed bottom-right, `z-60`. Dark stage (`#111009`, 160px tall) holds `AnalystSwissCube size-80` by default (or `job.animation` override). Asymptotic progress curve `90 × (1 − e^(−t/22))`. Blurred caption crossfade every 4 s. JetBrains Mono elapsed timer. Cancel button (calls `job.onCancel()`). `prefers-reduced-motion` fallback shows static "A" monogram. IconX from `@/components/icons` (not lucide-react). |
| `artifacts/hospitality-business-portal/src/hooks/useProcessingCard.ts` | Thin hook re-exporting `spawn`/`update`/`dismiss` from the store + `ANALYST_CAPTIONS` (8 strings) for callers that want a default caption rotation. |

### Edited files

| File | Change |
|---|---|
| `artifacts/hospitality-business-portal/src/components/Layout.tsx` | Import + `<AgentProcessingCard />` mounted before closing `</div>`, alongside `CommandPalette`, `GuidedWalkthrough`, `RebeccaPanel`. |
| `artifacts/hospitality-business-portal/src/components/property-research/useResearchStream.ts` | `spawn` on `setIsGenerating(true)` with `onCancel` abort lambda; `update({ caption: data.data })` on non-orchestrator phase events; `dismiss()` in `finally`. |
| `artifacts/hospitality-business-portal/src/components/company-research/useCompanyResearchStream.ts` | Same pattern as above. |

### Skill doc updated

`.agents/skills/analyst-processing-card/SKILL.md` — updated to reflect production-ready status, spawn/update/dismiss API, `ProcessingCardJob` type, and integration points.

---

## How to use the card from any new callsite

```ts
import { useProcessingCardStore } from "@/lib/processing-card";

// Spawn — returns job id
const jobId = useProcessingCardStore.getState().spawn({
  title: "Running analysis…",
  captions: ANALYST_CAPTIONS,          // from useProcessingCard hook
  onCancel: () => abortController.abort(),
});

// Update live caption mid-stream
useProcessingCardStore.getState().update({ caption: phaseText });

// Dismiss when done (call in finally block)
useProcessingCardStore.getState().dismiss();
```

For Rebecca-persona jobs, pass `animation={<RebeccaSwissOrbit size={80} />}` to `spawn`.

---

## Gates that passed

```
pnpm --filter @workspace/hospitality-business-portal run typecheck   # exit 0
pnpm --filter @workspace/hospitality-business-portal run lint        # exit 0
Portal dev server: VITE v7.3.2 ready — no import errors
```

---

## Pre-existing failures (CC-owned, not introduced by this work)

- `check:taxonomy-mirror` — `Could not find section "### Canonical definitions" in CLAUDE.md`
- `test:api-server` — builder-substitution-map, ai/dispatch, slide-6-embed-flow (all slides/AI work)

---

## What this handoff does NOT include

- Any changes to `lib/engine/`, `lib/calc/`, `lib/db/`, `api-server/src/finance/`, `api-server/src/report/`, `api-server/src/migrations/` — all CC-owned, untouched.
- Backend endpoints — card is purely client-side state; no API changes needed.
- Wiring to `AnalystButton.tsx` directly — spawn is called from the stream hooks, not the button component.
- Unit tests for the card — plan listed this as optional (U5 note); no test files were added.

---

## Definition of done

This handoff is **informational only** — no CC action required. The card is live. If CC wants to wire additional callsites (e.g., slide generation, specialist runs), use the API documented in the "How to use" section above and the skill doc at `.agents/skills/analyst-processing-card/SKILL.md`.
