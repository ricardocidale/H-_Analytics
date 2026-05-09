---
title: "Slide Factory — Deferred Follow-Ups: Photo Override, Maya Re-Judgment, Re-Suggest, Enzo"
type: feat
status: completed
date: 2026-05-09
origin: |
  docs/plans/2026-05-09-001-feat-slide-factory-override-rebuild-plan.md (deferred list)
  docs/plans/2026-05-09-002-feat-slide-factory-e2e-pipeline-test-plan.md (deferred list)
depth: standard
---

# Slide Factory — Deferred Follow-Ups: Photo Override, Maya Re-Judgment, Re-Suggest, Enzo

## Summary

Four deferred slide factory items, all explicitly scoped out of the override/rebuild plan, are
implemented here as a single follow-up. Together they complete the post-completion admin
experience: photo selection for Slide 3, fresh Maya verdicts on rebuilt slides, contextual LLM
suggestions in the override panel, and verdict reuse when Marco re-triggers an errored run.

---

## Problem Frame

The override panel shipped in PR #41 handles all 13 text slots. Slide 3's interior photo and
the re-suggest/re-judge capabilities were explicitly deferred. Separately, Marco always runs
6 full Maya calls on every retrigger, even when no slot content changed since the last verdict.

---

## Requirements

- R1. An admin can pick a different interior photo for Slide 3 from within the override panel
  after a run reaches `complete`, and the rebuilt deck reflects the new photo.
- R2. When a rebuild is triggered after an admin override, Maya re-judges only the slides whose
  Lucca slots carry `source: "admin-override"`, keeping the prior verdict for unchanged slides.
- R3. Each text slot in the override panel has a "Suggest" button that calls the server for an
  LLM-generated alternative value without navigating away from the panel.
- R4. When Marco re-triggers a run from `error` status, slides whose `agentResults` entry
  already has an `approved` verdict and whose slot content hash matches the prior build are
  skipped — Enzo returns the cached verdict instead of calling Maya again.

---

## Scope Boundaries

- Lorenzo → prompt-native refactor: separate plan required (behavioral stability, major change).
- Lucca → prompt-native refactor: separate plan required (738-line workflow, different risk profile).
- Maya re-judgment on error-retrigger (not override-rebuild): covered by R4 (Enzo), not by R2.
- Full photo picker with upload: admin selects from existing R2 keys already on the property
  record; uploading new photos is out of scope.
- Slide 3 hero photo (first photo in property gallery): auto-selection logic only; no override.

### Deferred to Follow-Up Work

- Maya Pass 2 for all six slides on every rebuild (R2 targets only `admin-override` slides): full
  re-judgment is a separate cost/quality decision once the targeted path is in production.
- Enzo content-hash for slides whose slot content includes structured values (reasons, rows): the
  hash implementation defers to a rolling string comparison to keep U4 bounded.

---

## Context & Research

### Relevant Code and Patterns

- `lib/shared/src/deck-payload-v2.ts` — `slide3PayloadSchema.interiorPhotoUrl` already defined
  as `z.string().optional().nullable()`. The field exists; only the storage and UI are missing.
- `artifacts/api-server/src/slides/build-factory-payload.ts` — `buildSlide3()` reads from
  `luccaDraft`; needs to check for `slide3.interiorPhotoUrl` slot and pass it as a plain URL.
- `artifacts/api-server/src/routes/slide-factory.ts` — PATCH `/slots/:key` already stores any
  key in `luccaDraft`; no route change needed for photo URL storage.
- `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` —
  `OVERRIDE_SLOT_GROUPS` and `SlotEditor`; photo slot needs a new `type: "photo"` variant.
- `artifacts/api-server/src/slides/marco-tools.ts` — `handleInvokeMaya` reads
  `run.luccaDraft` to build slotDrafts; `source` field is accessible for filtering.
- `artifacts/api-server/src/slides/marco-tools.ts` — `handleDispatchSlideTeam` reads
  `luccaDraftKeys: Object.keys(run.luccaDraft ?? {})` to scope slides to each prefix.
- `artifacts/api-server/src/slides/maya.ts` — `runMaya(slideNumber, payloadV2, slotDrafts)`.
- Legacy photo selection reference: `artifacts/hospitality-business-portal/src/features/
  internal-deck/editor/Slide3EditorPanel.tsx` — shows how `interiorPhotoUrl` is read from
  `DeckPayloadV2` and how the editor exposes photo picking from property photos.

