import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { getNamespaceStats, type VectorNamespace } from "../../ai/vector-store-service";
import { vectorStorePool } from "../../storage/vector-store";
import { acquireInFlight, releaseInFlight } from "../../middleware/analyst-refresh-guards";
import { indexKnowledgeBase } from "../../ai/knowledge-base";
import { indexAllMarketResearch } from "../../ai/vector-indexing";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
} from "../../ai/analyst-table-refresh";
import { logger } from "../../logger";
import {
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_422_UNPROCESSABLE_ENTITY,
} from "../../constants";
import type { InsertCountryEconomicData } from "@workspace/db";

const CHUNKS_PAGE_SIZE = 20;

// ── Country data external-fetch helpers ─────────────────────────────────────

interface CountrySnapshot {
  inflationRate: string | null;
  fxRateToUsd: string | null;
  gdpGrowthRate: string | null;
  interestRate: string | null;
  sourceNotes: string;
}

async function fetchFredValue(seriesId: string, params: string = ""): Promise<number | null> {
  const key = process.env.FRED_API_KEY;
  if (!key) return null;
  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${seriesId}&api_key=${key}&file_type=json&sort_order=desc&limit=1${params}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as { observations?: Array<{ value?: string }> };
    const val = data.observations?.[0]?.value;
    if (!val || val === ".") return null;
    return parseFloat(val);
  } catch {
    return null;
  }
}

// Returns { MXN: 17.2, COP: 4200, BRL: 5.0 } (USD → foreign currency)
async function fetchFrankfurterRates(): Promise<Record<string, number>> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=MXN,COP,BRL", {
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as { rates?: Record<string, number> };
    return data.rates ?? {};
  } catch {
    return {};
  }
}

// Returns the latest GDP growth rate (% YoY) for a World Bank ISO2 code, or null
async function fetchWorldBankGdp(iso2: string): Promise<number | null> {
  try {
    const url = `https://api.worldbank.org/v2/country/${iso2}/indicator/NY.GDP.MKTP.KD.ZG?format=json&mrv=2&per_page=2`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) return null;
    const data = (await res.json()) as [unknown, Array<{ value: number | null }>];
    const rows = data[1] ?? [];
    const val = rows.find(r => r.value != null)?.value;
    return val ?? null;
  } catch {
    return null;
  }
}

// Builds updated country rows by fetching external APIs, falling back to
// existing DB values for any field that cannot be fetched.
async function fetchCountryUpdates(
  existing: Map<string, InsertCountryEconomicData & { interestRate?: string | null }>,
): Promise<InsertCountryEconomicData[]> {
  const now = new Date();

  const [usCpi, usFedFunds, fxRates, usGdp, mxGdp, coGdp, brGdp] = await Promise.all([
    fetchFredValue("CPIAUCSL", "&units=pc1"),
    fetchFredValue("DFF"),
    fetchFrankfurterRates(),
    fetchWorldBankGdp("US"),
    fetchWorldBankGdp("MX"),
    fetchWorldBankGdp("CO"),
    fetchWorldBankGdp("BR"),
  ]);

  // Frankfurter gives USD → foreign; we store foreign → USD (i.e. 1/rate)
  const mxFx = fxRates["MXN"] ? (1 / fxRates["MXN"]) : null;
  const coFx = fxRates["COP"] ? (1 / fxRates["COP"]) : null;
  const brFx = fxRates["BRL"] ? (1 / fxRates["BRL"]) : null;

  const getField = <T>(code: string, field: string, fresh: T | null): string | null => {
    if (fresh != null) return String(fresh);
    const row = existing.get(code) as Record<string, unknown> | undefined;
    const v = row?.[field];
    return v != null ? String(v) : null;
  };

  const countries: Array<{ code: string; name: string; inflation: number | null; fx: number | null; gdp: number | null; notes: string }> = [
    { code: "US", name: "United States", inflation: usCpi, fx: 1.0, gdp: usGdp,
      notes: `FRED: CPI YoY (${usCpi != null ? usCpi.toFixed(1) + "%" : "n/a"}), Fed Funds ${usFedFunds != null ? usFedFunds.toFixed(2) + "%" : "n/a"}; World Bank GDP (${usGdp != null ? usGdp.toFixed(1) + "%" : "n/a"})` },
    { code: "MX", name: "Mexico", inflation: null, fx: mxFx, gdp: mxGdp,
      notes: `Frankfurter ECB FX; World Bank GDP (${mxGdp != null ? mxGdp.toFixed(1) + "%" : "n/a"})` },
    { code: "CO", name: "Colombia", inflation: null, fx: coFx, gdp: coGdp,
      notes: `Frankfurter ECB FX; World Bank GDP (${coGdp != null ? coGdp.toFixed(1) + "%" : "n/a"})` },
    { code: "BR", name: "Brazil", inflation: null, fx: brFx, gdp: brGdp,
      notes: `Frankfurter ECB FX; World Bank GDP (${brGdp != null ? brGdp.toFixed(1) + "%" : "n/a"})` },
  ];

  return countries.map(c => ({
    countryCode: c.code,
    countryName: c.name,
    inflationRate: getField(c.code, "inflationRate", c.inflation),
    fxRateToUsd: getField(c.code, "fxRateToUsd", c.fx),
    gdpGrowthRate: getField(c.code, "gdpGrowthRate", c.gdp),
    interestRate: getField(c.code, "interestRate", null),
    sourcedAt: now,
    sourceNotes: c.notes,
  }));
}

