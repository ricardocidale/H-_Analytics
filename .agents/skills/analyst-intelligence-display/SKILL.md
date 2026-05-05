---
name: analyst-intelligence-display
description: >
  Govern how specialist and research-engine output surfaces in the UI as range
  badges, verdict cards, contextual tips, field-level hints, and action dialogs.
  Load whenever you are building or reviewing any UI component that displays
  intelligence data — ranges, severity signals, research-backed suggestions,
  analyst tips, or conviction indicators — regardless of whether the triggering
  button is nearby. Complements `analyst-research-buttons` (input side: how to
  trigger research) with the display side: how to show results.
---

# Analyst Intelligence Display

## The rule (one sentence)

**All ranges, tips, suggestions, severity signals, and contextual intelligence
shown in the UI must originate 100% from specialist or research-engine output.
No component may hard-code a range, write its own tip, or derive a suggestion
through local logic — every number and every piece of advice flows through the
specialist pipeline.**

---

## Why this matters

The value proposition of H+ Analytics to users and admins is that the platform
*studies* their inputs against live market data, authority sources, and comp
sets, then surfaces what it found as actionable intelligence right next to the
fields being edited. If that intelligence were hard-coded constants or
ad-hoc if/else checks in the component, the user would receive stale guesses
dressed up as research — the worst possible deception. The specialist pipeline
is the only path that can cite its sources, score its confidence, and
self-update when the market changes.

---

## The data flow

```
Research engine / Specialist
        │
        │  runs (triggered by Analyst button or ambient scheduler)
        ▼
  AnalystVerdict  ──OR──  GuidanceRecord[]
  (full contract)          (lightweight, field-level)
        │                         │
        │  stored in DB / returned│ from API endpoint
        ▼                         ▼
  UI component reads              UI component reads
  verdict from API                guidance from prop
        │                         │
        ▼                         ▼
  AnalystVerdictDisplay   AnalystRangeIndicator
  AnalystCheckDialog      (inline badge, per-field)
```

**The component is a pure reader.** It receives already-produced intelligence;
it never calls an LLM, never calls a Specialist, and never crafts a range from
local math.

---

## The two data shapes

### Shape 1 — `AnalystVerdict` (full contract)

Source: `lib/engine/src/analyst/contracts/verdict.ts`

Used when the user explicitly clicks the Analyst button on a tab or surface.
The Surface Router runs the relevant Specialists, passes their raw dimensions
through the Voice Renderer, and returns a validated `AnalystVerdict`.

```ts
interface AnalystVerdict {
  specialistId: string;
  generatedAt: string;          // ISO timestamp
  overallSeverity: Severity;    // "ok" | "advisory" | "warning" | "block"
  overallQualityScore: number;  // 0–100, conviction-weighted across dimensions
  dimensions: VerdictDimension[];
  voice: VoiceBlock;            // top-level headline + detail
  meta: AnalystVerdictMeta;     // tier (0|1), durationMs, vendorsUsed, etc.
}

interface VerdictDimension {
  field: string;                // e.g. "baseMgmtFee", "interestRate"
  severity: Severity;
  range: VerdictRange | null;   // { low, mid, high, unit } — null for non-numeric
  qualityScore: number;         // 0–100 per dimension
  evidence: Evidence[];         // min MIN_SOURCES_FOR_ADVICE entries
  voice: VoiceBlock;            // headline + detail for this dimension
  actions: VerdictAction[];     // "consult-cognitive" | "accept-range" | "set-value" | "dismiss" | ...
}
```

### Shape 2 — `GuidanceRecord[]` (lightweight, field-level)

Source: `artifacts/api-server/src/ai/guidance/schemas.ts`

Used for inline per-field range badges when the surface stores guidance
separately from a full verdict (typically from a prior research run). Lighter
than a full verdict — no severity or evidence structure.

```ts
interface GuidanceRecord {
  assumptionKey: string;        // e.g. "capRate", "inflationRate"
  valueLow:   number | null;
  valueMid:   number | null;
  valueHigh:  number | null;
  confidence: "high" | "medium" | "low";
  sourceName: string | null;
  reasoning:  string | null;
}
```

---

## The canonical display components

### `AnalystRangeIndicator`

Path: `artifacts/hospitality-business-portal/src/components/analyst/AnalystRangeIndicator.tsx`

**When to use:** Inline, next to a form field label or input, to show the
research-backed range for that specific field. Tiny, non-intrusive.

**Data shape:** `GuidanceRecord[]` (passed as `guidance` prop) + `fieldKey`.

