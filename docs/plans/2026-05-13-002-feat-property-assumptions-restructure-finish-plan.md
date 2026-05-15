# Property Assumptions Restructure — Finish Plan

**Plan ID:** 2026-05-13-002
**Status:** Draft
**Owner:** Replit Agent (units U1–U6, U8) + Claude Code shell (unit U7)
**Source brainstorm:** `docs/brainstorms/property-assumptions-restructure/` (`requirements.md`, `deferred-milestone-b.md`, `opus-consult.md`, `synthesis.md`)
**Sister plan:** `docs/plans/2026-05-13-001-feat-seed-calibration-bracket-defaults-and-irr-views-plan.md` (independent, no dependencies)

---

## Status of prior work (already shipped)

This plan finishes a body of work that is **substantially landed**. Do not re-plan or re-implement these.

### Milestone A — Task #1404 (DONE)
| Requirement | Evidence |
|---|---|
| Breadcrumb "Edit" → "Property Assumptions" | `artifacts/hospitality-business-portal/src/components/Breadcrumbs.tsx:53` |
| BasicInfoSection split into Basic / As Purchased / As Improved | `artifacts/hospitality-business-portal/src/components/property-edit/BasicInfoSection.tsx` (767 LOC; `SubsectionHeader` ~L55; As-Improved placeholder behavior ~L617, ~L669, ~L687–758) |
| As-Purchased description column | `lib/db/src/schema/properties.ts:256` (`descriptionPurchased`) |
| As-Improved typed columns | `lib/db/src/schema/properties.ts:261–266` (`fbVenuesImproved`, `fbSeatsImproved`, `eventSpaceSqftImproved`, `totalBuildingSqftImproved`, `plannedReopeningYear`, `descriptionImproved`) |
| `updatePropertySchema` accepts new fields | `lib/db/src/schema/properties.ts:505–511, 572–575` |
| Migrations applied | `lib/db/migrations/0052_property_assumptions_improved_columns.sql`, `0053_property_description_purchased.sql` |
| Rebecca parity (by construction) | `update_property` / `patch_property` route through `updatePropertySchema` — new fields auto-addressable |

### Milestone B — Task #1407 (SUBSTRATE DONE; reader migration partial)
| Component | Evidence |
|---|---|
| `property_descriptor_catalog` table | `lib/db/migrations/0054_property_descriptor_catalog.sql` |
| Catalog Drizzle schema | `lib/db/src/schema/property-descriptor-catalog.ts` |
| Catalog seed (code-defined) | `lib/db/src/property-descriptor-catalog-seed.ts` |
| `descriptors_purchased` / `descriptors_improved` JSONB on `properties` | `properties.ts:271–284` |
| Backfill of JSONB from typed columns | Migration 0054 step 3 |
| Accessor `getEffectivePropertyView` | `lib/db/src/property-descriptor-accessor.ts` |
| Dual-write helper `buildDescriptorDualWritePatch` | `artifacts/api-server/src/routes/properties.ts:420–435, 479–495` |
| **Partial reader migration already landed** | `artifacts/api-server/src/routes/finance.ts:30–38`, `artifacts/api-server/src/ai/rebecca-context-builder.ts:215–221` |

---

## Authoring boundary (inviolable)

Per `CLAUDE.md` § 9 (financial-engine authoring), **Replit Agent must not touch** `lib/engine/src/calc/**`, `lib/engine/src/property-engine.ts`, `lib/engine/src/company-engine.ts`, or the server checker. **Unit U7 (engine reader migration) is a Claude Code (CC) shell handoff** with a written handoff doc at `docs/handoffs/`. Replit Agent prepares the handoff but does not execute U7.

---

## Design constraints (apply to all UI units — U2, U4, U6)

Before touching any `.tsx` in `artifacts/hospitality-business-portal/`, the executing agent **must load**:

- `.agents/skills/ce-frontend-design/SKILL.md` — composition / typography / color / motion / copy quality bar; verify via screenshot.
- `.agents/skills/hbg-design-philosophy/SKILL.md` — Tuscan Olive Grove palette, IBM Plex Sans / Inter / JetBrains Mono triple-font, 8px grid, framer-motion conventions, hospitality vocabulary.
- `.agents/skills/nai-design-system/SKILL.md` — CSS custom property tokens, shadcn/ui patterns.
- `.agents/skills/ui-page-patterns/SKILL.md` — canonical reference discovery and component reuse scan.

