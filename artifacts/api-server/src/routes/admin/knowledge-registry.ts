import type { Express } from "express";
import { storage } from "../../storage";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { getNamespaceStats, type VectorNamespace } from "../../ai/vector-store-service";
import { vectorStorePool } from "../../storage/vector-store";
import { acquireInFlight, releaseInFlight } from "../../middleware/analyst-refresh-guards";
import { indexKnowledgeBase } from "../../ai/knowledge-base";
import { indexAllMarketResearch } from "../../ai/vector-indexing";
import { runIcpBrackets001 } from "../../migrations/icp-brackets-001";
import { csrfTokenGuard } from "../../middleware/csrf";
import { z } from "zod";
import { ICP_CUSTOMER_TYPES, ICP_SERVICE_CONSUMPTION_PROFILES } from "@workspace/db";
import {
  researchCapitalRaiseBenchmarks,
  researchExitMultiples,
  researchReferenceBrands,
  researchGeographyDimension,
  researchJurisdictionalTaxes,
  researchRegulatoryFees,
  researchMarketCapRates,
} from "../../ai/analyst-table-refresh";
import { MINION_REGISTRY } from "../../ai/ambient/pietro-scheduler";
import { logger } from "../../logger";
import {
  HTTP_201_CREATED,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_422_UNPROCESSABLE_ENTITY,
} from "../../constants";
import type { InsertCountryEconomicData } from "@workspace/db";
import { db } from "../../db";
import { sql } from "drizzle-orm";

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
  "geography-dimension": "geography_dimension",
  "jurisdictional-taxes": "jurisdictional_taxes",
  "regulatory-fees": "regulatory_fees",
  "market-cap-rates": "market_cap_rates",
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
    } else if (tableId === "geography_dimension") {
      const current = await storage.getAllGeography();
      const result = await researchGeographyDimension(current);
      await storage.upsertGeography(result.proposedRows as any);
    } else if (tableId === "jurisdictional_taxes") {
      const result = await researchJurisdictionalTaxes();
      await storage.insertJurisdictionalTaxes(result.proposedRows as any);
    } else if (tableId === "regulatory_fees") {
      const result = await researchRegulatoryFees();
      await storage.insertRegulatoryFees(result.proposedRows as any);
    } else if (tableId === "market_cap_rates") {
      const result = await researchMarketCapRates();
      await storage.insertMarketCapRates(result.proposedRows as any);
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
  // Lists all registry entries with live chunk counts merged in for
  // vector_namespace assets, and live row counts for catalog_table assets.
  app.get("/api/admin/knowledge-registry", requireAdmin, async (_req, res) => {
    try {
      const [entries, stats, bracketCount] = await Promise.all([
        storage.getAllKnowledgeRegistry(),
        getNamespaceStats().catch(() => ({} as Record<string, number>)),
        db.execute(sql`SELECT COUNT(*)::int AS count FROM icp_brackets WHERE is_active = true`)
          .catch(() => ({ rows: [{ count: 0 }] })),
      ]);

      const catalogRowCount = Number(
        (bracketCount.rows[0] as { count: number } | undefined)?.count ?? 0,
      );

      const enriched = entries.map((entry) => ({
        ...entry,
        liveCount:
          entry.assetType === "vector_namespace"
            ? (stats[entry.assetRef as VectorNamespace] ?? 0)
            : entry.assetType === "catalog_table"
            ? catalogRowCount
            : null,
      }));

      res.json(enriched);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry", error, "AKNW-001");
    }
  });

  // GET /api/admin/knowledge-registry/country-economic-data
  // Must be registered BEFORE /:id to prevent path shadowing.
  app.get("/api/admin/knowledge-registry/country-economic-data", requireAdmin, async (_req, res) => {
    try {
      const rows = await storage.getAllCountryEconomicData();
      res.json(rows);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch country economic data", error, "AKNW-002");
    }
  });

  // GET /api/admin/knowledge-registry/icp-bracket-catalog/data
  // Returns ALL ICP brackets (active + inactive) for the admin viewer so
  // retired brackets remain visible and can be restored. Must be registered
  // BEFORE /:id to prevent path shadowing.
  app.get("/api/admin/knowledge-registry/icp-bracket-catalog/data", requireAdmin, async (_req, res) => {
    try {
      const result = await db.execute(sql`
        SELECT id, slug, name, archetype_label, customer_type,
               service_consumption_profile,
               target_adr_band_low, target_adr_band_high,
               comp_set_names, description, source_note,
               is_active, sort_order
        FROM icp_brackets
        ORDER BY is_active DESC, sort_order ASC, id ASC
      `);
      res.json({ brackets: result.rows });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch ICP bracket catalog", error, "AKNW-016");
    }
  });

  // ── ICP bracket admin write paths (Task #1454) ──────────────────────────
  //
  // POST   /api/admin/knowledge-registry/icp-bracket-catalog/data
  // PATCH  /api/admin/knowledge-registry/icp-bracket-catalog/data/:id
  //
  // Both endpoints are admin-only and CSRF-guarded. They mutate the shared
  // icp_brackets catalog (consumed by Cecília + Marco). Soft-delete is done
  // by PATCHing { isActive: false } — no DELETE endpoint to preserve history
  // and any historical company bracket-mix references.
  const SLUG_REGEX = /^[a-z\d][a-z\d-]*[a-z\d]$/;
  const SLUG_MAX_LEN = 80;
  const NAME_MAX_LEN = 120;
  const ARCHETYPE_MAX_LEN = 80;
  const COMP_SET_NAME_MAX_LEN = 120;
  const COMP_SET_MAX_ITEMS = 20;
  const SOURCE_NOTE_MAX_LEN = 500;
  const DESCRIPTION_MAX_LEN = 2000;

  const IcpBracketCreateSchema = z
    .object({
      slug: z.string().min(2).max(SLUG_MAX_LEN).regex(SLUG_REGEX, "slug must be kebab-case (lowercase letters, digits, hyphens)"),
      name: z.string().min(1).max(NAME_MAX_LEN),
      archetypeLabel: z.string().min(1).max(ARCHETYPE_MAX_LEN),
      customerType: z.enum(ICP_CUSTOMER_TYPES),
      serviceConsumptionProfile: z.enum(ICP_SERVICE_CONSUMPTION_PROFILES),
      targetAdrBandLow: z.number().nonnegative().nullable().optional(),
      targetAdrBandHigh: z.number().nonnegative().nullable().optional(),
      compSetNames: z.array(z.string().min(1).max(COMP_SET_NAME_MAX_LEN)).max(COMP_SET_MAX_ITEMS).nullable().optional(),
      description: z.string().max(DESCRIPTION_MAX_LEN).nullable().optional(),
      sourceNote: z.string().max(SOURCE_NOTE_MAX_LEN).nullable().optional(),
      sortOrder: z.number().int().nonnegative().optional(),
      isActive: z.boolean().optional(),
    })
    .strict();

  const IcpBracketPatchSchema = IcpBracketCreateSchema.partial().strict();

  app.post(
    "/api/admin/knowledge-registry/icp-bracket-catalog/data",
    requireAdmin,
    csrfTokenGuard,
    async (req, res) => {
      const parsed = IcpBracketCreateSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "Invalid bracket payload",
          code: "AKNW-017",
          details: parsed.error.flatten(),
        });
      }
      const b = parsed.data;
      try {
        const dup = await db.execute(sql`
          SELECT 1 FROM icp_brackets WHERE slug = ${b.slug} LIMIT 1
        `);
        if (dup.rows.length > 0) {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Bracket with slug '${b.slug}' already exists`,
            code: "AKNW-018",
          });
        }

        const compSetJson = b.compSetNames ? JSON.stringify(b.compSetNames) : null;
        const result = await db.execute(sql`
          INSERT INTO icp_brackets (
            slug, name, archetype_label, customer_type, service_consumption_profile,
            target_adr_band_low, target_adr_band_high, comp_set_names,
            description, source_note, sort_order, is_active
          ) VALUES (
            ${b.slug},
            ${b.name},
            ${b.archetypeLabel},
            ${b.customerType},
            ${b.serviceConsumptionProfile},
            ${b.targetAdrBandLow ?? null},
            ${b.targetAdrBandHigh ?? null},
            ${compSetJson}::jsonb,
            ${b.description ?? null},
            ${b.sourceNote ?? null},
            ${b.sortOrder ?? 0},
            ${b.isActive ?? true}
          )
          RETURNING id, slug
        `);
        const row = result.rows[0] as { id: number; slug: string };
        logActivity(req, "icp-bracket-create", "icp_brackets", row.id, row.slug, { slug: row.slug });
        return res.status(HTTP_201_CREATED).json({ bracket: row });
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === "23505") {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Bracket with slug '${b.slug}' already exists`,
            code: "AKNW-018",
          });
        }
        return logAndSendError(res, "Failed to create ICP bracket", error, "AKNW-019");
      }
    },
  );

  app.patch(
    "/api/admin/knowledge-registry/icp-bracket-catalog/data/:id",
    requireAdmin,
    csrfTokenGuard,
    async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "Invalid bracket id",
          code: "AKNW-020",
        });
      }
      const parsed = IcpBracketPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "Invalid bracket payload",
          code: "AKNW-021",
          details: parsed.error.flatten(),
        });
      }
      const p = parsed.data;
      if (Object.keys(p).length === 0) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "No fields to update",
          code: "AKNW-022",
        });
      }
      try {
        const existing = await db.execute(sql`
          SELECT id, slug FROM icp_brackets WHERE id = ${id} LIMIT 1
        `);
        if (existing.rows.length === 0) {
          return res.status(HTTP_404_NOT_FOUND).json({
            error: "Bracket not found",
            code: "AKNW-023",
          });
        }

        // Build SET clauses dynamically while keeping each value parameterized.
        const sets: ReturnType<typeof sql>[] = [];
        if (p.slug !== undefined) {
          if (p.slug !== (existing.rows[0] as { slug: string }).slug) {
            const dup = await db.execute(sql`
              SELECT 1 FROM icp_brackets WHERE slug = ${p.slug} AND id <> ${id} LIMIT 1
            `);
            if (dup.rows.length > 0) {
              return res.status(HTTP_409_CONFLICT).json({
                error: `Bracket with slug '${p.slug}' already exists`,
                code: "AKNW-024",
              });
            }
          }
          sets.push(sql`slug = ${p.slug}`);
        }
        if (p.name !== undefined) sets.push(sql`name = ${p.name}`);
        if (p.archetypeLabel !== undefined) sets.push(sql`archetype_label = ${p.archetypeLabel}`);
        if (p.customerType !== undefined) sets.push(sql`customer_type = ${p.customerType}`);
        if (p.serviceConsumptionProfile !== undefined)
          sets.push(sql`service_consumption_profile = ${p.serviceConsumptionProfile}`);
        if (p.targetAdrBandLow !== undefined) sets.push(sql`target_adr_band_low = ${p.targetAdrBandLow}`);
        if (p.targetAdrBandHigh !== undefined) sets.push(sql`target_adr_band_high = ${p.targetAdrBandHigh}`);
        if (p.compSetNames !== undefined) {
          const json = p.compSetNames ? JSON.stringify(p.compSetNames) : null;
          sets.push(sql`comp_set_names = ${json}::jsonb`);
        }
        if (p.description !== undefined) sets.push(sql`description = ${p.description}`);
        if (p.sourceNote !== undefined) sets.push(sql`source_note = ${p.sourceNote}`);
        if (p.sortOrder !== undefined) sets.push(sql`sort_order = ${p.sortOrder}`);
        if (p.isActive !== undefined) sets.push(sql`is_active = ${p.isActive}`);
        sets.push(sql`updated_at = now()`);

        const setClause = sql.join(sets, sql`, `);
        const result = await db.execute(sql`
          UPDATE icp_brackets SET ${setClause}
          WHERE id = ${id}
          RETURNING id, slug, is_active
        `);
        const row = result.rows[0] as { id: number; slug: string; is_active: boolean };
        const action = p.isActive === false ? "icp-bracket-retire"
          : p.isActive === true ? "icp-bracket-restore"
          : "icp-bracket-update";
        logActivity(req, action, "icp_brackets", row.id, row.slug, { fields: Object.keys(p) });
        return res.json({ bracket: row });
      } catch (error: unknown) {
        if ((error as { code?: string })?.code === "23505") {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Bracket with slug '${p.slug}' already exists`,
            code: "AKNW-024",
          });
        }
        return logAndSendError(res, "Failed to update ICP bracket", error, "AKNW-025");
      }
    },
  );

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
      logAndSendError(res, "Failed to regenerate country economic data", error, "AKNW-003");
    }
  });

  // GET /api/admin/knowledge-registry/:id
  app.get("/api/admin/knowledge-registry/:id", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found", code: "AKNW-007" });
      res.json(entry);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch knowledge registry entry", error, "AKNW-004");
    }
  });

  // GET /api/admin/knowledge-registry/:id/chunks?page=N
  // Paginated chunk browsing for VectorChunkViewer. Only valid for
  // vector_namespace assets; returns 422 for other asset types.
  app.get("/api/admin/knowledge-registry/:id/chunks", requireAdmin, async (req, res) => {
    try {
      const entry = await storage.getKnowledgeRegistryEntry(String(req.params.id));
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found", code: "AKNW-008" });
      if (entry.assetType !== "vector_namespace") {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: `Chunk browsing is only available for vector_namespace assets; this entry is asset_type '${entry.assetType}'`,
        code: "AKNW-010" });
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
      logAndSendError(res, "Failed to fetch chunks for knowledge registry entry", error, "AKNW-005");
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
      if (!entry) return res.status(HTTP_404_NOT_FOUND).json({ error: "Knowledge registry entry not found", code: "AKNW-009" });

      if (entry.assetType === "vector_namespace") {
        const assetRef = entry.assetRef;

        if (assetRef === "assumption-guidance") {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: "assumption-guidance has no portfolio-wide regeneration path. It is populated automatically by per-entity analyst runs.",
          code: "AKNW-011" });
        }
        if (assetRef === "comparables") {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: "comparables are indexed per-property during research runs. Use the research engine to regenerate comparables for a specific property.",
          code: "AKNW-012" });
        }

        const dispatch: Record<string, () => Promise<unknown>> = {
          "market-research": () => indexAllMarketResearch(),
          "knowledge-base": () => indexKnowledgeBase(),
        };

        const fn = dispatch[assetRef];
        if (!fn) {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: `No regeneration handler for vector namespace '${assetRef}'`,
          code: "AKNW-013" });
        }

        const result = await fn();
        await storage.updateKnowledgeRegistryRefreshed(id, new Date());
        logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, { result });
        return res.json({ success: true, assetRef, result });
      }

      // National research feed tables (vendor-passthrough-costs, mgmt-co-markup-factors)
      // are regenerated by calling their Pietro minion directly, not via the LLM
      // analyst-table-refresh path (which requires an analyst-tables tableId).
      if (entry.assetType === "benchmark_table" && MINION_REGISTRY[entry.assetRef]) {
        const minionSlug = entry.assetRef;
        if (!acquireInFlight(minionSlug)) {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Refresh already in flight for ${minionSlug}`,
          });
        }
        try {
          const minionFn = MINION_REGISTRY[minionSlug]!;
          const result = await minionFn();
          await storage.updateKnowledgeRegistryRefreshed(id, new Date());
          logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, {
            slug: minionSlug,
            rowsUpserted: result.rowsUpserted,
          });
          return res.json({ success: true, assetRef: entry.assetRef, rowsUpserted: result.rowsUpserted });
        } finally {
          releaseInFlight(minionSlug);
        }
      }

      if (entry.assetType === "benchmark_table" || entry.assetType === "benchmark_brands") {
        const tableId = BENCHMARK_TABLE_ID[entry.assetRef];
        if (!tableId) {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
            error: `Unknown benchmark asset ref: ${entry.assetRef}`,
          code: "AKNW-014" });
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

      // catalog_table — re-runs the idempotent seed (ON CONFLICT DO NOTHING)
      // so any missing starter brackets are restored without overwriting live data.
      if (entry.assetType === "catalog_table" && entry.assetRef === "icp-bracket-catalog") {
        if (!acquireInFlight("icp-bracket-catalog")) {
          return res.status(HTTP_409_CONFLICT).json({
            error: "Refresh already in flight for icp-bracket-catalog",
          });
        }
        try {
          await runIcpBrackets001();
          await storage.updateKnowledgeRegistryRefreshed(id, new Date());
          logActivity(req, "knowledge-registry-regenerate", "knowledge_registry", null, id, {
            assetRef: entry.assetRef,
          });
          return res.json({ success: true, assetRef: entry.assetRef });
        } finally {
          releaseInFlight("icp-bracket-catalog");
        }
      }

      return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
        error: `Unhandled asset type: ${entry.assetType}`,
      code: "AKNW-015" });
    } catch (error: unknown) {
      logger.error(`Knowledge registry regeneration failed for ${req.params.id}: ${String(error)}`, "knowledge-registry");
      logAndSendError(res, "Failed to regenerate knowledge registry entry", error, "AKNW-006");
    }
  });
}
