---
name: zod-schema-sync
description: Zod schema sync rule for ResearchConfig. Prevents 400 errors when new fields are added to TypeScript types but not to the Zod strict validation schema. Use when modifying ResearchConfig or similar persisted JSON objects.
---

# Zod Schema Sync — ResearchConfig

## The Problem

The `ResearchConfig` object is persisted as JSON inside `global_assumptions.researchConfig`. Both the **TypeScript interface** (shared) and the **server Zod validation schema** (route handler) must list every field. When a new field is added to the TypeScript type but not to the Zod `.strict()` schema, the server returns **400 Bad Request** on save because Zod rejects unrecognised keys.

## The Three Places That Must Stay In Sync

When adding or removing a field from `ResearchConfig`:

1. **TypeScript interface** — `shared/schema/research-types.ts` → `ResearchConfig`
2. **Server Zod schema** — `server/routes/admin/research.ts` → `researchConfigSchema` (has `.strict()`)
   - If the field is a `ContextLlmConfig`, also check `contextLlmConfigSchema` in the same file.
3. **Server merge handler** — same file, inside the `PUT /api/admin/research-config` handler → the `merged` object literal that shallow-merges `incoming` into `current`.

All three must list the field. Missing any one causes:
- Missing from (1): TypeScript compile errors or missing autocomplete.
- Missing from (2): **400 on save** — the `.strict()` Zod schema rejects the unknown key.
- Missing from (3): the field is accepted but silently dropped on save, reverting to the old value.

## Checklist (copy-paste into your workflow)

```
[ ] shared/schema/research-types.ts  — ResearchConfig interface has the field
[ ] server/routes/admin/research.ts  — researchConfigSchema has the field with correct Zod type
[ ] server/routes/admin/research.ts  — merged object in PUT handler includes the field
```

## Pattern for ContextLlmConfig fields

```typescript
// In researchConfigSchema:
myNewLlm: contextLlmConfigSchema.optional(),

// In merged object:
myNewLlm: incoming.myNewLlm ? { ...current.myNewLlm, ...incoming.myNewLlm } : current.myNewLlm,
```

## Pattern for simple optional fields

```typescript
// In researchConfigSchema:
myFlag: z.boolean().optional(),

// In merged object:
myFlag: incoming.myFlag ?? current.myFlag,
```