### Institutional Learnings

- Slot keys in `luccaDraft` are arbitrary strings; the PATCH route does not restrict them.
  A `slide3.interiorPhotoUrl` key stored as `{ value: "<r2-url>", source: "admin-override", ... }`
  follows the existing LuccaSlotDraft shape without any schema change.
- `buildFactoryPayload` is synchronous and pure; extending it to handle a URL-typed slot has
  no side effects on the rest of the pipeline.
- The `admin-override` source literal was introduced specifically for Tab 6 overrides; filtering
  on this in U2 is intentional and exact.

---

## Key Technical Decisions

- **Photo URL stored in `luccaDraft['slide3.interiorPhotoUrl']`** rather than a new DB column:
  avoids a schema migration, follows the existing override storage pattern, and makes the
  rebuild path automatically include the photo URL when `buildFactoryPayload` runs.

- **Maya re-judgment scope (R2) keyed to `admin-override` source rather than slide number:**
  an admin could override two slots on different slides; the targeted approach re-runs Maya
  only for those slides' `slideN` prefix, not all six. Cheaper, proportional to the edit.

- **Re-suggest endpoint is a lightweight POST returning one suggestion synchronously** rather
  than a streaming slot-draft generation: the panel can show an inline suggestion chip without
  a full SSE stream, matching how existing short AI responses behave.

- **Enzo content hash is a per-slide string comparison of joined slot values** (not a cryptographic
  hash): sufficient for determining whether slot content changed between runs; the cost of a
  false negative (re-running Maya when content is identical) is low.

---

## Open Questions

### Resolved During Planning

- **Where does the photo picker surface?** In `FactoryOverridePanel`, as a new `type: "photo"`
  SlotConfig entry in `OVERRIDE_SLOT_GROUPS`. The property's photos are already loaded on the
  run (the run has `slide3PropertyId`; the slide-factory panel fetches property details).
- **Does `buildFactoryPayload` need to know the photo is in luccaDraft?** Yes — `buildSlide3`
  reads `luccaDraft["slide3.interiorPhotoUrl"]` and if present, sets `slide3.interiorPhotoUrl`
  directly (not as `AuthoredString`; the schema field is a plain string).

### Deferred to Implementation

- **Photo picker UI component shape**: whether to adapt `PropertyPhotoUpload.tsx` directly or
  build a simpler read-only photo-grid-selector inline in `SlotEditor` — defer to implementer.
- **Re-suggest prompt template**: which Lucca drafter's system prompt to reuse for a single-slot
  regeneration — defer to implementer; fall back to a generic "improve this slide copy" prompt
  if no per-slot prompt exists.
- **Enzo hash scope boundary for structured slots** (`slide3.reasons`, `slide5.transformationRows`):
  joining the raw `value` string is sufficient for the initial implementation.

---

## Implementation Units

- U1. **Slide 3 interior photo override in the override panel**

**Goal:** Add a `slide3.interiorPhotoUrl` photo-picker slot to `OVERRIDE_SLOT_GROUPS`, store the
selected R2 URL in `luccaDraft` via the existing PATCH route, and update `buildFactoryPayload`
so the rebuilt deck uses the chosen photo.

**Requirements:** R1

