# Replit Instructions — The Analyst Watchdog UI

> Pull `main` first. You'll see `analyst-watchdog.ts` and new property schema columns.

---

## What Was Built (Server Side — Already Done)

The Analyst is now always on. The server:
- Validates every property assumption on seed via `validateAllProperties()`
- Validates every field change in real time via `validateFieldChanges()`
- Marks properties as `pending_validation` / `validated` / `flagged` / `stale`
- New columns on `properties`: `validationStatus`, `lastValidatedAt`, `flaggedFieldCount`
- Runs staleness + portfolio consistency checks every 6 hours
- Logs everything to `assumption_change_log`

**You need to build the UI for this.**

---

## TASK 1: Property Validation Status Badge

Every property card and property header should show a validation status badge.

**API:** `GET /api/properties/:id` — the property object now includes:
```json
{
  "validationStatus": "pending_validation" | "validated" | "flagged" | "stale",
  "lastValidatedAt": "2026-04-16T...",
  "flaggedFieldCount": 3
}
```

**Badge designs:**

| Status | Badge | Color |
|--------|-------|-------|
| `pending_validation` | "Awaiting The Analyst" | Amber/yellow pulse |
| `validated` | "Validated by The Analyst" | Green |
| `flagged` | "3 fields flagged" | Red with count |
| `stale` | "Research outdated" | Gray/amber |

Place this badge in:
- Property cards in the property list
- Property detail page header
- Property edit page header

---

## TASK 2: First-Visit Validation Gate

When a user visits a property page for the first time:

1. Check `property.validationStatus`
2. If `pending_validation`:
   - Show a full-width banner: "The Analyst hasn't reviewed this property yet."
   - Auto-trigger research (the existing `generateResearch()` function)
   - Show the AI animation while running
   - After completion, refresh the page to show range badges
3. If `flagged`:
   - Show a warning banner: "The Analyst flagged [N] assumptions that need review"
   - List the flagged fields with The Analyst's expected ranges
   - Each flag has "Accept The Analyst's range" or "Keep current value" buttons
4. If `stale`:
   - Show a subtle info banner: "Last reviewed [X] days ago — consider refreshing"
   - "Refresh Intelligence" button

**Hook:** Update `usePageVisit()` to also check `validationStatus`:
```tsx
const { isFirstVisit } = usePageVisit(pageKey);
const isUnvalidated = property?.validationStatus === "pending_validation";
const isFlagged = property?.validationStatus === "flagged";
const isStale = property?.validationStatus === "stale";
```

---

## TASK 3: Real-Time Field Alerts

When a user edits a property field and saves, the server now returns field alerts from The Analyst's watchdog. The PATCH response doesn't include them directly (they're fire-and-forget on the server), so you need a polling or SSE approach:

**Option A (simpler):** After saving, fetch the property's assumption_guidance:
```
GET /api/guidance?entityType=property&entityId={propertyId}
```
If any guidance rows have a `verdict` of "above" or "below" that weren't there before, show a toast:
"The Analyst flags: [field] [value] is [above/below] the expected range of [low]–[high]"

**Option B (better UX):** Add a new endpoint:
```
GET /api/properties/:id/validation-alerts
```
That calls `validateFieldChanges()` synchronously and returns the alerts. Call this after every save.

---

## TASK 4: Flagged Fields Inline Indicators

In the property edit form, next to each assumption input field:

- If The Analyst has an `assumption_guidance` row for this field:
  - Show a small range indicator: `$285–$340` with conviction badge
  - If the current value is OUTSIDE the range: red highlight on the input
  - If inside: subtle green checkmark
- If no guidance exists: no indicator (The Analyst hasn't reviewed this field yet)

**API:** `GET /api/guidance?entityType=property&entityId={propertyId}`
Returns array of `{ assumptionKey, valueLow, valueMid, valueHigh, confidence, reasoning }`

This is the core UX — The Analyst's ranges visible at every field, not hidden in a dashboard.

---

## TASK 5: Admin — Flagged Properties Panel

In Admin > Properties (or Admin > Intelligence), add a panel:

**"Properties Needing Review"**
- List all properties where `validationStatus = "flagged"` or `"pending_validation"`
- For each: show property name, flag count, and a "Review" button
- "Review" opens the property edit page scrolled to the first flagged field

**API:** `GET /api/admin/properties?validationStatus=flagged`
(or filter client-side from the existing properties list)

---

## BRANDING

- The Analyst (capitalized, singular) — never "the system" or "validation engine"
- "The Analyst flags..." not "Validation error:"
- "The Analyst suggests $285–$340" not "Recommended range: $285–$340"
- Use human verbs: "flags", "suggests", "recommends", "reviewed"
- Badges should feel like a colleague's sticky note, not a system error

---

## ORDER

1. Pull main
2. Run `npx tsx server/seeds/index.ts --force` (now includes Analyst validation)
3. Task 1: Validation status badges (30 min)
4. Task 2: First-visit validation gate (45 min)
5. Task 4: Flagged fields inline indicators (45 min)
6. Task 3: Real-time field alerts after save (30 min)
7. Task 5: Admin flagged properties panel (20 min)
