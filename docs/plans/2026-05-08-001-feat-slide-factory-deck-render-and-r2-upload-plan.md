---
title: "Slide Factory deck render + R2 upload (post-Marco producer)"
type: feat
status: active
date: 2026-05-08
origin: docs/plans/2026-05-07-001-feat-slide-factory-completion-plan.md
---

# Slide Factory deck render + R2 upload (post-Marco producer)

## Summary

Build the missing producer that takes a `complete` slide-factory run and turns it into a downloadable PDF on R2. Marco's `handleTransitionStatus` currently writes `{status: "complete", completedAt}` — never `deckR2Key` — so the download route shipped in PR #29 is functionally unreachable in production. This plan adds an **agent-native** deck-production capability: a new Marco tool `produce_deck` that Marco calls explicitly after `transition_status: complete` succeeds, plus a deterministic minion (`Franco`) that does the Playwright render + R2 upload. The same deterministic core is exposed via a Rebecca tool so an admin can ask "produce the deck for run 5" through conversation when an automated run got stuck — agent-native parity by construction.

---

## Problem Frame

The slide factory pipeline reaches `status: "complete"` but stops there. The download route at `GET /api/lb-slides/factory/runs/:id/download` (`routes/slide-factory.ts:449`) reads `run.deckR2Key`, but no production code path writes it. Marco's `handleTransitionStatus` (`marco-tools.ts:431-432`) writes only `{status: "complete", completedAt}`. Tests (`slide-factory-download-route.test.ts:145`, `Tab6Download.test.tsx:82`) inject synthetic `deckR2Key` values, masking the gap.

The next agent who tries to use the slide factory in production will see Tab 6 sit on "Deck not yet rendered — please contact your administrator" forever (the 422 branch in `slide-factory.ts:465-468`). Polling on PR #30 for `complete && !deckR2Key` keeps refetching but no producer is firing.

This plan closes that gap. It does **not** write the missing E2E pipeline test (a separate, smaller plan that follows once a real producer exists for the test to drive).

---

## Requirements