**Dependencies:** None

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`
  (add `{ key: "slide3.interiorPhotoUrl", label: "Interior Photo", type: "photo" }` to
  `OVERRIDE_SLOT_GROUPS`; add photo-picker branch in `SlotEditor`)
- Modify: `artifacts/api-server/src/slides/build-factory-payload.ts`
  (in `buildSlide3`: read `luccaDraft["slide3.interiorPhotoUrl"]?.value` and assign to
  `payload.interiorPhotoUrl` when non-empty)
- Test: `artifacts/api-server/src/tests/build-factory-payload.test.ts`
  (add cases: photo URL in draft → appears in Slide3Payload; null/absent → omitted)

**Approach:**
- `SlotConfig` needs a `type?: "text" | "photo"` discriminator (default `"text"`).
- `SlotEditor` renders a photo-grid when `type === "photo"`: loads photos from the property
  assigned to `slide3PropertyId`, shows thumbnails, on click calls PATCH with
  `{ value: photoR2Url }`. Clear button sends `{ value: "" }` or null.
- `buildSlide3` in `build-factory-payload.ts` checks for the `slide3.interiorPhotoUrl` key
  exactly (same prefix+key pattern already used for text slots) and passes its `value` as the
  plain URL. If the value is an empty string, treat as null/cleared.
- No DB migration — `luccaDraft` is JSONB and already accepts arbitrary keys.

**Patterns to follow:**
- `Slide3EditorPanel.tsx` — existing photo selection UI pattern and how `interiorPhotoUrl`
  flows into `DeckPayloadV2`.
- Existing `SlotEditor` in `SlideFactoryPanel.tsx` for the edit/save/cancel pattern.

**Test scenarios:**
- Happy path: run in `complete`, PATCH `slide3.interiorPhotoUrl` with a valid URL →
  `luccaDraft["slide3.interiorPhotoUrl"].value === url`, `source === "admin-override"`.
- Happy path: `buildFactoryPayload` with `luccaDraft["slide3.interiorPhotoUrl"].value = "https://r2.example.com/photo.jpg"` → `result.slide3.interiorPhotoUrl === "https://r2.example.com/photo.jpg"`.
- Edge case: `value === ""` (cleared) → `result.slide3.interiorPhotoUrl` is null/undefined.
- Edge case: key absent from luccaDraft → `result.slide3.interiorPhotoUrl` is undefined (unchanged).
- Error path: PATCH while status is `rebuilding` → 409 (existing guard, no change needed).

**Verification:**
- `buildFactoryPayload` test passes including new photo-URL cases
- `pnpm run typecheck` clean; `check-magic-numbers` PASS

---

- U2. **Targeted Maya re-judgment on admin-override rebuild**

**Goal:** After the rebuild route fires Franco, run Maya for each slide that has at least one
slot with `source: "admin-override"` in `luccaDraft`. Update `agentResults` for those slides;
leave other slides' verdicts unchanged.

**Requirements:** R2

**Dependencies:** U1 (interiorPhotoUrl stored in luccaDraft; source flag is already set)

**Files:**
- Modify: `artifacts/api-server/src/routes/slide-factory.ts` (rebuild route: after Franco
  write, call a new `runMayaForOverriddenSlides(id)` helper)
- Create: `artifacts/api-server/src/slides/rebuild-maya.ts`
  (exports `runMayaForOverriddenSlides(runId)`)
- Test: `artifacts/api-server/src/tests/slide-factory-pipeline-e2e.test.ts`
  (add rebuild-with-override: Maya verdict updated for overridden slide, unchanged for others)

**Approach:**
- `runMayaForOverriddenSlides(runId)`:
  1. Load the run (`getSlideFactoryRunById`).
  2. Find slide prefixes with at least one `source === "admin-override"` entry in `luccaDraft`
     (e.g., if `slide1.headerSubtitle` has `admin-override`, queue `"slide1"`).
  3. For each affected slide prefix, call `runMaya(slideNumber, payloadV2, slotDrafts)` using
     the same pattern as `marco-tools.ts handleInvokeMaya`.
  4. Write updated `mayaVerdict`/`mayaNotes` to `agentResults` via `updateAgentResult`.
- Called from the rebuild route's async block, after the Franco write succeeds and before
  the status is set to `complete`. The rebuild write order becomes: Franco → Maya → DB write.
- If Maya throws, log the error and continue (non-fatal; stale verdict is acceptable on failure).

**Patterns to follow:**
- `handleInvokeMaya` in `artifacts/api-server/src/slides/marco-tools.ts` (lines 352–376)
  for how to derive `payloadV2` and `slotDrafts` from a run.
- `buildFactoryPayload` for constructing the per-slide DeckPayloadV2 from luccaDraft.

**Test scenarios:**
- Happy path: rebuild after overriding `slide1.headerSubtitle` → `agentResults.slide1.mayaVerdict`
  updated; `agentResults.slide2` through `slide6` unchanged.
- Happy path: rebuild with no `admin-override` slots → Maya not called; all verdicts unchanged.
- Edge case: Maya returns `"block"` for overridden slide → verdict written, rebuild still
  completes (admin can see the block verdict in the panel).
- Error path: Maya throws → error logged, rebuild completes without re-judging that slide.

**Verification:**
- After rebuild with one overridden slot, `agentResults[affectedSlide].mayaVerdict` reflects
  fresh judgment; `agentResults[unaffectedSlide]` retains prior timestamp.
- `pnpm run typecheck` clean.

---

- U3. **In-panel LLM re-suggest button**

**Goal:** Each text slot in `FactoryOverridePanel` gains a "Suggest" button that calls a new
route endpoint, which invokes an LLM against the run's context, and returns a single candidate
replacement value displayed inline as a chip the admin can accept or dismiss.

**Requirements:** R3

**Dependencies:** None (independent of U1/U2)

**Files:**
- Create: `artifacts/api-server/src/routes/slide-factory-suggest.ts`
  (exports `POST /api/lb-slides/factory/runs/:id/slots/:key/suggest`)
- Modify: `artifacts/api-server/src/index.ts` (register new route)
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`
  (`SlotEditor`: add Suggest button, suggestion chip, Accept/Dismiss handlers)
