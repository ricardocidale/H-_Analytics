---
title: "Slide Factory — Post-Completion Override + Lightweight Rebuild"
type: feat
status: completed
date: 2026-05-09
---

# Slide Factory — Post-Completion Override + Lightweight Rebuild

## Summary

After a factory run reaches `status=complete`, allow an admin to override any of the 15 LLM-authored slot values stored in `slide_factory_runs.luccaDraft`, then trigger a lightweight rebuild that re-renders the PDF without re-running Lorenzo, Lucca, or the 6 swarm teams. The rebuild path (`buildFactoryPayload` → `buildLbPayloadFromFactoryRun` → Franco render → R2 upload) already exists deterministically; this plan wires it to a new `POST /rebuild` endpoint, a new `rebuilding` status, and a structured slot-override UI embedded in Tab 6 (FactoryDownloadTab).

A latent serialization bug (`parseReasons` / `parseRows` in `build-factory-payload.ts` assume JSON but Lucca writes text format) must be fixed first — it silently drops slide 3 and slide 5 content from any override rebuild today.

---

## Problem Frame

The factory pipeline writes LLM-authored copy into `luccaDraft` and then renders a PDF. Once `status=complete`, the slots are frozen: the slot-PATCH endpoint returns 409, and there is no re-render path. An admin who needs to fix a word, sharpen a bullet, or correct a mis-drafted reason has no option other than discarding the run and restarting from scratch — an expensive path given the full Lorenzo → Lucca → Marco → swarms pipeline (~5–10 min).

The lightweight rebuild path (`buildFactoryPayload` is already synchronous; Franco is the only I/O step) means the right fix is plumbing, not a new pipeline. The override UI naturally lives in Tab 6 (already shown for `complete` runs) so the admin can edit and rebuild without leaving the download tab.

---

## Requirements

- R1. An admin can edit any authored slot value on a `complete` run from the admin UI.
- R2. Each slot edit is validated against the `DeckPayloadV2` character-limit constants before persistence.
- R3. Structured slots (`slide3.reasons`, `slide5.transformationRows`) are surfaced as repeating form groups, not raw textareas.
- R4. After at least one override is saved, the admin can trigger a lightweight rebuild that re-renders the PDF via Franco without re-running any LLM stage.
- R5. While rebuilding, the run shows a `rebuilding` status; the Tab 6 UI displays a progress indicator and stays visible (no tab navigation away).
- R6. Dino pixel-diff (Pass 1) reruns after the override rebuild; its results are stored in `agentResults` per slide.
- R7. Rebecca can override slots and trigger a rebuild on a `complete` run through the same API (agent-native parity, CLAUDE.md §7).
- R8. `buildFactoryPayload` correctly handles the plain-text serialization format that Lucca writes for `slide3.reasons` and `slide5.transformationRows`.
- R9. `check:magic-numbers`, `typecheck`, and the unit test suite pass after every unit.

---

## Scope Boundaries

- Re-running Lucca, Lorenzo, or any swarm agent on an override rebuild is out of scope — this is a text-edit path, not a re-draft path.
- Maya content judge (Pass 2 — Opus vision calls) does not rerun on override rebuild. The initial build already captured content judgment; a text edit does not warrant 6 Opus calls.
- Photo slot overrides (Slide 3 interior photo, hero photo captions) are out of scope — photo editing requires a separate picker flow.
- Per-property `property_deck_payloads` and `SlideNEditorPanel` are not affected; they remain a separate editorial system.
- The per-property `GET /api/properties/:id/deck.pdf` route is not touched by this plan.

### Deferred to Follow-Up Work

- Maya Pass 2 re-judgment after override rebuild: separate plan once the override UX is validated.
- Photo slot override UI: separate plan.
- "LLM re-suggest" button per slot in the override panel: admin can ask Rebecca in chat for a re-draft; explicit in-panel re-suggest button is future work.

---

## Context & Research

### Relevant Code and Patterns

