# Surface Router

**Status:** Spec — implementation lands in Phase 3.
**Future home:** `engine/analyst/surface/surface-router.ts`
**Parent:** `docs/architecture/ANALYST.md`

---

## Purpose

The Surface Router is the dispatch layer between user-triggered events (HTTP routes, save events, page-open events) and the Surface Specialists that respond to them. It is the closest thing the system has to a "main()" for The Analyst.

The user has been calling this "the orchestrator." That word is intentionally avoided in code because it collides with the Cognitive Engine's existing `orchestrateResearch` (a different concept at a different tier). **Surface Router** is the canonical name.

---

## Hard constraints

1. **No LLM calls.** The Router never reasons; it dispatches. Anything requiring reasoning is delegated to a Specialist (which may in turn delegate to the Cognitive Engine).
2. **Every output is an `AnalystVerdict`** (Phase 3 contract; see `verdict-contract.md`).
3. **Every output passes through the Voice Renderer** before returning to the caller. The Router never crafts user-facing strings itself.
4. **Conviction-floor decisions live here**, not in Specialists. A Specialist returns its raw verdict + `qualityScore`; the Router decides advise / advise-with-caveat / withhold based on `CONVICTION_FLOOR` (currently 40, see `shared/analyst-conviction.ts`).
5. **Multi-Specialist aggregation is the Router's job.** When a single event spans surfaces (e.g., saving a Mgmt-Co tab that affects portfolio defaults), the Router fans out, aggregates verdicts, and produces a single composite verdict.

---

## Inputs (events)

The Router accepts a typed `AnalystEvent` discriminated union (Phase 3, `engine/analyst/contracts/events.ts`). Initial event types:

- `TabSaved` — `{ surface: "mgmt-co" | "property", tabKey, propertyId?, payload }`
- `FieldChanged` — `{ surface, field, oldValue, newValue, propertyId? }`
- `PageOpened` — `{ surface, propertyId? }` — for "Due for review" checks
- `ResearchRequested` — `{ surface, scope, propertyId? }` — explicit "Consult the Analyst" click
- `ScheduledRefresh` — `{ surface, scope }` — ambient/cron-driven
- `AdminDefaultsChanged` — `{ tableName, rowId, payload }`
- `ICPRequested` — `{ scope, propertyIds }`

Routes do not call Specialists directly. Routes build an `AnalystEvent` and call `surfaceRouter.dispatch(event)`.

---

## Outputs

Every dispatch returns `AnalystVerdict` or a composite of them. The route layer renders the verdict into HTTP/SSE — it does not transform it.

For event types that emit progress (e.g., `ResearchRequested` which streams Cognitive Engine output), the Router returns an AsyncIterable of partial verdicts, mirroring the existing `orchestrateResearch` SSE pattern.

---

## Routing table (initial)

| Event | Specialist(s) called |
|---|---|
| `TabSaved { surface: "mgmt-co", tabKey: "funding" }` | Mgmt-Co Funding Specialist |
| `TabSaved { surface: "mgmt-co", tabKey: "revenue" }` | Mgmt-Co Revenue Specialist |
| `TabSaved { surface: "mgmt-co", tabKey: "compensation" }` | Mgmt-Co Compensation Specialist (Phase 4) |
| `TabSaved { surface: "property", tabKey: "revenue", propertyId }` | Property Revenue Specialist + Cross-Portfolio Specialist (advisory) |
| `FieldChanged` | Property field-alert path (today's `analyst-watchdog.computeFieldAlerts`, re-homed to the relevant Property Specialist) |
| `PageOpened` | Staleness Specialist |
| `ResearchRequested` | The right surface Specialist, which calls the Cognitive Engine |
| `ScheduledRefresh` | Refresh / Staleness Specialist + the relevant surface Specialist |
| `AdminDefaultsChanged` | Admin Defaults Specialist + Cross-Portfolio Specialist (advisory) |
| `ICPRequested` | ICP Specialist (which calls Cognitive Engine with portfolio scope) |

---

## What the Router replaces

Today, dispatch is inlined in two places:

1. `server/routes/global-assumptions.ts` — the `/save-tab` handler with an `if (tabKey === "funding") evaluateFunding(...) else if (tabKey === "revenue") evaluateRevenue(...)` chain.
2. `server/ai/analyst-watchdog.ts` — the `runAnalystWatchdog` function with hardcoded checks against SEED / DATA-ENTRY / IMPORT / STALENESS / CROSS-PROPERTY events.

Phase 3 extracts both into the Router. Old call sites become one-line `surfaceRouter.dispatch(event)` calls. The Router is the only place that knows the event-to-Specialist mapping.

---

## Composition with the Cognitive Engine

The Router never calls the Cognitive Engine directly. It calls a Specialist; the Specialist decides whether to invoke the Cognitive Engine (`engine/analyst/cognitive/engine-client.ts`) for that particular request.

This separation matters because:
- Many events (every Tab Save) need only Tier-0 evaluation (constants + DB benchmark lookup, sub-second, no LLM).
- A few events (ICP Specialist, explicit "Consult the Analyst" clicks, scheduled refresh on stale guidance) need Tier-1 (the full Gemini + Sonnet + Opus pipeline).
- Specialists own this decision based on their own logic. The Router does not know about LLMs.

---

## Failure semantics

- **Unknown event** → typed error, route returns 400. The Router refuses to silently no-op.
- **Specialist error** → the Specialist's responsibility to recover or rethrow. The Router does not catch.
- **Voice Renderer rejection** (forbidden persona pattern) → in dev, throws; in prod, logs + sanitizes + emits a `voice-violation` metric. Never silently passes a forbidden string to the user.

---

## What lives in the Router and what does not

| Lives in the Router | Lives elsewhere |
|---|---|
| Event type definitions | Specialist implementations |
| Event → Specialist routing table | Cognitive Engine client |
| Multi-Specialist aggregation logic | Single-Specialist verdict construction |
| Conviction-floor advise/withhold decision | `qualityScore` computation (Quality Scorer) |
| Voice Renderer invocation | Voice Renderer rendering rules |
| Cache key construction (for orchestrator-level cache, future) | Cache backend |

---

## Open questions for Phase 3 design

1. Is the Router synchronous, AsyncIterable, or both? (Initial answer: both — `dispatch()` is async, `dispatchStream()` returns AsyncIterable.)
2. Where does telemetry live? (Initial answer: middleware around `dispatch`, not in the Router itself.)
3. How does the Router cache cross-event results? (See ADR-003, future.)
