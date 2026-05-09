---
title: "Slide Factory — E2E Pipeline Integration Test"
type: feat
status: active
date: 2026-05-09
origin: |
  docs/plans/2026-05-07-001-feat-slide-factory-completion-plan.md (U9 deferred follow-up)
  docs/plans/2026-05-08-001-feat-slide-factory-deck-render-and-r2-upload-plan.md (§Deferred to Follow-Up Work)
depth: standard
---

# Slide Factory — E2E Pipeline Integration Test

## Summary

The slide factory pipeline has no integration test covering the full route surface. Two prior
plans deferred this work explicitly: the completion plan (U9) and the deck-render plan both
named `slide-factory-pipeline-end-to-end.test.ts` as a thin follow-up once a real producer
(Franco) existed to assert against. Franco shipped in PR #41, and the override/rebuild loop
shipped in `feat/slide-factory-override-rebuild`. This plan writes that test.

---

## Problem Frame

The slide factory pipeline spans 9 API endpoints across 9 status values. The current test
coverage is:

| Layer | Coverage |
|---|---|
| Unit — `buildFactoryPayload` | `build-factory-payload.test.ts` ✅ |
| Unit — Marco tool dispatch | `marco.test.ts` ✅ |
| Unit — Rebecca tools | `rebecca-slide-factory-tools.test.ts` ✅ |
| Unit — Lucca draft serialization | `lucca-draft.test.ts` ✅ |
| Integration — route status guards and transitions | ❌ **missing** |
| Integration — download route (`deckR2Key` gating) | ❌ **missing** |
| Integration — override/rebuild loop | ❌ **missing** |

Without a route-layer integration test:
- Status guard bugs (409 on wrong status) go undetected until manual smoke tests.
- The download route's 422 branch (deck not yet rendered) and 200 branch (PDF stream) are never
  exercised automatically.
- The rebuild loop (status: `rebuilding` → `complete` + fresh `deckR2Key`) introduced in
  `feat/slide-factory-override-rebuild` has no regression coverage.

---

## Requirements

- **R1.** A single test file exercises every route in `routes/slide-factory.ts` that mutates
  state (create, brief, accept-brief, properties, approve-all-slots, trigger-build,
  trigger-ingestion, cancel, slots PATCH, rebuild), plus the read routes (list, get, download).
- **R2.** The test drives the happy path: `new` → `brief_ready` → `ingesting` → `ingested` →
  `drafting` → `draft_review` → `building` → `complete` → download succeeds.
- **R3.** The test drives the rebuild loop: `complete` → slot edit stamps `"admin-override"` →
  `rebuilding` → `complete` (new `deckR2Key`) → download succeeds.
- **R4.** Status-guard violations return 409. At least three guards are covered: accepting a
  brief on a non-`new` run, triggering a build on a non-`draft_review` run, and rebuilding on
  a non-`complete` run.
- **R5.** No real network, DB, LLM, Playwright, or R2 calls. All external dependencies are
  mocked.
