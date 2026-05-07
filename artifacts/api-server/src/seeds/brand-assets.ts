/**
 * seeds/brand-assets.ts
 *
 * Idempotent seed that upserts H+ Analytics logo entries into the `logos`
 * table pointing at the brand-assets R2 proxy route (/api/brand-assets/…).
 *
 * This seed only runs once (guarded by _applied_migrations). It adds the
 * enhanced H+ logo and the glass H+ logo as proper library entries so admins
 * can select them from the Logo Selector. The og-banner is not a logo (no
 * square-crop assumption) and is surfaced only in the Brand Assets admin tab.
 *
 * Prerequisites: upload-brand-assets script must have been run so the files
 * are live in R2. If not yet uploaded this seed is a no-op — the /api/brand-
 * assets/ proxy returns 404 until the files are there.
 */

import { db } from "../db";
import { logos } from "@workspace/db";
import { sql, eq } from "drizzle-orm";
import { logger } from "../logger";
import {
  R2_BRAND_KEY_H_PLUS_ENHANCED,
  R2_BRAND_KEY_H_PLUS_GLASS,
} from "@shared/constants";

const MIGRATION_TAG = "brand_asset_logos_v1";

function proxyUrl(r2Key: string): string {
  const fn = r2Key.split("/").at(-1) ?? r2Key;
  return `/api/brand-assets/${fn}`;
}

const BRAND_LOGOS: { name: string; companyName: string; url: string }[] = [
  {
    name: "H+ Enhanced Logo",
    companyName: "H+ Analytics",
    url: proxyUrl(R2_BRAND_KEY_H_PLUS_ENHANCED),
  },
  {
    name: "H+ Glass Logo",
    companyName: "H+ Analytics",
    url: proxyUrl(R2_BRAND_KEY_H_PLUS_GLASS),
  },
];

export async function seedBrandAssetLogos(): Promise<void> {
  // Ensure _applied_migrations table exists (may not on first cold boot).
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS _applied_migrations (
      tag TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const already = await db.execute(
    sql`SELECT 1 FROM _applied_migrations WHERE tag = ${MIGRATION_TAG} LIMIT 1`,
  );
  if ((already as { rows: Array<Record<string, unknown>> }).rows?.length > 0) {
    return;
  }

  const existingLogos = await db.select({ url: logos.url }).from(logos);
  const existingUrls = new Set(existingLogos.map((l) => l.url));

  let added = 0;
  for (const entry of BRAND_LOGOS) {
    if (existingUrls.has(entry.url)) continue;

    // Check if a logo with the same URL already exists (race-safe).
    const dupe = await db.select().from(logos).where(eq(logos.url, entry.url)).limit(1);
    if (dupe.length > 0) continue;

    await db.insert(logos).values({
      name: entry.name,
      companyName: entry.companyName,
      url: entry.url,
      isDefault: false,
      isAppLogo: false,
    });
    added++;
    logger.info(`Seeded brand asset logo: ${entry.name}`, "seed");
  }

  await db.execute(
    sql`INSERT INTO _applied_migrations (tag) VALUES (${MIGRATION_TAG}) ON CONFLICT (tag) DO NOTHING`,
  );

  if (added > 0) {
    logger.info(`Brand asset logos seeded (${added} added)`, "seed");
  }
}