- **R1.** A `complete` slide-factory run produces a PDF at `factory-runs/<runId>/deck.pdf` on R2 and the run's `deckR2Key` column is set to that key.
- **R2.** The render uses the existing canonical Playwright pattern (`getBrowser` singleton, `renderLimiter`, `signFactoryDeckToken`, internal-proxy URL, `window.__deckReady` polling, `page.pdf({ printBackground: true, preferCSSPageSize: true })`) so behavior matches `lb-deck-pdf.ts` and `property-deck-pdf.ts`.
- **R3.** Render failures do not break the run's `complete` status. The `produce_deck` tool returns a structured `{ error: ... }` to Marco; Marco logs and finishes the run. `deckR2Key` stays null; the user sees the existing "Deck not yet rendered" 422 branch in Tab 6 (which now correctly reflects reality), and Rebecca can be asked to retry production manually.
- **R4.** Per-slide payload assembly works after the in-memory `dispatchedPayloads` cache has been cleared. The renderer reconstructs `DeckPayloadV2` from persisted run state (luccaDraft + slot assignments + canonical-spec) without depending on Marco's transient cache.
- **R5.** Tab 6's polling (extended in PR #30 to keep firing while `complete && !deckR2Key`) drains correctly once the producer writes `deckR2Key` on a real run.
- **R6.** Verification gates pass: `pnpm run typecheck` clean, `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS, new and existing slide-factory tests PASS.
- **R7.** The producer respects ADR-007 §1 DI discipline (see `CLAUDE.md` §4) — `lib/calc/` and `lib/engine/` stay untouched. All payload assembly happens at the route/service layer.
- **R8. Agent-native parity (CLAUDE.md §7).** The deck-production capability is exposed as both:
  - a Marco tool (`produce_deck`) that Marco calls in its loop after `transition_status: complete`, and
  - a Rebecca tool (`produce_slide_factory_deck`) that any admin can invoke via Rebecca chat for a `complete` run whose `deckR2Key` is null (manual retry path).
  Both routes call the same deterministic core (`runFranco(runId)`). Parity map at `docs/discipline/agent-native-parity-map.md` updated in the same unit that adds the Rebecca tool.
- **R9. Naming convention (CLAUDE.md §10).** The deterministic deck-render minion is named **Franco** (single Italian first name, fits the existing minion progression Aldo / Bruno / Carlo / Dino / Enzo → Franco). Reserved-names list in `CLAUDE.md` §10 updated.

**Origin trace:** Advances origin plan U9 (the test U9 calls for a real download path; this plan provides the producer the test will drive). R5 of origin (parity map) and R6 (Rebecca tools) are already shipped per PR #29 / #30; this plan does not regress them.

---

## Scope Boundaries

- The end-to-end pipeline test (`slide-factory-pipeline-end-to-end.test.ts`). Once a real producer exists, that test becomes a thin follow-up (separate plan).
- Pixel-perfect canonical PNG match. Dino already exists for per-slide pixel-diff (`slides/dino.ts`); the producer's job is just to render and upload. Dino verification at the deck level is a separate concern.
- Re-render of a `complete` run (idempotency). First-render-only is enough for v1; a re-render endpoint can be added later if operators need it.
- The legacy `lb-deck-pdf.ts` flow. That stays as-is for the manual configure-and-render workflow; the new producer is slide-factory-specific.
- Schema additions to `slide_factory_runs`. The existing `deckR2Key` column is the only field this plan writes. No new columns are needed if payload reconstruction works from existing data (see U1's discriminating decision).

### Deferred to Follow-Up Work

- **End-to-end pipeline test plan.** Rewrite the prior 2026-05-08 E2E test plan once this producer ships. The test then drives a real run-to-download path with mocked LLM/Playwright but real status transitions and a real `deckR2Key` write site to assert against.
- **Re-render / refresh endpoint.** `POST /api/lb-slides/factory/runs/:id/re-render` for operators to force a fresh PDF. Out of scope here.
- **Render queue + retry logic.** The first iteration uses `renderLimiter` (the existing shared singleton). If render failures recur in production, add explicit retry shape later.

---

## Context & Research

### Relevant Code and Patterns

**Canonical render pattern (mirror this exactly):**
- `artifacts/api-server/src/routes/lb-deck-pdf.ts:66-100` — `renderLbDeckPdfOnce` + the disconnect-retry wrapper. The producer's render function should follow the same shape verbatim, swapping `signLbDeckToken()` → `signFactoryDeckToken(runId)` and the URL.
- `artifacts/api-server/src/routes/lb-deck-pdf.ts:299` — `sp.uploadBuffer(LB_PDF_R2_KEY, pdf, PDF_CONTENT_TYPE)`. R2 upload site to mirror.
- `artifacts/api-server/src/routes/property-deck-pdf.ts:197-238` — alternative render variant with more sophisticated retry. Useful reference if `lb-deck-pdf.ts`'s simpler retry isn't enough.

**Marco's success path (where the hook lands):**
- `artifacts/api-server/src/slides/marco-tools.ts:414-438` — `handleTransitionStatus`. The producer hook fires here when `effectiveStatus === "complete"`.
- `artifacts/api-server/src/slides/marco.ts:73` — `runMarco(runId)`. Alternative hook site: wrap the function so the render fires after the inner loop returns (cleaner separation, but harder to access in-memory payload cache).

**In-memory payload cache:**
- `artifacts/api-server/src/slides/marco-tools.ts:44, 325, 342, 459` — `dispatchedPayloads: Map<cacheKey, payloadV2>`. Populated by `dispatch_slide_team`, consumed by `invoke_maya`, cleared by `markRunError`. **On the success path the entries are leaked, not cleared.** This means the renderer hooked at `transition_status: complete` could read from this cache directly — but R4 explicitly requires the renderer not depend on this transient state. The cache is a Marco-internal optimization, not a contract.

**Internal-deck route + payload (extend or duplicate):**
- `artifacts/hospitality-business-portal/src/pages/LbInternalDeck.tsx:7-77` — `/internal/lb-deck?token=<hmac>`, fetches `/api/internal/lb-deck-payload?token=...`. This serves the **legacy** LB deck only. Extension or parallel route needed for slide-factory.
- `artifacts/api-server/src/routes/internal-lb-deck-payload.ts` — the legacy payload endpoint. Returns `LbSlidePayload` from the legacy `lb_slides_config` table.
- `artifacts/api-server/src/slides/build-payload.ts` and `build-lb-payload.ts` — payload assembly helpers used by the legacy flow. Reusable for slide-factory if their inputs are made source-agnostic.

**Token signing:**
- `artifacts/api-server/src/slides/lb-token.ts` — `signLbDeckToken()` pattern. The slide-factory needs an analogous `signFactoryDeckToken(runId)` that includes the runId in the payload.
- `artifacts/api-server/src/slides/internal-token.ts` — generic internal-token utilities; check whether it can sign factory-deck tokens directly or if a new helper is cleaner.

**Render constants and limiter:**
- `artifacts/api-server/src/slides/deck-render-constants.ts` — `PDF_RENDER_TIMEOUT_MS`, `DECK_READY_POLL_TIMEOUT_MS`, `DECK_VIEWPORT_WIDTH/HEIGHT`, `PDF_CONTENT_TYPE`, `SLIDE_INTERNAL_PROXY_PORT`. All shared.
- `artifacts/api-server/src/slides/render-limiter.ts` — shared singleton preventing concurrent renders. The producer must acquire it before launching Playwright.

**State + storage:**
- `artifacts/api-server/src/storage/slide-factory-runs.ts:65-92` — `updateSlideFactoryRun` accepts `deckR2Key` in the patch type.
- `artifacts/api-server/src/slides/lorenzo-ingestion.ts:91` writes the `canonical-spec` to the run; that's where the per-slide structural data lives.
- `artifacts/api-server/src/slides/lucca-draft.ts:724-727` writes `luccaDraft` (the slot-text drafts).
- `artifacts/api-server/src/slides/marco-tools.ts:393-411` writes `agentResults[slideN]` per slide with `SlideAgentResult` shape.

So the persisted state at `complete` time is: `canonicalSpec` + `luccaDraft` + `agentResults` + the four `slide<N>PropertyId` columns. R4 says the renderer must reconstruct `DeckPayloadV2` from this. Whether that reconstruction is straightforward or requires re-running parts of the build pipeline is the discriminating decision in U1.

### Institutional Learnings

- `docs/solutions/architecture-patterns/lb-deck-composite-payload-architecture-2026-05-04.md` — single-Playwright-pass; one R2 key per deck. The producer follows this exact shape.
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — the orchestrator-then-route flow. Producer is downstream of Marco; same pattern as Lorenzo/Lucca/Marco.
- `docs/solutions/architecture-patterns/lorenzo-vision-pipeline-canonical-ingestion-2026-05-07.md` — Lorenzo's persisted output (`canonicalSpec`) is what the producer reads.
- `docs/solutions/architecture-patterns/slide-factory-runs-schema-design-2026-05-07.md` — the schema's `deckR2Key` column was always intended to be written by a producer; this plan is what the schema was waiting for.
- `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md` — the discipline gates this plan ships under (CE review, parity map, harmonization, magic-numbers, typecheck, tests).

### External References

None needed. The producer is a strict mirror of two existing Playwright-render patterns in the same repo. No new framework or external dependency.

---

## Key Technical Decisions

- **Agent-native shape over deterministic side effect.** The producer is *not* a hidden hook inside `handleTransitionStatus`. Instead it is a new Marco tool `produce_deck` that Marco calls explicitly after `transition_status: complete` returns ok. This makes deck production an observable step in Marco's tool log, exposes the same capability as a Rebecca tool for manual retry, and keeps `marco-tools.ts` honest about its responsibilities. The deterministic core (`runFranco(runId)`) is the single implementation both call sites share. Alternative considered (deterministic side effect) was rejected because it hides the produce step from Marco's tool transcript and creates an asymmetry: Marco can see/recover from `update_agent_result` and `transition_status` failures via its tool loop, but a side-effect render failure would be invisible to it.
- **Marco's prompt updated** to: "After all six slides have agentResults written, call `transition_status: complete`. If status is `complete`, call `produce_deck`. If `produce_deck` returns an error, log it via `update_agent_result` notes (or simply finish — Rebecca can retry). Then call `complete_task`." The change is additive to the existing 7-tool list; Marco becomes an 8-tool agent.
- **Franco — new deterministic minion.** Single Italian first name, fits the minion progression (Aldo / Bruno / Carlo / Dino / Enzo → Franco). Per CLAUDE.md §10 minions are deterministic helpers with no LLM and no judgment. Franco's signature: `runFranco(runId: number): Promise<{ deckR2Key: string }>` — throws on render or upload failure. Lives in `artifacts/api-server/src/slides/minions/franco.ts`.
- **Rebecca tool: `produce_slide_factory_deck(runId)`.** Calls the same `runFranco` core. Required for agent-native parity: an admin who notices Tab 6 stuck on "Deck not yet rendered" can ask Rebecca "produce the deck for run 42" instead of having to dig into the database. Emits `dataChanged: { entityType: "slide_factory_run", entityId: runId }` on SSE done, per the Rebecca pattern, so the panel re-renders immediately.
- **Renderer reads from persisted run state, not Marco's in-memory `dispatchedPayloads` map.** Per R4. The map is a Marco-internal optimization that gets cleared on error and leaked on success — it is not a durable contract. Franco reads from `canonicalSpec + luccaDraft + agentResults + slide<N>PropertyId` and survives a server restart between Marco completion and the (potentially much later) Rebecca-triggered manual retry.
- **Payload assembly extracted to a shared builder.** Either extend `build-lb-payload.ts` to accept a slide-factory run as an alternative input, or add `build-factory-payload.ts` alongside it. Decision deferred to U1 implementation — depends on how source-agnostic the existing builder's signature is. Either way the assembly does **not** re-invoke any LLM agents.
- **Internal route extension over duplication.** The existing `/internal/lb-deck?token=<hmac>` is reused with the token discriminating between legacy and factory modes (token payload includes `factoryRunId` when present). The frontend page branches on token type. Avoids forking the route + frontend page.
- **Render-error policy: structured error to caller; `deckR2Key` stays null; status stays `complete`.** Per R3. Marco logs and proceeds; Rebecca can manually retry. The run does not flip to `error` because the slides themselves were approved — only the rendering step failed, which is operationally a different problem.
- **R2 key format: `factory-runs/<runId>/deck.pdf`.** Already established by the existing tests (`slide-factory-download-route.test.ts:145`) and Tab 6 fixture (`Tab6Download.test.tsx:82`). No migration needed.
- **Magic-numbers gate compliance:** all timeouts, viewport dimensions, etc. come from `deck-render-constants.ts` (already named constants). The new module should add **no** new numeric literals beyond `0`/`1`/`-1`.

---

## Open Questions

### Resolved During Planning

- **Where to hook (Marco loop wrapper vs `handleTransitionStatus`):** in-handler — see Key Technical Decisions.
- **Whether to depend on Marco's in-memory cache:** no — read from persisted state per R4.
- **Render-failure policy:** log and continue; do not flip status to error.
- **R2 key format:** `factory-runs/<runId>/deck.pdf` (already established).

### Deferred to Implementation

- **Payload assembly: extend `build-lb-payload.ts` vs new `build-factory-payload.ts`.** Settle by reading the existing builder's signature at U1 start. If the builder already takes per-slide structural data as input (vs. fetching from `lb_slides_config`), extension is trivial; if it's tightly coupled to legacy storage, a parallel module is cleaner.
- **Token-signing approach: extend `lb-token.ts` with a `factoryRunId` field, vs new `factory-token.ts`.** Same shape of decision as above; the answer falls out of looking at the existing token's payload schema.
- **Whether the frontend page (`LbInternalDeck.tsx`) needs branching for factory vs legacy mode, or whether a parallel page (`FactoryInternalDeck.tsx`) is cleaner.** The render contract (`window.__deckReady`, image-ready handling) is identical; the only delta is which payload is fetched. Settle at U2 by reading the LB page's structure.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
       Marco's tool loop (8 tools, was 7) — agent-native success path:
       ┌──────────────────────────────────────────────────────────────┐
       │  ... loop iteration N: dispatch_slide_team(slide=6),         │
       │                        invoke_maya, invoke_dino,             │
       │                        update_agent_result(slide=6, ...)     │
       │  ↓                                                           │
       │  loop iteration N+1: transition_status({newStatus:           │
       │                                          "complete"})        │
       │  ← { ok: true, status: "complete" }                          │
       │  ↓                                                           │
       │  loop iteration N+2: produce_deck({})  [NEW]                 │
       │  ← { ok: true, deckR2Key: "factory-runs/5/deck.pdf" }        │
       │     OR  { error: "render failed: ..." }   (logged, run       │
       │                                            stays complete,   │
       │                                            Rebecca can retry)│
       │  ↓                                                           │
       │  loop iteration N+3: complete_task({summary: "..."})         │
       └──────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
       Marco tool dispatch routes produce_deck → runFranco(runId).
       Rebecca tool produce_slide_factory_deck routes the same way:

       ┌────────────────────────────────────────────────────────────┐
       │  Marco tool: produce_deck            Rebecca tool:         │
       │    handleProduceDeck(runId) →        produce_slide_factory │
       │      runFranco(runId)                _deck → runFranco(    │
       │                                      runId, { caller:      │
       │                                      "rebecca" })          │
       │                                      ↓ emits dataChanged    │
       │                                                            │
       │   Both paths share the same        Same agent-native       │
       │   deterministic core.              parity contract as Maya │
       │                                    / Dino — exposed in     │
       │                                    docs/discipline/agent-  │
       │                                    native-parity-map.md.   │
       └────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
       ┌────────────────────────────────────────────────────────────┐
       │  runFranco(runId)  [NEW deterministic minion —             │
       │                     slides/minions/franco.ts]              │
       │                                                            │
       │   1. token = signFactoryDeckToken(runId)                   │
       │   2. url   = factoryDeckUrl(token)                         │
       │   3. await renderLimiter.run(async () => {                 │
       │        browser = await getBrowser()                        │
       │        page    = await browser.newContext(viewport)...     │
       │        await page.goto(url, { waitUntil: "load" })         │
       │        await page.waitForFunction("window.__deckReady")    │
       │        pdf = await page.pdf({ printBackground: true,       │
       │                                preferCSSPageSize: true })  │
       │      })                                                    │
       │   4. key = `factory-runs/${runId}/deck.pdf`                │
       │   5. await sp.uploadBuffer(key, pdf, PDF_CONTENT_TYPE)     │
       │   6. await updateSlideFactoryRun(runId, { deckR2Key: key })│
       │   7. return { deckR2Key: key }   (throws on failure)       │
       └────────────────────────────────────────────────────────────┘
                                       ▲
                                       │ fetched by Playwright via internal proxy
                                       │
       ┌───────────────────────────────┴────────────────────────────┐
       │  /internal/lb-deck?token=<factory-token>                   │
       │  Token payload carries factoryRunId. Backend payload       │
       │  endpoint branches: factoryRunId present → buildFactory    │
       │  Payload(run) (U1); else → existing legacy LB flow.        │
       └────────────────────────────────────────────────────────────┘
```