- **R6.** The fire-and-forget background runners (`runLorenzoIngestion`, `runLuccaDraft`,
  `runMarco`, and the rebuild's `runFranco`) are mocked to complete synchronously with correct
  state updates so the test can observe downstream state without sleeping.
- **R7.** `pnpm run typecheck` clean, `check-magic-numbers` PASS, `pnpm test` PASS.

---

## Scope Boundaries

- **Out:** True E2E with a real database. The test mocks storage — the value is route-logic
  and state-machine coverage, not DB driver coverage.
- **Out:** Pixel-diff or PDF-content verification. Franco is mocked; the test asserts that
  `deckR2Key` is written and the download route returns 200 with `content-type: application/pdf`.
- **Out:** LLM output fidelity. Lorenzo, Lucca, Marco tool loops are mocked; the test
  verifies status transitions and route guards only.
- **Out:** Browser or UI testing. The frontend Tab tests remain in `Tab6Download.test.tsx`.

---

## Context & Research

### Existing Patterns to Follow

**`reference-brands-route.test.ts`** is the canonical pattern for route integration tests
in this repo:
- `express` + `supertest` with a real Express app registered in `beforeAll()`
- `vi.mock('path/to/module', () => ({ fn: vi.fn() }))` declared before imports (vitest hoisting)
- `requireAdmin` and `getAuthUser` mocked as passthrough / returning a synthetic admin user
- Storage functions mocked via `vi.fn().mockResolvedValue(...)` — no real DB
- Assertions: `expect(res.status).toBe(N)` + `expect(res.body.field).toBe(expected)`

**In-memory store for mock state:** Because the slide factory routes call `getSlideFactoryRun`
and `updateSlideFactoryRun` repeatedly across multiple HTTP calls in the same test, the mocks
must share state. The pattern is a module-level `Map<number, SlideFactoryRun>` that the mocked
storage functions read/write.

**Fire-and-forget draining:** `void runLorenzoIngestion(id)` queues an async function. With
synchronous mocks, `await Promise.resolve()` (one or two microtask ticks) is enough to drain
the queue before asserting downstream state. If not, `await new Promise(r => setImmediate(r))`
is the next level.

**Auth bypass pattern:**
```typescript
vi.mock('../auth', () => ({
  requireAdmin: (_req: Request, _res: Response, next: NextFunction) => next(),
  getAuthUser: () => ({ id: 1, role: 'admin' }),
}));
```

### Key Storage Module

`artifacts/api-server/src/storage/slide-factory-runs.ts` exports:
- `createSlideFactoryRun(userId)` → `SlideFactoryRun`
- `getSlideFactoryRun(id, userId)` → `SlideFactoryRun | null`
- `getSlideFactoryRunById(id)` → `SlideFactoryRun | null`
- `listSlideFactoryRuns(userId)` → `SlideFactoryRun[]`
- `updateSlideFactoryRun(id, patch)` → `SlideFactoryRun`
- `updateAgentResult(id, slideNumber, result)` → `SlideFactoryRun`

### Background Runner Mocks

The three fire-and-forget runners + rebuild's Franco each need mocks that mirror what the real
functions write to the DB:

| Runner | What real fn writes | Mock must write |
|---|---|---|
| `runLorenzoIngestion(id)` | `{ status: 'ingested', canonicalSpec: {...}, canonicalPngKeys: [] }` | Same via mocked `updateSlideFactoryRun` |
| `runLuccaDraft(id)` | `{ status: 'draft_review', luccaDraft: { ...13 slots... } }` | Same; use minimal stub slots |
| `runMarco(id)` | `{ status: 'complete', agentResults: {...}, completedAt, deckR2Key }` | Same; use stub `deckR2Key: 'factory-runs/1/deck.pdf'` |
| `runFranco(id, opts)` | returns `{ deckR2Key }` (rebuild caller writes status+key atomically via route) | Return `{ deckR2Key: 'factory-runs/1/deck-v2.pdf' }` |

**Rebuild flow note:** The rebuild route calls `runFranco` and then does the DB write itself
(atomic status+deckR2Key). The mock for `runFranco` only needs to return `{ deckR2Key }` — the
route handles the write.

### Download Route Behaviour

`GET /api/lb-slides/factory/runs/:id/download` (routes/slide-factory.ts):
- 422 if `run.status !== 'complete'` or `!run.deckR2Key`
- Calls `getStorageProviderAsync()` → `sp.readObject(run.deckR2Key)` → pipes buffer back with
  `Content-Type: application/pdf` header
- Mock `getStorageProviderAsync` to return `{ readObject: vi.fn().mockResolvedValue(Buffer.from('PDF')) }`

---

## Key Technical Decisions

- **Single test file covering all endpoints.** The state machine is sequential; a single
  `describe` block with a shared in-memory store is simpler than per-endpoint files that each
  need to bootstrap to a specific status.
- **Mock storage with a stateful in-memory Map, not per-test `.mockResolvedValue`.** The route
  makes multiple calls to `getSlideFactoryRun` and `updateSlideFactoryRun` within a single HTTP
  request. A Map that the mocks share preserves consistency across calls.
- **Import the route registration function, not the full server.** `registerSlideFactoryRoutes`
  (or equivalent) is imported and registered on a bare Express app in `beforeAll`. This avoids
  pulling in unrelated middleware (session store, Sentry, static files) that would require more
  mocks.
- **Verify fire-and-forget completion with `await Promise.resolve()` ticks.** Two microtask
  ticks (`await Promise.resolve(); await Promise.resolve()`) are sufficient to drain synchronous
  mocks. If a mock has a real `await` in it (even a resolved one), `setImmediate` is used.

---

## Implementation Units

### U1 — Write `slide-factory-pipeline-e2e.test.ts`

**Goal:** Single integration test file covering the happy path (new → complete → download),
the rebuild loop (complete → rebuilding → complete → fresh download), and three status guards.

**Files:**
- Create: `artifacts/api-server/src/tests/slide-factory-pipeline-e2e.test.ts`

**Patterns to follow:**
- `reference-brands-route.test.ts` for Express + supertest setup, auth mock, and mock module
  shape
- `rebecca-slide-factory-tools.test.ts` for the in-memory store pattern (that file uses a
  per-test `mockRun` but the E2E test needs a shared store)

**Approach:**

1. **Mock declarations (top of file, before imports):**
   ```typescript
   // In-memory store — shared across all describe blocks
   let store = new Map<number, SlideFactoryRun>();
   let nextId = 1;
   
   vi.mock('../storage/slide-factory-runs', () => ({
     createSlideFactoryRun: vi.fn((userId) => {
       const run = { id: nextId++, userId, status: 'new', ... };
       store.set(run.id, run);
       return Promise.resolve(run);
     }),
     getSlideFactoryRun: vi.fn((id) => Promise.resolve(store.get(id) ?? null)),
     getSlideFactoryRunById: vi.fn((id) => Promise.resolve(store.get(id) ?? null)),
     updateSlideFactoryRun: vi.fn((id, patch) => {
       const run = { ...store.get(id)!, ...patch };
       store.set(id, run);
       return Promise.resolve(run);
     }),
     listSlideFactoryRuns: vi.fn(() => Promise.resolve([...store.values()])),
     updateAgentResult: vi.fn((id, slideNum, result) => {
       const run = { ...store.get(id)!, agentResults: { ...store.get(id)!.agentResults, [slideNum]: result } };
       store.set(id, run);
       return Promise.resolve(run);
     }),
   }));
   
   vi.mock('../slides/lorenzo-ingestion', () => ({
     runLorenzoIngestion: vi.fn(async (id) => {
       const run = store.get(id)!;
       store.set(id, { ...run, status: 'ingested', canonicalSpec: { version: 1 }, canonicalPngKeys: [] });
     }),
   }));
   
   vi.mock('../slides/lucca-draft', () => ({
     runLuccaDraft: vi.fn(async (id) => {
       const run = store.get(id)!;
       store.set(id, { ...run, status: 'draft_review', luccaDraft: STUB_LUCCA_DRAFT });
     }),
   }));
   
   vi.mock('../slides/marco', () => ({
     runMarco: vi.fn(async (id) => {
       const run = store.get(id)!;
       store.set(id, {
         ...run, status: 'complete',
         deckR2Key: `factory-runs/${id}/deck.pdf`,
         completedAt: new Date(),
         agentResults: STUB_AGENT_RESULTS,
       });
     }),
   }));
   
   vi.mock('../slides/minions/franco', () => ({
     runFranco: vi.fn(async (id, opts) => {
       return { deckR2Key: `factory-runs/${id}/deck-v2.pdf` };
     }),
   }));
   
   vi.mock('../providers/storage', () => ({
     getStorageProviderAsync: vi.fn(() => Promise.resolve({
       readObject: vi.fn(() => Promise.resolve(Buffer.from('%PDF-1.4 mock'))),
       uploadBuffer: vi.fn(() => Promise.resolve()),
     })),
   }));
   ```

2. **Express app setup in `beforeAll`:**
   Register the slide factory routes on a bare `express()` app with the auth mock already in
   place. `STUB_LUCCA_DRAFT` has 13 stub slots covering the 13 keys in `OVERRIDE_SLOT_GROUPS`.

3. **Test suites:**

   **Happy path (sequential, single run):**
   - `POST /api/lb-slides/factory/runs` → 201, `id: 1`, `status: 'new'`
   - `POST .../brief` (body: `{ r2Key, filename }`) → 200, `status: 'new'`
   - `POST .../accept-brief` → 202, `status: 'ingesting'`; drain microtasks; re-GET → `status: 'ingested'`
   - `POST .../properties` → 202, `status: 'drafting'`; drain; re-GET → `status: 'draft_review'`
   - `POST .../approve-all-slots` → 200, all slots have `approved: true`
   - `POST .../trigger-build` → 202, `status: 'building'`; drain; re-GET → `status: 'complete'`, `deckR2Key` set
   - `GET .../download` → 200, `Content-Type: application/pdf`

   **Rebuild loop:**
   - Start from the `complete` run above
   - `PATCH .../slots/slide1.headerSubtitle` → 200, `source: 'admin-override'`
   - `POST .../rebuild` → 202, `status: 'rebuilding'`; drain; re-GET → `status: 'complete'`, `deckR2Key: 'factory-runs/1/deck-v2.pdf'`
   - `GET .../download` → 200, `Content-Type: application/pdf`

   **Status guards (409):**
   - Accept brief on a `complete` run → 409
   - Trigger build on a `new` run → 409
   - Rebuild on a `building` run → 409

   **Download guards:**
   - `GET .../download` on a `draft_review` run → 422

4. **`STUB_LUCCA_DRAFT`:** A minimal `Record<string, LuccaSlotDraft>` with the 13 keys that
   `SlideFactoryPanel.tsx`'s `OVERRIDE_SLOT_GROUPS` expects. Each slot: `{ value: 'stub', approved: false, approvedAt: null, source: 'lucca' }`.

**Verification:**
- All test assertions pass
- `pnpm run typecheck` clean
- `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` PASS

---

## System-Wide Impact

- **No new routes, no new DB schema.** The test file is purely additive.
- **`STUB_LUCCA_DRAFT` must use the 13 slot keys.** If new slots are added to the UI, the stub
  needs updating. The 13 keys are the canonical set defined by `OVERRIDE_SLOT_GROUPS` in
  `SlideFactoryPanel.tsx` — copying them here as a literal list in the test is correct; the
  test should break if the UI diverges from the route.

---

## Verification

- [ ] `pnpm test artifacts/api-server/src/tests/slide-factory-pipeline-e2e.test.ts` — all cases PASS
- [ ] `pnpm run typecheck` — clean
- [ ] `scripts/node_modules/.bin/tsx scripts/src/check-magic-numbers.ts` — PASS

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `feat/slide-factory-override-rebuild` not merged when this lands | The rebuild suite (`PATCH .../slots/:key`, `POST .../rebuild`) needs those routes. Either merge first or conditionally scope the rebuild tests to `xdescribe` and flip when merged. |
| Microtask draining insufficient for fire-and-forget completion | Use `await new Promise(r => setImmediate(r))` as a stronger flush if `await Promise.resolve()` ticks don't drain the mock runners. |
| Import path for `runFranco` differs from mock path | Check whether the rebuild route imports from `../slides/minions/franco` or `../slides/franco` — the mock module path must match exactly. |

---

## Open Questions

### Deferred to Implementation

- **Import path for the route registration function:** Check whether `slide-factory.ts`
  exports a function like `registerSlideFactoryRoutes(app)` or just exports `router`.
  If it exports a `Router`, mount it with `app.use('/', router)` in the test app setup.
- **`cancel` route mock shape:** The cancel route sets `status: 'error'` — verify the exact
  field patch to complete the mock's coverage.