**Visual contract:**
- Emerald badge with ✓ icon → value is within the research range
- Red badge with ⚠ icon → value is above or below range
- Gray badge → no current value to compare
- Amber badge → insufficient data (below `CONVICTION_FLOOR`) — shows
  "Insufficient data — needs research" instead of a range

**Usage:**
```tsx
<AnalystRangeIndicator
  fieldKey="capRate"
  currentValue={property.capRate}
  guidance={guidance}   // GuidanceRecord[] from the API
  isPercent
/>
```

**Rule:** If `guidance` is empty or the `fieldKey` has no matching record,
renders `null` (never errors, never shows a placeholder value).

### `AnalystVerdictDisplay`

Path: `artifacts/hospitality-business-portal/src/components/analyst/AnalystVerdictDisplay.tsx`

**When to use:** After an explicit Analyst button run, to show the full
verdict as an animated card stack below (or alongside) the inputs that
produced it. Full per-dimension breakdown with severity, range, headline,
detail, and action buttons.

**Data shape:** `AnalystVerdict` (from the Surface Router).

**Visual contract:**
- Top-level banner: severity-tinted, Sparkles icon, `verdict.voice.headline`
- One `DimensionCard` per dimension: severity theme, range chip, `voice.headline`,
  `voice.detail`, action buttons
- Meta footer: tier, quality score, duration, timestamp
- Animated in with `framer-motion` (fade + slide-up, staggered per card)

**Usage:**
```tsx
<AnalystVerdictDisplay
  verdict={verdict}           // AnalystVerdict | null
  propertyId={property.id}   // optional — enables "Open this field" deep links
  onAction={(dim, action) => { /* handle set-value / consult-cognitive */ }}
/>
```

### `AnalystCheckDialog`

Path: `artifacts/hospitality-business-portal/src/components/intelligence/AnalystCheckDialog.tsx`

**When to use:** Surfaced as a modal when the Analyst runs on an explicit
click and the result is non-ok (severity != "ok"). NOT triggered automatically
on Save — only on explicit Analyst button click.

**Data shape:** `AnalystVerdict` (same as display component).

**Visual contract:**
- DialogTitle: "Analyst Check — {tabLabel}"
- DialogDescription: `verdict.voice.headline`
- Bulleted list: non-ok dimension `voice.headline` values
- Action buttons: deduped from all dimension `actions[]`; default focus on
  `consult-cognitive` (Adjust) if present, else `dismiss`
- Optional "Save Anyway" ghost button (only when caller passes `onProceedAnyway`)

**Trigger discipline (`.claude/rules/analyst-trigger-discipline.md`):**
The dialog opens only after an explicit `AnalystButton` click, never on Save
automatically. Save-tab API responses no longer carry a verdict.

---

## Severity color system (memorise this table)

| Severity | Badge background | Text | Icon | Meaning |
|---|---|---|---|---|
| `ok` | `emerald-500/10` | `emerald-700 / emerald-400` | ✓ CheckCircle | Within range / on target |
| `advisory` | `sky-500/10` | `sky-700 / sky-400` | Sparkles | Worth noting, not urgent |
| `warning` | `amber-500/40` | `amber-700 / amber-400` | ⚠ AlertTriangle | Worth a second look |
| `block` | `red-500/40` | `red-700 / red-400` | ⚠ AlertTriangle | Blocking — must address |

**Conviction floor (insufficient data) badge:**
`amber-500/10` bg, `amber-700 / amber-400` text, info `ⓘ` icon.
Text: "Insufficient data — needs research"

Do not invent new severity levels. Do not use these colors for non-verdict UI.

---

## The voice rule (non-negotiable)

**No component may write its own analyst voice.** All user-facing text that
expresses an opinion, rating, or recommendation about the user's data must come
from the `verdict.voice.headline`, `verdict.voice.detail`, `dimension.voice.headline`,
or `dimension.voice.detail` fields — which were produced by the Voice Renderer
inside the Surface Router.

```tsx
// ✅ CORRECT — voice from the verdict
<h3>{verdict.voice.headline}</h3>
<p>{dimension.voice.detail}</p>

// ❌ WRONG — component writing its own analyst opinion
<h3>Your interest rate looks high for this market.</h3>
<p>Consider lowering to 7.0%.</p>
```

The Voice Renderer is the **only** place that translates a specialist's raw
dimension (`intent`, `range`, `severity`) into a branded sentence. Components
are pure renderers of already-rendered voice.

Similarly: persona names (`Gaspar`, `Ana`, `Fernanda`, …) must follow the
`specialist-persona-naming` skill — never show role strings like
"Funding Specialist" in user-facing text.