---

## Implementation Units

- U1. **Per-slide payload assembly from a factory run's persisted state**

**Goal:** Produce a `DeckPayloadV2` for a given factory run by reading only persisted run state — no LLM, no in-memory cache, no re-running upstream agents. This is the data path Playwright will consume.

**Requirements:** R4, R7.

**Dependencies:** None.

**Files:**
- Create or extend: `artifacts/api-server/src/slides/build-factory-payload.ts` (or extend `build-lb-payload.ts` if its existing shape allows source-agnostic input — see Open Questions)
- Test: `artifacts/api-server/src/tests/build-factory-payload.test.ts`

**Approach:**
- Input: `runId` (or, more cleanly, an already-loaded `SlideFactoryRun` row).
- Read `canonicalSpec`, `luccaDraft`, `agentResults`, `slide1PropertyId`..`slide5PropertyId`, `briefR2Key`, `briefFilename` from the run.
- Assemble each per-slide `DeckPayloadV2` slot in the same order the swarm builders did (Sofia → Bianca → Chiara → Dario → Elisa → Felix). Source data: lucca slot text + canonical-spec structural fields + property data fetched via existing `storage.getProperty(...)`.
- Return the full `DeckPayloadV2` object the internal-deck page expects.
- Decision point at unit start: read `build-lb-payload.ts`'s signature — if it already takes per-slide structural data as input, extend it with a `source: "factory"` discriminator. If it's tightly coupled to `lb_slides_config`, write a new module.

