/**
 * Real-DB concurrency test for `tryReserveAnalystCooldown`.
 *
 * The mocked route test (tests/server/analyst-admin-route.test.ts) proves the
 * handler honours the cooldown semantics; this suite proves the SQL primitive
 * itself is atomic against actual concurrent Postgres clients. The CTE in
 * `intelligence-v2.ts` is the only thing standing between two simultaneous
 * admin clicks and a double-fire of the analyst pipeline — it deserves a
 * test that hits real Postgres rather than a JS Map.
 *
 * Skips itself when DATABASE_URL is unset (so `vitest` on a fresh checkout
 * stays green), and uses a dedicated synthetic test user inserted in
 * beforeAll / removed in afterAll so it never collides with seeded data.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "../../server/db";
import { storage } from "../../server/storage";
import { users } from "../../shared/schema/auth";
import { analystCooldowns } from "../../shared/schema/intelligence-v2";
import { eq, sql } from "drizzle-orm";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

d("tryReserveAnalystCooldown — real-DB concurrency", () => {
  let testUserId: number;

  beforeAll(async () => {
    // Insert a throwaway user with a unique email so the FK on
    // analyst_cooldowns.user_id resolves without colliding with seed data.
    const stamp = `cooldown-test-${Date.now()}@example.invalid`;
    const [u] = await db.insert(users).values({
      email: stamp,
      passwordHash: "x",
    }).returning({ id: users.id });
    testUserId = u.id;
  });

  afterAll(async () => {
    if (testUserId != null) {
      await db.delete(analystCooldowns).where(eq(analystCooldowns.userId, testUserId));
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  beforeEach(async () => {
    await db.delete(analystCooldowns).where(eq(analystCooldowns.userId, testUserId));
  });

  it("grants exactly one slot when N callers race for a fresh cooldown", async () => {
    const N = 12;
    const cooldownMs = 60_000;
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: N }, () => storage.tryReserveAnalystCooldown(testUserId, now, cooldownMs)),
    );
    const grants = results.filter(r => r.granted).length;
    expect(grants).toBe(1);
    // Every loser reports a positive retry window bounded by cooldownMs.
    for (const r of results) {
      if (!r.granted) {
        expect(r.retryAfterMs).toBeGreaterThan(0);
        expect(r.retryAfterMs).toBeLessThanOrEqual(cooldownMs);
      }
    }
    // DB state matches: exactly one row, reserved at `now`.
    const rows = await db.select().from(analystCooldowns).where(eq(analystCooldowns.userId, testUserId));
    expect(rows.length).toBe(1);
    expect(rows[0].reservedAt.getTime()).toBe(now.getTime());
  });

  it("re-grants after the cooldown window elapses", async () => {
    const cooldownMs = 50;
    const t0 = new Date();
    const first = await storage.tryReserveAnalystCooldown(testUserId, t0, cooldownMs);
    expect(first.granted).toBe(true);

    const tEarly = new Date(t0.getTime() + 10);
    const denied = await storage.tryReserveAnalystCooldown(testUserId, tEarly, cooldownMs);
    expect(denied.granted).toBe(false);
    if (!denied.granted) {
      expect(denied.retryAfterMs).toBe(cooldownMs - 10);
    }

    const tLate = new Date(t0.getTime() + cooldownMs + 5);
    const second = await storage.tryReserveAnalystCooldown(testUserId, tLate, cooldownMs);
    expect(second.granted).toBe(true);

    // The single row should now reflect the second reservation's timestamp.
    const rows = await db.select().from(analystCooldowns).where(eq(analystCooldowns.userId, testUserId));
    expect(rows.length).toBe(1);
    expect(rows[0].reservedAt.getTime()).toBe(tLate.getTime());
  });

  it("computes retryAfterMs from the row the gate decision saw", async () => {
    // Seed a reservation in the past so we know the canonical retry window.
    const now = new Date();
    const reservedAt = new Date(now.getTime() - 20_000); // 20s ago
    await db.execute(sql`
      INSERT INTO analyst_cooldowns (user_id, reserved_at)
      VALUES (${testUserId}, ${reservedAt})
    `);
    const cooldownMs = 60_000;
    const r = await storage.tryReserveAnalystCooldown(testUserId, now, cooldownMs);
    expect(r.granted).toBe(false);
    if (!r.granted) {
      // 60s budget − 20s elapsed = 40s remaining.
      expect(r.retryAfterMs).toBe(40_000);
    }
  });
});
