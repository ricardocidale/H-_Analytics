/**
 * pietro-resources-002 — Seed 2 ICP national research admin_resource rows.
 *
 * Adds the vendor pass-through cost feed and the Mgmt Co markup factor feed,
 * both sourced via Exa neural web search, to admin_resources. These two feeds
 * implement R11–R14 of docs/brainstorms/icp-simplification/requirements.md.
 *
 * Idempotent: ON CONFLICT (kind, slug) DO NOTHING. Safe to re-run on every boot.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { type InsertAdminResource } from "@workspace/db";

const TAG = "[migration] pietro-resources-002";

const ICP_SEED_ROWS: InsertAdminResource[] = [
  {
    kind: "source",
    slug: "vendor-passthrough-costs",
    displayName: "National Vendor Pass-Through Costs",
    description:
      "National hospitality vendor pass-through cost benchmarks as percent of revenue per service line " +
      "(marketing, IT, accounting, reservations, housekeeping, maintenance, revenue management, F&B, " +
      "branding, performance bonus). Sourced via Exa neural web search over STR Global, CBRE, HVS, and " +
      "PKF industry reports. Populated weekly by MinionVendorPassthroughCosts (Gaetano). " +
      "Used by ICP bracket calculations — a national refresh updates every Mgmt Co on next calc run.",
    config: {
      baseUrl: "https://api.exa.ai/search",
      cadence: "weekly",
      healthProbe: {
        url: "https://api.exa.ai",
        method: "GET",
        expectedStatus: 200,
      },
    },
    secretRef: "EXA_API_KEY",
    dailyRequestBudget: 10,
  },
  {
    kind: "source",
    slug: "mgmt-co-markup-factors",
    displayName: "National Mgmt Co Markup Factors",
    description:
      "National Management Company markup factors applied on vendor pass-through services, expressed as " +
      "percent of total property revenue per service line. Sourced via Exa neural web search over HVS, " +
      "CBRE, and PKF hotel management agreement benchmarks. Populated weekly by " +
      "MinionMgmtCoMarkupFactors (Renato). A national refresh updates every Mgmt Co calculation on next run.",
    config: {
      baseUrl: "https://api.exa.ai/search",
      cadence: "weekly",
      healthProbe: {
        url: "https://api.exa.ai",
        method: "GET",
        expectedStatus: 200,
      },
    },
    secretRef: "EXA_API_KEY",
    dailyRequestBudget: 10,
  },
];

export async function runPietroResources002(): Promise<void> {
  let inserted = 0;
  let failed = 0;
  for (const row of ICP_SEED_ROWS) {
    try {
      const result = await db.execute(sql`
        INSERT INTO admin_resources
          (kind, slug, display_name, description, config, secret_ref, daily_request_budget)
        VALUES (
          ${row.kind},
          ${row.slug},
          ${row.displayName},
          ${row.description},
          ${JSON.stringify(row.config)}::jsonb,
          ${row.secretRef},
          ${row.dailyRequestBudget}
        )
        ON CONFLICT (kind, slug) DO NOTHING
        RETURNING id
      `);
      if (Array.isArray(result.rows) && result.rows.length > 0) inserted++;
    } catch (err) {
      failed++;
      logger.error(
        `${TAG} failed to seed row ${row.slug}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  const skipped = ICP_SEED_ROWS.length - inserted - failed;
  logger.info(`${TAG} ICP resource rows: ${inserted} seeded, ${skipped} already existed, ${failed} failed`);
}