- `lib/db/src/schema/slide-factory-runs.ts` — `SLIDE_FACTORY_RUN_STATUSES`, `LuccaSlotDraft` (source: `"lucca" | "admin"`), `SlideFactoryRun` type
- `artifacts/api-server/src/slides/build-factory-payload.ts` — `buildFactoryPayload(run)`: synchronous `luccaDraft → DeckPayloadV2`; `parseReasons` and `parseRows` use `JSON.parse` but Lucca writes text format (see U1)
- `artifacts/api-server/src/slides/lucca-draft.ts` — `serializeReasons` (line 270): `"Label: detail\n\nLabel: detail"` format; `serializeRows` (line 274): `"feature | existing | proposed\n"` format
- `artifacts/api-server/src/slides/minions/franco.ts` — Playwright render + R2 upload; used by U3 rebuild endpoint
- `artifacts/api-server/src/routes/slide-factory.ts` — existing `PATCH .../slots/:key` (draft_review guard at line ~340); existing `trigger-build`
- `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` — `FactoryDownloadTab` (line 1589); `PlaceholderTab`; `statusToTab` (line 203); `SlotRow` reuse candidate from `FactoryLuccaTab`
- `lib/shared/src/deck-payload-v2.ts` — per-slot `SLIDE{N}_{FIELD}_MAX` / `_COUNT` constants; authoritative constraint source for the override UI
- `artifacts/api-server/src/chat/rebecca-tools.ts` — `update_slide_factory_slot` (line 332, `draft_review` description); `produce_slide_factory_deck` pattern for parity
- `artifacts/api-server/src/tests/build-factory-payload.test.ts` — test pattern for `buildFactoryPayload`
- `artifacts/api-server/src/slides/dino.ts` / `dino-render.ts` — Dino pixel-diff; `runDino` entry point

### Institutional Learnings

- `docs/solutions/architecture-patterns/slide-factory-runs-schema-design-2026-05-07.md` — status is the single source of truth; tab position is derivable from status. Adding `rebuilding` follows this pattern exactly.
- `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md` — Builder is assemble-only (no re-drafting). The override is a second admin-endorsement pass on the `luccaDraft` layer; the replay calls `buildFactoryPayload` deterministically, then Franco. Inspector (Dino) still runs.
- `docs/solutions/developer-experience/programmatic-data-path-smoke-testing-2026-05-08.md` — `smoke-producer.ts` is the fastest validation harness for the `buildFactoryPayload` replay path; extend it to verify override rebuilds.
- `docs/solutions/architecture-patterns/slide-payload-slot-specific-schema-2026-05-03.md` — each slot has a distinct Zod contract; enforce `SLIDE{N}_{FIELD}_MAX` as live character-count meters, not just save-time validation.
- `docs/solutions/architecture-patterns/slide-factory-financial-data-fork-diagnostic-vs-packaging-2026-05-06.md` — Slide 6 pro forma table is engine-only, not in `luccaDraft`; only `disclaimer` is editable on Slide 6.

---

## Key Technical Decisions

- **`source: "admin-override"` distinguishes post-completion edits.** The `LuccaSlotDraft.source` union gains a third literal `"admin-override"`. Slots edited via Tab 6 carry this value; `hasOverrides` is derived by checking any slot for `source === "admin-override"`. After a successful rebuild, the endpoint resets those slots to `source: "admin"` in the **same DB write** that sets `status = "complete"` and updates `deckR2Key`. Combining all three writes into one transaction ensures no partial-failure state where `deckR2Key` is updated but status is stuck in `rebuilding`. This avoids a separate boolean flag on the run, which the schema design doc explicitly forbids.

- **`rebuilding` is the correct new status.** The existing `building` status maps to Tab 5 (agents view). A re-render triggered from Tab 6 should stay on Tab 6 — it is not a full Marco-swarm run. `rebuilding` routes to `f-download` in `statusToTab`, preventing the tab from jumping to Tab 5 and confusing the admin. No Drizzle migration is needed: `status` is a `text()` column typed via `$type<SlideFactoryRunStatus>()`, so adding the literal to `SLIDE_FACTORY_RUN_STATUSES` is sufficient.