**Component reuse rule (no new visual primitives):** UI work uses the components already imported by `BasicInfoSection.tsx` — `Card`, `Input`, `Label`, `Select`, `Textarea`, `InfoTooltip`, the local `SubsectionHeader` and `AutoFillBadge` helpers, themed icons from `@/components/icons`. New visual primitives require justification in the unit's notes.

---

## Units

### U1 — Drift-window persistence + clean-window query
- **Blocked By:** []
- **Authoring boundary:** Replit Agent
- **Scope:** The dual-write helper currently emits `descriptor-drift` log warnings only (`routes/properties.ts:420–435, 479–495`). Persist drift events to a new `property_descriptor_drift_log` table and add a server query `getDriftWindowSummary({ sinceDays })` that returns drift count + most-recent timestamp. This is the gate that U8 reads to know when dual-write is safe to drop.
- **Files:**
  - new: `lib/db/migrations/0057_descriptor_drift_log.sql` (table: `id bigserial pk`, `property_id int fk`, `field_key text`, `typed_value jsonb`, `jsonb_value jsonb`, `created_at timestamptz default now()`, index on `created_at desc`)
  - new: `lib/db/src/schema/property-descriptor-drift-log.ts`
  - edit: `lib/db/src/property-descriptor-accessor.ts` — export `recordDriftEvent`, `getDriftWindowSummary`
  - edit: `artifacts/api-server/src/routes/properties.ts` (around L420–495) — replace log-only warning with `recordDriftEvent` insert
  - sync `drizzle.__drizzle_migrations` per `docs/runbooks/schema-migrations.md`
- **Acceptance:**
  - `getDriftWindowSummary({ sinceDays: 7 })` returns `{ count, lastSeenAt }`.
  - PATCH `/api/properties/:id` writes that mutate a typed column produce a row in the drift log if the JSONB blob diverges.
  - Unit test in `lib/db/src/__tests__/property-descriptor-accessor.test.ts` covers both branches.
- **Verification:**
  - `pnpm --filter @workspace/db run typecheck`
  - `pnpm --filter @workspace/scripts run check:schema-drift`
  - `pnpm --filter @workspace/scripts run check:migration-guards`

### U2 — K&R Tables surface for `property_descriptor_catalog`
- **Blocked By:** []
- **Authoring boundary:** Replit Agent
- **Scope:** Per the 2026-05-11 K&R contract (see `hplus-admin-nav-ia` SUPERSEDING section), every catalog table must surface read-only under **Admin → AI → Intelligence → Knowledge & Resources → Tables**. `property_descriptor_catalog` is missing. Follow the existing ICP brackets registration pattern.
- **Files:**
  - edit: `artifacts/api-server/src/seeds/knowledge-registry.ts:113–121` — add `property_descriptor_catalog` entry mirroring the ICP brackets shape
  - edit: `artifacts/api-server/src/routes/admin/knowledge-registry.ts:248–266, 286–305` — extend the catalog read-handler whitelist
  - edit (admin UI): `artifacts/hospitality-business-portal/src/...AssetPanel.tsx:753–755` — register the new table card; status dot driven by row-count probe; description per `analyst-intelligence-display` skill
  - parity row: `docs/discipline/agent-native-parity-map.md` — add row "View property descriptor catalog | Admin → AI → Intelligence → K&R → Tables → Property Descriptor Catalog | `list_tables` (existing) | ✅"
- **Design references:** `analyst-intelligence-display` skill (status dot + description card pattern); `front-of-app-admin-isolation` (catalog never appears outside admin).
- **Acceptance:**
  - Admin K&R Tables list shows "Property Descriptor Catalog" with the green/yellow/red dot.
  - Card-open view shows: row count, last-seeded timestamp, agents/specialists/minions consuming it (from registry metadata), and the read-only schema.
  - No edit affordance.
- **Verification:**
  - `pnpm --filter @workspace/api-server run typecheck`
  - `pnpm --filter @workspace/hospitality-business-portal run typecheck`
  - Manual screenshot of the K&R Tables list per `ce-frontend-design` quality bar.

### U3 — Reader migration: exports, research, admin (lowest risk first)
- **Blocked By:** [U1]
- **Authoring boundary:** Replit Agent
- **Scope:** Migrate the four non-engine, non-slide-factory readers to `getEffectivePropertyView`. These are the architect-mandated lowest-risk batch — they consume property descriptors for human-readable output, not for math.
- **Files:**
  - edit: `artifacts/api-server/src/report/server-export-data.ts:616–647`
  - edit: `artifacts/api-server/src/report/assumption-sections.ts:149–174`
  - edit: `artifacts/api-server/src/routes/research/generate-prompt.ts:72–99`
  - edit: `artifacts/api-server/src/ai/research-prompt-builders.ts:353–401`