- Test: `artifacts/api-server/src/tests/slide-factory-suggest.test.ts`

**Approach:**
- **Route**: `POST .../slots/:key/suggest`
  - Requires `status === "complete"` (same guard as slot edits).
  - Reads the run's current `luccaDraft[key].value`, the run's canonical context
    (`canonicalSpec`, property name from `slideNPropertyId`), and the existing `deckPayloadV2`
    context assembled by `buildFactoryPayload`.
  - Calls Claude (from the `llm_slot` configured for `research-synthesis` or a new
    `slide-factory-suggest` slot) with a prompt: "Given this slide context, suggest an
    improved version of this slot: [current value]. Return only the replacement text."
  - Returns `{ suggestion: string }`.
  - Rate-limited: one suggestion per 10 seconds per run (server-side; block if in-flight).
- **UI**: Suggest button shows a spinner while in-flight; on success renders the suggestion
  as a bordered chip below the current value with Accept/Dismiss. Accept fills the textarea
  with the suggestion value (does not auto-save; admin still clicks Save). Dismiss clears chip.

**Patterns to follow:**
- `chat.ts` for how to resolve the LLM provider from `admin_resources` at runtime.
- `SlotEditor` edit/save pattern in `SlideFactoryPanel.tsx` for the UI interaction model.
- Existing `HTTP_422_UNPROCESSABLE_ENTITY` / `HTTP_409_CONFLICT` pattern in the factory route
  for guard responses.

