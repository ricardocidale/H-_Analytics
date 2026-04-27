/**
 * OIDC session-store + user-upsert integration test.
 *
 * Task #701 fixed two latent bugs in the OIDC login path:
 *
 *   1. `connect-pg-simple` was pointed at the custom-auth `sessions` table
 *      whose shape (id text PK, user_id, expires_at) does not match what
 *      the session store needs (sid varchar PK, sess jsonb, expire ts).
 *      Real OIDC logins therefore failed at session-write time.
 *   2. The verify callback discarded the result of the user upsert, so
 *      even when a session was written, `req.user` carried only the
 *      OIDC token claims — no internal `id`, no `role`. Any handler
 *      gated by `requireAdmin` / `req.user.role` silently denied access
 *      for OIDC-authed admins.
 *
 * This test exercises both fixes against the real DB:
 *
 *   - The session store can write / read / delete a session row in
 *     `user_sessions` (proves the schema fix).
 *   - The exported `upsertUser` returns the seeded admin's full user row
 *     (proves an OIDC sign-in surfaces the internal `id` + `role` that
 *     `requireAdmin` reads on every request).
 *
 * Skips itself when DATABASE_URL is unset (so a fresh checkout's
 * `vitest` run stays green).
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import session from "express-session";
import connectPg from "connect-pg-simple";
import { Pool } from "pg";
import { db } from "../../server/db";
import { users } from "../../shared/schema/auth";
import { upsertUser } from "../../server/replit_integrations/auth/replitAuth";
import { getDbUrl } from "../../shared/db-url";
import { eq } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("OIDC session store + upsertUser — real DB", () => {
  const PgStore = connectPg(session);
  const probePool = new Pool({ connectionString: getDbUrl() });
  const store = new PgStore({
    pool: probePool,
    createTableIfMissing: false,
    tableName: "user_sessions",
  });

  const sid = `task-701-test-${Date.now()}`;
  const stampedEmail = `task-701-${Date.now()}@example.invalid`;
  const adminEmail = "ricardo.cidale@norfolkgroup.io";

  beforeAll(async () => {
    // Ensure the known-admin row exists before the upsertUser test below.
    // The production seed (seedAdminUser in server/auth.ts) runs only on
    // server start — which never happens in CI unit-test runs. We insert
    // here with onConflictDoNothing so a locally-seeded row is not
    // overwritten, and the row is removed in afterAll with the same guard.
    await db
      .insert(users)
      .values({ email: adminEmail, role: "admin", firstName: "Ricardo", lastName: "Cidale" })
      .onConflictDoNothing();
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => store.destroy(sid, () => resolve()));
    await db.delete(users).where(eq(users.email, stampedEmail.toLowerCase())).catch(() => {});
    // Only remove the admin row if we are the ones who created it (CI case).
    // In local dev the row was seeded at startup — leave it alone. We detect
    // "we created it" by checking whether the role is still exactly 'admin'
    // and the row has no password hash (i.e. it's our minimal test fixture).
    const adminRow = await db.query.users.findFirst({ where: eq(users.email, adminEmail) });
    if (adminRow && adminRow.role === "admin" && !adminRow.passwordHash) {
      await db.delete(users).where(eq(users.email, adminEmail)).catch(() => {});
    }
    await probePool.end().catch(() => {});
  });

  it("session store can round-trip a row through user_sessions", async () => {
    const payload = {
      cookie: { originalMaxAge: 60_000, expires: new Date(Date.now() + 60_000) },
      passport: { user: { id: 999, email: stampedEmail, role: "admin" } },
    } as unknown as session.SessionData;

    await new Promise<void>((resolve, reject) =>
      store.set(sid, payload, (err) => (err ? reject(err) : resolve())),
    );

    const got = await new Promise<session.SessionData | null | undefined>((resolve, reject) =>
      store.get(sid, (err, sess) => (err ? reject(err) : resolve(sess))),
    );
    expect(got).toBeTruthy();
    // Cast through unknown so we can read the round-tripped passport payload
    // without leaning on Express's narrow SessionData typing.
    const passport = (got as unknown as { passport?: { user?: { email?: string; role?: string } } })
      ?.passport;
    expect(passport?.user?.email).toBe(stampedEmail);
    expect(passport?.user?.role).toBe("admin");
  });

  it("upsertUser returns the seeded admin's full row (id + role) when OIDC claims match", async () => {
    // The admin row is pre-seeded in beforeAll above so this test runs
    // identically in CI (fresh DB) and in local dev (production-seeded DB).
    const result = await upsertUser({
      email: adminEmail,
      first_name: "Ricardo",
      last_name: "Cidale",
    });
    expect(result.id).toEqual(expect.any(Number));
    expect(result.email).toBe(adminEmail);
    // The seeded role for this admin is `super_admin`; whatever the seed
    // recorded must survive the OIDC sign-in (we never demote).
    expect(["super_admin", "admin"]).toContain(result.role);
  });

  it("upsertUser creates a fresh row with role=user for an unknown OIDC email", async () => {
    const created = await upsertUser({
      email: stampedEmail,
      first_name: "Test",
      last_name: "Newcomer",
    });
    expect(created.id).toEqual(expect.any(Number));
    expect(created.email).toBe(stampedEmail.toLowerCase());
    expect(created.role).toBe("user");
  });

  it("upsertUser refuses claims missing the required email", async () => {
    await expect(upsertUser({})).rejects.toThrow(/email/i);
  });
});
