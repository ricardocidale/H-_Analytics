# Replit Agent Brief — Post-MASTER-PLAN Audit (UI & DB Tasks)

> The CLI has handled: engine smoke tests (2,437 pass), skills audit (7 files fixed),
> stale reference cleanup, TypeScript verification, dependency audit.
> You handle the UI, DB, and server-side items below.

Pull latest first: `git pull origin main`

---

## 1. Dead UI Component Scan

Search `client/src/components/` for components that are not imported anywhere else:

```bash
# For each component file, check if it's imported
for f in $(find client/src/components -name "*.tsx" -type f); do
  base=$(basename "$f" .tsx)
  count=$(grep -rl "$base" client/src/ --include="*.ts" --include="*.tsx" | grep -v "$f" | wc -l)
  if [ "$count" -eq 0 ]; then echo "ORPHAN: $f"; fi
done
```

Delete any truly orphaned components (not exported via index.ts, not lazy-loaded, not used anywhere).

## 2. `.agents/skills/` Cleanup

The `.agents/skills/` directory has 55+ skill directories from early Replit Agent sessions. They are separate from `.claude/skills/` and likely stale.

**Check:** Are any `.agents/skills/` files loaded at runtime?
```bash
grep -rl ".agents/skills" --include="*.ts" --include="*.tsx" --include="*.json" .
```

If nothing references them at runtime, **archive or delete** the `.agents/skills/` directory. Key concern: `.agents/skills/marcela-ai-system/` still uses old chatbot name "Marcela."

If some ARE used, rename any "Marcela" references to "Rebecca."

## 3. User Group Remnants in Server Code

Phase 1.4 removed user groups but Replit wisely kept `users.company_id` due to deep dependencies. Check these files for dead `userGroup` code paths:

- `server/storage/index.ts` — look for `getUserGroup`, `createUserGroup`, etc.
- `server/storage/admin.ts` — any user group CRUD functions
- `shared/schema/core.ts` — `userGroups` table definition (should already be removed)

Remove any dead functions that reference tables/columns that no longer exist. Keep `company_id` references intact.

## 4. Naming Convention Cleanup

These files use camelCase while the rest of the codebase uses kebab-case:
- `server/calculationChecker.ts` → rename to `server/calculation-checker.ts`
- `server/syncHelpers.ts` → rename to `server/sync-helpers.ts`

Update all imports that reference the old names. Run TypeScript check after.

## 5. DB: Stale Migration Files

Check `server/migrations/` for:
- Migrations that reference dropped tables (user_groups, user_group_properties) — these should stay as-is (they're historical)
- Any migration with `marcela` in the name — leave the migration name but check the SQL is correct
- Duplicate or conflicting migrations

## 6. Feature Flag Cleanup

`server/feature-flags.ts` has only one flag left: `REBECCA_V2` which always defaults to `true`. Check:
1. Is `REBECCA_V2` used anywhere to gate behavior?
2. If it always defaults to true and is never set to false, remove it entirely and inline the v2 behavior.

```bash
grep -rn "REBECCA_V2\|rebecca_v2\|rebeccaV2" server/ client/ shared/ --include="*.ts" --include="*.tsx"
```

## 7. Server Route Registration Audit

Verify all admin routes in `server/routes/admin/` are properly registered in the main router:
```bash
ls server/routes/admin/
# Then check server/routes/admin/index.ts or wherever routes are mounted
```

Specifically verify the NEW routes from this sprint:
- `server/routes/admin/required-fields.ts` — is it registered?
- `server/routes/admin/user-defaults.ts` — is it registered?

## 8. Duplicate Formatting Utilities

Check if formatting functions are duplicated across:
- `client/src/lib/formatters.ts`
- `server/routes/helpers.ts`
- `engine/helpers/utils.ts`

If the same `formatCurrency`, `formatPercent`, `formatNumber` logic exists in multiple places, consolidate into `shared/` so both client and server use the same code.

## 9. Security Quick Check

- Verify `.env.example` contains NO real secrets (only placeholder text)
- Verify all admin routes check `req.isAuthenticated()` or equivalent auth middleware
- Verify `server/routes/ssrf-guard.ts` is applied to all routes that fetch external URLs

## 10. Health Check After All Changes

```bash
npm run check      # TypeScript
npm test           # Full test suite
npm run build      # Production build
```

All must pass. Only DB-connection-dependent tests may fail locally.

---

## Priority Order
1. Route registration audit (#7) — high impact if routes are missing
2. Feature flag cleanup (#6) — quick win
3. User group remnants (#3) — dead code removal
4. `.agents/skills/` cleanup (#2) — reduces confusion
5. Dead component scan (#1) — code hygiene
6. Naming conventions (#4) — consistency
7. Duplicate utilities (#8) — maintainability
8. Security check (#9) — always important
9. Stale migrations (#5) — low priority, historical
10. Health check (#10) — final verification
