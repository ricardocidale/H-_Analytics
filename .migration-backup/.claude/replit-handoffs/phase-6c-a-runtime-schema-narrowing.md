# Phase 6c-a: runtimeConfig schema narrowing — server side

Make the per-Specialist `runtimeConfig` jsonb writable only against a per-Specialist Zod schema (when one is registered) plus a global size/depth cap. Today the PUT route at `server/routes/admin/specialists/runtime.ts` accepts any JSON object whatsoever — `{ "totally": "garbage" }` persists with no signal — even though the only on-disk consumer (Photo Enhancer) already does narrow-and-clamp on the read side via `parseBatchScheduleConfig`. This packet moves the gate from read-time-clamp to write-time-reject for Photos and lays the registry seam every other Specialist will plug into in P7.

## Doctrine Freeze Gate Check

- **Governing ADR:** [`docs/architecture/decisions/ADR-006-resources-control-plane.md`](../../docs/architecture/decisions/ADR-006-resources-control-plane.md)
- **ADR status:** `Accepted` (2026-04-21)
- **Last ADR edit:** 2026-04-22 (cosmetic — pointer migration, semantic doctrine unchanged)
- **Sessions stable since acceptance:** 3 (P5 ✅, P6a ✅, P6b ✅, P6d ✅)
- **Gate decision:** ✅ **Cleared to execute.**

## Context (≤200 words)

Recon (this session, no commit) found that 10 of 12 Specialists declare the `runtime` capability but **only `photos.photo-enhancer` actually reads from `runtimeConfig`** at evaluation time. The reader (`server/jobs/specialist-photos-batch.ts:88-132`, `engine/analyst/surface/photos/photo-enhancer-evaluator.ts:99-115`) already validates and clamps every field. The hole is on the WRITE path: `updateRuntimeSchema` is `z.record(z.string(), z.unknown())`, so an admin can save `{ "thresholds": { "adr": 0.1 } }` against the Watchdog Specialist (no consumer reads it) or `{ "batchSchedule": { "intervalHours": -1 } }` against Photos (the parser silently clamps to `[1, 168]` later, hiding the typo).

This packet adds a **server-side registry** mapping `specialistId → Zod schema`, declares one for Photos that mirrors the existing parser's contract, and makes the PUT route validate against the registered schema (falling back to a 16KB / depth-4 hardened version of the current loose contract for Specialists with no schema declared). The catalog is **untouched** — schemas don't belong in client-shipped definition data.

References:
- Skill: `.claude/skills/resources/SKILL.md` — Specialist-side per-row config governance
- Skill: `.claude/skills/analyst/_index.md` — LOCKED 2026-04-21 governance block
- Recon trail: PUT route at `server/routes/admin/specialists/runtime.ts:30-57`; reader contract at `server/jobs/specialist-photos-batch.ts:84-132`
- Architect note: `phases.md` P6 row — "runtimeConfig schema narrowing"
- Sibling packets: P6a (router gate pattern), P6b (audit user-name resolution), P6d (sidebar map narrowing)

## Atomic-budget check

- **Sub-step count:** 4 (≤7 ✅)
- **File count:** 2 source + 1 test (≤3 source ✅; tests sit in the verification domain)
- **Capability domains touched:** 2 — `route` (registry + PUT lookup) + `verification` (test additions) ✅

## Design notes

**Why not put the schema in the catalog?** The catalog ships to the client (`client/src/components/ai-intelligence/AiIntelligenceSidebar.tsx:38` and others import `SPECIALIST_CATALOG`). Storing a Zod schema as an entry field would either (a) force `z.custom<ZodType<...>>()` — a pattern with zero precedent in this repo (verified via grep across `shared/`, `engine/`, `server/`) — or (b) bloat the client bundle with a schema only the server's PUT route uses. A separate server-side registry keeps `SpecialistDefinition` unchanged and pure data.

**Why not collapse `parseBatchScheduleConfig` into the Zod schema in this packet?** Two reasons: (1) it expands the file count and crosses into the Photos domain, blowing the atomic budget; (2) the parser tolerates partial / malformed blocks by falling back to safe disabled-defaults, while the Zod schema rejects with 400. They're different contracts for different surfaces (read-time tolerance vs write-time strictness). Folding them is a worthwhile follow-up but requires its own design pass — deferred to `phase-6c-c-parser-collapse.md`.

## Tasks

### S1: Create the runtime-schema registry + Photo Enhancer schema

- **Files:**
  - `engine/analyst/registry/specialist-runtime-schemas.ts` (NEW, ≤80 lines)
