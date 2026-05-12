/**
 * icp-brackets.ts — ICP Bracket Catalog API routes
 *
 * Task #1409 — REST endpoints for the bracket catalog and per-company
 * bracket-mix management.
 *
 * Routes:
 *   GET   /api/icp/brackets           — List all active brackets (catalog)
 *   GET   /api/icp/brackets/mix       — Current company bracket mix
 *   PUT   /api/icp/brackets/mix       — Save company bracket mix (full replace)
 *   PATCH /api/icp/brackets/mix       — Save company bracket mix (full replace, same semantics)
 *   GET   /api/icp/brackets/:slug     — Single bracket detail
 *
 * Authorization: requireAuth (all routes).
 * Mix routes operate on the calling user's own global_assumptions row;
 * they will never mutate the shared platform-default row.
 *
 * IMPORTANT: /mix routes must be registered BEFORE /:slug so Express does
 * not treat "mix" as a slug param value.
 */

import type { Express } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { storage } from "../storage";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { logger } from "../logger";
import { BracketMixSchema } from "@workspace/db";
import {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_NOT_FOUND,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  ICP_BRACKET_MIX_WEIGHT_TOLERANCE,
  ICP_BRACKET_MIX_MAX_ENTRIES,
} from "@shared/constants";

const LOG_TAG = "icp-brackets";

/**
 * Shared handler for PUT /api/icp/brackets/mix and PATCH /api/icp/brackets/mix.
 * Both verbs have identical semantics: full-replace of the user's bracket mix.
 *
 * Security: always upserts into the user's OWN row. Never patches the shared
 * platform-default row (userId IS NULL) even when the user has no row yet.
 */
async function handleSaveMix(
  req: Parameters<Parameters<Express["put"]>[1]>[0],
  res: Parameters<Parameters<Express["put"]>[1]>[1],
): Promise<void> {
  try {
    const user = getAuthUser(req);

    const parsed = BracketMixSchema.safeParse(req.body.bracketMix);
    if (!parsed.success) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        error: "Invalid bracket mix format",
        code: "ICPB-006",
        details: parsed.error.flatten(),
      });
      return;
    }

    const mix = parsed.data;

    if (mix.length > ICP_BRACKET_MIX_MAX_ENTRIES) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        error: `Bracket mix may not exceed ${ICP_BRACKET_MIX_MAX_ENTRIES} entries`,
        code: "ICPB-007",
      });
      return;
    }

    const weightSum = mix.reduce(
      (sum: number, e: { bracketSlug: string; weight: number }) => sum + e.weight,
      0,
    );
    if (Math.abs(weightSum - 1) > ICP_BRACKET_MIX_WEIGHT_TOLERANCE) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        error: `Bracket mix weights must sum to 1.0 (got ${weightSum.toFixed(4)})`,
        code: "ICPB-008",
      });
      return;
    }

    const slugs = mix.map((e: { bracketSlug: string; weight: number }) => e.bracketSlug);
    const existingRows = await db.execute(sql`
      SELECT slug FROM icp_brackets WHERE slug = ANY(${slugs}::text[])
    `);
    const existingSlugs = new Set(
      existingRows.rows.map((r) => (r as { slug: string }).slug),
    );
    const unknownSlugs = slugs.filter((s) => !existingSlugs.has(s));
    if (unknownSlugs.length > 0) {
      res.status(HTTP_STATUS_BAD_REQUEST).json({
        error: `Unknown bracket slugs: ${unknownSlugs.join(", ")}`,
        code: "ICPB-009",
      });
      return;
    }

    // Security: always write into the user's OWN row, never the shared platform
    // default row (userId IS NULL). getGlobalAssumptions(userId) falls back to
    // the shared default when the user has no personal row yet, so we must
    // check ownership before deciding the write strategy:
    //   - own row exists → patch it in place (bracketMix column only)
    //   - no own row yet → upsertGlobalAssumptions creates a new user-scoped row
    //                       using the default row as a data baseline
    const base = await storage.getGlobalAssumptions(user.id);
    if (!base) {
      res.status(HTTP_STATUS_NOT_FOUND).json({
        error: "Global assumptions not found",
        code: "ICPB-010",
      });
      return;
    }

    if (base.userId === user.id) {
      await storage.patchGlobalAssumptions(base.id, { bracketMix: mix });
    } else {
      // User has no own row; base is the shared platform default.
      // upsertGlobalAssumptions filters strictly by userId and will INSERT a
      // new user-owned row rather than updating the shared default.
      // cast: stripAutoFields inside upsert removes id/createdAt/updatedAt so
      // the spread is safe at runtime even with the optional-vs-required delta.
      await storage.upsertGlobalAssumptions(
        { ...base, bracketMix: mix } as unknown as import("@workspace/db").InsertGlobalAssumptions,
        user.id,
      );
    }

    logger.info(`${LOG_TAG} bracket mix updated for user ${user.id}: ${JSON.stringify(mix)}`);
    res.json({ bracketMix: mix });
  } catch (error: unknown) {
    logger.error(
      `Failed to save bracket mix: ${error instanceof Error ? error.message : error}`,
      LOG_TAG,
    );
    res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
      error: "Failed to save bracket mix",
      code: "ICPB-011",
    });
  }
}