- **Acceptance:**
  - Each file imports from `lib/db/src/property-descriptor-accessor` and reads through `getEffectivePropertyView` instead of `property.fbVenues` / `.fbSeats` / etc.
  - For each migrated file, a smoke test exercises the `descriptionPurchased` and `descriptionImproved` paths and asserts the rendered text reflects the JSONB value when typed columns and JSONB diverge.
- **Verification:**
  - `pnpm typecheck`
  - `pnpm test --filter @workspace/api-server -- exports research`
  - Spot-check: trigger a research-prompt generation and a server export against a property where typed and JSONB descriptors have been intentionally desynced; confirm output reflects accessor.

### U4 — UI quality pass on `BasicInfoSection.tsx`
- **Blocked By:** []
- **Authoring boundary:** Replit Agent
- **Scope:** The three-subsection split shipped at 767 LOC without a design review. Verify and tighten:
  - Faded-placeholder UX for unset As-Improved fields (R8 from requirements) — placeholder text uses `text-muted-foreground/60` (or app token equivalent), restored to full opacity on focus.
  - SubsectionHeader spacing matches H+ 8px grid.
  - Cancel / Save / Analyst button block follows `hplus-form-actions` skill order and density.
  - `front-of-app-admin-isolation`: no admin jump-links anywhere on the page.
  - Hospitality vocabulary check (`hbg-design-philosophy`): no banned terms ("listing", "unit" used loosely, "property type" mislabels).
  - File size triage: if any helper function exceeds 60 lines or the file blocks readability, extract `AsPurchasedDescriptionField` and `AsImprovedDescriptionField` to sibling files in the same directory — do not change behavior.
- **Files:**
  - edit: `artifacts/hospitality-business-portal/src/components/property-edit/BasicInfoSection.tsx`
  - possibly new: `artifacts/hospitality-business-portal/src/components/property-edit/AsPurchasedDescriptionField.tsx`, `.../AsImprovedDescriptionField.tsx`
- **Design references:** `ce-frontend-design`, `hbg-design-philosophy`, `nai-design-system`, `ui-page-patterns`, `hplus-form-actions`, `front-of-app-admin-isolation`, `analyst-intelligence-display` (if range badges are present).
- **Acceptance:**
  - Screenshot review per `ce-frontend-design` (composition / typography / color / motion / copy) submitted alongside the change.
  - All requirements R1–R12 in `docs/brainstorms/property-assumptions-restructure/requirements.md` visually verified against the running app.
  - No new visual primitives introduced.
- **Verification:**
  - `pnpm typecheck`
  - `pnpm --filter @workspace/scripts run check:spinner-contrast`
  - `pnpm --filter @workspace/scripts run check:taxonomy-mirror`

### U5 — Reader migration: slide factory
- **Blocked By:** [U1, U3]
- **Authoring boundary:** Replit Agent (slide factory is content/render, not engine math)
- **Scope:** Migrate the slide factory's two property-descriptor reads.
- **Files:**
  - edit: `artifacts/api-server/src/slides/build-payload.ts:279–281`
  - edit: `artifacts/api-server/src/slides/lucca-draft.ts:345–347`
- **Acceptance:**
  - Both files read through `getEffectivePropertyView`.
  - A factory dry-run on a fixture property where typed and JSONB descriptors diverge produces output reflecting the JSONB values.
- **Verification:**
  - `pnpm typecheck`
  - `pnpm test --filter @workspace/api-server -- slides`

### U6 — Parity-map row + Rebecca smoke test
- **Blocked By:** []
- **Authoring boundary:** Replit Agent
- **Scope:** Even though `update_property` / `patch_property` accept the new fields by construction, the parity map has no explicit row documenting As-Purchased / As-Improved capability. Add it, and add a Rebecca smoke test asserting the new fields round-trip.
- **Files:**
  - edit: `docs/discipline/agent-native-parity-map.md:19–20` — add row "Edit As-Purchased / As-Improved property fields | Property → Property Assumptions → As Purchased / As Improved | `update_property` / `patch_property` | ✅"
  - new: `artifacts/api-server/src/chat/__tests__/rebecca-property-improved-fields.test.ts` — smoke test that `patch_property({ id, fields: { fbVenuesImproved: 3, descriptionImproved: "..." } })` writes through and is reflected by `get_property`.
- **Verification:**
  - `pnpm test --filter @workspace/api-server -- rebecca-property-improved-fields`

