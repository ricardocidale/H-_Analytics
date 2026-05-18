---
name: analyst-processing-card
description: "Standard floating wait-state card for analyst and research jobs. Use whenever code needs to show the user that an agent is working — research generation, document analysis, slide builds, or any async job. Covers spawn/update/dismiss API, animation selection, cancel wiring, and which overlay patterns stay page-embedded vs. delegate to the card."
---

# Analyst Processing Card — Agent Usage Guide

The `AgentProcessingCard` is the **standard wait-state UI** for H+ Analytics.
It floats above the page plane (`position: fixed bottom-6 right-6, z-[60]`),
renders via `createPortal` to escape stacking contexts, and is controlled through
a global Zustand store so any hook or component can spawn it without prop-drilling.

---

## When to use the card

Use `useProcessingCard().spawn(…)` when:
- A user-initiated research job is running (property research, company research, market rates)
- A document is being analyzed (Mistral OCR, Google Document AI)
- A slide build is in progress (Marco / slide factory)
- Any other async job where the user must wait > ~1 s

Do **not** use it for:
- Inline form field validation feedback — use `ResearchLoadingOverlay compact` or `ResearchLoadingOverlay inline`
- Bulk portfolio refresh — `ResearchRefreshOverlay` is the intentional full-screen takeover for that
- Multi-step detailed agent theater (`CompanyAssumptions` analyst review) — `ResearchTheater` shows the detailed job list; the card is for compact "waiting" feedback only

---

## API

```ts
import { useProcessingCard, ANALYST_CAPTIONS } from "@/hooks/useProcessingCard";

const { spawn, update, dismiss } = useProcessingCard();
```

### `spawn(job: ProcessingCardJob): void`

Shows the card immediately. If a card is already showing, replaces it.

```ts
spawn({
  id: "property-research-42",          // unique job ID (use entityId + type)
  title: "Analyst is working…",        // shown right of animation
  captions: ANALYST_CAPTIONS,          // rotates every 4 s
  onCancel: () => abortResearch(),     // called when user clicks Cancel
});
```

| Field | Type | Required | Default |
|---|---|---|---|
| `id` | `string` | ✅ | — |
| `title` | `string` | ✅ | — |
| `captions` | `string[]` | ✅ | — |
| `caption` | `string` | — | `undefined` (use captions[] rotation) |
| `animation` | `React.ReactNode` | — | `<AnalystSwissCube size={40} />` |
| `progress` | `number` (0–100) | — | `undefined` (indeterminate) |
| `onCancel` | `() => void` | — | `undefined` |

### `update(patch): void`

Patches the current job. No-op if no card is showing.

```ts
// Live caption update from SSE phase event
update({ caption: "Cross-referencing industry benchmarks…" });

// Determinate progress update
update({ progress: 67 });
```

### `dismiss(): void`

Hides the card. Call on job complete, error, or component unmount.

```ts
// On SSE 'done' event
dismiss();

// On AbortError (user cancel already called onCancel; this cleans up the card)
dismiss();
```

---

## Animation selection guide

Default for all jobs: `AnalystSwissCube` (monochrome minimalist — no override needed).

To use a different animation from the portfolio, pass a `React.ReactNode` as `animation`:

```ts
import { AnalystThinkingCube } from "@/components/agent-animations/AnalystThinkingCube";
import { AnalystNexusCore }    from "@/components/agent-animations/AnalystNexusCore";

// Heavier quant job (keep as override if AnalystSwissCube too minimal)
spawn({ …, animation: <AnalystThinkingCube size={40} /> });

// Data synthesis (many sources converging)
spawn({ …, animation: <AnalystNexusCore size={40} /> });
```

The `AnalystSwissCube` is the app-wide default — use it unless there is a strong
persona-specific reason to override. Consistency across jobs reduces cognitive load.

---

## Caption patterns

### Pattern A — Static rotation (most common)

Pass the shared `ANALYST_CAPTIONS` array. Captions rotate every 4 s automatically.

```ts
import { ANALYST_CAPTIONS } from "@/hooks/useProcessingCard";

spawn({ …, captions: ANALYST_CAPTIONS });
```

### Pattern B — Custom caption array

For jobs with domain-specific messaging:

```ts
spawn({
  …,
  captions: [
    "Extracting property details…",
    "Parsing floor plans…",
    "Running OCR on page 3 of 12…",
  ],
});
```

### Pattern C — Live SSE caption streaming

Pass a minimal `captions` array as fallback, then push live updates:

```ts
spawn({ …, captions: ["Starting analysis…"] });

// In SSE phase handler:
onPhase((phase) => update({ caption: phase }));
```

When `caption` is set via `update`, it overrides the rotating array until the
next `update` call or `dismiss`.

---

## Cancel wiring

The `onCancel` callback is job-specific. The card does not manage `AbortController`
directly — the caller owns the abort logic.

```ts
// Example: research stream
const abortRef = useRef(new AbortController());

spawn({
  id: "company-research",
  title: "Analyst is working…",
  captions: ANALYST_CAPTIONS,
  onCancel: () => {
    abortRef.current.abort();
    abortRef.current = new AbortController();  // reset for next job
  },
});
```

If `onCancel` is omitted, the Cancel button still dismisses the card — it just
doesn't abort any underlying request.

---

## Cleanup discipline

Always call `dismiss()` in all exit paths — complete, error, and unmount:

```ts
useEffect(() => {
  if (isGenerating) {
    spawn({ … });
  } else {
    dismiss();
  }
  return () => dismiss();  // cleanup on unmount
}, [isGenerating]);
```

Forgetting the cleanup will leave the card visible after navigation. `usePanelManager`
uses the same discipline.

---

## What stays page-embedded (do not migrate to card)

| Component | Why it stays |
|---|---|
| `ResearchLoadingOverlay` inline/compact | Appropriate for in-page feedback (inside `CollapsibleSection`, form rows) |
| `ResearchTheater` | Detailed multi-step job list for `CompanyAssumptions` analyst review |
| `ResearchRefreshOverlay` | Full-screen takeover for bulk portfolio refresh — intentional |
| `AnalystStudyingIndicator` | Inline sub-step text within a page section |
| `IntelligenceStatusBar` | Freshness indicator; "Reviewing" state is page-contextual |

---

## Plan reference

Full implementation plan: `docs/plans/2026-05-18-001-feat-agent-processing-card-plan.md`
