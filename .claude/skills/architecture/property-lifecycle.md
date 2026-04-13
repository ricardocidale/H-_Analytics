---
name: Property Lifecycle
description: Property portfolio management — soft delete, user assignment, scenario overrides, admin controls
---

# Property Lifecycle Skill

## Core Concepts

Properties are **global entities** that belong to the management company, not individual users. Visibility is controlled through the `userDefaultProperties` join table.

## Schema Tables

- `properties` — canonical property record with base assumptions and `archivedAt` soft-delete column
- `userDefaultProperties` — maps `userId` to `propertyId` (in `shared/schema/auth.ts`)
- `scenarioPropertyOverrides` — per-scenario assumption overrides with `changeType` (added/removed/modified)

## Lifecycle States

1. **Active** — `archivedAt IS NULL`. Visible to assigned users.
2. **Archived** — `archivedAt` set to timestamp. Hidden from listings but data preserved.
3. Archived properties can be **restored** by admin (set `archivedAt` back to null).

## Critical Rules

- **NEVER hard delete properties.** Always use soft delete via `archivedAt`.
- Property listings MUST filter on `archivedAt IS NULL`.
- Users see properties via `userDefaultProperties` join, not just properties they created.
- Admin sees all properties regardless of assignment.
- The `archivedBy` column tracks who archived the property.

## Scenario Integration

- `scenarioPropertyOverrides.changeType`: `"added"` | `"removed"` | `"modified"`
- `overrides` JSONB contains only changed fields (sparse override pattern)
- `basePropertySnapshot` stores frozen state at scenario creation for drift detection

## Admin Operations

| Operation | Implementation |
|-----------|---------------|
| Assign property to user | INSERT into `userDefaultProperties` |
| Unassign | DELETE from `userDefaultProperties` |
| Archive | SET `archivedAt = now()`, `archivedBy = adminId` |
| Restore | SET `archivedAt = NULL`, `archivedBy = NULL` |

## Key Files

- `shared/schema/properties.ts` — property schema with `archivedAt`, `archivedBy`, `createdBy`
- `shared/schema/auth.ts` — `userDefaultProperties` join table
- `shared/schema/scenarios.ts` — `scenarioPropertyOverrides` with `changeType`
- `server/routes/` — property CRUD and admin assignment endpoints
- `engine/helpers/default-resolver.ts` — `computePropertyDefaults()` for intelligent default seeding

## See Also

- `docs/architecture/property-portfolio-model.md` — full architecture reference
- `finance/scenarios.md` — scenario save/load/compare system