**Patterns to follow:**
- `artifacts/api-server/src/slides/build-lb-payload.ts` — existing builder's slot ordering and field shape.
- `artifacts/api-server/src/slides/build-payload.ts` — adjacent payload helper.

**Test scenarios:**
- *Happy path:* Given a run with canonicalSpec, luccaDraft, agentResults, all four slide property ids, the builder produces a 6-slot DeckPayloadV2 with all slot text fields populated.
- *Edge case:* Run with one missing `slide<N>PropertyId` → the builder falls back to the same default the legacy LB flow uses (or returns an error if that slot is required); test asserts the expected behavior matches the existing builder's contract.
- *Edge case:* Run where `agentResults` has fewer than 6 entries (one slide rejected) → the builder's behavior is documented and tested. Likely contract: `complete` should never have rejected slides (Marco's downgrade gate prevents it), so this case is theoretically unreachable, but the test pins the behavior.
- *Integration:* Builder output passes the existing `DeckPayloadV2` Zod schema validation (if one exists in `@shared/deck-payload-v2`).

**Verification:**
- Test file passes: `npx vitest run src/tests/build-factory-payload.test.ts`.
- `pnpm run typecheck` clean.
- Magic-numbers gate PASS.

---

- U2. **Franco minion: deterministic deck render + R2 upload + `deckR2Key` write**

