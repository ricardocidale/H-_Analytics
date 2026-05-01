# Property Portfolio Model

Architecture reference for property lifecycle, ownership, scenario integration, and admin controls.

---

## Property Lifecycle

```
create --> assign to users --> customize via scenarios --> archive --> restore
```

1. **Create**: Admin (or seed) inserts a property row in `properties` table with base assumptions (ADR, occupancy, cost rates, revenue shares, capital structure).
2. **Assign**: Admin assigns properties to users via `userDefaultProperties` join table. Users only see properties assigned to them.
3. **Customize**: Users create scenarios that layer overrides on top of base property assumptions via `scenarioPropertyOverrides`.
4. **Archive**: Admin sets `archivedAt` timestamp. Property disappears from active listings but remains in DB with all historical data intact.
5. **Restore**: Admin clears `archivedAt`. Property reappears in listings.

---

## Ownership Model

Properties are **global entities** — they exist independently of any single user. Visibility is controlled by the `userDefaultProperties` join table.

| Table | Purpose |
|-------|---------|
| `properties` | The canonical property record. One row per property. Contains all base assumptions. |
| `userDefaultProperties` | Maps `userId` to `propertyId`. Determines which properties a user sees. |
| `scenarioPropertyOverrides` | Per-scenario overrides to a property's assumptions. |

**Key rules:**
- A property can be assigned to many users.
- A user sees only their assigned properties (plus any they create).
- Admin sees all properties regardless of assignment.
- Properties are never owned by a single user — they belong to the management company.

---

## Editing Rules

| Actor | What they edit | Where it lives |
|-------|---------------|----------------|
| Admin | Base assumptions (ADR, cost rates, revenue shares, capital) | `properties` table directly |
| User | Scenario overrides (what-if adjustments) | `scenarioPropertyOverrides.overrides` JSONB |
| Engine | Computed defaults from quality tier, model, country | `computePropertyDefaults()` in `engine/helpers/default-resolver.ts` |

**Principle:** Users never modify the base property record. All user-level customization flows through scenarios. This keeps the golden baseline intact for comparison.

---

## Scenario Integration

The `scenarioPropertyOverrides` table connects properties to scenarios:

```
scenarioPropertyOverrides {
  scenarioId    -> scenarios.id
  propertyId    -> properties.id
  propertyName  -> denormalized name for display
  changeType    -> "added" | "removed" | "modified"
  overrides     -> JSONB of changed assumption fields
  basePropertySnapshot -> frozen copy at scenario creation time
}
```

**changeType semantics:**
- `added` — property included in this scenario but not in the baseline
- `removed` — property excluded from this scenario (present in baseline)
- `modified` — property assumptions adjusted relative to baseline

The `overrides` JSONB contains **only the fields that differ** from the baseline. Example: `{ "startAdr": 250, "adrGrowthRate": 0.04 }`. Unspecified fields use the base property value.

The `basePropertySnapshot` stores a frozen copy of the property state at scenario creation, enabling drift detection.

---

## Soft Delete

Properties are **never hard deleted**. The schema enforces this:

```typescript
// shared/schema/properties.ts
archivedAt: timestamp("archived_at"),  // null = active, non-null = archived
archivedBy: integer("archived_by").references(() => users.id),
```

**Rules:**
- `archivedAt = null` means the property is active and visible.
- `archivedAt = <timestamp>` means the property is archived. It still exists with all data.
- `archivedBy` tracks which admin archived it.
- All property listings filter on `archivedAt IS NULL` by default.
- Historical scenarios that reference archived properties still work (snapshot preserved).
- Admin can restore by setting `archivedAt` back to `null`.

---

## Admin Controls

| Action | How |
|--------|-----|
| Create property | Insert into `properties` table with base assumptions |
| Assign to user | Insert into `userDefaultProperties` (userId, propertyId) |
| Unassign from user | Delete from `userDefaultProperties` |
| Archive | Set `archivedAt` to current timestamp, `archivedBy` to admin userId |
| Restore | Set `archivedAt` to null, clear `archivedBy` |
| Edit base assumptions | Update `properties` row directly |
| View all properties | Admin bypasses `userDefaultProperties` filter |
| Assign default scenarios | Toggle ON/OFF per user in admin panel |

Admin property management uses a chevron-expandable list with ON/OFF toggles per user, as documented in the session memory and CLAUDE.md preferences.
