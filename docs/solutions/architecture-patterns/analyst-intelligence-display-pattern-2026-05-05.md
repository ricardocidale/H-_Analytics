---
title: "Analyst Intelligence Display: 100%-Specialist-Sourced UI Pattern"
date: 2026-05-05
category: docs/solutions/architecture-patterns/
module: "AI Intelligence / Analyst"
problem_type: architecture_pattern
component: documentation
severity: high
applies_when:
  - Building or reviewing UI components that display ranges, severity signals, or analyst suggestions
  - Integrating research-backed intelligence into form fields or assumption surfaces
  - Adding new specialist output surfaces to the platform
  - "Code-reviewing any component that renders verdict cards, range badges, or contextual tips"
tags:
  - analyst
  - intelligence-display
  - specialist-sourced
  - verdict
  - guidance-records
  - conviction-floor
  - voice-rule
  - anti-pattern
---

# Analyst Intelligence Display: 100%-Specialist-Sourced UI Pattern

## Context

The H+ Analytics platform runs a specialist research pipeline (Surface Router +
Voice Renderer + domain Specialists) that produces structured intelligence:
`AnalystVerdict` (full verdict with per-dimension severity, ranges, evidence, and
voice) and `GuidanceRecord[]` (lightweight per-field guidance). Before this
pattern was codified, no documented invariant prevented UI components from:

- Hard-coding financial ranges (`const suggestedRange = "7%–9%"`)
- Deriving severity locally (`value > 0.10 ? "warning" : "ok"`)
- Writing analyst-voice copy directly in components ("Your rate looks high for this market")
- Bypassing the conviction floor by falling back to a `DEFAULT_*` constant when specialist data quality was insufficient
- Triggering research runs inside display components via `useEffect`

These anti-patterns would present users with stale guesses dressed as
research output — directly contradicting the platform's core value proposition.

(session history) Prior sessions identified the upstream problem as an
insufficient separation between DEFAULT constants (code-level null-coalescing
fallbacks) and specialist-produced intelligence (research output). The constants
taxonomy work (`hplus-variable-taxonomy`) established the three-category model
(TRUE CONSTANTS / DEFAULT VARIABLES / TABLE-SOURCED VALUES). This skill enforces
the same boundary at the UI display layer — specialist-produced ranges and
DEFAULT constants are orthogonal concepts and must never be conflated.

The skill `.agents/skills/analyst-intelligence-display/SKILL.md` documents the
invariant and makes it discoverable for all future development. The memory files
`claude.md` and `replit.md` were updated to reflect this rule at the
project-architecture level.

## Guidance

**The invariant (one sentence):** All ranges, tips, suggestions, severity
signals, and contextual intelligence shown in the UI must originate 100% from
specialist or research-engine output. No component may hard-code a range, write
its own analyst-voice text, or derive a suggestion through local logic.

### The two canonical data shapes

| Shape | Source | When used |
|---|---|---|
| `AnalystVerdict` | Surface Router + Voice Renderer (triggered by explicit Analyst button) | Full verdict display: per-dimension severity, range, voice, actions |
| `GuidanceRecord[]` | Guidance extractor (stored from a prior research run) | Inline per-field range badge next to form inputs |

Key fields:

```ts
// AnalystVerdict (lib/engine/src/analyst/contracts/verdict.ts)
interface VerdictDimension {
  field: string;
  severity: "ok" | "advisory" | "warning" | "block";
  range: { low: number; mid: number; high: number; unit: string } | null;
  qualityScore: number;        // 0–100
  evidence: Evidence[];
  voice: { headline: VoiceRenderedString; detail?: VoiceRenderedString };
  actions: VerdictAction[];
}

// GuidanceRecord (artifacts/api-server/src/ai/guidance/schemas.ts)
interface GuidanceRecord {
  assumptionKey: string;
  valueLow: number | null;
  valueMid: number | null;
  valueHigh: number | null;
  confidence: "high" | "medium" | "low";
  sourceName: string | null;
  reasoning: string | null;
}
```

### The three canonical display components

| Component | Data shape | Purpose |
|---|---|---|
| `AnalystRangeIndicator` | `GuidanceRecord[]` + `fieldKey` | Inline badge next to a form field |
| `AnalystVerdictDisplay` | `AnalystVerdict` | Full severity-tinted card stack after Analyst run |
| `AnalystCheckDialog` | `AnalystVerdict` | Modal when Analyst finds non-ok issues |

### Key rules

**Conviction floor:** If `qualityScore < CONVICTION_FLOOR` (from
`@shared/analyst-conviction`), show the amber "Insufficient data — needs
research" badge. Never fall back to a `DEFAULT_*` constant as the displayed
suggestion.

**Voice rule:** `verdict.voice.headline`, `verdict.voice.detail`, and
per-dimension `voice.*` fields are produced exclusively by the Voice Renderer
inside the Surface Router. Components render these strings verbatim — they never
craft analyst-voice copy themselves. `VoiceRenderedString` is a branded TypeScript
type that physically prevents components from constructing fake voice strings
without importing `__castVoiceRendered` — making accidental violations visible
in code review.

**Severity color system:** ok=emerald, advisory=sky, warning=amber, block=red.
No new severity levels.

**Trigger discipline:** Display components are purely presentational. Research is
triggered only by explicit user action via `AnalystActionButton`. Ambient
research is the server-side scheduler's job
(`artifacts/api-server/src/ai/ambient/research-scheduler.ts`).