async function regenerateCountryData(): Promise<{ rowsUpdated: number; notes: string[] }> {
  const currentRows = await storage.getAllCountryEconomicData();
  const existingByCode = new Map(currentRows.map(r => [r.countryCode, r as InsertCountryEconomicData & { interestRate?: string | null }]));

  const updates = await fetchCountryUpdates(existingByCode);
  await storage.upsertCountryEconomicData(updates);

  await storage.updateKnowledgeRegistryRefreshed("country-data", new Date());

  return {
    rowsUpdated: updates.length,
    notes: updates.map(u => u.sourceNotes ?? "").filter(Boolean),
  };
}

// ── Benchmark helpers ────────────────────────────────────────────────────────

// Maps knowledge_registry.assetRef → analyst-tables allow-list tableId
const BENCHMARK_TABLE_ID: Record<string, string> = {
  "capital-raise": "capital_raise_benchmarks",
  "exit-multiples": "exit_multiples",
  "reference-brands": "reference_brands",
};

async function regenerateBenchmark(
  assetRef: string,
  registryId: string,
): Promise<void> {
  const tableId = BENCHMARK_TABLE_ID[assetRef];
  if (!tableId) throw new Error(`Unknown benchmark assetRef: ${assetRef}`);

  if (!acquireInFlight(tableId)) {
    throw Object.assign(new Error(`Refresh already in flight for ${tableId}`), { status: HTTP_409_CONFLICT });
  }

  try {
    const now = new Date();
    if (tableId === "capital_raise_benchmarks") {
      const current = await storage.getCapitalRaiseBenchmarks();
      const result = await researchCapitalRaiseBenchmarks(current);
      for (const r of result.proposedRanges) {
        await storage.upsertCapitalRaiseBenchmark({
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit,
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: result.sourceCount,
          lastRefreshedAt: now,
        });
      }
    } else if (tableId === "exit_multiples") {
      const current = await storage.getExitMultiples();
      const result = await researchExitMultiples(current);
      for (const r of result.proposedRanges) {
        await storage.upsertExitMultiple({
          dimensionKey: r.dimensionKey,
          label: r.label,
          unit: r.unit,
          valueLow: r.valueLow,
          valueMid: r.valueMid,
          valueHigh: r.valueHigh,
          sourceCount: result.sourceCount,
          lastRefreshedAt: now,
        });
      }
    } else {
      // reference_brands — researchReferenceBrands auto-commits to DB
      const current = await storage.getReferenceBrands();
      await researchReferenceBrands(current, undefined);
    }

    await storage.updateKnowledgeRegistryRefreshed(registryId, now);
  } finally {
    releaseInFlight(tableId);
  }
}

// ── Route registration ───────────────────────────────────────────────────────

