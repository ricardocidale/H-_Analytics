# Database Sync Behavior — Fill-Only Mode

## Overview

The production sync mechanism uses **fill-only mode**: it pushes development seed values to the production database ONLY for fields that are not already populated by a user. Existing user-edited values are never overwritten.

## Key Files

| File | Purpose |
|------|---------|
| `server/syncHelpers.ts` | Core helper: `isFieldEmpty()`, `fillMissingFields()`, `runFillOnlySync()` |
| `server/routes.ts` | `POST /api/admin/seed-production` endpoint (calls `runFillOnlySync`) |
| `client/src/pages/Admin.tsx` | Database tab UI — "Populate Production" card |
| `tests/admin/fill-only-sync.test.ts` | Unit tests for fill-only behavior |
| `tests/admin/database-sync.test.ts` | Golden-value tests for seed constants |
| `shared/constants.ts` | Source of truth for all default values + `SEED_DEBT_ASSUMPTIONS` |

## Fill-Only Logic

### `isFieldEmpty(value)`
Returns `true` if value is `null`, `undefined`, or an empty/whitespace string. Returns `false` for `0`, `false`, objects, arrays — these are valid user values.

### `fillMissingFields(existing, defaults, excludeKeys?)`
Compares an existing record against defaults. For each key in defaults:
- If the existing value `isFieldEmpty()` → include in updates
- If the existing value is populated → skip (preserve user value)
- Keys in `excludeKeys` are always skipped (default: `id`, `createdAt`, `updatedAt`, `userId`)

Returns a `Partial<T>` containing only the fields that need filling.

### `runFillOnlySync(storage, generateResearchValues?)`
Orchestrates the full fill-only sync:

1. **Global Assumptions**: If none exist → create with seed data. If exist → fill only empty fields.
2. **Properties**: If property name doesn't exist → create with seed data. If exists → fill only empty fields.
3. **Fee Categories**: If property has no categories → create defaults. If has categories → only add missing category names (never update rates).
4. **Design Themes**: If no themes exist → create "Fluid Glass". Otherwise → skip.

## UI Layout

The Database tab has two distinct cards:
1. **Database Status** (top) — "Check Status" button, entity counts, global assumptions summary, properties table
2. **Populate Production** (bottom) — amber-themed card with "Fill Missing Values" button and confirmation dialog

## Behavioral Contract

- **NEVER overwrites** user-set values (rates, dates, names, etc.)
- Zero (`0`) and `false` are treated as valid user values, not empty
- Fee category rates are never updated if the category exists — only missing categories are added
- Users and user groups are created if missing but never overwritten
- Theme is created only if no themes exist at all

## Response Shape

```typescript
{
  users: { created: number; skipped: number },
  userGroups: { created: number; skipped: number },
  globalAssumptions: { created: number; skipped: number; filled: number },
  properties: { created: number; skipped: number; filled: number },
  propertyFeeCategories: { created: number; skipped: number },
  designThemes: { created: number; skipped: number },
}
```

Note: No `updated` field — fill-only mode either creates, fills gaps, or skips entirely.
