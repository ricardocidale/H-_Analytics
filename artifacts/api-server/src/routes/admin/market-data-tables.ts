/**
 * Admin routes — market data reference tables.
 *
 * GET  /api/admin/market-data-tables              — catalog (names, row counts, last updated)
 * GET  /api/admin/market-data-tables/:table        — all rows for a table (read-only)
 * POST /api/admin/market-data-tables/:table/refresh — trigger Analyst refresh via web search + LLM
 *
 * These tables are populated by:
 *   1. Initial seed (server/seeds/hospitality-benchmarks.ts + market-data-tables.ts)
 *   2. Analyst refresh (this route → server/ai/regenerate-market-data.ts)
 *
 * Doctrine: admins can VIEW but not manually edit rows. The only write path
 * is the Analyst refresh, which fetches current internet data and upserts.
 */

import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { getAuthUser } from "../../auth";
import { logAndSendError, zodErrorMessage } from "../helpers";
import { z } from "zod";
import {
  refreshMarketDataTable,
  type MarketDataTableName,
} from "../../ai/regenerate-market-data";

const TABLE_NAMES: MarketDataTableName[] = [
  "hospitality-benchmarks",
  "market-adr-index",
  "labor-rates",
  "fb-benchmarks",
  "seasonal-calendars",
];

const TABLE_META: Record<MarketDataTableName, { label: string; description: string; sourceNote: string }> = {
  "hospitality-benchmarks": {
    label: "Hospitality Benchmarks",
    description: "Industry ADR, occupancy, RevPAR, cap rate, management fee, and cost benchmarks by segment and market.",
    sourceNote: "STR/CoStar, CBRE, HVS, PwC, AHLA",
  },
  "market-adr-index": {
    label: "Market ADR Index",
    description: "Quarterly average daily rate by major market across segments (luxury, upscale, boutique, economy).",
    sourceNote: "STR/CoStar, CBRE Hotel Outlook",
  },
  "labor-rates": {
    label: "Labor Rates",
    description: "Hospitality staffing costs by market, role, and employment type.",
    sourceNote: "BLS, AHLA Compensation Survey, market surveys",
  },
  "fb-benchmarks": {
    label: "F&B Benchmarks",
    description: "Food & beverage operating metrics: ticket averages, covers per room night, cost of goods, labor percent.",
    sourceNote: "NRA, AHLA, PKF Hospitality Research",
  },
  "seasonal-calendars": {
    label: "Seasonal Calendars",
    description: "Peak / shoulder / trough demand patterns by market and month, with ADR multipliers.",
    sourceNote: "STR seasonal data, market analysis",
  },
};

const refreshBodySchema = z.object({
  market: z.string().max(100).nullable().optional(),
});

export function registerMarketDataTableRoutes(app: Express) {
  // ── Catalog — names, descriptions, row counts, last-updated ────────
  app.get("/api/admin/market-data-tables", requireAdmin, async (_req, res) => {
    try {
      const [
        benchmarks,
        adrRows,
        laborRows,
        fbRows,
        seasonalRows,
      ] = await Promise.all([
        storage.getHospitalityBenchmarks({}),
        storage.getAllMarketAdrIndex(),
        storage.getAllLaborRates(),
        storage.getAllFbBenchmarks(),
        storage.getAllSeasonalCalendars(),
      ]);

      const rowsByTable: Record<MarketDataTableName, unknown[]> = {
        "hospitality-benchmarks": benchmarks,
        "market-adr-index": adrRows,
        "labor-rates": laborRows,
        "fb-benchmarks": fbRows,
        "seasonal-calendars": seasonalRows,
      };

      const catalog = TABLE_NAMES.map((name) => {
        const rows = rowsByTable[name] as Array<{ updatedAt?: Date }>;
        const lastUpdated = rows.reduce<Date | null>((max, r) => {
          if (!r.updatedAt) return max;
          return !max || r.updatedAt > max ? r.updatedAt : max;
        }, null);
        return {
          name,
          ...TABLE_META[name],
          rowCount: rows.length,
          lastUpdatedAt: lastUpdated?.toISOString() ?? null,
        };
      });

      res.json(catalog);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to load market data catalog", error, "AMDT-001");
    }
  });

  // ── Single table — all rows ─────────────────────────────────────────
  app.get("/api/admin/market-data-tables/:table", requireAdmin, async (req, res) => {
    const table = req.params.table as MarketDataTableName;
    if (!TABLE_NAMES.includes(table)) {
      return res.status(404).json({ error: `Unknown table: ${table}`, code: "AMDT-004" });
    }

    try {
      let rows: unknown[];
      switch (table) {
        case "hospitality-benchmarks":
          rows = await storage.getHospitalityBenchmarks({});
          break;
        case "market-adr-index":
          rows = await storage.getAllMarketAdrIndex();
          break;
        case "labor-rates":
          rows = await storage.getAllLaborRates();
          break;
        case "fb-benchmarks":
          rows = await storage.getAllFbBenchmarks();
          break;
        case "seasonal-calendars":
          rows = await storage.getAllSeasonalCalendars();
          break;
      }
      res.json({ table, meta: TABLE_META[table], rows });
    } catch (error: unknown) {
      logAndSendError(res, `Failed to load ${table}`, error, "AMDT-002");
    }
  });

  // ── Analyst refresh — web search + LLM → upsert ────────────────────
  app.post("/api/admin/market-data-tables/:table/refresh", requireAdmin, async (req, res) => {
    const table = req.params.table as MarketDataTableName;
    if (!TABLE_NAMES.includes(table)) {
      return res.status(404).json({ error: `Unknown table: ${table}`, code: "AMDT-005" });
    }

    const parsed = refreshBodySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: zodErrorMessage(parsed.error) });
    }

    const user = getAuthUser(req);
    const market = parsed.data.market ?? null;

    try {
      const result = await refreshMarketDataTable(table, market, user?.id ?? undefined);
      res.json(result);
    } catch (error: unknown) {
      logAndSendError(res, `Analyst refresh failed for ${table}`, error, "AMDT-003");
    }
  });
}
