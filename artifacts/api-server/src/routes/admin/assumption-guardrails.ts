/**
 * Admin route — read-only `assumption_guardrails` table for Knowledge &
 * Resources → Tables.
 *
 * Per the range-badge contract memorized in `replit.md` (2026-05-11), the
 * `assumption_guardrails` table is the source of truth for every range
 * badge's green/yellow/red range-quality dot and the separate "out of
 * range" chip. The table is code-seeded — admins view but never edit
 * rows. There is no Analyst refresh button for this table; rows change
 * only through `seedAssumptionGuardrails()` running at boot.
 *
 * GET /api/admin/assumption-guardrails — all rows + light catalog metadata
 *   (row count, last-updated timestamp).
 */

import type { Express } from "express";
import { db } from "../../db";
import { assumptionGuardrails } from "@workspace/db";
import { requireAdmin, requireAuth } from "../../auth";
import { logAndSendError } from "../helpers";
import { desc } from "drizzle-orm";

const CACHE_TTL_MS = 5 * 60 * 1000;

type GuardrailsPayload = Awaited<ReturnType<typeof fetchGuardrailRowsFromDb>>;

let cachedPayload: GuardrailsPayload | null = null;
let cacheExpiresAt = 0;

async function fetchGuardrailRowsFromDb() {
  const rows = await db
    .select()
    .from(assumptionGuardrails)
    .orderBy(assumptionGuardrails.assumptionKey);

  // Suppress unused-import lint when desc() is dropped in future edits.
  void desc;

  const lastUpdatedAt = rows.reduce<Date | null>((max, r) => {
    if (!r.updatedAt) return max;
    return !max || r.updatedAt > max ? r.updatedAt : max;
  }, null);

  return {
    meta: {
      label: "Assumption Guardrails",
      description:
        "Plausibility low/high bounds Fabio reads to color the range-quality dot and decide the 'out of range' chip on every range badge across the app.",
      sourceNote: "Code-seeded from server/seeds/assumption-guardrails.ts (see migration 0055)",
      rowCount: rows.length,
      lastUpdatedAt: lastUpdatedAt?.toISOString() ?? null,
    },
    rows: rows.map((r) => ({
      id: r.id,
      assumptionKey: r.assumptionKey,
      low: r.low,
      high: r.high,
      targetLow: r.targetLow,
      targetHigh: r.targetHigh,
      unit: r.unit,
      rationale: r.rationale,
      source: r.source,
      updatedAt: r.updatedAt?.toISOString() ?? null,
    })),
  };
}

async function fetchGuardrailRows(): Promise<GuardrailsPayload> {
  const now = Date.now();
  if (cachedPayload !== null && now < cacheExpiresAt) {
    return cachedPayload;
  }
  const payload = await fetchGuardrailRowsFromDb();
  cachedPayload = payload;
  cacheExpiresAt = now + CACHE_TTL_MS;
  return payload;
}

/**
 * Admin-gated route — full metadata for Knowledge & Resources → Tables view.
 */
export function registerAssumptionGuardrailRoutes(app: Express): void {
  app.get("/api/admin/assumption-guardrails", requireAdmin, async (_req, res) => {
    try {
      res.json(await fetchGuardrailRows());
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load assumption_guardrails", error, "AAG-001");
    }
  });
}

/**
 * Authenticated (non-admin) route — same read-only guardrail data, accessible
 * to all logged-in users so property editors see Fabio quality dots too.
 *
 * GET /api/assumption-guardrails
 */
export function registerPublicAssumptionGuardrailRoutes(app: Express): void {
  app.get("/api/assumption-guardrails", requireAuth, async (_req, res) => {
    try {
      res.json(await fetchGuardrailRows());
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load assumption_guardrails", error, "AAG-002");
    }
  });
}