export function register(app: Express) {

  /**
   * GET /api/icp/brackets
   * Returns all active brackets from the shared catalog, ordered by sort_order ASC.
   */
  app.get("/api/icp/brackets", requireAuth, async (req, res) => {
    try {
      const rows = await db.execute(sql`
        SELECT id, slug, name, archetype_label, customer_type,
               service_consumption_profile,
               target_adr_band_low, target_adr_band_high,
               comp_set_names, description, source_note,
               is_active, sort_order, created_at, updated_at
        FROM icp_brackets
        WHERE is_active = true
        ORDER BY sort_order ASC
      `);
      res.json({ brackets: rows.rows });
    } catch (error: unknown) {
      logger.error(
        `Failed to list brackets: ${error instanceof Error ? error.message : error}`,
        LOG_TAG,
      );
      res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
        error: "Failed to fetch bracket catalog",
        code: "ICPB-001",
      });
    }
  });

  /**
   * GET /api/icp/brackets/mix
   * Returns the current company bracket mix from global_assumptions.
   * Returns null when no mix has been assigned yet.
   *
   * NOTE: registered BEFORE /:slug.
   */
  app.get("/api/icp/brackets/mix", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const global = await storage.getGlobalAssumptions(user.id);
      if (!global) {
        return res
          .status(HTTP_STATUS_NOT_FOUND)
          .json({ error: "Global assumptions not found", code: "ICPB-004" });
      }
      res.json({ bracketMix: (global as Record<string, unknown>).bracketMix ?? null });
    } catch (error: unknown) {
      logger.error(
        `Failed to fetch bracket mix: ${error instanceof Error ? error.message : error}`,
        LOG_TAG,
      );
      res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
        error: "Failed to fetch bracket mix",
        code: "ICPB-005",
      });
    }
  });

  /**
   * PUT /api/icp/brackets/mix
   * Full-replace of the company's bracket mix.
   * NOTE: registered BEFORE /:slug.
   */
  app.put("/api/icp/brackets/mix", requireAuth, (req, res) => handleSaveMix(req, res));

  /**
   * PATCH /api/icp/brackets/mix
   * Alias for PUT — same full-replace semantics.
   * NOTE: registered BEFORE /:slug.
   */
  app.patch("/api/icp/brackets/mix", requireAuth, (req, res) => handleSaveMix(req, res));

  /**
   * GET /api/icp/brackets/:slug
   * Returns a single bracket by slug (active or inactive).
   *
   * NOTE: registered AFTER all /mix routes.
   */
  app.get("/api/icp/brackets/:slug", requireAuth, async (req, res) => {
    try {
      const { slug } = req.params;
      const rows = await db.execute(sql`
        SELECT id, slug, name, archetype_label, customer_type,
               service_consumption_profile,
               target_adr_band_low, target_adr_band_high,
               comp_set_names, description, source_note,
               is_active, sort_order, created_at, updated_at
        FROM icp_brackets
        WHERE slug = ${slug}
        LIMIT 1
      `);
      if (rows.rows.length === 0) {
        return res
          .status(HTTP_STATUS_NOT_FOUND)
          .json({ error: "Bracket not found", code: "ICPB-002" });
      }
      res.json({ bracket: rows.rows[0] });
    } catch (error: unknown) {
      logger.error(
        `Failed to fetch bracket: ${error instanceof Error ? error.message : error}`,
        LOG_TAG,
      );
      res.status(HTTP_STATUS_INTERNAL_SERVER_ERROR).json({
        error: "Failed to fetch bracket",
        code: "ICPB-003",
      });
    }
  });
}
