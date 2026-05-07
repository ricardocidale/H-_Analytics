# Financial Agents Contract — Davide

**Status:** active
**Origin:** `docs/plans/2026-05-07-001-feat-slide-factory-completion-plan.md` § U3
**Reconciles against:** `docs/solutions/architecture-patterns/slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md` (Fork-A)

---

## Identity

**Davide** is the H+ Analytics financial-agents shared service. Davide wraps the pure financial engine (`lib/engine/`, `lib/calc/`) behind a stable, DB-aware contract that any consumer in the application can call without re-deriving the recompute → stamp → derive → shape sequence inline.

Per CLAUDE.md §10, Davide is a **cross-app specialist** — used in multiple surfaces — and therefore takes a single name with no `-NN` suffix. The name is reserved here.

> **Davide is a horizontal shared service, not a vertical orchestrator.**
> Marco is the slide-factory-internal orchestrator. Davide sits below the consumer line and serves Marco alongside several other consumers. Davide is **not** a new layer between the engine and the slide teams.

---

## Reconciliation against Fork-A

The Slide Factory Financial Data Fork (`slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md`) chose Fork A: *"no new financial orchestrator between engine and slide teams — Marco fills that role; before proposing a new orchestrator, name its TWO independent consumers."*

Davide passes Fork A's escape hatch: it is a horizontal shared service with **five independent consumers** (well above the "TWO" minimum), not a vertical orchestrator inserted into the slide-factory-only path.

Independent consumers of Davide today:

1. **Slide factory (via Marco)** — `artifacts/api-server/src/slides/build-payload.ts` and `build-lb-payload.ts` consume Davide.recompute methods to refresh and stamp per-property pro formas before assembling slide payloads.
2. **Property detail page** — every load of `/api/properties/:id/...` finance routes invokes Davide via the route handlers in `artifacts/api-server/src/routes/finance.ts` and adjacent files.
3. **Internal-deck PDF route** — `artifacts/api-server/src/routes/property-deck-pdf.ts` and `internal-deck-payload.ts` consume Davide to produce the per-property deck payload.
4. **Rebecca tools** — finance-touching Rebecca tools in `artifacts/api-server/src/chat/rebecca-tools.ts` (e.g., property reads, scenario reads) consume Davide to surface freshly-computed numbers to the conversational agent.
5. **Report compiler** — `artifacts/api-server/src/report/compiler.ts` consumes Davide to compile the long-form financial report PDF.

Adding a sixth consumer requires no change to Davide. Adding a sixth orchestrator inside the slide-factory pipeline would violate Fork A.

---

## Contract surface

Davide's contract is the existing exports from three files. **No file moves. No new modules. Option (a) of the slide-factory plan: rename what exists; consumers stay.**

### `artifacts/api-server/src/finance/service.ts` — pure compute (zero IO)

Three entrypoints. ADR-007-clean: no storage imports, no DB writes, no async awaits inside the pure path. Cache is pure / in-memory.

| Identity (in cross-references) | Function |
|---|---|
| `Davide.computePortfolioProjection` | `computePortfolioProjection(input: ComputePortfolioInput): PortfolioComputeResult` |
| `Davide.computePortfolioProjectionWithAudit` | `computePortfolioProjectionWithAudit(input): ComputeResultWithAudit` |
| `Davide.computeSingleProperty` | `computeSingleProperty(input: ComputeSinglePropertyInput): SinglePropertyComputeResult` |
| `Davide.computeCompanyProjection` | `computeCompanyProjection(input: ComputeCompanyInput): CompanyComputeResult` |

### `artifacts/api-server/src/finance/recompute.ts` — DB-aware wrappers

Three async wrappers that call the pure compute and then stamp `properties.financials_computed_at` for every property whose ID is known. Per the existing docstring at line 36: *"the one server-side seam where engine output meets the DB."*

| Identity | Function |
|---|---|
| `Davide.recomputeSinglePropertyAndStamp` | `recomputeSinglePropertyAndStamp(input)` |
| `Davide.recomputePortfolioAndStamp` | `recomputePortfolioAndStamp(input)` |
| `Davide.recomputePortfolioWithAuditAndStamp` | `recomputePortfolioWithAuditAndStamp(input)` |
| `Davide.recomputeCompanyAndStamp` | `recomputeCompanyAndStamp(input)` |

**Rule:** any code path that has to talk to the DB after a recompute MUST go through `recompute.ts`. The pure compute path is reserved for callers that do not write back to `properties` (verification, scenarios, dry-run dashboards).

### `artifacts/api-server/src/finance/apply-model-constants.ts` — pre-engine overlay

Single helper that overlays admin-governed Model Constants onto the `GlobalInput` before it reaches the engine.

| Identity | Function |
|---|---|
| `Davide.withModelConstants` | `withModelConstants(globalInput, constants): GlobalInput` |

---

## Authoring authority (Rule #9)

Davide's contract files are protected per CLAUDE.md §9 (Financial Engine Authoring Authority). **Only the shell Claude Code session may edit them.** Replit Agent and other AI agents must NOT touch:

- `artifacts/api-server/src/finance/service.ts`
- `artifacts/api-server/src/finance/recompute.ts`
- `artifacts/api-server/src/finance/apply-model-constants.ts`

Adding a new method to Davide therefore goes through shell CC, with the method's contract added to this document in the same commit.

---

## Adding a method

Davide grows additively. To add a new method:

1. **Decide where it goes.** Pure compute (no DB) → `service.ts`. DB-aware wrapper → `recompute.ts`. Pre-engine overlay → `apply-model-constants.ts`.
2. **Confirm the consumer count.** A new method that benefits only one consumer is a candidate for that consumer's own module; Davide is for cross-cutting work. The "two independent consumers" rule from Fork A applies at method granularity too.
3. **Add the method to the relevant file** with a Davide-prefixed identity in the docstring (e.g., `// Davide.getNoiSnapshot — cross-consumer NOI snapshot used by slides + Rebecca + report compiler`).
4. **Update this document's contract surface table.**
5. **Run the verification gates** — typecheck, magic-numbers gate, full finance test suite.

---

## What Davide is not

- **Not an LLM agent.** Davide is a deterministic service. There is no system prompt, no tool surface, no context window. The naming is a documentary convention that gives the service an identity for cross-references without changing its implementation.
- **Not a router.** Davide does not dispatch to consumers. Consumers call Davide.
- **Not a cache.** Davide.service.ts has its own pure cache (`./cache.ts`); that's an internal implementation detail, not part of Davide's public contract.
- **Not a place for packaging logic.** Slide-shape, deck-shape, and report-shape transformations live in their respective consumer modules (`slides/build-payload.ts`, `slides/build-lb-payload.ts`, `report/compiler.ts`). Absorbing those into Davide is **option (b)** of the slide-factory plan and is explicitly deferred.

---

## Cross-references

- **Plan that introduces this contract:** `docs/plans/2026-05-07-001-feat-slide-factory-completion-plan.md` § U3
- **Fork-A architecture decision:** `docs/solutions/architecture-patterns/slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md`
- **Engine integrity findings (out of scope, but a constraint Davide preserves):** `docs/solutions/logic-errors/financial-engine-audit-findings-2026-05-04.md`
- **ADR-007 (DI discipline in calc/engine):** referenced in CLAUDE.md §4
- **Naming convention:** CLAUDE.md §10 — Davide listed under cross-app specialists
- **Authoring authority:** CLAUDE.md §9
