/**
 * Admin routes for the 24 market benchmark band groups.
 *
 * These are the universal (no country/subdivision) low/mid/high triplets
 * seeded into model_constants that drive every Specialist watchdog. Admins
 * can view and edit them here without a code deploy; the Analyst button
 * re-seeds gaps only (never overwrites manually-saved values).
 *
 * GET  /api/admin/benchmark-bands        — list all groups with current values
 * PUT  /api/admin/benchmark-bands/:base  — save one group's low/mid/high
 * POST /api/admin/benchmark-bands/seed   — gap-fill seed (non-destructive)
 */

import type { Express } from "express";
import { z } from "zod";
import { eq, isNull, and, sql } from "drizzle-orm";
import { requireAdmin } from "../../auth";
import { logAndSendError, logActivity } from "../helpers";
import { ModelCanonicalsStorage } from "../../storage/model-canonicals";
import { db } from "../../db";
import { modelConstants } from "@workspace/db";
import { getFactoryNumber, type RegisteredConstantKey } from "@shared/model-constants-registry";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
} from "../../constants";

const canonicalsStorage = new ModelCanonicalsStorage();

type BandCategory = "compensation" | "revenue" | "overhead" | "property-defaults" | "company";

type BandGroup = {
  keyBase: string;
  label: string;
  category: BandCategory;
  unit: string;
  authority: string;
};

const BAND_GROUPS: BandGroup[] = [
  // Compensation
  {
    keyBase: "benchmarkCompPartnerCompYear1",
    category: "compensation",
    unit: "usd",
    label: "Partner total comp — Year 1 (USD/yr)",
    authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
  },
  {
    keyBase: "benchmarkCompPartnerCompYear10",
    category: "compensation",
    unit: "usd",
    label: "Partner total comp — Year 10 (USD/yr)",
    authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
  },
  {
    keyBase: "benchmarkCompPartnerCountYear1",
    category: "compensation",
    unit: "count",
    label: "Founding partner headcount — Year 1",
    authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
  },
  {
    keyBase: "benchmarkCompStaffSalary",
    category: "compensation",
    unit: "usd",
    label: "Average staff salary (USD/yr)",
    authority: "AHLA Lodging Industry Survey + hospitality market benchmarks",
  },
  {
    keyBase: "benchmarkCompStaffTier3Fte",
    category: "compensation",
    unit: "count",
    label: "Tier-3 FTE count (max-scale staffing)",
    authority: "Hospitality ManCo compensation benchmarks (H+ Analytics 2024)",
  },
  // Revenue
  {
    keyBase: "benchmarkRevMarketingRate",
    category: "revenue",
    unit: "percent",
    label: "Sales & marketing as % of total revenue",
    authority: "HVS 2024 Hotel Cost Survey (boutique luxury)",
  },
  {
    keyBase: "benchmarkRevFbRevenueShare",
    category: "revenue",
    unit: "percent",
    label: "F&B as % of total revenue",
    authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
  },
  {
    keyBase: "benchmarkRevEventsRevenueShare",
    category: "revenue",
    unit: "percent",
    label: "Events as % of total revenue",
    authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
  },
  {
    keyBase: "benchmarkRevOtherRevenueShare",
    category: "revenue",
    unit: "percent",
    label: "Other operated departments as % of total revenue",
    authority: "STR/CoStar 2024 + BLLA 2024 boutique luxury operating mix",
  },
  {
    keyBase: "benchmarkRevCateringBoostPct",
    category: "revenue",
    unit: "percent",
    label: "Catering boost additive uplift on F&B",
    authority: "Industry rule-of-thumb — off-property catering / private events",
  },
  // Overhead
  {
    keyBase: "benchmarkOverheadOfficeLease",
    category: "overhead",
    unit: "usd",
    label: "Office lease start cost (USD/yr)",
    authority: "AHLA Lodging Industry Survey + HFTP/AICPA practice benchmarks",
  },
  {
    keyBase: "benchmarkOverheadProfServices",
    category: "overhead",
    unit: "usd",
    label: "Professional services start cost (USD/yr)",
    authority: "AICPA practice benchmarks for early-stage hospitality companies",
  },
  {
    keyBase: "benchmarkOverheadTechInfra",
    category: "overhead",
    unit: "usd",
    label: "Tech infrastructure start cost (USD/yr)",
    authority: "HFTP Technology Survey for corporate-level IT spend",
  },
  {
    keyBase: "benchmarkOverheadBizInsurance",
    category: "overhead",
    unit: "usd",
    label: "Business insurance start cost (USD/yr)",
    authority: "Hospitality D&O / E&O / cyber liability premium benchmarks",
  },
  {
    keyBase: "benchmarkOverheadTravelPerClient",
    category: "overhead",
    unit: "usd",
    label: "Travel cost per managed property (USD/yr)",
    authority: "AHLA per-property travel benchmarks",
  },
  {
    keyBase: "benchmarkOverheadItLicensePerClient",
    category: "overhead",
    unit: "usd",
    label: "IT license cost per managed property (USD/yr)",
    authority: "HFTP per-property tech-stack survey",
  },
  // Property defaults
  {
    keyBase: "benchmarkPropDefaultsEventExpenseRate",
    category: "property-defaults",
    unit: "percent",
    label: "Event expense as % of event revenue",
    authority: "AHLA/USALI F&B and Event Cost Benchmarks (11th ed.) + CBRE Hotel Operations Report",
  },
  {
    keyBase: "benchmarkPropDefaultsOtherExpenseRate",
    category: "property-defaults",
    unit: "percent",
    label: "Other expense as % of other revenue",
    authority: "CBRE Trends in the Hotel Industry + USALI undistributed-department benchmarks",
  },
  {
    keyBase: "benchmarkPropDefaultsUtilitiesVarSplit",
    category: "property-defaults",
    unit: "percent",
    label: "Utilities variable vs. fixed split (%)",
    authority: "ENERGY STAR Hotel Energy Intensity benchmarks + Cornell Hotel Sustainability Handbook",
  },
  {
    keyBase: "benchmarkPropDefaultsSalesCommissionRate",
    category: "property-defaults",
    unit: "percent",
    label: "Sales commission rate (% of room revenue)",
    authority: "Kalibri Labs Direct Booking Study + AHLA Distribution Cost Study",
  },
  // Company
  {
    keyBase: "benchmarkCompanyBaseMgmtFee",
    category: "company",
    unit: "percent",
    label: "Base management fee (% of gross revenue)",
    authority: "AHLA/HLA operator survey + CBRE Hotel Management Fee Study",
  },
  {
    keyBase: "benchmarkCompanyIncentiveMgmtFee",
    category: "company",
    unit: "percent",
    label: "Incentive management fee (% of GOP)",
    authority: "HVS Management Contract Study + STR/AHLA operator terms",
  },
  {
    keyBase: "benchmarkCompanyTaxRate",
    category: "company",
    unit: "percent",
    label: "Company tax rate (%)",
    authority: "IRS corporate rates + AICPA combined federal + state benchmarks",
  },
  {
    keyBase: "benchmarkCompanyCostOfEquity",
    category: "company",
    unit: "percent",
    label: "Cost of equity (%)",
    authority:
      "Damodaran + Duff & Phelps Kroll Cost of Capital Navigator 2024 + KPMG WACC Monitor + CBRE 2024 Hotel Investor Survey",
  },
];

