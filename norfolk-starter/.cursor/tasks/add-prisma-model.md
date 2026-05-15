# Add a Prisma Model

## Steps

1. Define the model in `prisma/schema.prisma`
2. Create the migration: `npx prisma migrate dev --name <description>`
3. Prisma client auto-regenerates — types available immediately
4. If needed, add seed data in `prisma/seed.ts`
5. Create Zod validation schemas in `lib/validations/<domain>.ts`
6. Add API routes in `app/api/<resource>/route.ts`
7. Run `npm run build` to verify

## Example Model

```prisma
model Project {
  id          String   @id @default(cuid())
  name        String
  description String?
  status      String   @default("active")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([status])
}
```

## Reminders

- Use `cuid()` for IDs (not UUID) — consistent with existing patterns
- Use `Decimal` with `@db.Decimal(18, 4)` for monetary amounts
- Always add `@@index` on fields you filter/sort by
- Prisma client is generated to `lib/generated/prisma` (gitignored)
- Import from `@prisma/client` — it's aliased in tsconfig.json
