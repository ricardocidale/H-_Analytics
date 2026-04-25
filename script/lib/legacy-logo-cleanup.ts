/**
 * Pure logic backing `script/cleanup-legacy-logo-urls.ts` (Task #526).
 *
 * Lives in `script/lib/` so it can be imported from tests without
 * triggering the CLI's `main()` side effects. The CLI is a thin wrapper
 * around these functions; everything that touches the DB is here.
 *
 * Why an explicit `Pool`-shaped dependency? Vitest's real-DB suites
 * already hold a `Pool` from `server/db`; threading it in keeps the
 * cleanup script and its test on the same connection so the test can
 * insert a fixture row in one transaction-free statement and have the
 * cleanup function see it on the next.
 */
import type { Pool } from "pg";

export interface LegacyLogoRow {
  id: number;
  name: string;
  companyName: string;
  url: string;
  isDefault: boolean;
  isAppLogo: boolean;
}

export interface LogoFkRefs {
  companies: number[];
  businessBrands: number[];
  globalAssumptionsCompany: number[];
  globalAssumptionsAsset: number[];
}

export interface ClassifiedRow extends LegacyLogoRow {
  verdict: "rewrite" | "delete";
  /** Canonical sibling URL when verdict === "rewrite", else null. */
  canonicalUrl: string | null;
  refs: LogoFkRefs;
}

export interface CleanupSummary {
  total: number;
  rewrite: number;
  delete: number;
  blockedByDefault: number;
  blockedByAppLogo: number;
}

export interface ApplyResult {
  rewrites: number;
  deletes: number;
  blocked: ClassifiedRow[];
}

/**
 * Fetch all logos whose URL is still in the legacy `/objects/uploads/<key>`
 * namespace. Anything in `/api/media/...`, `/objects/<key>` (post-cutover
 * shape), or absolute URLs is out of scope here — those are either already
 * canonical or owned by a different cleanup tool.
 */
export async function fetchLegacyLogos(pool: Pool): Promise<LegacyLogoRow[]> {
  const { rows } = await pool.query<{
    id: number;
    name: string;
    company_name: string;
    url: string;
    is_default: boolean;
    is_app_logo: boolean;
  }>(
    `SELECT id, name, company_name, url, is_default, is_app_logo
       FROM logos
      WHERE url LIKE '/objects/uploads/%'
      ORDER BY id`,
  );
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    companyName: r.company_name,
    url: r.url,
    isDefault: r.is_default,
    isAppLogo: r.is_app_logo,
  }));
}

/**
 * Look up a sibling row on the same `company_name` whose URL is already
 * in the canonical `/api/media/<file>` namespace. Mirrors
 * `resolveCanonicalLogoUrl` in `server/lib/canonical-asset-url.ts` so the
 * cleanup verdict matches what the runtime helper would do.
 *
 * Sibling preference: default logo first, then lowest id. Deterministic
 * when an admin has uploaded multiple replacement logos under the same
 * company name.
 */
export async function findCanonicalSibling(
  pool: Pool,
  companyName: string,
): Promise<string | null> {
  const { rows } = await pool.query<{ url: string }>(
    `SELECT url FROM logos
       WHERE company_name = $1
         AND url LIKE '/api/media/%'
       ORDER BY is_default DESC, id ASC
       LIMIT 1`,
    [companyName],
  );
  return rows[0]?.url ?? null;
}

/**
 * Enumerate FK references to a given logo id across every table that
 * declares `references(() => logos.id)`. The cleanup script never silently
 * detaches branding from a company — surfacing these counts in the report
 * is what lets an admin decide whether to rewrite vs. delete.
 */
export async function fetchRefs(pool: Pool, logoId: number): Promise<LogoFkRefs> {
  const [companies, brands, gaCompany, gaAsset] = await Promise.all([
    pool.query<{ id: number }>(
      `SELECT id FROM companies WHERE logo_id = $1 ORDER BY id`,
      [logoId],
    ),
    pool.query<{ id: number }>(
      `SELECT id FROM business_brands WHERE logo_id = $1 ORDER BY id`,
      [logoId],
    ),
    pool.query<{ id: number }>(
      `SELECT id FROM global_assumptions WHERE company_logo_id = $1 ORDER BY id`,
      [logoId],
    ),
    pool.query<{ id: number }>(
      `SELECT id FROM global_assumptions WHERE asset_logo_id = $1 ORDER BY id`,
      [logoId],
    ),
  ]);
  return {
    companies: companies.rows.map((r) => r.id),
    businessBrands: brands.rows.map((r) => r.id),
    globalAssumptionsCompany: gaCompany.rows.map((r) => r.id),
    globalAssumptionsAsset: gaAsset.rows.map((r) => r.id),
  };
}

export async function classifyLegacyLogos(
  pool: Pool,
  rows: LegacyLogoRow[],
): Promise<ClassifiedRow[]> {
  const out: ClassifiedRow[] = [];
  for (const row of rows) {
    const [canonicalUrl, refs] = await Promise.all([
      findCanonicalSibling(pool, row.companyName),
      fetchRefs(pool, row.id),
    ]);
    out.push({
      ...row,
      verdict: canonicalUrl ? "rewrite" : "delete",
      canonicalUrl,
      refs,
    });
  }
  return out;
}

export function summariseCleanup(rows: ClassifiedRow[]): CleanupSummary {
  let rewrite = 0;
  let del = 0;
  let blockedByDefault = 0;
  let blockedByAppLogo = 0;
  for (const r of rows) {
    if (r.verdict === "rewrite") {
      rewrite += 1;
    } else {
      del += 1;
      if (r.isDefault) blockedByDefault += 1;
      if (r.isAppLogo) blockedByAppLogo += 1;
    }
  }
  return { total: rows.length, rewrite, delete: del, blockedByDefault, blockedByAppLogo };
}

export async function applyRewrites(pool: Pool, rows: ClassifiedRow[]): Promise<number> {
  let n = 0;
  for (const r of rows) {
    if (r.verdict !== "rewrite" || !r.canonicalUrl) continue;
    await pool.query(`UPDATE logos SET url = $1 WHERE id = $2`, [r.canonicalUrl, r.id]);
    n += 1;
  }
  return n;
}

/**
 * Delete unresolvable rows. Refuses to delete rows flagged
 * `is_default = true` or `is_app_logo = true` — admin must reassign first.
 *
 * The FK columns on `companies`, `business_brands`, and `system_branding`
 * all declare `ON DELETE SET NULL`, so the database handles the detach
 * atomically.
 */
export async function applyDeletes(
  pool: Pool,
  rows: ClassifiedRow[],
): Promise<{ deleted: number; blocked: ClassifiedRow[] }> {
  let deleted = 0;
  const blocked: ClassifiedRow[] = [];
  for (const r of rows) {
    if (r.verdict !== "delete") continue;
    if (r.isDefault || r.isAppLogo) {
      blocked.push(r);
      continue;
    }
    await pool.query(`DELETE FROM logos WHERE id = $1`, [r.id]);
    deleted += 1;
  }
  return { deleted, blocked };
}