const BAND_GROUP_MAP = new Map(BAND_GROUPS.map((g) => [g.keyBase, g]));

const saveBandSchema = z.object({
  low: z.number(),
  mid: z.number(),
  high: z.number(),
}).refine((d) => d.low <= d.mid, {
  message: "low must be ≤ mid",
}).refine((d) => d.mid <= d.high, {
  message: "mid must be ≤ high",
});

function factoryForKey(key: string): number {
  try {
    return getFactoryNumber(key as RegisteredConstantKey);
  } catch {
    return 0;
  }
}

/**
 * Upsert a single universal (country=null, subdivision=null) band key inside
 * an existing Drizzle transaction context. Mirrors the NULL-safe pre-find
 * pattern in ModelCanonicalsStorage.upsertCanonical but accepts a tx handle
 * so all three band keys in a triplet are written atomically.
 */
async function upsertBandKeyInTx(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  constantKey: string,
  value: number,
  unit: string,
  authoritySource: string,
  lastEditedBy: number | null,
): Promise<void> {
  const conds = [
    eq(modelConstants.constantKey, constantKey),
    isNull(modelConstants.country),
    isNull(modelConstants.countrySubdivision),
  ];
  const [existing] = await tx.select({ id: modelConstants.id }).from(modelConstants).where(and(...conds));

  if (existing) {
    await tx
      .update(modelConstants)
      .set({ value, unit, authoritySource, lastEditedBy, lastEditedAt: new Date() })
      .where(eq(modelConstants.id, existing.id));
  } else {
    await tx
      .insert(modelConstants)
      .values({ constantKey, country: null, countrySubdivision: null, value, unit, authoritySource, lastEditedBy })
      .onConflictDoUpdate({
        target: [modelConstants.constantKey, modelConstants.country, modelConstants.countrySubdivision],
        set: { value, unit, authoritySource, lastEditedBy, lastEditedAt: sql`now()` },
      });
  }
}

