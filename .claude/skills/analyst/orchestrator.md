# Skill: Surface Router (the "orchestrator")

**Status:** Spec — implementation lands in Phase 3 at `engine/analyst/surface/surface-router.ts`.
**Descriptive companion:** `docs/architecture/analyst/surface-router.md`.
**Parent skill:** `_index.md`.

---

## What this skill is for

Directive guidance for implementing and evolving the Surface Router. The architecture doc describes what the Router is; this skill tells you what to do (and what not to do) when touching it.

The user calls this "the orchestrator." In code the name is **Surface Router** — the word "orchestrator" is reserved for the Cognitive Engine's `orchestrateResearch` (a different concept at a different tier). Never merge the two names.

---

## Hard rules (do not violate)

### 1. No LLM calls in the Router. Ever.

The Router dispatches. It does not reason. Any code path in the Router that reaches for Gemini, Sonnet, Opus, or any other LLM is a bug. If reasoning is needed, delegate to a Specialist. If the Specialist needs Tier-1 evaluation, IT calls the Cognitive Engine façade. The Router stays on Tier-0.

### 2. Every dispatch passes through the Voice Renderer before returning.

Route handlers NEVER receive raw Specialist output. The Router calls the Specialist, gets the verdict, passes it through the Voice Renderer to populate `voice.*`, and returns the rendered verdict. If a caller receives a verdict with empty `voice.headline`, the Router skipped the Renderer — violation.

### 3. Conviction-floor decisions live in the Router, not in Specialists.

Specialists compute `qualityScore`. The Router decides advise / advise-with-caveat / withhold based on `CONVICTION_FLOOR` (currently 40, defined in `shared/analyst-conviction.ts`).

A Specialist that applies the floor itself is a violation — it would prevent the Router from making context-aware decisions (e.g., admin override flags, scope-specific thresholds).

### 4. Multi-Specialist aggregation is the Router's job.

When a single event spans surfaces (e.g., a Property tab save that also implicates Cross-Portfolio), the Router fans out, collects multiple verdicts, aggregates, and returns one composite `AnalystVerdict`.

Specialists never call each other. They never know about each other. The Router is the only place that knows the event-to-Specialist mapping.

### 5. Unknown event types are errors, not no-ops.

Router receiving an `AnalystEvent` it doesn't know about → typed error, route returns 400. Silent no-op is forbidden (it would let route handlers accidentally drop work).

---

## What lives in the Router

| Lives here | Does not live here |
|---|---|
| Event type definitions (`AnalystEvent` discriminated union) | Specialist implementations |
| Event → Specialist routing table | Cognitive Engine client / `research-orchestrator.ts` |
| Multi-Specialist aggregation logic | Single-Specialist verdict construction |
| Conviction-floor advise/withhold decision | `qualityScore` computation (lives in Quality Scorer) |
| Voice Renderer invocation | Voice Renderer rendering rules |
| Cache-key construction (Phase 5) | Cache backend |

---

## Event types (initial)

From `docs/architecture/analyst/surface-router.md`. These are the inputs the Router accepts as a discriminated union:

- `TabSaved` — `{ surface: "mgmt-co" | "property", tabKey, propertyId?, payload }`
- `FieldChanged` — `{ surface, field, oldValue, newValue, propertyId? }`
- `PageOpened` — `{ surface, propertyId? }`
- `ResearchRequested` — `{ surface, scope, propertyId? }`
- `ScheduledRefresh` — `{ surface, scope }`
- `AdminDefaultsChanged` — `{ tableName, rowId, payload }`
- `ICPRequested` — `{ scope, propertyIds }`

Route handlers must build a typed `AnalystEvent` and call `surfaceRouter.dispatch(event)`. Route handlers NEVER call Specialists directly.

---

## Routing table (initial; authoritative table lives in `surface-router.md`)

| Event | Specialist(s) |
|---|---|
| `TabSaved` mgmt-co funding | Funding Specialist |
| `TabSaved` mgmt-co revenue | Revenue Specialist |
| `TabSaved` mgmt-co compensation/overhead/company/property-defaults | The corresponding Mgmt-Co Specialist (Phase 4) |
| `TabSaved` property (any tab) | The corresponding Property Specialist + Cross-Portfolio Specialist (advisory) |
| `FieldChanged` | The relevant Property Specialist's field-alert path |
| `PageOpened` | Staleness Specialist |
| `ResearchRequested` | The relevant surface Specialist → Cognitive Engine |
| `ScheduledRefresh` | Staleness Specialist + the relevant surface Specialist |
| `AdminDefaultsChanged` | Admin Defaults Specialist + Cross-Portfolio Specialist (advisory) |
| `ICPRequested` | ICP Specialist → Cognitive Engine |

---

## Return shape

`dispatch(event): Promise<AnalystVerdict>` for synchronous cases.
`dispatchStream(event): AsyncIterable<AnalystVerdict>` for streaming cases (explicit research consults that return partial verdicts as the Cognitive Engine streams).

Both shapes are pre-rendered by the Voice Renderer before returning.

---

## Failure semantics

- **Unknown event** → typed error, 400 from route. Log with event JSON for debugging.
- **Specialist error** → let it propagate. The Specialist's responsibility to recover or rethrow. The Router does not catch.
- **Voice Renderer rejection** (forbidden persona pattern) → dev: throw; prod: log + sanitize + emit `voice-violation` metric. Never silently pass a forbidden string to the user.

---

## What to do before modifying the Router

1. Read `surface-router.md` (descriptive spec).
2. Check whether the change adds a new event type → update the discriminated union type AND the routing table AND the route handlers that emit the event.
3. Check whether the change adds a new Specialist → update the routing table only (the Specialist has its own skill + spec).
4. Write the behavioral test in `tests/analyst/router/<event>.test.ts` (Phase 3).
5. Walk the 9-step steward checklist (`steward.md`).
6. Run the five pre-commit gates.

---

## What the Router replaces (for context)

Today, dispatch is inlined in two places that Phase 3 will extract:

1. `server/routes/global-assumptions.ts` — the `/save-tab` handler with an `if (tabKey === "funding") else if (tabKey === "revenue")` chain.
2. `server/ai/analyst-watchdog.ts:runAnalystWatchdog` — hardcoded checks against SEED / DATA-ENTRY / IMPORT / STALENESS / CROSS-PROPERTY events.

Both collapse to one-line `surfaceRouter.dispatch(event)` calls after Phase 3. Do not re-implement dispatch anywhere else in the interim.

---

## Relationship to Cognitive Engine

The Router never calls the Cognitive Engine directly. It calls a Specialist; the Specialist decides whether to call `engine/analyst/cognitive/engine-client.ts` for that request. See `cognitive-engine.md` for the façade rules.

---

## References

- `docs/architecture/analyst/surface-router.md` — descriptive spec
- `docs/architecture/ANALYST.md` — architecture spine
- `docs/architecture/analyst/verdict-contract.md` — `AnalystVerdict` shape
- `.claude/skills/analyst/voice.md` — Voice Renderer skill
- `.claude/skills/analyst/cognitive-engine.md` — Cognitive Engine façade skill
- `.claude/skills/analyst/steward.md` — change-control gate
- `shared/analyst-conviction.ts` — `CONVICTION_FLOOR` definition
