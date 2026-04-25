/**
 * Real-DB integration test for `script/lib/legacy-logo-cleanup.ts`
 * (Task #526).
 *
 * The CLI script wraps these helpers; testing them directly against
 * Postgres is what proves the cleanup actually classifies and applies
 * the way the report claims it will. Static contract tests can't catch
 * a SQL typo in `findCanonicalSibling` or a forgotten "blocked by
 * is_default" branch in `applyDeletes`.
 *
 * Skips itself when DATABASE_URL is unset (so `vitest` on a fresh
 * checkout stays green). All inserts use a unique synthetic
 * `company_name` prefix so the test never collides with seed data and
 * cleans up after itself in afterEach.
 */
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { pool } from "../../server/db";
import {
  applyDeletes,
  applyRewrites,
  classifyLegacyLogos,
  fetchLegacyLogos,
  findCanonicalSibling,
  summariseCleanup,
} from "../../script/lib/legacy-logo-cleanup";

const HAS_DB = !!process.env.DATABASE_URL;
const d = HAS_DB ? describe : describe.skip;

// All synthetic rows share this company-name prefix so the afterEach
// teardown can locate and remove them without touching real seeded
// branding rows. The timestamp keeps parallel test runs disjoint.
const PREFIX = `__task526_test_${Date.now()}_`;