---

## The conviction floor rule

A range badge is withheld when `dataQuality` fails `meetsConvictionFloor()`
(i.e. the specialist's quality score for that field is below `CONVICTION_FLOOR`).
In that case the component shows the amber "Insufficient data — needs research"
badge instead of a range. This prevents the UI from presenting a low-confidence
range as authoritative.

Source: `@shared/analyst-conviction` — `meetsConvictionFloor()`,
`insufficientDataMessage()`, `CONVICTION_FLOOR`.

**Never bypass the conviction floor** by falling back to a hard-coded range
when the verdict is insufficient. If the specialist doesn't have enough data,
the right answer is to tell the user and invite them to trigger a fresh
Analyst run.

---

## "Open this field" deep links

`AnalystVerdictDisplay` resolves a field registry entry for each dimension's
`field` key, then calls `resolveFieldMountPoint()` to produce an `href` and a
`navigate()` function. Clicking "Open this field" on a dimension card takes the
user directly to the form input that needs attention — closing the loop between
the verdict and the edit action.

**Adding a new field:** register it in `lib/engine/src/analyst/registry/field-registry.ts`.
If the field is missing from the registry, the "Open this field" link is hidden
(no broken-link risk). See `resolveFieldMountPoint()` in `@/lib/analyst-mount-points`.

---

## What to use when (decision table)

| Situation | Component | Data shape |
|---|---|---|
| Inline badge next to a single form field | `AnalystRangeIndicator` | `GuidanceRecord[]` |
| Full verdict display after Analyst button click | `AnalystVerdictDisplay` | `AnalystVerdict` |
| Modal surfaced after Analyst click finds issues | `AnalystCheckDialog` | `AnalystVerdict` |
| Streaming wait state while Analyst is running | `CompanyAnalystOverlay` / `ResearchTheater` | `isGenerating` + `streamedContent` |
| Button to trigger the research | `AnalystActionButton` | n/a (see `analyst-research-buttons` skill) |

---

## Anti-patterns (the guard list)

1. **Hard-coded range in a component:**
   ```tsx
   // ❌ NEVER
   const suggestedRange = "7%–9%";
   ```
   Every number shown as intelligence must come from a `GuidanceRecord` or `VerdictRange`.

2. **Local if/else to derive severity:**
   ```tsx
   // ❌ NEVER
   const sev = value > 0.10 ? "warning" : "ok";
   ```
   Severity is computed by the Specialist + Surface Router. The component reads
   `dimension.severity`, period.

3. **Crafting voice in the component:**
   ```tsx
   // ❌ NEVER
   const msg = `Your ${field} is above the ${range} market range.`;
   ```
   The Voice Renderer already wrote the sentence. Render `dimension.voice.headline`.

4. **Showing a range when conviction is insufficient:**
   ```tsx
   // ❌ NEVER
   const range = record?.valueLow ?? DEFAULT_INTEREST_RATE;
   ```
   If the guidance record has no data, render `null` or the "Insufficient data"
   badge — never fall back to a code constant as the displayed suggestion.

5. **Triggering research inside a display component:**
   ```tsx
   // ❌ NEVER
   useEffect(() => { runAnalyst(); }, []);
   ```
   Display components are presentational. Research is triggered by explicit user
   action via `AnalystActionButton`. Ambient research is handled by the server-side
   scheduler (`artifacts/api-server/src/ai/ambient/research-scheduler.ts`).

---

## Coupling with other skills

- **`analyst-research-buttons`** — the complementary input-side skill. Governs
  how to label, icon, and wire the button that triggers research. This skill
  governs what happens after the button fires and the data lands.
- **`specialist-persona-naming`** — persona name rules that apply to any
  user-facing text produced by or attributed to a named specialist.
- **`hplus-variable-taxonomy`** — the separation between DEFAULT variables
  (code constants) and specialist-produced intelligence (verdict ranges). These
  must never be confused: a `DEFAULT_*` constant is a seed/fallback for the
  financial engine; it is never the source of a displayed range badge.
- **`verification-system`** — higher-level audit opinion system (unqualified /
  qualified / adverse / disclaimer). Complementary but distinct from verdict
  severity; the verification layer reads verdicts as inputs, not the other
  way around.
- **`hplus-assumption-lifecycle`** — explains when a user "accepts" a
  specialist suggestion (writes the range midpoint to the DB as a confirmed
  assumption). The `accept-range` `VerdictAction` is the bridge between
  the display side and the lifecycle save.
