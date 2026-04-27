# Cleanup: `oidc-session-store.integration.test.ts` CI seed gap

> **Owner:** CC (server-side test + seed). CC's lane per 2026-04-27 `claude-replit-split.md` revision.
> **Discovered:** 2026-04-27 during v1 CI investigation. Pre-existing — pre-dates G1 saga.
> **Severity:** Low — test reports false positive in CI; the OIDC session-store logic itself is correct.

## What's failing

`tests/db/oidc-session-store.integration.test.ts > OIDC session store + upsertUser — real DB > upsertUser returns the seeded admin's full row (id + role) when OIDC claims match` fails in CI with:

```
AssertionError: expected [ 'super_admin', 'admin' ] to include 'user'
```

**Locally the test passes** (4/4) because the local DB seed includes a 'user' role. CI's seed (auto-generated from `script/seed-model-defaults.ts` + auth.ts seedAdminUser) only provisions `admin` + `super_admin` roles — no plain `user`.

## Root cause

The test asserts that `upsertUser()` returns the row with role `'user'` when OIDC claims match a non-admin email. In CI, the seed never creates a user with that role, so `upsertUser()` matches against an admin row and returns role `'admin'` instead.

Two places to look:
1. **Test setup** (`tests/db/oidc-session-store.integration.test.ts`) — does it pre-create the expected `'user'` row before assertion? If yes but CI doesn't honor that setup, the issue is environmental. If no, it relies on a baseline seed that exists locally but not in CI.
2. **CI seed** (`script/seed-model-defaults.ts` + `server/auth.ts:seedAdminUser`) — confirm what roles are seeded in CI vs local.

## Likely fix path

If the test should be self-contained (best practice for integration tests), it should INSERT the expected `'user'` row in `beforeEach` rather than rely on global seed state. If that's already happening but the row gets filtered out, the bug is in `upsertUser`'s claim-matching logic.

## Tasks (S1-S2)

### S1 — Investigate the test's setup vs CI seed

**File:** `tests/db/oidc-session-store.integration.test.ts`

**Change:** Read the test file. Determine whether it:
- (a) Creates its own fixture row in `beforeEach` (then fix any setup bug)
- (b) Relies on a globally-seeded row (then make it self-contained)

**Acceptance:**
- [ ] One of (a)/(b) confirmed; root cause documented in commit message.

### S2 — Make the test self-contained or fix the seed

**File:** Either the test file (option (b) → make it self-contained with explicit fixture insert/cleanup) or `server/auth.ts` / `script/seed-model-defaults.ts` (option (b-alt) → seed a 'user' role row in test mode).

**Recommended:** make the test self-contained. Integration tests that rely on global seed state are fragile by definition.

```ts
beforeEach(async () => {
  // Test fixture: ensure a 'user' role exists for OIDC claim matching
  await db.insert(users).values({
    email: 'oidc-test-user@test.local',
    role: 'user',
    // ...other required fields
  }).onConflictDoNothing();
});

afterEach(async () => {
  await db.delete(users).where(eq(users.email, 'oidc-test-user@test.local'));
});
```

**Acceptance:**
- [ ] `npm run test:file -- tests/db/oidc-session-store.integration.test.ts` PASSES locally + in CI
- [ ] Test no longer depends on a particular seed shape
- [ ] Cleanup runs even on test failure

## Verification

- Push to a PR branch
- CI test-and-verify Run Tests step passes for this specific test
- Local `npm run test:file -- tests/db/oidc-session-store.integration.test.ts` continues to pass

## Out of scope

- Other integration tests with similar global-seed dependencies (audit `tests/db/*.integration.test.ts` for the pattern but treat each as its own fix).
- Adding a 'user' role to the production seed — that's a separate decision (do we want a default 'user' row in prod?).

## Estimated effort

30 minutes. Read test, confirm root cause, refactor to self-contained, verify both paths.
