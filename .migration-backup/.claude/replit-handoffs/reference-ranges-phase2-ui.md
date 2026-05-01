# Reference Ranges — Phase 2 UI

**Owner:** Replit Agent
**CC work done:** Storage write methods + all 5 server routes are live on `main` (commit after this packet).
**Scope:** Admin → Intelligence → Reference Ranges tab edit UX.
**Atomic budget:** 5 sub-steps. Each commits separately.

---

## Background

`reference_range` rows are the authoritative low/mid/high benchmark store used by
Specialists. Phase 1 gave admins a read-only grid. Phase 2 adds create / edit /
archive / restore so admins can curate rows without a seed script.

The server contract is fully live:

| Method | Route | Response |
|--------|-------|----------|
| POST | `/api/admin/reference-ranges` | 201 new row, or 409 on duplicate key |
| PUT | `/api/admin/reference-ranges/:id` | updated row |
| DELETE | `/api/admin/reference-ranges/:id` | archived row (soft delete) |
| POST | `/api/admin/reference-ranges/:id/restore` | restored row |

All routes require admin auth (`requireAdmin`). `verifiedBy` is auto-set server-side to the calling admin's email when not explicitly provided.

---

## S1 — "New Range" button + create dialog

File: `client/src/components/admin/intelligence/ReferenceRangesTab.tsx`

Add a **"New Range"** button in the tab header (right side). Clicking it opens a dialog.

**Dialog fields** (in order):

| Field | Type | Notes |
|-------|------|-------|
| Domain | Select | `REFERENCE_RANGE_DOMAINS` enum values |
| Metric Key | Input | kebab-case, e.g. `adr-luxury` |
| Label | Input | human-readable |
| Country | Input | ISO-3166 alpha-2 or `GLOBAL` |
| Subdivision | Input | optional |
| Market | Input | optional |
| Segment | Input | optional |
| Property Type | Input | optional |
| Year | Number | 0 = evergreen |
| Low | Number | |
| Mid | Number | |
| High | Number | |
| Unit | Input | e.g. `percent`, `usd_per_room_night` |
| Confidence | Select | `high` / `medium` / `low` |
| Source Name | Input | optional |
| Source URL | Input | optional |
| Methodology | Textarea | optional, one line |

On submit: `POST /api/admin/reference-ranges`. On 409: show inline error "A range with
that combination already exists." On 201: close dialog, refresh the list (invalidate
the TanStack Query for the grid).

No financial mutations — no need to call `invalidateAllFinancialQueries`.

**Acceptance criteria:**
- [ ] Dialog opens from "New Range" button
- [ ] Submit posts to server
- [ ] 409 shows meaningful inline error
- [ ] Success closes and refreshes grid

---

## S2 — Edit row inline or via dialog

On each row in the grid, add an edit icon button (pencil). Clicking opens the same
dialog pre-populated with the row's current values.

On submit: `PUT /api/admin/reference-ranges/:id` with only the changed fields (or send
the full payload — server accepts both partial and full objects).

**Acceptance criteria:**
- [ ] Edit button opens pre-populated dialog
- [ ] Submit updates the row
- [ ] Success refreshes grid

---

## S3 — Archive button with confirmation

On each active row, add an archive icon button (Archive from lucide-react). Clicking
shows a small confirmation: "Archive this range? It will be hidden from the grid and
from Specialist lookups."

On confirm: `DELETE /api/admin/reference-ranges/:id`.

**Acceptance criteria:**
- [ ] Archive button present on active rows
- [ ] Confirmation required before archiving
- [ ] Archived row disappears from grid (unless "Show archived" toggle is on)

---

## S4 — Restore archived rows

When the "Show archived" toggle is on, archived rows display with a muted style and a
"Restore" button.

On click: `POST /api/admin/reference-ranges/:id/restore`. No confirmation needed.

**Acceptance criteria:**
- [ ] Restore button visible only on archived rows when toggle is on
- [ ] Restore call succeeds and row returns to active state

---

## S5 — Verification

```bash
npx tsc --noEmit
npm run lint
npm run test:file -- tests/audit/vocabulary-compliance.test.ts
npm run test:summary
npm run verify:summary   # must say UNQUALIFIED
```

All five gates must pass before committing S5.

---

## Commit footer pattern

Each commit should include:

```
Surfaces: S2 (ReferenceRangesTab.tsx)
```

---

## Notes

- Do NOT add `invalidateAllFinancialQueries` — reference ranges are not financial engine
  inputs that trigger recalculation.
- The `verifiedBy` field is auto-set server-side; you do not need to send it from the UI.
- The `details` JSONB field can be omitted from the create/edit form for now — it's for
  domain-specific extras and has no current UI consumer.
- `year = 0` is the convention for "evergreen" rows (e.g. permanent statutory rules with
  no calendar anchor). Display as "Evergreen" in the grid year column when value is 0.