async function insertLogo(opts: {
  name: string;
  companyName: string;
  url: string;
  isDefault?: boolean;
  isAppLogo?: boolean;
}): Promise<number> {
  const { rows } = await pool.query<{ id: number }>(
    `INSERT INTO logos (name, company_name, url, is_default, is_app_logo)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [opts.name, opts.companyName, opts.url, !!opts.isDefault, !!opts.isAppLogo],
  );
  return rows[0].id;
}

async function logoExists(id: number): Promise<boolean> {
  const { rows } = await pool.query<{ id: number }>(
    `SELECT id FROM logos WHERE id = $1`,
    [id],
  );
  return rows.length > 0;
}

async function getLogoUrl(id: number): Promise<string | null> {
  const { rows } = await pool.query<{ url: string }>(
    `SELECT url FROM logos WHERE id = $1`,
    [id],
  );
  return rows[0]?.url ?? null;
}

d("legacy logo cleanup — real-DB behaviour", () => {
  beforeAll(async () => {
    // Sanity: the test should never run against a DB that already has
    // the synthetic prefix from a prior, crashed test invocation. Wipe
    // any stragglers so a flaky earlier run doesn't poison this one.
    await pool.query(`DELETE FROM logos WHERE company_name LIKE $1`, [`${PREFIX}%`]);
  });

  afterEach(async () => {
    await pool.query(`DELETE FROM logos WHERE company_name LIKE $1`, [`${PREFIX}%`]);
  });

  it("classifies a legacy logo as 'rewrite' when a /api/media sibling exists", async () => {
    const company = `${PREFIX}with_sibling`;
    const legacyId = await insertLogo({
      name: "old logo",
      companyName: company,
      url: "/objects/uploads/abc123",
    });
    const siblingId = await insertLogo({
      name: "new logo",
      companyName: company,
      url: "/api/media/new-logo.png",
      isDefault: true,
    });

    const sibling = await findCanonicalSibling(pool, company);
    expect(sibling).toBe("/api/media/new-logo.png");

    const legacy = await fetchLegacyLogos(pool);
    const mine = legacy.filter((r) => r.id === legacyId);
    expect(mine).toHaveLength(1);

    const classified = await classifyLegacyLogos(pool, mine);
    expect(classified[0].verdict).toBe("rewrite");
    expect(classified[0].canonicalUrl).toBe("/api/media/new-logo.png");

    // Sibling row is canonical — fetchLegacyLogos must NOT include it.
    expect(legacy.find((r) => r.id === siblingId)).toBeUndefined();
  });

  it("classifies a legacy logo as 'delete' when no sibling exists", async () => {
    const company = `${PREFIX}no_sibling`;
    const legacyId = await insertLogo({
      name: "orphan logo",
      companyName: company,
      url: "/objects/uploads/orphan-key",
    });

    const legacy = await fetchLegacyLogos(pool);
    const mine = legacy.filter((r) => r.id === legacyId);
    const classified = await classifyLegacyLogos(pool, mine);
    expect(classified[0].verdict).toBe("delete");
    expect(classified[0].canonicalUrl).toBeNull();
  });

  it("rewrites resolvable logos in place and leaves unresolvable rows alone", async () => {
    const companyA = `${PREFIX}rewrite_target`;
    const companyB = `${PREFIX}delete_target`;
    const rewriteId = await insertLogo({
      name: "old",
      companyName: companyA,
      url: "/objects/uploads/will-be-rewritten",
    });
    await insertLogo({
      name: "new",
      companyName: companyA,
      url: "/api/media/replacement.png",
    });
    const deleteId = await insertLogo({
      name: "orphan",
      companyName: companyB,
      url: "/objects/uploads/will-stay",
    });

    const legacy = await fetchLegacyLogos(pool);
    const mine = legacy.filter((r) => r.id === rewriteId || r.id === deleteId);
    const classified = await classifyLegacyLogos(pool, mine);

    const rewritten = await applyRewrites(pool, classified);
    expect(rewritten).toBe(1);

    expect(await getLogoUrl(rewriteId)).toBe("/api/media/replacement.png");
    expect(await getLogoUrl(deleteId)).toBe("/objects/uploads/will-stay");
  });

  it("deletes unresolvable rows and refuses to delete default / app-logo rows", async () => {
    const company = `${PREFIX}delete_mix`;
    const orphanId = await insertLogo({
      name: "orphan",
      companyName: company,
      url: "/objects/uploads/k1",
    });
    const defaultId = await insertLogo({
      name: "default-orphan",
      companyName: `${company}_default`,
      url: "/objects/uploads/k2",
      isDefault: true,
    });
    const appId = await insertLogo({
      name: "app-orphan",
      companyName: `${company}_app`,
      url: "/objects/uploads/k3",
      isAppLogo: true,
    });

    const legacy = await fetchLegacyLogos(pool);
    const mine = legacy.filter((r) =>
      [orphanId, defaultId, appId].includes(r.id),
    );
    const classified = await classifyLegacyLogos(pool, mine);

    const summary = summariseCleanup(classified);
    expect(summary.delete).toBe(3);
    expect(summary.blockedByDefault).toBe(1);
    expect(summary.blockedByAppLogo).toBe(1);

    const result = await applyDeletes(pool, classified);
    expect(result.deleted).toBe(1);
    expect(result.blocked.map((r) => r.id).sort()).toEqual([defaultId, appId].sort());

    expect(await logoExists(orphanId)).toBe(false);
    expect(await logoExists(defaultId)).toBe(true);
    expect(await logoExists(appId)).toBe(true);
  });

  it("nulls FK references via ON DELETE SET NULL when removing an orphan logo", async () => {
    const company = `${PREFIX}fk_detach`;
    const orphanId = await insertLogo({
      name: "linked-orphan",
      companyName: company,
      url: "/objects/uploads/k-fk",
    });

    // Create a company that references the orphan logo. The FK declares
    // `ON DELETE SET NULL`, so deleting the logo must leave the company
    // row intact with logo_id = NULL.
    const { rows: companyRows } = await pool.query<{ id: number }>(
      `INSERT INTO companies (name, type, logo_id) VALUES ($1, 'spv', $2) RETURNING id`,
      [`${PREFIX}fk_company`, orphanId],
    );
    const companyId = companyRows[0].id;

    try {
      const legacy = await fetchLegacyLogos(pool);
      const mine = legacy.filter((r) => r.id === orphanId);
      const classified = await classifyLegacyLogos(pool, mine);
      expect(classified[0].refs.companies).toContain(companyId);

      const result = await applyDeletes(pool, classified);
      expect(result.deleted).toBe(1);

      const { rows } = await pool.query<{ logo_id: number | null }>(
        `SELECT logo_id FROM companies WHERE id = $1`,
        [companyId],
      );
      expect(rows[0].logo_id).toBeNull();
    } finally {
      await pool.query(`DELETE FROM companies WHERE id = $1`, [companyId]);
    }
  });
});