- **Rebuild endpoint calls `buildFactoryPayload` + Franco in-process (not Marco).** The override rebuild skips all LLM stages. The endpoint calls `buildFactoryPayload(run)` (synchronous) → `buildLbPayloadFromFactoryRun` → Franco. If Dino is available, it screenshots the rendered pages before Franco uploads the PDF and stores results in `agentResults`. The full Marco orchestrator is not involved.

- **`parseReasons` and `parseRows` must handle both the JSON format (smoke fixture) and the text format (live Lucca output).** The fix tries `JSON.parse` first; on failure, falls back to the text-format parser. This is backward-compatible: smoke fixtures continue to work with JSON, live runs work with text. The text parsers are `"Label: detail"` splitting on `"\n\n"` for reasons, and `"feature | existing | proposed"` splitting on `"\n"` for rows.

- **Override UI is embedded in FactoryDownloadTab, not a new tab.** Adding a seventh tab would break the "tab position = status" invariant. The override panel lives below the download button, collapsed by default, expandable via a disclosure. The `rebuilding` status shows a rebuild-in-progress indicator replacing the download button temporarily.

- **`update_slide_factory_slot` Rebecca tool is extended, not duplicated.** The existing tool description is updated to accept `complete` and `rebuilding` in addition to `draft_review`. A new `rebuild_slide_factory_deck` tool is added. One tool per distinct server action.

---

## Open Questions

### Resolved During Planning