## Why This Matters

1. **Trust and authority:** Users rely on H+ for market-accurate intelligence.
   Hard-coded ranges or locally-derived severity signals deceive users with
   stale guesses dressed up as research.

2. **Traceability:** The specialist pipeline can cite its sources (`evidence[]`)
   and score its confidence (`qualityScore`). Hard-coded values cannot.

3. **Consistency of voice:** The Voice Renderer enforces the platform's branded
   persona tone. Component-crafted advice creates inconsistent, unverifiable
   analyst personas that conflict with named Specialists (Gustavo, Ana, Fernanda,
   etc.).

4. **Conviction floor protects users:** The pipeline self-reports when it lacks
   sufficient data to advise. Bypassing the floor by substituting a constant
   hides this signal and presents false confidence.

5. **Market accuracy over time:** When the market changes, the specialist reruns
   and the displayed range updates. Hard-coded ranges require a code change and
   deploy cycle — and are almost never updated in practice.

## When to Apply

- Whenever a UI component needs to show a "suggested" range for a financial
  input (cap rate, interest rate, ADR, occupancy, management fee, etc.)
- When providing feedback on the severity of a user's current value relative to
  market benchmarks
- When rendering verdict cards, contextual tips, action dialogs, or any
  post-Analyst display surface
- During code review: any PR adding or modifying a component that shows
  intelligence data should be checked against this pattern

## Examples

### Anti-pattern 1 — Hard-coded range

```tsx
// ❌ NEVER
const suggestedRange = "7%–9%";
<Badge>{suggestedRange}</Badge>

// ✅ CORRECT
<AnalystRangeIndicator
  fieldKey="interestRate"
  currentValue={value}
  guidance={guidance}   // GuidanceRecord[] from API — never a local constant
  isPercent
/>
```

### Anti-pattern 2 — Local severity derivation

```tsx
// ❌ NEVER
const sev = value > 0.10 ? "warning" : "ok";
<Badge color={sev}>…</Badge>

// ✅ CORRECT — severity comes from the Specialist, read from the verdict
const dimension = verdict.dimensions.find(d => d.field === "interestRate");
// dimension.severity is "ok" | "advisory" | "warning" | "block"
```

### Anti-pattern 3 — Component-crafted analyst voice

```tsx
// ❌ NEVER
<p>Your interest rate looks high for this market.</p>
<p>Consider lowering to 7.0%.</p>

// ✅ CORRECT — Voice Renderer already wrote the sentence
<p>{dimension.voice.headline}</p>
<p>{dimension.voice.detail}</p>
```

### Anti-pattern 4 — Conviction floor bypass

```tsx
// ❌ NEVER — displaying a DEFAULT constant as if it were research
const range = record?.valueLow ?? DEFAULT_INTEREST_RATE;
<span>Suggested: {range}</span>

// ✅ CORRECT — AnalystRangeIndicator handles conviction floor internally
// When data quality is insufficient it shows:
// "Insufficient data — needs research" (amber badge)
// It never substitutes a DEFAULT_* constant as the displayed range
```

### Anti-pattern 5 — Research trigger inside display component

```tsx
// ❌ NEVER
useEffect(() => { runAnalyst(); }, []);

// ✅ CORRECT — display components are pure readers
// Research is triggered only by the user clicking AnalystActionButton
// Ambient research runs on the server-side scheduler
```

## Related

**Skills:**
- `.agents/skills/analyst-intelligence-display/SKILL.md` — full rules, data contracts, decision table, coupling map (the canonical reference)
- `.agents/skills/analyst-research-buttons/SKILL.md` — input/trigger side: how to label, icon, and wire the button that fires research
- `.agents/skills/specialist-persona-naming/SKILL.md` — persona name rules for Specialist attribution in user-facing text
- `.agents/skills/hplus-variable-taxonomy/SKILL.md` — the three-category taxonomy separating DEFAULT constants from specialist-produced intelligence
- `.agents/skills/hplus-assumption-lifecycle/SKILL.md` — how the `accept-range` VerdictAction flows to a confirmed assumption save

**Source files:**
- `lib/engine/src/analyst/contracts/verdict.ts` — AnalystVerdict contract, VoiceRenderedString brand, conviction floor invariants
- `artifacts/api-server/src/ai/guidance/schemas.ts` — GuidanceRecord schema
- `lib/engine/src/analyst/router/surface-router.ts` — Surface Router + Voice Renderer pipeline
- `artifacts/hospitality-business-portal/src/components/analyst/AnalystRangeIndicator.tsx`
- `artifacts/hospitality-business-portal/src/components/analyst/AnalystVerdictDisplay.tsx`
- `artifacts/hospitality-business-portal/src/components/intelligence/AnalystCheckDialog.tsx`

**Related architecture patterns in this repo:**
- `docs/solutions/architecture-patterns/ai-intelligence-specialists-page-2026-05-02.md` — read-only specialist display + single-source-of-truth for specialist admin surfaces
- `docs/solutions/architecture-patterns/reference-brands-ai-pipeline-wiring-2026-05-02.md` — how specialist data flows through prompt layers (DI pattern, layer purity)
- `docs/solutions/architecture-patterns/sources-ux-status-analyst-button-2026-05-02.md` — UI triggers for specialist regeneration (the input/trigger side of this pattern)
- `docs/solutions/logic-errors/reference-brands-dropped-from-llm-prompt-2026-05-02.md` — prevention rules for coverage checks when adding context fields
