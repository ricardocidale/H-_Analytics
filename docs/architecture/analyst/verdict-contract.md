# AnalystVerdict — Unified Contract

**Status:** Spec — implementation lands in Phase 3.
**Future home:** `engine/analyst/contracts/verdict.ts`
**Parent:** `docs/architecture/ANALYST.md`
**Decision record:** `docs/architecture/decisions/ADR-002-unified-verdict-shape.md` (Phase 2)

---

## Why a unified contract

Today, four "watchdog-shaped" surfaces each return a different shape:

| Surface | Today's return shape |
|---|---|
| `engine/watchdog/capitalRaiseEvaluator.ts` | `{ status, alerts: Alert[] }` |
| `engine/watchdog/revenueEvaluator.ts` | `{ status, alerts: Alert[], info }` |
| `server/ai/analyst-watchdog.ts:computeFieldAlerts` | `FieldAlert[]` |
| `server/ai/analyst-table-refresh.ts` | `AnalystRefreshResult` |
| `server/ai/research-orchestrator.ts` | SSE event stream |

This means the Surface Router can't route, the Voice Renderer can't render uniformly, and the Quality Scorer can't grade. It also means every new Specialist invents its own shape, compounding the problem.

The `AnalystVerdict` contract fixes this. Every Specialist returns it. The Router and Voice Renderer consume it. The Quality Scorer attaches to it. The persona-keyed test bench asserts against it.

---

## The shape (initial proposal)

```ts
// engine/analyst/contracts/verdict.ts

export type Severity = "ok" | "advisory" | "warning" | "block";

export type EvidenceTier = "db_table" | "api" | "web" | "estimated";

export interface Evidence {
  source: string;            // human-readable source name
  tier: EvidenceTier;        // higher tier = more trustworthy
  asOf: string;              // ISO date of source data
  url?: string;              // canonical URL when applicable
  personaFit: number;        // 0-1, segment-relevance score
}

export interface VerdictRange {
  low: number;
  mid: number;
  high: number;
  unit: string;              // "$", "%", "rooms", etc.
}

export interface VerdictAction {
  kind:
    | "consult-cognitive"    // route to Cognitive Engine for this field
    | "accept-range"         // user can endorse the recommended mid
    | "set-value"            // user can apply an explicit value
    | "open-admin"           // surface a related admin defaults row
    | "view-source";         // open the canonical source URL
  label: string;             // pre-rendered Analyst-voice CTA
  payload?: unknown;         // action-kind-specific payload
}

export interface VerdictDimension {
  field: string;             // dot-path or canonical field key
  severity: Severity;
  range: VerdictRange | null;
  qualityScore: number;      // 0-100
  evidence: Evidence[];
  voice: {                   // pre-rendered, persona-checked
    headline: string;        // one-line Analyst voice
    detail?: string;         // expandable detail (one paragraph max)
  };
  actions: VerdictAction[];
  crossSurface?: {           // when this dimension implicates other surfaces
    needsCrossPortfolio?: boolean;
    needsAdminDefaults?: boolean;
    reason: string;
  };
}

export interface AnalystVerdict {
  specialistId: string;      // e.g. "mgmt-co.funding", "property.revenue", "icp"
  generatedAt: string;       // ISO timestamp
  overallSeverity: Severity; // max severity across dimensions
  overallQualityScore: number; // weighted across dimensions
  dimensions: VerdictDimension[];
  voice: {                   // pre-rendered surface-level summary
    headline: string;
    detail?: string;
  };
  meta: {
    tier: 0 | 1;             // Tier-0 (deterministic) or Tier-1 (Cognitive Engine consulted)
    durationMs: number;
    cognitiveRunId?: string; // if Tier-1, the research_runs row id
  };
}
```

---

## Invariants (enforced in Phase 3)

1. **Every numeric verdict has a range.** If `severity !== "ok"` and the dimension is numeric, `range` cannot be `null`. Persona rule: never show a range without a conviction level — the inverse is "never show a verdict without a range, when one applies."
2. **`qualityScore` >= `CONVICTION_FLOOR` (40)** for any dimension with `severity !== "ok"`. Below-floor verdicts must downgrade to `severity: "ok"` with a "developing data" voice note.
3. **`evidence.length >= MIN_SOURCES_FOR_ADVICE` (1)** always; for Tier-1 verdicts, `>= MIN_SOURCES_FOR_TIER1` (3, the existing N+1 rule).
4. **`voice.headline` and `voice.detail` are pre-rendered by Voice Renderer** — Specialists never craft user-facing strings directly. Phase 3 enforces this by typing `voice` as `Branded<string, "voice-rendered">`.
5. **`overallSeverity = max(dimensions.severity)`** — computed, not declared.
6. **`overallQualityScore = weighted_avg(dimensions.qualityScore)`** weighted by dimension count and severity — computed, not declared.

A `tests/proof/analyst-verdict-shape.test.ts` will assert these invariants for every Specialist's golden test output.

---

## Migration of the two existing evaluators

Phase 3 backfills `capitalRaiseEvaluator` and `revenueEvaluator`:

1. New file `engine/analyst/surface/mgmt-co/funding-specialist.ts` (resp. `revenue-specialist.ts`) returns `AnalystVerdict`.
2. Old file at the legacy path becomes a re-export shim with `@deprecated` JSDoc and a note pointing to the new file.
3. The route handler in `server/routes/global-assumptions.ts` is updated to call the new path via the Surface Router.
4. The shim survives one release cycle, then is deleted.
5. The L+B golden test (`tests/analyst/personas/lb.test.ts`) covers both Specialists from the moment of migration.

---

## What this contract does NOT include

- **No serialization format.** The contract is a TypeScript type. HTTP/SSE serialization is the route layer's concern.
- **No persistence schema.** `AnalystVerdict` is a runtime value, not a row. Persistence (in `assumption_guidance`) maps from this shape; the persistence schema can evolve independently.
- **No client UI binding.** Components consume verdict fields; they do not consume `AnalystVerdict` whole. UI adapters live client-side.

---

## Future evolution

Adding a new field to `AnalystVerdict` is a contract change and requires an ADR. Removing or renaming a field requires both an ADR and a backfill plan for every Specialist that returns the field. This is intentional friction — the contract's value comes from being stable.