- **Change:** Create a new module exporting:
  ```ts
  import { z } from "zod";
  import { PHOTO_ENHANCER_STYLES } from "../../../server/services/photo-enhancer-pipeline";

  /**
   * Photo Enhancer runtime config — mirrors the clamps in
   * `server/jobs/specialist-photos-batch.ts#parseBatchScheduleConfig`.
   * Source of truth for the WRITE path. The parser remains the
   * read-time tolerant path until phase 6c-c collapses them.
   */
  export const PhotoEnhancerRuntimeConfigSchema = z.object({
    scheduledStyle: z.enum(PHOTO_ENHANCER_STYLES).optional(),
    scheduledPrompt: z.string().max(2_000).optional(),
    batchSchedule: z.object({
      enabled: z.boolean(),
      intervalHours: z.number().int().min(1).max(24 * 7),
      maxPerCycle: z.number().int().min(1).max(50),
      style: z.enum(PHOTO_ENHANCER_STYLES),
      prompt: z.string().max(2_000),
      propertyIds: z.array(z.number().int().positive()).nullable(),
      targetMode: z.enum(["explicit", "all"]),
    }).partial().optional(),
  }).strict();

  /**
   * Server-side registry: specialistId → Zod schema for runtimeConfig.
   * Specialists with no entry fall through to a generic record validator
   * bounded by serialized-size + max-depth caps in the PUT route.
   *
   * Add a Specialist here when its evaluator starts reading runtimeConfig
   * fields. Keep schemas mirrored against the runtime parser.
   */
  export const SPECIALIST_RUNTIME_SCHEMAS: Readonly<
    Record<string, z.ZodType<Record<string, unknown>>>
  > = {
    "photos.photo-enhancer": PhotoEnhancerRuntimeConfigSchema,
  };
  ```
- **Notes on `.strict()` vs `.partial()`:**
  - Top-level `.strict()` rejects unknown keys (catches typos like `scheduleStyle` → `scheduledStyle`).
  - `batchSchedule` is `.partial().optional()` because the read-time parser tolerates partial blocks and falls back to safe defaults — preserving existing admin behavior for previously-saved rows. The parser's contract at lines 88-132 of `specialist-photos-batch.ts` is the reference: every shape it accepts (empty block, `{ enabled: false }`, `{ enabled: true, intervalHours: 6 }`, etc.) must continue to validate cleanly.
- **Why this import path?** `engine/analyst/surface/photos/photo-enhancer-evaluator.ts:24-33` already imports from `server/services/photo-enhancer-pipeline` and `server/storage`. The `engine/ → server/` boundary is already crossed in this surface, so importing `PHOTO_ENHANCER_STYLES` from the same source preserves a single source of truth. The broader engine→server boundary question is out of scope for this packet (see Out of scope §).
- **Affected dependency surfaces:** S-Specialist-Router, S-Photos-Pipeline (verify exact tags against `.claude/audit-inventory.md` during execution; if either is missing, file `BLOCKED.md`).
- **Cross-check invariants:**
  - "PHOTO_ENHANCER_STYLES is the single source of truth" — DO NOT redefine it; import.
  - "Parser tolerance ↔ Zod tolerance must match" — every shape `parseBatchScheduleConfig` accepts as valid (including `batchSchedule` absent or empty) must also pass the Zod schema. Discrepancies surface as admin save failures on previously-valid rows.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors.
  - [ ] No new lint warnings on the new file.
  - [ ] If `engine/` cannot import from `server/` due to tsconfig/eslint constraints (unexpected — sibling files do it), file `BLOCKED.md` rather than refactoring boundaries here.
- **Test impact:** Covered by S3.
- **Rollback notes:** Delete the file. No DB or migration touched.

### S2: Wire PUT `/runtime` route to look up + apply the registered schema

- **Files:**
  - `server/routes/admin/specialists/runtime.ts` — extend the existing handler at lines 30-57.
- **Change:**
  - Import `SPECIALIST_RUNTIME_SCHEMAS` from `engine/analyst/registry/specialist-runtime-schemas.ts`.
  - After the existing `def.capabilities.includes("runtime")` check and the existing `updateRuntimeSchema.safeParse(req.body)` (which validates the envelope `{ runtimeConfig, changeSummary? }`), insert a second validation layer:
    1. **Size + depth cap** applied to `parsed.data.runtimeConfig` before any per-Specialist parse:
       - Serialized size ≤ 16 KiB: `JSON.stringify(parsed.data.runtimeConfig).length <= 16_384`.
       - Max nesting depth ≤ 4: write a small recursive `getMaxDepth(value, current = 0): number` helper inline; treat arrays and plain objects as one level; primitives are depth 0.
       - On violation, return `400 { error: "runtimeConfig exceeds size or depth limits" }`.
    2. **Per-Specialist schema** lookup: `const runtimeSchema = SPECIALIST_RUNTIME_SCHEMAS[id]`. If present, run `runtimeSchema.safeParse(parsed.data.runtimeConfig)`. On failure, return `400 { error: fromZodError(parsed.error).message }`.
    3. If no schema is registered, accept the value as-is (loose-fallback behavior — the size/depth cap is the only protection).
  - The successful path (`storage.updateSpecialistConfigSection(id, "runtime", { runtimeConfig: parsed.data.runtimeConfig }, …)`) is unchanged.
- **Affected dependency surfaces:** S-Specialist-Router.
- **Cross-check invariants:**
  - "Route signature change → also update contract test + caller(s)" — covered by S3.
  - "Zod error formatting must use `fromZodError`" — already imported at top of file.
  - "Read-only Resource Assignments invariant" — preserved; this packet only narrows a write surface.
- **Acceptance criteria:**
  - [ ] `npx tsc --noEmit` returns 0 errors.
  - [ ] No new lint warnings on touched file.
- **Test impact:** Covered by S3.
- **Rollback notes:** Revert the commit. No DB touched.

### S3: Tests — adjust the "arbitrary jsonb" assertion + add Photos schema cases + global cap cases

- **Files:**
  - `tests/server/admin-specialists.test.ts` — adjust the existing test at lines 365-376 ("PUT /api/admin/specialists/:id/runtime accepts an arbitrary jsonb object") and add new cases.
- **Change:**
  - The existing test at lines 365-376 currently uses Specialist `portfolio-ops.watchdog` (no schema registered). Keep that test as-is — it asserts the loose-fallback path still works for un-schema'd Specialists. Rename it for clarity: `"accepts an arbitrary jsonb object for Specialists with no registered runtime schema"`.
  - Add new cases (mirror the existing test's mock + invoke shape):
    1. **Photos accepts a valid runtime config:** `id: "photos.photo-enhancer"`, body `{ runtimeConfig: { batchSchedule: { enabled: true, intervalHours: 6, maxPerCycle: 5, style: "standard", prompt: "", propertyIds: null, targetMode: "all" } } }` → 200.
    2. **Photos rejects a negative `intervalHours`:** body `{ runtimeConfig: { batchSchedule: { enabled: true, intervalHours: -1, maxPerCycle: 5, style: "standard", prompt: "", propertyIds: null, targetMode: "all" } } }` → 400 with a Zod-formatted error mentioning `intervalHours`.
    3. **Photos rejects an unknown top-level key:** body `{ runtimeConfig: { totallyMadeUp: 1 } }` → 400. (Validates `.strict()`.)
    4. **Photos accepts an empty config:** body `{ runtimeConfig: {} }` → 200 (admin clearing the row).
    5. **Photos accepts a partial batchSchedule:** body `{ runtimeConfig: { batchSchedule: { enabled: false } } }` → 200 (regression guard for the parser-tolerance ↔ Zod-tolerance contract).
    6. **Size cap rejects oversized payloads:** body `{ runtimeConfig: { someBigBlob: "x".repeat(20_000) } }` against any Specialist → 400 with a size-limit error.
    7. **Depth cap rejects deeply-nested payloads:** body `{ runtimeConfig: { a: { b: { c: { d: { e: 1 } } } } } }` (depth 5) → 400 against any Specialist.
- **Affected dependency surfaces:** S-Specialist-Router (verification).
- **Cross-check invariants:**
  - "Test names describe the business rule, not the implementation."
  - "Test fixtures match real handler shape" — follow the existing `invoke(handlers, ...)` + mocked storage pattern.
- **Acceptance criteria:**
  - [ ] `npm run test:file -- tests/server/admin-specialists.test.ts` passes; the new cases all run.
  - [ ] Existing Photo Enhancer tests still pass: `npm run test:file -- tests/server/photo-enhancer-batch.test.ts tests/server/photo-enhancer-evaluator.test.ts tests/server/photo-enhancer-pipeline-runtime.test.ts`.
- **Test impact:** As above. No new test file required.
- **Rollback notes:** Revert the commit.

### S4: (Optional) Inline assertion that the Zod schema accepts every shape the parser accepts

- **Files:**
  - `tests/server/photo-enhancer-runtime-schema-parity.test.ts` (NEW, ≤60 lines) — only if S3's case 5 is judged insufficient at execution time.
- **Change:** Create a small parity test asserting every fixture in `tests/server/photo-enhancer-batch.test.ts` (lines 51, 96, 111, 129, 163, 187 — `runtimeConfig` shapes that the parser accepts as valid) also passes `PhotoEnhancerRuntimeConfigSchema.safeParse`. This is a regression guard against parser/schema divergence.
- **Decision rule:** If S3 case 5 (partial batchSchedule) plus existing Photo Enhancer tests cover the parity surface, SKIP this step. If executor judgment finds a gap during S3 review, execute. Either way, document the decision in the completion report.
- **Acceptance criteria (if executed):**
  - [ ] New test file passes; every parser-valid fixture parses cleanly through the Zod schema.
- **Test impact:** Net-new test file.
- **Rollback notes:** Delete the file.

## Verification

### Gate commands

- [ ] `npx tsc --noEmit` — TypeScript: 0 errors
- [ ] `npm run lint` — ESLint: 0 errors, 0 warnings on touched files
- [ ] `npm run test:file -- tests/audit/vocabulary-compliance.test.ts` — 11/11 pass (no UI strings touched, but baseline gate)
- [ ] `npm run test:summary` — All tests PASS
- [ ] `npm run verify:summary` — UNQUALIFIED PASS (all 19 phases)
- [ ] `npm run health` — ALL CLEAR

### Behavioral verification (manual, dev server)

- [ ] In dev, navigate to Admin → AI Intelligence → `photos.photo-enhancer` → Runtime tab.
- [ ] Paste `{ "batchSchedule": { "enabled": true, "intervalHours": -1, "maxPerCycle": 5, "style": "standard", "prompt": "", "propertyIds": null, "targetMode": "all" } }` and click Save → toast "Save failed" with a Zod-formatted error mentioning `intervalHours`.
- [ ] Paste `{ "batchSchedule": { "enabled": true, "intervalHours": 6, "maxPerCycle": 5, "style": "standard", "prompt": "", "propertyIds": null, "targetMode": "all" } }` → toast "Runtime updated"; the audit tab shows a new entry.
- [ ] Navigate to a non-Photos Specialist's Runtime tab (e.g. `portfolio-ops.watchdog`); paste `{ "anything": true }` → still saves (loose-fallback path).
- [ ] Paste `{ "huge": "<20KB string>" }` against any Specialist → toast "Save failed" with size-limit error.

### Surface-specific verification

- **S-Specialist-Router:** PUT `/api/admin/specialists/:id/runtime` is the surface; gates above cover it.
- **S-Photos-Pipeline:** Three Photo Enhancer test files (batch, evaluator, pipeline-runtime) are the regression gate.

## Out of scope

- **Typed `RuntimeTab` UI** — the form stays a free-form `<Textarea>` with `JSON.parse`. Typed form rendering for Specialists with a registered schema is **deferred to packet `phase-6c-b-runtime-typed-tab.md`** (UI domain).
- **Collapsing `parseBatchScheduleConfig` into the Zod schema** — the parser stays as-is. Folding the read-time tolerant clamp into the Zod schema is **deferred to packet `phase-6c-c-parser-collapse.md`** (route + photos domains).
- **Stripping the `runtime` capability from Specialists that don't read it** — that decision belongs in P7 alongside their evaluator design. This packet does NOT change any catalog `capabilities` array.
- **Public-view schema (`SpecialistConfigPublicViewSchema:592`)** — the read-side `runtimeConfig: z.record(z.string(), z.unknown())` stays loose. Tightening the read-side response is purely cosmetic (clients already get whatever was saved) and would be a UI-driven change tied to P6c-b.
- **Versions table (`specialistConfigVersions:427`)** — the audit-history column stays `Record<string, unknown>`. Historical rows must NOT be re-validated against a future tightened schema (an old row with a now-removed field must remain readable).
- **Engine→server boundary refactor** — the Photos surface already imports from `server/`; reorganizing that boundary belongs in its own architecture packet, not here.
- **Catalog widening** — explicitly NOT touching `SpecialistDefinitionSchema`. Schemas live in a server-side registry, not in client-shipped catalog data.

If during execution Replit identifies work that belongs in scope but isn't listed, file a `BLOCKED.md` sibling rather than expanding the packet.

## Surfaces footer template

Every commit emitted from this packet must end with:

```
Surfaces: S-Specialist-Router, S-Photos-Pipeline
Packet: .claude/replit-handoffs/phase-6c-a-runtime-schema-narrowing.md
Verified: TS 0, Lint 0, Vocab 11/11, test:summary PASS, Verify UNQUALIFIED
```

(Confirm exact S-tags against `.claude/audit-inventory.md` at execution time; the names above are best-guess from sibling packets P5/P6a/P6b.)

## Completion report (filled by Replit on exit)

After all sub-steps land, Replit appends to this packet:

- **Commits:** `<sha1>`, `<sha2>`, …
- **Sub-steps PASSED:** `<list>`
- **Sub-steps SKIPPED with reason:** `<list>` (S4 is conditional)
- **Verification gates PASSED:** `<list>`
- **Verification gates SKIPPED with reason:** `<list>`
- **Out-of-scope items discovered (filed as BLOCKED or follow-up):** `<list>`
- **Session-memory entry added:** ✅ / ❌