**Goal:** Land the deterministic core that any caller (Marco's tool, Rebecca's tool, future operators) shares. Single function, single responsibility, no LLM, no judgment — exactly what CLAUDE.md §10 calls a "minion".

**Requirements:** R1, R2, R3, R4, R6, R9.

**Dependencies:** U1 (`runFranco` consumes `buildFactoryPayload` indirectly — U1's builder lives behind the internal-deck payload endpoint that Franco's Playwright instance fetches).

**Files:**
- Create: `artifacts/api-server/src/slides/minions/franco.ts` — exports `runFranco(runId: number, opts?: { caller?: "marco" | "rebecca" }): Promise<{ deckR2Key: string }>`. Throws on render or upload failure.
- Create: `artifacts/api-server/src/slides/factory-token.ts` (or extend `lb-token.ts`) — `signFactoryDeckToken(runId): { token: string }`.
- Test: `artifacts/api-server/src/tests/swarms/franco.test.ts` — covers the contract (token signing, upload key, `deckR2Key` write, throws on failure, retry on Playwright disconnect).

**Approach:**
- Mirror `lb-deck-pdf.ts:66-100` (`renderLbDeckPdfOnce` + disconnect-retry wrapper).
- Acquire `renderLimiter` for the duration of the Playwright session.
- After `page.pdf(...)` returns, upload via `getStorageProviderAsync().uploadBuffer(key, pdf, PDF_CONTENT_TYPE)`.
- Then `updateSlideFactoryRun(runId, { deckR2Key: key })` and return the key.
- Error path: any throw propagates. Callers (Marco's tool, Rebecca's tool) catch and convert to structured `{ error }` for their respective surfaces.
- The optional `opts.caller` is for log namespacing only — `[franco]` namespace with caller annotation; behavior is identical.

**Patterns to follow:**
- `artifacts/api-server/src/routes/lb-deck-pdf.ts:66-100` (exact mirror of the render shape).
- `artifacts/api-server/src/routes/property-deck-pdf.ts:325-329` for the upload-after-render pattern.
- `artifacts/api-server/src/slides/lb-token.ts` for token signing.
- `artifacts/api-server/src/slides/minions/{aldo,carlo}.ts` — existing minion file conventions (single deterministic function, no LLM, no judgment).