**Test scenarios:**
- Happy path: POST suggest on `slide1.headerSubtitle` of a `complete` run → 200, `{ suggestion: "..." }`.
- Edge case: slot key not in luccaDraft → 404 (slot doesn't exist).
- Error path: run status is `rebuilding` → 409.
- Error path: LLM call fails → 502 with `{ error: "Suggestion unavailable — try again." }`.
- Error path: request arrives while a prior suggestion is in-flight for the same run/key →
  429 with `{ error: "Suggestion already in progress for this slot." }`.

**Verification:**
- `POST .../suggest` returns 200 with a non-empty `suggestion` string.
- `pnpm run typecheck` clean; `check-magic-numbers` PASS.

---

- U4. **Enzo: skip Maya when slot content is unchanged on Marco retrigger**

**Goal:** When Marco re-triggers a run that was previously in `complete` or `error` (retrigger
from `error` status), slides whose `agentResults` entry already has an `approved` verdict and
whose slot content (joined `value` strings) matches the same content as when the verdict was
written are skipped — Enzo returns the cached verdict immediately.

**Requirements:** R4

**Dependencies:** None

**Files:**
- Create: `artifacts/api-server/src/slides/minions/enzo.ts`
  (exports `checkVerdictCache(runId, slideNumber): CacheCheckResult`)
- Modify: `artifacts/api-server/src/slides/marco-tools.ts`
  (`handleInvokeMaya`: before calling `runMaya`, call `checkVerdictCache`; if cached, return
  cached verdict)
- Modify: `lib/db/src/schema/slide-factory-runs.ts` (add `slotContentHashes` optional JSONB
  field to `slideFactoryRuns` — `Record<string, string>` keyed by slide prefix, value is
  joined slot content string; null on initial build)
- Create: `lib/db/migrations/<next-N>_slide_factory_slot_hashes.sql` (ALTER TABLE ADD COLUMN)
- Test: `artifacts/api-server/src/tests/marco.test.ts` (add Enzo cache-hit / cache-miss cases)

**Approach:**
- **Content hash**: join all slot values for a given slide prefix in alphabetical key order
  as a plain concatenated string (no crypto, no JSON; this is a cache check not a security
  primitive). Example: for `slide1.*` slots sorted by key, concatenate `value` fields.
- **Write on Marco build**: `handleDispatchSlideTeam` already assembles per-slide slot lists;
  after building, write the content hash to `slotContentHashes[slidePrefix]` via an
  `updateSlideFactoryRun` patch.
- **Read on retrigger**: `handleInvokeMaya` calls `checkVerdictCache(runId, slideNumber)`:
  1. Load `run.agentResults[slideNumber]` — if verdict is not `"approved"`, cache miss.
  2. Compute current content hash for the slide prefix from `run.luccaDraft`.
  3. Compare against `run.slotContentHashes[slidePrefix]` — if equal, return cached verdict
     as `{ verdict: run.agentResults[slideNumber].mayaVerdict, headline: null, notes: run.agentResults[slideNumber].mayaNotes, fromCache: true }`.
  4. If mismatched or no cached hash, return `{ fromCache: false }`.
- **DB column**: `slot_content_hashes jsonb` nullable on `slide_factory_runs`. Added via Drizzle
  migration. Existing rows have null (treated as cache miss).

**Patterns to follow:**
- Drizzle migration generation: `pnpm --filter @workspace/db run generate` after adding
  the column to `lib/db/src/schema/slide-factory-runs.ts`.
- `marco-tools.ts` `handleDispatchSlideTeam` for where to write hashes after slot assembly.
- `updateSlideFactoryRun` patch pattern for writing the hash map.

**Test scenarios:**
- Happy path (cache hit): retrigger with identical slot content → `handleInvokeMaya` returns
  cached `mayaVerdict` without calling `runMaya`; log shows "Enzo: cache hit for slide1".
- Happy path (cache miss): retrigger after slot edit → `runMaya` called; fresh verdict written.
- Edge case: `slotContentHashes` is null (first build, no prior hash) → cache miss, Maya runs.
- Edge case: prior verdict is `"rejected"` or `"block"` → cache miss (don't cache non-approved
  verdicts; force re-judgment after a block).
- Integration: full Marco run writes hash; retrigger reads hash and skips Maya for unchanged slides.

**Verification:**
- `pnpm --filter @workspace/scripts run check:migration-guards` PASS after migration.
- `pnpm run typecheck` clean.
- `check-magic-numbers` PASS.
- Marco test suite passes including Enzo cache-hit/miss cases.

---

## System-Wide Impact

- **`buildFactoryPayload`**: reading `luccaDraft["slide3.interiorPhotoUrl"]` is additive; no
  change to how other slots are built.
- **Rebuild route**: U2 extends the async block (Maya after Franco) — if Maya throws, the
  rebuild still completes; verdict staleness is acceptable and already the pre-U2 behavior.
- **`slotContentHashes` column**: nullable, migration-guarded; existing rows and tests handle
  null as cache miss with no behavioral change.
- **Suggest endpoint**: new route, new file; no modification to the existing factory routes.
- **Unchanged invariants**: the 13-slot `OVERRIDE_SLOT_GROUPS` text slots are untouched;
  existing E2E test suite (15 cases) continues to pass without modification.

---

## Risks & Dependencies

| Risk | Mitigation |
|---|---|
| `slide3.interiorPhotoUrl` in luccaDraft causes issues in existing tests that check luccaDraft shape | The E2E test's `STUB_LUCCA_DRAFT` only has the 13 text keys; new key is additive and unaffected |
| Maya re-judgment in rebuild route increases latency | Capped to overridden slides only (≤ 6, typically 1–2); Maya runs async and doesn't block the 202 response |
| LLM cost for re-suggest endpoint | Rate-limited per run/key; suggest is on-demand, not automatic |
| `slot_content_hashes` migration drift if schema changes after branch divergence | Always generate via `pnpm --filter @workspace/db run generate`; never hand-craft the SQL |

---

## Sources & References

- Origin plans: `docs/plans/2026-05-09-001-feat-slide-factory-override-rebuild-plan.md`,
  `docs/plans/2026-05-09-002-feat-slide-factory-e2e-pipeline-test-plan.md`
- Schema: `lib/shared/src/deck-payload-v2.ts` (slide3PayloadSchema.interiorPhotoUrl)
- Build assembly: `artifacts/api-server/src/slides/build-factory-payload.ts`
- Maya invocation: `artifacts/api-server/src/slides/marco-tools.ts` (handleInvokeMaya)
- Legacy photo editor: `artifacts/hospitality-business-portal/src/features/internal-deck/editor/Slide3EditorPanel.tsx`
- Override panel: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`