### U7 — Reader migration: financial engine (CC HANDOFF — Replit Agent prepares only)
- **Blocked By:** [U1, U3, U5]
- **Authoring boundary:** **Claude Code shell.** Replit Agent does NOT execute this unit. Replit Agent writes the handoff doc and stops.
- **Scope (for CC):** Migrate every reader of typed property descriptor columns inside `lib/engine/src/**` to `getEffectivePropertyView`. Specifically the `PropertyInput` build path and any direct reads of `fbVenues`, `fbSeats`, `eventSpaceSqft`, `totalBuildingSqft`, `lastRenovationYear` inside `calc/`.
- **Replit Agent deliverable:**
  - new: `docs/handoffs/property-descriptor-engine-reader-migration-2026-05-13.md` — context, list of all engine files reading typed descriptors (gathered via `rg -n '\.(fbVenues|fbSeats|eventSpaceSqft|totalBuildingSqft|lastRenovationYear)\b' lib/engine/src/`), expected accessor signature, drift-log gate condition, paste-prompt for CC.
- **CC acceptance (for tracking, not Replit Agent's responsibility):**
  - `rg '\.(fbVenues|fbSeats|eventSpaceSqft|totalBuildingSqft|lastRenovationYear)\b' lib/engine/src/` returns zero hits outside the accessor itself.
  - `pnpm --filter @workspace/calc run test` green.
  - `pnpm --filter @workspace/scripts run check:types-mirror` green.

### U8 — Drop dual-write + drop deprecated typed columns (cleanup)
- **Blocked By:** [U3, U5, U7] AND clean drift-window
- **Authoring boundary:** Replit Agent (DDL only; the readers it depends on are already migrated by upstream units, including CC's U7)
- **Scope:** Remove dual-write from `routes/properties.ts`; drop the deprecated typed columns (`fbVenuesImproved`, `fbSeatsImproved`, `eventSpaceSqftImproved`, `totalBuildingSqftImproved`, `plannedReopeningYear`, `descriptionImproved`) AND the legacy operational columns now mirrored in `descriptors_purchased` (`fbVenues`, `fbSeats`, `eventSpaceSqft`, `totalBuildingSqft`, `lastRenovationYear`). Keep `description` and `descriptionPurchased` columns (TEXT-typed narrative fields are not catalogued).
- **HARD GATES (all must hold):**
  1. U3, U5, U7 all merged.
  2. `getDriftWindowSummary({ sinceDays: 14 })` returns `count = 0` for at least 14 consecutive days.
  3. CC sign-off recorded in the U7 handoff doc.
- **Files:**
  - new: `lib/db/migrations/0058_drop_property_descriptor_typed_columns.sql`
  - edit: `artifacts/api-server/src/routes/properties.ts` — remove `buildDescriptorDualWritePatch` call sites
  - edit: `lib/db/src/schema/properties.ts` — remove dropped columns + their `updatePropertySchema` entries
  - edit: `artifacts/api-server/src/chat/__tests__/rebecca-property-improved-fields.test.ts` — switch to JSONB-only assertions
- **Verification:**
  - All workflow checks green: `check:typecheck`, `check:schema-drift`, `check:migration-guards`, `check:taxonomy-mirror`, `check:types-mirror`, `test:calc`.
  - Spot-check 3 properties before/after: `getEffectivePropertyView` output unchanged.

---

## Out of plan — follow-ups (do NOT execute as units)

1. **Six v0 placeholder enums operator review.** `market_tier`, `target_adr_band`, `f&b_service_model`, `glamping_unit_types`, `condition_rating`, `seasonality_pattern` (per `opus-consult.md` push-back fields). This is a product/operator workshop, not engineering — open as a brainstorm, not a plan unit.
2. **Descriptor catalog vector indexing usage telemetry.** Per the K&R contract, every catalog table needs a 90-day rolling usage log. If U2 surfaces the catalog without telemetry wired up, file as a follow-up.

---

## Sequencing summary

```
U1 (drift persist) ──┐
                     ├──► U3 (exports/research/admin) ──► U5 (slide factory) ──► U7 (engine — CC) ──► U8 (cleanup)
U2 (K&R surface)  ───┘                                                                                ▲
                                                                                                     │
U4 (UI quality pass) ────────────────────────────────────────────────────────────────────────────────┤
U6 (parity row + smoke test) ────────────────────────────────────────────────────────────────────────┘
                                                                       (drift-window 14d clean) ─────┘
```

**Replit Agent units:** U1, U2, U3, U4, U5, U6, (U7 handoff doc only), U8.
**Claude Code units:** U7 execution.