export function registerBenchmarkBandRoutes(app: Express) {
  /**
   * List all 24 band groups with their current effective values.
   * Reads canonical rows from model_constants; falls back to factory defaults
   * for keys that have not been seeded yet.
   */
  app.get("/api/admin/benchmark-bands", requireAdmin, async (_req, res) => {
    try {
      const allCanonicals = await canonicalsStorage.listCanonicals();

      const canonicalsByKey = new Map(
        allCanonicals
          .filter((c) => c.country === null && c.countrySubdivision === null)
          .map((c) => [c.constantKey, c]),
      );

      const groups = BAND_GROUPS.map((g) => {
        const lowKey = `${g.keyBase}Low`;
        const midKey = `${g.keyBase}Mid`;
        const highKey = `${g.keyBase}High`;

        const lowRow = canonicalsByKey.get(lowKey);
        const midRow = canonicalsByKey.get(midKey);
        const highRow = canonicalsByKey.get(highKey);

        return {
          keyBase: g.keyBase,
          label: g.label,
          category: g.category,
          unit: g.unit,
          authority: g.authority,
          low:  lowRow  ? Number(lowRow.value)  : factoryForKey(lowKey),
          mid:  midRow  ? Number(midRow.value)  : factoryForKey(midKey),
          high: highRow ? Number(highRow.value) : factoryForKey(highKey),
          seeded: !!(lowRow && midRow && highRow),
          lastEditedAt: lowRow?.lastEditedAt ?? lowRow?.id ? (lowRow as { lastEditedAt?: Date | null })?.lastEditedAt : null,
        };
      });

      res.json({ groups });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to list benchmark bands", error, "ABB-001");
    }
  });

  /**
   * Save a single band group's low/mid/high values by upserting canonical
   * rows in model_constants. All three band keys (Low/Mid/High) are written
   * atomically so the group is always consistent.
   */
  app.put("/api/admin/benchmark-bands/:base", requireAdmin, async (req, res) => {
    try {
      const keyBase = String(req.params.base ?? "");
      const group = BAND_GROUP_MAP.get(keyBase);
      if (!group) {
        return res.status(HTTP_404_NOT_FOUND).json({
          error: `Unknown benchmark band key base: ${keyBase}`,
          code: "ABB-011",
        });
      }

      const parsed = saveBandSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({
          error: parsed.error.message,
          code: "ABB-012",
        });
      }

      const { low, mid, high } = parsed.data;
      const userId = (req.user as { id?: number } | undefined)?.id ?? null;

      // Write all three band keys atomically so the triplet is never partially
      // updated if the request fails mid-way.
      await db.transaction(async (tx) => {
        await upsertBandKeyInTx(tx, `${keyBase}Low`,  low,  group.unit, group.authority, userId);
        await upsertBandKeyInTx(tx, `${keyBase}Mid`,  mid,  group.unit, group.authority, userId);
        await upsertBandKeyInTx(tx, `${keyBase}High`, high, group.unit, group.authority, userId);
      });

      logActivity(
        req,
        "save-benchmark-band",
        "benchmark-band",
        0,
        `Saved benchmark band ${keyBase}: low=${low}, mid=${mid}, high=${high}`,
      );

      res.json({ keyBase, low, mid, high });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to save benchmark band", error, "ABB-002");
    }
  });

  /**
   * Non-destructive seed: fills canonical rows that are missing in the DB
   * without overwriting any row that already has a value. Runs only the
   * benchmark-band keys, not the full country/state matrix.
   *
   * This is the "Analyst refresh" action from the UI — it gives first-time
   * admins populated defaults to start from without clobbering manual edits.
   */
  app.post("/api/admin/benchmark-bands/seed", requireAdmin, async (req, res) => {
    try {
      const allCanonicals = await canonicalsStorage.listCanonicals();
      const existingKeys = new Set(
        allCanonicals
          .filter((c) => c.country === null && c.countrySubdivision === null)
          .map((c) => c.constantKey),
      );

      let filled = 0;
      let skipped = 0;

      for (const g of BAND_GROUPS) {
        const triplets: [string, string][] = [
          [`${g.keyBase}Low`, "Low"],
          [`${g.keyBase}Mid`, "Mid"],
          [`${g.keyBase}High`, "High"],
        ];

        for (const [key] of triplets) {
          if (existingKeys.has(key)) {
            skipped++;
            continue;
          }
          const value = factoryForKey(key);
          await canonicalsStorage.upsertCanonical({
            constantKey: key,
            country: null,
            countrySubdivision: null,
            value,
            unit: g.unit,
            authoritySource: g.authority,
          });
          filled++;
        }
      }

      logActivity(
        req,
        "seed-benchmark-bands",
        "benchmark-band",
        0,
        `Gap-fill seed: ${filled} rows inserted, ${skipped} rows already present (skipped).`,
      );

      res.json({ filled, skipped });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to seed benchmark bands", error, "ABB-003");
    }
  });
}
