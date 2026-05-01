# Database Seeding Rules

> Full reference (schema tables, seeding mechanisms, seed data, migrations): `.claude/skills/database/SKILL.md`

## Seeding Invariants (Non-Negotiable)

1. **Seeding errors cascade** — Seed data is the foundation of all financial calculations. Wrong values produce cascading failures across the entire model. Review and verify before any deployment.

2. **Production sync is fill-only** — The seed endpoint MUST never overwrite user-set values. Uses `isFieldEmpty()` + `fillMissingFields()` from `server/syncHelpers.ts`. Zero and `false` are valid user values.

3. **DB sync is SQL only** — Synchronizing values between environments MUST use direct SQL statements. No auto-sync on startup, no "sync from dev to prod" endpoints, no code that reads one DB and writes another.

4. **All properties created with `userId: null`** — Shared ownership. Every authenticated user must see all portfolio properties.

5. **Scenario load must restore as shared** — `loadScenario()` must restore properties with `userId: null`, not the logged-in user's ID. Restoring with a user ID makes properties invisible to all other users.

6. **Passwords from env vars only** — `ADMIN_PASSWORD`, `CHECKER_PASSWORD`, `REYNALDO_PASSWORD`. Dev seed script's hardcoded password is overridden on server start by env vars.

7. **Seed order: users before properties** — Foreign key constraint. Seed scripts handle this automatically.

## Three Seeding Mechanisms

| Mechanism | When | File |
|-----------|------|------|
| Auto user seeding | Every server start | `server/auth.ts → seedAdminUser()` |
| Dev seed script | Manual dev reset | `server/seed.ts` (use `--force` to reset) |
| Production seed endpoint | Initial setup | `POST /api/admin/seed-production` (admin auth) |