- **Does the status column need a DB migration?** No — `status` is `text()` with a TypeScript `$type<>` annotation. No CHECK constraint exists in the schema. Adding `rebuilding` to the TS enum is sufficient.
- **Should `reasons` and `transformationRows` be stored as JSON or text in the override path?** When the admin saves a structured override, the API receives a JSON array and stores it as JSON string in `luccaDraft`. The existing `parseReasons`/`parseRows` JSON path handles this correctly after U1's fix.
- **Does `buildFactoryPayload` need a DB fetch?** No — it is fully synchronous given a loaded `SlideFactoryRun`. The rebuild endpoint loads the run from DB, then calls `buildFactoryPayload` in-process.
- **What format does the override UI use when serializing reasons/rows back to `luccaDraft`?** Text format (same as Lucca's original output) — `"Label: detail\n\n"` for reasons, `"feature | existing | proposed\n"` for rows, `"• bullet"` for vision bullets. After U1 fixes `parseReasons`/`parseRows` to handle both JSON and text, the text format is handled by the fallback parser. Sending text from the UI keeps the serialization format consistent across the Lucca and admin-override code paths and avoids a round-trip conversion. The U4 test scenario for reasons is updated accordingly to use text format.

### Deferred to Implementation

- Exact Dino integration in the rebuild endpoint: confirm whether `runDino` can be called from the route handler given its Playwright dependency or whether it needs to run in the background after the PDF is uploaded.
- Whether the override panel should auto-save slots (debounced) or require explicit save buttons — leave to implementer judgment based on UX feel; either pattern is acceptable.

---

## Implementation Units

- U1. **Fix `buildFactoryPayload` serialization parsers**

**Goal:** Make `parseReasons` and `parseRows` handle the actual Lucca text format in addition to JSON, so the override rebuild path (`buildFactoryPayload` called on a real completed run) produces correct `DeckPayloadV2` output.

**Requirements:** R8, R9

**Dependencies:** None

**Files:**
- Modify: `artifacts/api-server/src/slides/build-factory-payload.ts`
- Modify (test): `artifacts/api-server/src/tests/build-factory-payload.test.ts`

**Approach:**
- `parseReasons(raw)`: try `JSON.parse` first (existing). On `SyntaxError`, fall back to splitting on `"\n\n"` and parsing each line as `"label: detail"` — take everything before the first `": "` as `label` and everything after as `detail`. Return `null` if fewer than 1 valid pair parsed.
- `parseRows(raw)`: try `JSON.parse` first (existing). On `SyntaxError`, fall back to splitting on `"\n"`, each line as `"feature | existing | proposed"` splitting on `" | "`. Return `null` if fewer than 1 valid row parsed.
- Both parsers remain pure functions with no I/O.

**Patterns to follow:** Existing `parseReasons` and `parseBullets` in `build-factory-payload.ts`

**Test scenarios:**
- Happy path — `parseReasons` with JSON input `'[{"label":"View","detail":"Panoramic lake"}]'` → returns `[{label: "View", detail: "Panoramic lake"}]`
- Happy path — `parseReasons` with Lucca text input `"View: Panoramic lake\n\nHistory: Turn-of-century"` → returns both reasons correctly
- Happy path — `parseRows` with JSON input `'[{"feature":"Pool","existing":"None","proposed":"Heated infinity"}]'` → parses correctly
- Happy path — `parseRows` with Lucca pipe input `"Pool | None | Heated infinity\nSpa | Closed | Full service"` → returns 2 rows
- Edge case — `parseReasons` with malformed string `"no colon here"` → returns 1 item with empty `detail` or null (implementer decides, document the choice)
- Edge case — `parseRows` with single-column line missing `|` separators → returns null
- Regression — existing `build-factory-payload.test.ts` test with smoke-fixture JSON passes unchanged

**Verification:** `pnpm --filter @workspace/api-server run test -- --testPathPattern build-factory-payload` passes with all new scenarios; `pnpm run typecheck` clean; `check:magic-numbers` PASS.

---

- U2. **Schema + API: `rebuilding` status, `admin-override` source, slot PATCH relaxation, rebuild endpoint**

**Goal:** Add the `rebuilding` status literal, the `admin-override` source literal, relax the slot-PATCH status guard, and expose a `POST /rebuild` endpoint that calls `buildFactoryPayload` + Franco.

**Requirements:** R1, R4, R5, R8

**Dependencies:** U1 (rebuild endpoint calls `buildFactoryPayload` which U1 fixes)

**Files:**
- Modify: `lib/db/src/schema/slide-factory-runs.ts`
- Modify: `artifacts/api-server/src/routes/slide-factory.ts`
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` (add `"rebuilding"` to `statusBadge` map — the TypeScript union update in the schema triggers a type error here)
- Modify (test): `artifacts/api-server/src/tests/slide-factory.test.ts` *(create if absent)*

**Approach:**

*Schema changes (no DB migration):*
- Add `"rebuilding"` to `SLIDE_FACTORY_RUN_STATUSES` array with comment `// Tab 6: lightweight re-render in progress`
- Add `"admin-override"` to `LuccaSlotDraft.source` union: `"lucca" | "admin" | "admin-override"`

*Slot PATCH relaxation:*
- Current guard: `run.status !== "draft_review"` → 409
- New guard: `run.status !== "draft_review" && run.status !== "complete"` → 409. This denies `rebuilding` implicitly (it is neither `draft_review` nor `complete`), as confirmed by the test scenario below.
- When `run.status === "complete"`, force `draft.source = "admin-override"` regardless of what the caller sends
- Keep the existing `draft_review` path unchanged (source stays whatever caller sends)

*`POST /api/lb-slides/factory/runs/:id/rebuild`:*
- Accepts: `complete` status only (deny with 409 on any other status, including `rebuilding` to prevent double-trigger)
- Immediately sets `status = "rebuilding"` (synchronous DB write before async work)
- Calls `buildFactoryPayload(run)` (pure, in-process)
- Calls `buildLbPayloadFromFactoryRun(run, factoryPayload)` to add DB-sourced property data
- Calls Franco to render and upload PDF; updates `deckR2Key`
- Runs Dino per-slide pixel-diff (best-effort: if Playwright is unavailable in test environment, log and skip without error)
- On success: atomically (single DB write) set `status = "complete"`, `deckR2Key = <new key>`, `completedAt = now`, and reset all `source === "admin-override"` slots to `source === "admin"` — all in one update to prevent the partial-failure state where `deckR2Key` is updated but status is stuck in `rebuilding`
- On Franco failure: set `status = "error"`, preserve `luccaDraft` overrides unchanged (admin can fix and retry via the existing error flow or `rebuild_slide_factory_deck` Rebecca tool)
- Log activity: `logActivity(req, "update", "slide_factory_run", id, "override-rebuild")`

**Patterns to follow:** Existing `POST .../trigger-build` handler for status transitions; `runFranco` call pattern in `marco-tools.ts`

**Test scenarios:**
- Happy path — POST rebuild on a `complete` run → 202 accepted; after completion status is `complete`, `deckR2Key` updated
- Error path — POST rebuild on a `draft_review` run → 409 conflict
- Error path — POST rebuild on a `rebuilding` run → 409 conflict (prevents double-trigger)
- Slot PATCH on a `complete` run with `value: "new text"` → 200, stored with `source: "admin-override"`
- Slot PATCH on a `complete` run with `approved: true` and no `value` → only approval flag updated, `source` forced to `"admin-override"`
- Slot PATCH on a `rebuilding` run → 409

**Verification:** All tests pass; `pnpm run typecheck` clean; `check:magic-numbers` PASS; `check:migration-guards` PASS (no migration generated, this is a TS-only change).

---

- U3. **Override UI in FactoryDownloadTab (Tab 6)**

**Goal:** Embed a structured slot-override panel in Tab 6 so an admin can edit any authored slot and trigger a rebuild without leaving the download tab.

**Requirements:** R1, R2, R3, R4, R5

**Dependencies:** U2

**Files:**
- Modify: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx`

**Approach:**

*`statusToTab` update:* Add `case "rebuilding": return "f-download"` — keeps the admin on Tab 6 during re-render. Also add `case "error": return "f-download"` when the run has a `deckR2Key` present (rebuild error), otherwise fall through to default (never-built error which routes to `f-brief`).

*`TRANSITIONING_STATUSES` update:* Add `"rebuilding"` to this Set so the 5s polling loop fires while the rebuild is in progress. Without this, `isTransitioning` is false while `status === "rebuilding"` and the UI never discovers the transition back to `complete`.

*`statusBadge` map update:* Add a `"rebuilding"` entry (e.g., `{ label: "Rebuilding…", variant: "secondary" }`).

*`TabsContent` guard update for `f-download`:* Change the existing guard from `run.status === "complete" || run.status === "error"` to also include `"rebuilding"`, so `FactoryDownloadTab` renders (not `PlaceholderTab`) during the re-render.

*`FactoryDownloadTab` redesign:*
- When `status === "complete"`: show download button + `FactoryOverridePanel` below it (collapsed by default, disclosed with a chevron button labeled "Override slots")
- When `status === "rebuilding"`: hide download button, show a spinner + "Rebuilding PDF…" message; keep `FactoryOverridePanel` visible but all inputs disabled
- When `status === "rebuilding"` reverts to `complete`: toast "PDF rebuilt — ready to download"; re-enable inputs and download button

*`FactoryOverridePanel` component (inside SlideFactoryPanel.tsx):*
- Grouped by slide: "Slide 1", "Slide 2", "Slide 3", "Slide 4", "Slide 5", "Slide 6"
- Each slot renders as `SlotOverrideField` — a labeled input with live character counter (`CharCounter` pattern from `editor-shared.tsx` if reusable; otherwise implement inline)
- Slot type routing:
  - Simple string slots (all except `visionBullets`, `reasons`, `transformationRows`) → single `<textarea>` with `maxLength` and char counter
  - `slide1.visionBullets` → 3 separate `<input>` fields (one per bullet), each max `SLIDE1_VISION_BULLET_MAX` chars
  - `slide3.reasons` → 3 repeating groups, each with `label` input (max `SLIDE3_REASON_LABEL_MAX`) and `detail` textarea (max `SLIDE3_REASON_DETAIL_MAX`)
  - `slide5.transformationRows` → 4 repeating groups, each with `feature`, `existing`, `proposed` inputs with respective `_MAX` constants
- **Per-slot save:** A "Save" button on each group (or field cluster) calls `PATCH .../slots/:key` with the edited value serialized back to the Lucca text format (`reasons` → `"Label: detail\n\n"`, `transformationRows` → `"feature | existing | proposed\n"`, `visionBullets` → `"• b1\n• b2\n• b3"`). The server stores it, and the component marks the slot as saved with a transient green checkmark.
- **"Rebuild PDF" button:** Enabled when any slot in `run.luccaDraft` has `source === "admin-override"`. Calls `POST .../rebuild`. While `status === "rebuilding"` (via the existing 5s poll), the button is disabled with a spinner.
- Slides 4 and 6 show only their single editable slots (`sectionSubtitle`, `disclaimer`) — no other override fields.
- Deterministic-only slides show a note: "No editable slots — content is generated from live property data."

**Patterns to follow:**
- `FactoryLuccaTab` in `SlideFactoryPanel.tsx` for the slot-row rendering pattern
- `CharCounter` and `SlotRow` from `editor-shared.tsx` if importable (check if they export cleanly; if they couple to `editor-shared`'s context provider, implement inline versions)
- `editor-shared.tsx` `hydrateSlot` / `stampSlot` for understanding the provenance model (do not import directly if that pulls in the property-level editor context)

**Test scenarios:**
- UI: Tab 6 shows override panel collapsed by default when `status === complete`
- UI: Expanding panel shows all 6 slide groups with their slots
- UI: `slide3.reasons` renders 3 label+detail pairs, not a raw textarea
- UI: `slide5.transformationRows` renders 4 feature/existing/proposed groups
- UI: char counter turns red when input exceeds max; Save button disabled
- UI: "Rebuild PDF" button absent when no `admin-override` slots; appears after any slot is saved
- UI: clicking "Rebuild PDF" disables inputs, shows spinner, download button hidden
- UI: successful rebuild shows toast and re-enables download button
- UI: while `status === "rebuilding"`, `FactoryDownloadTab` renders (not `PlaceholderTab`) — the `f-download` TabsContent guard includes `rebuilding`
- UI: while `status === "rebuilding"`, the polling loop fires (5s interval) and discovers the `complete` transition — `TRANSITIONING_STATUSES` includes `rebuilding`
- Integration: after rebuild, `GET .../runs/:id` returns updated `deckR2Key`

**Verification:** Typecheck clean; magic-numbers PASS (all `_MAX` constants imported from `@shared/deck-payload-v2`, no raw numeric literals); design review via `/post-coding-design-review` before marking done.

---

- U4. **Rebecca parity — extend `update_slide_factory_slot` + add `rebuild_slide_factory_deck`**

**Goal:** Expose the override and rebuild actions to Rebecca so she can override slots and trigger a rebuild through conversation (CLAUDE.md §7 agent-native parity).

**Requirements:** R7

**Dependencies:** U2

**Files:**
- Modify: `artifacts/api-server/src/chat/rebecca-tools.ts`
- Modify: `docs/discipline/agent-native-parity-map.md`
- Modify (test): `artifacts/api-server/src/tests/rebecca-slide-factory-tools.test.ts`

**Approach:**

*`update_slide_factory_slot` tool update:*
- Update description: change `"Requires status 'draft_review'"` to `"Requires status 'draft_review' or 'complete'. When editing a complete run, the slot is marked as a post-completion override (source: 'admin-override') and the run will need a rebuild to incorporate changes."`
- The underlying API already handles both statuses after U2; no handler change needed

*New `rebuild_slide_factory_deck` tool:*
```
name: "rebuild_slide_factory_deck"
description: "Trigger a lightweight deck rebuild on a complete run that has post-completion slot overrides. Re-renders the PDF using the override slot values, runs Dino pixel-diff, and updates the deck R2 key. Does not re-run Lucca, Lorenzo, or any swarm agent. Requires status 'complete'. Poll get_slide_factory_run for status 'complete' (rebuilding → complete)."
parameters: { id: number (run ID) }
```

*Handler case `"rebuild_slide_factory_deck"`:* Call `POST /api/lb-slides/factory/runs/:id/rebuild` (internal route call) and return the updated run.

*Parity map additions (in Slide Factory section):*
```
| Override a slot on a complete run (Tab 6) | PATCH .../slots/:key (complete status) | `update_slide_factory_slot` | ✅ |
| Trigger lightweight rebuild after override (Tab 6) | POST .../rebuild | `rebuild_slide_factory_deck` | ✅ |
```

**Test scenarios:**
- `rebuild_slide_factory_deck` on a `complete` run with overrides → run transitions to `rebuilding`, then `complete`; new `deckR2Key` differs from original
- `rebuild_slide_factory_deck` on a `draft_review` run → error response surfaced to Rebecca
- `update_slide_factory_slot` on a `complete` run → slot saved with `source: "admin-override"`
- `update_slide_factory_slot` on a `complete` run with a `reasons` slot value in text format (`"View: Panoramic lake\n\nHistory: Turn-of-century"`) → stored correctly, `buildFactoryPayload` produces valid reasons on rebuild via U1's text-format fallback parser

**Verification:** Typecheck clean; magic-numbers PASS; `rebecca-slide-factory-tools.test.ts` covers all new cases; parity map has both rows with ✅.

---

## System-Wide Impact

- **Interaction graph:** `statusToTab` is the single function that maps `rebuilding → f-download`; the panel's 5s polling loop (already exists for `building`) continues to work unchanged since it polls on any non-terminal status.
- **Error propagation:** Franco failure during rebuild → `status = "error"`; `luccaDraft` overrides preserved; admin can inspect and retry via the existing error re-trigger flow (or via `rebuild_slide_factory_deck` Rebecca tool once the `trigger-build` guard is updated to also accept `complete` + overrides present — deferred).
- **State lifecycle risks:** Double-trigger of rebuild prevented by 409 on `rebuilding` status. Franco upload is idempotent (overwrites `deckR2Key` on success). Slot PATCH during `rebuilding` is denied (409) — the UI disables all inputs while `rebuilding`.
- **Unchanged invariants:** The Lorenzo → Lucca → Marco → swarms → Franco initial pipeline is completely unchanged. The per-property `property_deck_payloads` table is not touched.
- **API surface parity:** The Rebecca tool `update_slide_factory_slot` acquires a broader status acceptance; callers that only use it on `draft_review` are unaffected.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `buildFactoryPayload` reasons/rows parse fails on live run data (silent null) | U1 adds text-format parser + tests against both formats |
| Franco (Playwright) unavailable in test environment for rebuild endpoint tests | Dino/Franco calls are best-effort in tests; test against mock Franco that returns a synthetic R2 key |
| Admin triggers rebuild while downloading — stale URL | Download URL comes from `run.deckR2Key` fetched fresh on the `GET .../download` endpoint; old pre-signed URL remains valid for its TTL (R2 default) |
| `statusToTab("rebuilding")` → `f-download` confuses Tab 5 agent progress expectations | Tab 5 only shows for `building` status; `rebuilding` → Tab 6 is a distinct code path |
| Char-counter constraint mismatch between UI (TypeScript constants) and server Zod schema | Both import from `@shared/deck-payload-v2`; same constants; no drift possible |

---

## Sources & References

- Related code: `artifacts/api-server/src/slides/build-factory-payload.ts` — `parseReasons`, `parseRows`
- Related code: `artifacts/api-server/src/slides/lucca-draft.ts` — `serializeReasons` (line 270), `serializeRows` (line 274)
- Related code: `artifacts/api-server/src/routes/slide-factory.ts` — slot PATCH handler (~line 340)
- Related code: `artifacts/hospitality-business-portal/src/features/slide-factory/SlideFactoryPanel.tsx` — `FactoryDownloadTab` (line 1589), `statusToTab` (line 203)
- Related code: `lib/db/src/schema/slide-factory-runs.ts` — `SLIDE_FACTORY_RUN_STATUSES`, `LuccaSlotDraft`
- Related code: `artifacts/api-server/src/chat/rebecca-tools.ts` — `update_slide_factory_slot` (line 332)
- Institutional: `docs/solutions/architecture-patterns/slide-factory-runs-schema-design-2026-05-07.md`
- Institutional: `docs/solutions/architecture-patterns/agent-native-precision-pipeline-pattern-2026-05-06.md`
- Institutional: `docs/solutions/developer-experience/programmatic-data-path-smoke-testing-2026-05-08.md`