export function registerKnowledgeRegistryRoutes(app: Express) {
  // GET /api/admin/knowledge-registry
  // Lists all 8 registry entries with live chunk counts merged in for
  // vector_namespace assets.
  app.get("/api/admin/knowledge-registry", requireAdmin, async (_req, res) => {
    try {
      const [entries, stats] = await Promise.all([
        storage.getAllKnowledgeRegistry(),
        getNamespaceStats().catch(() => ({} as Record<string, number>)),
      ]);

      const enriched = entries.map((entry) => ({
        ...entry,
        liveCount:
          entry.assetType === "vector_namespace"
            ? (stats[entry.assetRef as VectorNamespace] ?? 0)
            : null,
      }));

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry", error);
    }
  });

  // GET /api/admin/knowledge-registry/country-economic-data
  // Must be registered BEFORE /:id to prevent path shadowing.
  app.get("/api/admin/knowledge-registry/country-economic-data", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAllCountryEconomicData();
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch country economic data", error);
    }
  });

  // POST /api/admin/knowledge-registry/country-economic-data/regenerate
  // Must be registered BEFORE /:id/regenerate to prevent path shadowing.
  // Fetches live macro data from FRED, Frankfurter, and World Bank, upserts
  // into country_economic_data, and updates the registry refreshed timestamp.
  app.post("/api/admin/knowledge-registry/country-economic-data/regenerate", requireAdmin, async (req, res) => {
    try {
      const result = await regenerateCountryData();
      logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, "country-data", {
        rowsUpdated: result.rowsUpdated,
      });
      res.json({ success: true, rowsUpdated: result.rowsUpdated });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to regenerate country economic data", error);
    }
  });

  // GET /api/admin/knowledge-registry/:id
  app.get("/api/admin/knowledge-registry/:id", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found" });
      res.json(entry);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry entry", error);
    }
  });

  // GET /api/admin/knowledge-registry/:id/chunks?page=N
  // Paginated chunk browsing for VectorChunkViewer. Only valid for
  // vector_namespace assets; returns 422 for other asset types.
  app.get("/api/admin/knowledge-registry/:id/chunks", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found" });
      if (entry.assetType !== "vector_namespace") {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: `Chunk browsing is only available for vector_namespace assets; this entry is asset_type '${entry.assetType}'`,
        });
      }

      const page = Math.max(1, Number(req.query.page ?? "1") || 1);
      const offset = (page - 1) * CHUNKS_PAGE_SIZE;
      const namespace = entry.assetRef;

      const [chunksResult, countResult] = await Promise.all([
        vectorStorePool.query<{ id: string; text: string; metadata: Record<string, unknown> }>(
          `SELECT id, text, metadata FROM vector_chunks WHERE namespace = $1 ORDER BY id ASC LIMIT $2 OFFSET $3`,
          [namespace, CHUNKS_PAGE_SIZE, offset],
        ),
        vectorStorePool.query<{ count: string }>(
          `SELECT COUNT(*)::text AS count FROM vector_chunks WHERE namespace = $1`,
          [namespace],
        ),
      ]);

      res.json({
        chunks: chunksResult.rows,
        page,
        total: Number(countResult.rows[0]?.count ?? "0"),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch chunks for knowledge registry entry", error);
    }
  });

  // POST /api/admin/knowledge-registry/:id/regenerate
  // Dispatches regeneration by asset_type:
  //   vector_namespace → indexKnowledgeBase() or indexAllMarketResearch()
  //   benchmark_table / benchmark_brands → single-flight guard + LLM refresh + auto-commit
  //   country_data → live fetch from FRED / Frankfurter / World Bank
  //   assumption-guidance / comparables → 422 (no batch path)
  app.post("/api/admin/knowledge-registry/:id/regenerate", requireAdmin, async (req, res) => {
    try {
      const id = String(req.params.id);
      const entry = await storage.getKnowledgeRegistryEntry(id);
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found" });

      if (entry.assetType === "vector_namespace") {
        const assetRef = entry.assetRef;

        if (assetRef === "assumption-guidance") {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: "assumption-guidance has no portfolio-wide regeneration path. It is populated automatically by per-entity analyst runs.",
          });
        }
        if (assetRef === "comparables") {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: "comparables are indexed per-property during research runs. Use the research engine to regenerate comparables for a specific property.",
          });
        }

        const dispatch: Record<string, () => Promise<unknown>> = {
          "market-research": () => indexAllMarketResearch(),
          "knowledge-base": () => indexKnowledgeBase(),
        };

        const fn = dispatch[assetRef];
        if (!fn) {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: `No regeneration handler for vector namespace '${assetRef}'`,
          });
        }

        const result = await fn();
        await storage.updateKnowledgeRegistryRefreshed(id, new Date());
        logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, { result });
        return res.json({ success: true, assetRef, result });
      }

      if (entry.assetType === "benchmark_table" || entry.assetType === "benchmark_brands") {
        const tableId = BENCHMARK_TABLE_ID[entry.assetRef];
        if (!tableId) {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: `Unknown benchmark asset ref: ${entry.assetRef}`,
          });
        }
        // acquireInFlight is called inside regenerateBenchmark; 409 is thrown as an error with .status
        try {
          await regenerateBenchmark(entry.assetRef, id);
        } catch (benchErr: unknown) {
          const status = (benchErr as { status?: number }).status;
          if (status === HTTP_409_CONFLICT) {
            return res.status(HTTP_409_CONFLICT).json({
              error: (benchErr as Error).message,
            });
          }
          throw benchErr;
        }
        logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, { tableId });
        return res.json({ success: true, assetRef: entry.assetRef });
      }

      if (entry.assetType === "country_data") {
        const result = await regenerateCountryData();
        logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, {
          rowsUpdated: result.rowsUpdated,
        });
        return res.json({ success: true, assetRef: entry.assetRef, rowsUpdated: result.rowsUpdated });
      }

      return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
        error: `Unhandled asset type: ${entry.assetType}`,
      });
    } catch (error: unknown) {
      logger.error(`Knowledge registry regeneration failed for ${req.params.id}: ${String(error)}`, "knowledge-registry");
      logAndSendError(res, "Failed to regenerate knowledge registry entry", error);
    }
  });
}