**Test scenarios:**
- *Happy path:* `runFranco(5)` with mocked Playwright (returns synthetic PDF buffer) and mocked storage provider → asserts `uploadBuffer` called with `factory-runs/5/deck.pdf` + `PDF_CONTENT_TYPE`, `updateSlideFactoryRun(5, { deckR2Key: "factory-runs/5/deck.pdf" })` was called, and the return value is `{ deckR2Key: "factory-runs/5/deck.pdf" }`.
- *Edge — Playwright disconnect retry:* first attempt throws "Target closed", second succeeds. Assert one retry happened.
- *Error — render fails after retry:* both attempts throw → `runFranco` throws.
- *Error — uploadBuffer fails:* render succeeds, R2 throws → `runFranco` throws (no `deckR2Key` write).
- *Error — updateSlideFactoryRun fails:* render + upload succeed, DB write throws → `runFranco` throws (R2 object exists but DB doesn't reflect it; this is acceptable — Rebecca-triggered retry is idempotent on the same R2 key).
- *Caller annotation:* `runFranco(5, { caller: "rebecca" })` produces a log entry with `[franco][rebecca]` annotation; no behavioral change.

**Verification:**
- All test scenarios pass: `npx vitest run src/tests/swarms/franco.test.ts`.
- `pnpm run typecheck` clean.
- Magic-numbers gate PASS — every numeric value comes from `deck-render-constants.ts`.
- `CLAUDE.md` §10 reserved-names list updated to include Franco.

---

- U3. **`produce_deck` Marco tool + `produce_slide_factory_deck` Rebecca tool + parity-map update**

**Goal:** Expose Franco via two agent-native call sites. Marco calls `produce_deck` after `transition_status: complete`; Rebecca exposes `produce_slide_factory_deck` for manual retry. Both paths route to `runFranco(runId)`. Update the agent-native parity map and Marco's system prompt.

**Requirements:** R1, R3, R5, R8.

**Dependencies:** U2 (Franco's deterministic core).

**Files:**
- Modify: `artifacts/api-server/src/slides/marco-tools.ts` — add `produce_deck` to `MARCO_TOOLS` (8 total, was 7); add `handleProduceDeck(runId)` that calls `runFranco(runId, { caller: "marco" })` and converts thrown errors to `{ error: <string> }`.
- Modify: `artifacts/api-server/src/slides/marco.ts` — update `MARCO_SYSTEM_PROMPT` so Marco knows to call `produce_deck` after `transition_status: complete` succeeds. Update the "do not call any tool other than the seven listed above" line to "eight". Increase `MARCO_MAX_TOOL_DEPTH` if needed (one extra iteration per run).
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts` — add `produce_slide_factory_deck` tool. Calls `runFranco(runId, { caller: "rebecca" })`. Emits `dataChanged: { entityType: "slide_factory_run", entityId: runId }` on SSE done. Returns `{ ok: true, deckR2Key }` on success or `{ ok: false, error }` on failure (Rebecca surfaces as `isError: true` per pattern).
- Modify: `docs/discipline/agent-native-parity-map.md` — under the Slide Factory section, add a "Produce / re-render deck PDF" row mapped to the new Rebecca tool. Status: ✅.
- Modify: `CLAUDE.md` §10 reserved-names list — add Franco to the slide factory minions list (Aldo, Bruno, Carlo, Dino, Enzo, **Franco**).
- Test: `artifacts/api-server/src/tests/marco.test.ts` — extend with `produce_deck` tool routing and prompt-update sanity (e.g., verify the prompt mentions the new tool by name).
- Test: `artifacts/api-server/src/tests/rebecca-slide-factory-tools.test.ts` — extend with `produce_slide_factory_deck` happy path + error path.

**Approach:**
- `produce_deck` is a Marco-internal tool. Schema: no input parameters (Marco already knows the runId from context). Returns `{ ok: true, deckR2Key }` or `{ error: <string> }`.
- `produce_slide_factory_deck` is a Rebecca tool. Schema: `{ runId: number }`. Same return shape.
- Marco's prompt update: append a step to the existing instruction set: "After `transition_status: complete` succeeds, call `produce_deck`. If it returns an error, finish the run anyway — Rebecca can retry. Then call `complete_task`."
- Parity-map update is the visible discipline gate per CLAUDE.md §7.

**Patterns to follow:**
- `artifacts/api-server/src/slides/marco-tools.ts` existing tool dispatch shape (`handleX(...)` per tool, switch in `dispatchMarcoTool`).
- `artifacts/api-server/src/chat/rebecca-tools.ts` — Rebecca-tool registration shape, `dataChanged` emission pattern (use the existing helper).

**Test scenarios:**
- *Marco tool — happy path:* `handleProduceDeck(5)` with mocked `runFranco` returning `{ deckR2Key: "k" }` → asserts the tool returns `{ ok: true, deckR2Key: "k" }`.
- *Marco tool — error path:* `handleProduceDeck(5)` with `runFranco` throwing → asserts the tool returns `{ error: <string> }` (no throw to Marco).
- *Marco prompt:* `MARCO_SYSTEM_PROMPT` mentions `produce_deck` and `transition_status` in the right order; `MARCO_TOOLS` has 8 entries.
- *Rebecca tool — happy path:* `produce_slide_factory_deck({ runId: 5 })` with mocked `runFranco` → asserts `dataChanged` is emitted on done with `{ entityType: "slide_factory_run", entityId: 5 }` and the response shape is `{ ok: true, deckR2Key }`.
- *Rebecca tool — error path:* `runFranco` throws → tool returns `{ ok: false, error }` and the response carries `isError: true`.
- *Rebecca tool — invalid runId:* non-existent run → `runFranco` throws → same error path as above.
- *Parity map row count:* existing test that asserts parity-map row count matches the slide-factory endpoint count is updated to reflect the new "Produce deck" row.

**Verification:**
- All test scenarios pass.
- `pnpm run typecheck` clean.
- Magic-numbers gate PASS.
- `marco.test.ts` and `rebecca-slide-factory-tools.test.ts` still PASS in their entirety.

---

- U4. **Internal route + frontend page wired for factory tokens**

**Goal:** The internal `/internal/lb-deck` route serves a factory run's payload when the token discriminates as a factory token. The frontend page renders identically (the contract `window.__deckReady` is identical); the only delta is which payload-build path is taken on the backend.

**Requirements:** R4 (the renderer reads from persisted state), R7 (no engine/calc imports).

**Dependencies:** U1 (U1's builder is the data source); U2 lands `signFactoryDeckToken`.

**Files:**
- Modify: `artifacts/api-server/src/routes/internal-lb-deck-payload.ts` — token-payload check; route to legacy or factory builder.
- Verify (no expected change): `artifacts/hospitality-business-portal/src/pages/LbInternalDeck.tsx` — confirm the page is token-agnostic on the frontend side.
- Test: `artifacts/api-server/src/tests/internal-lb-deck-payload-route.test.ts` (new or extend existing) — covers both legacy and factory token paths.

**Approach:**
- Token verification is unchanged for the legacy path. For factory tokens (token payload contains `factoryRunId`), fetch the run, validate `status === "complete"` and the effective owner matches the token's intended audience, then call `buildFactoryPayload(run)` from U1.
- If the run is not yet `complete`, return 409 (matches the slide-factory route's state-machine guards from PR #30 — same pattern).

**Patterns to follow:**
- `artifacts/api-server/src/routes/internal-lb-deck-payload.ts` — existing legacy flow.
- `artifacts/api-server/src/routes/slide-factory.ts` — 409-on-not-complete pattern.

**Test scenarios:**
- *Legacy token:* existing legacy flow works; payload comes from `lb_slides_config`.
- *Factory token, run is complete:* 200 with assembled `DeckPayloadV2` from U1's builder.
- *Factory token, run is not complete:* 409 with state-machine error message.
- *Factory token, run not found:* 404.
- *Token signature invalid:* 401 (existing token-verification path).

**Verification:**
- All test scenarios pass.
- Existing `internal-lb-deck-payload` tests (if any) still pass.
- `pnpm run typecheck` clean.

---

- U5. **End-to-end smoke (manual, not automated)**

**Goal:** One manual smoke pass against a real dev run before declaring the producer working. Also exercise the agent-native parity: ask Rebecca to "produce the deck for run N" and verify the same code path runs.

**Requirements:** R1, R5, R8.

**Dependencies:** U1, U2, U3, U4.

**Files:** None.

**Execution note:** This is a manual verification, not an automated test. Document the smoke procedure in the PR description.

**Test scenarios:**
- *Marco-triggered:* Create a slide-factory run via the UI; advance through Tabs 1–4 with real briefs and properties; trigger Marco; wait for `complete`; observe Tab 6 surfaces a working Download button (not the "Deck not yet rendered" 422 branch); click Download; verify a 6-slide PDF downloads successfully.
- *Rebecca-triggered (agent-native parity):* On a `complete` run whose `deckR2Key` is null (simulate by clearing the column manually), ask Rebecca "produce the deck for run N". Verify Rebecca calls `produce_slide_factory_deck`, Tab 6 polling drains, and the same 6-slide PDF is downloadable.
- The automated E2E test plan (deferred follow-up) will eventually replace this manual step.

**Verification:**
- A real PDF is produced and downloaded via both the automated (Marco) and conversational (Rebecca) paths.
- Server logs show the `[franco]` namespace render entries with caller annotations (`[franco][marco]` and `[franco][rebecca]`).
- `deckR2Key` is set on the run row in the DB after each path.
- Parity map row for "Produce / re-render deck PDF" reflects ✅ in `docs/discipline/agent-native-parity-map.md`.

---

## System-Wide Impact

- **Interaction graph:** Marco gains an 8th tool (`produce_deck`) it calls after `transition_status: complete` succeeds. Rebecca gains a parallel tool (`produce_slide_factory_deck`) for manual retry. Both route to `runFranco(runId)` — the new deterministic minion — which consumes the existing `renderLimiter`, `getBrowser`, and storage-provider singletons. Internal-deck route extended to serve factory payloads.
- **Error propagation:** Render failures surface to the calling agent as a structured `{ error }` (no throws across the agent boundary). The run keeps `status: complete`; `deckR2Key` stays null; Tab 6's existing 422 branch surfaces "Deck not yet rendered" as today, and the user can ask Rebecca to retry. Franco logs to `[franco]` namespace with caller annotation.
- **State lifecycle risks:** The `dispatchedPayloads` Map in `marco-tools.ts` continues to leak on the success path (existing behavior). This plan does not fix that leak; it just makes sure the renderer doesn't depend on the cache.
- **API surface parity:** No new HTTP endpoints. The `produce_deck` Marco tool and `produce_slide_factory_deck` Rebecca tool both call into the same in-process function — no new route to maintain.
- **Agent-native parity (CLAUDE.md §7):** Every UI affordance Tab 6 surfaces is reachable via Rebecca. Tab 6's "Download" button continues to use `GET /api/lb-slides/factory/runs/:id/download` (no Rebecca tool needed — file download is 🚫 N/A per existing parity-map row). Tab 6's "stuck on Deck not yet rendered" state now has a Rebecca-side recovery path (`produce_slide_factory_deck`). Parity map updated.
- **Integration coverage:** U2 unit-tests Franco against mocked Playwright/R2. U3 unit-tests both Marco's and Rebecca's tool wiring. The end-to-end pipeline test (deferred follow-up) will close the cross-tool integration gap.
- **Unchanged invariants:** Marco's deterministic gate logic (downgrade-on-rejection in `handleTransitionStatus`), the 9-status enum, the `agentResults` shape, the existing legacy `lb-deck-pdf.ts` flow, and PR #30's polling logic in `SlideFactoryPanel.tsx` all stay verbatim. `handleTransitionStatus` is **not** modified — the producer is a peer tool, not a side effect of the status flip.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| Per-slide payload reconstruction from persisted state misses fields the in-memory `payloadV2` had | U1 includes a Zod-schema validation step (if `@shared/deck-payload-v2` exposes one) so missing fields fail fast at build time, not at render time. Cross-reference each builder's output against the schema. |
| Concurrent factory runs serialize behind `renderLimiter` and produce slow user-visible Tab 6 wait | First iteration is fine — the existing limiter is shared across LB deck and property decks; production concurrency is low. If this becomes a bottleneck, a separate factory-specific limiter can be added later. |
| Render fails silently in production and operators don't notice | Two operator signals: (1) `[franco]` log entries with `[marco]`/`[rebecca]` caller annotation; (2) the user can ask Rebecca to retry, which surfaces the failure conversationally. Tab 6 explicitly tells the user "Deck not yet rendered — please contact your administrator", which is the existing copy and is now operationally honest. A monitoring task to count `[franco]` render-failure log entries can follow. |
| Marco's depth limit hit because of the new tool call | `MARCO_MAX_TOOL_DEPTH` may need a small bump to accommodate one extra iteration per run (transition_status + produce_deck + complete_task vs. the prior transition_status + complete_task). Verify in U3 implementation; bump the constant if the existing limit is tight. |
| Rebecca tool call from a non-admin user produces a render | The Rebecca tool registration uses the existing admin-scoped pattern; non-admin users cannot reach the tool. This is the same posture as every other write-side Rebecca tool. |
| Internal-deck token reuse confuses the legacy and factory paths | U3's tests cover both token types. Token signing helpers stay distinct (different signing key inputs or token-payload field), and the route's branch is explicit on `factoryRunId !== undefined`. |
| Re-render of a successful run via the Rebecca tool produces a duplicate R2 object | R2 keys are deterministic (`factory-runs/<runId>/deck.pdf`) so a re-render overwrites the prior object idempotently. No duplicate accumulation. The DB write is also idempotent — same key, just refreshed timestamp. |
| Marco's `produce_deck` returning `{ error }` confuses the LLM into retrying inside its tool loop | Marco's prompt explicitly instructs: "If `produce_deck` returns an error, finish the run anyway — Rebecca can retry. Do not retry `produce_deck` inside the same loop." Verify in U3 by reviewing the prompt against the existing Marco discipline rules. |

---

## Documentation / Operational Notes

- After this lands, update `docs/slide-system/lb-slides-implementation-reference.md` (if present) with the producer architecture and the Franco minion role.
- Update `CLAUDE.md` Recent Significant Changes (with mirrored entry in `replit.md`) noting the producer is shipped, plus update §10 reserved-names list to include Franco — the Memory-file harmonization gate applies (per `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md`).
- Update `docs/discipline/agent-native-parity-map.md` with the new "Produce / re-render deck PDF" row in the Slide Factory section (U3 owns this update, but call it out here too — parity-map updates are easy to forget).
- The deferred E2E test plan can now be rewritten and shipped — note that work in the slide-factory completion plan's deferred-follow-up list.
- Monitor the `[franco]` log namespace for render-failure entries during the first week post-deploy. If failures cluster around a specific Playwright error mode, tune the retry policy. Caller annotation (`[franco][marco]` vs `[franco][rebecca]`) helps distinguish automatic from operator-initiated retries.

---

## Sources & References

- **Origin document:** `docs/plans/2026-05-07-001-feat-slide-factory-completion-plan.md` (U9)
- **Related PRs:** #29 (U7+U8 Tab 5/6 + Maya/Dino), #30 (U8.1 followup with `deckR2Key`-pending polling)
- **Canonical render code to mirror:** `artifacts/api-server/src/routes/lb-deck-pdf.ts`, `artifacts/api-server/src/routes/property-deck-pdf.ts`
- **Marco success path:** `artifacts/api-server/src/slides/marco-tools.ts:414-438`
- **Internal route + payload:** `artifacts/api-server/src/routes/internal-lb-deck-payload.ts`, `artifacts/hospitality-business-portal/src/pages/LbInternalDeck.tsx`
- **Shared render infra:** `artifacts/api-server/src/slides/{playwright-browser,render-limiter,deck-render-constants,lb-token}.ts`
- **Storage:** `artifacts/api-server/src/storage/slide-factory-runs.ts`
- **Learnings:** `docs/solutions/architecture-patterns/{lb-deck-composite-payload-architecture,agent-native-precision-pipeline-pattern,lorenzo-vision-pipeline-canonical-ingestion,slide-factory-runs-schema-design}-2026-05-*.md`, `docs/solutions/workflow-issues/slide-factory-pre-merge-shipping-gates-2026-05-08.md`
