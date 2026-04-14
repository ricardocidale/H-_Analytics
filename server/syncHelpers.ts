import type { IStorage } from "./storage";
import { seedServiceTemplates } from "./seeds/services";
import { SEED_PROPERTY_DEFAULTS, DEFAULT_FEE_CATEGORIES, SEED_SYNC_PROPERTIES } from "./seeds/properties";
import { readFileSync } from "fs";
import { resolve } from "path";
import { db } from "./db";
import { seedDefaults } from "@shared/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  DEFAULT_EXIT_CAP_RATE,
  DEFAULT_COMMISSION_RATE,
  DEFAULT_SAFE_VALUATION_CAP,
  DEFAULT_SAFE_DISCOUNT_RATE,
  DEFAULT_EVENT_EXPENSE_RATE,
  DEFAULT_OTHER_EXPENSE_RATE,
  DEFAULT_UTILITIES_VARIABLE_SPLIT,
  SEED_DEBT_ASSUMPTIONS,
  DEFAULT_PROPERTY_INFLATION_RATE,
  DEFAULT_COMPANY_TAX_RATE,
  DEFAULT_BUSINESS_INSURANCE_START,
} from "../shared/constants";

export interface SyncResults {
  globalAssumptions: { created: number; skipped: number; filled: number };
  properties: { created: number; skipped: number; filled: number };
  propertyFeeCategories: { created: number; skipped: number };
  designThemes: { created: number; skipped: number };
  serviceTemplates: { created: number; skipped: number };
}

export const SEED_GLOBAL_ASSUMPTIONS = {
  modelStartDate: "2026-04-01",
  inflationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  baseManagementFee: DEFAULT_BASE_MANAGEMENT_FEE_RATE,
  incentiveManagementFee: DEFAULT_INCENTIVE_MANAGEMENT_FEE_RATE,
  staffSalary: 75000,
  staffTier1MaxProperties: 3,
  staffTier1Fte: 2.5,
  staffTier2MaxProperties: 6,
  staffTier2Fte: 4.5,
  staffTier3Fte: 7.0,
  travelCostPerClient: 12000,
  itLicensePerClient: 3000,
  marketingRate: 0.05,
  miscOpsRate: 0.03,
  officeLeaseStart: 36000,
  professionalServicesStart: 24000,
  techInfraStart: 18000,
  businessInsuranceStart: DEFAULT_BUSINESS_INSURANCE_START,
  standardAcqPackage: { monthsToOps: 6, purchasePrice: 3800000, preOpeningCosts: 200000, operatingReserve: 250000, buildingImprovements: 1200000 },
  debtAssumptions: SEED_DEBT_ASSUMPTIONS,
  commissionRate: DEFAULT_COMMISSION_RATE,
  fixedCostEscalationRate: DEFAULT_PROPERTY_INFLATION_RATE,
  safeTranche1Amount: 1000000,
  safeTranche1Date: "2026-06-01",
  safeTranche2Amount: 1000000,
  safeTranche2Date: "2027-04-01",
  safeValuationCap: DEFAULT_SAFE_VALUATION_CAP,
  safeDiscountRate: DEFAULT_SAFE_DISCOUNT_RATE,
  companyTaxRate: DEFAULT_COMPANY_TAX_RATE,
  companyOpsStartDate: "2026-06-01",
  fiscalYearStartMonth: 1,
  companyName: "Hospitality Business Group",
  exitCapRate: DEFAULT_EXIT_CAP_RATE,
  salesCommissionRate: DEFAULT_COMMISSION_RATE,
  eventExpenseRate: DEFAULT_EVENT_EXPENSE_RATE,
  otherExpenseRate: DEFAULT_OTHER_EXPENSE_RATE,
  utilitiesVariableSplit: DEFAULT_UTILITIES_VARIABLE_SPLIT,
  partnerCompYear1: 540000, partnerCompYear2: 540000, partnerCompYear3: 540000,
  partnerCompYear4: 600000, partnerCompYear5: 600000, partnerCompYear6: 700000,
  partnerCompYear7: 700000, partnerCompYear8: 800000, partnerCompYear9: 800000, partnerCompYear10: 900000,
  partnerCountYear1: 3, partnerCountYear2: 3, partnerCountYear3: 3, partnerCountYear4: 3, partnerCountYear5: 3,
  partnerCountYear6: 3, partnerCountYear7: 3, partnerCountYear8: 3, partnerCountYear9: 3, partnerCountYear10: 3,
};

export { SEED_PROPERTY_DEFAULTS, DEFAULT_FEE_CATEGORIES } from "./seeds/properties";

export const SEED_PROPERTIES = SEED_SYNC_PROPERTIES;

export function isFieldEmpty(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === "string" && value.trim() === "") return true;
  return false;
}

export function fillMissingFields<T extends Record<string, unknown>>(
  existing: T,
  defaults: Record<string, unknown>,
  excludeKeys: string[] = ["id", "createdAt", "updatedAt", "userId"]
): Partial<T> {
  const updates: Record<string, unknown> = {};
  for (const [key, defaultValue] of Object.entries(defaults)) {
    if (excludeKeys.includes(key)) continue;
    const existingValue = existing[key];
    if (isFieldEmpty(existingValue)) {
      updates[key] = defaultValue;
    }
  }
  return updates as Partial<T>;
}

export async function runFillOnlySync(storage: IStorage, generateResearchValues?: (prop: any) => any): Promise<SyncResults> {
  const results: SyncResults = {
    globalAssumptions: { created: 0, skipped: 0, filled: 0 },
    properties: { created: 0, skipped: 0, filled: 0 },
    propertyFeeCategories: { created: 0, skipped: 0 },
    designThemes: { created: 0, skipped: 0 },
    serviceTemplates: { created: 0, skipped: 0 },
  };

  const existingAssumptions = await storage.getGlobalAssumptions();
  if (!existingAssumptions) {
    await storage.upsertGlobalAssumptions(SEED_GLOBAL_ASSUMPTIONS);
    results.globalAssumptions.created++;
  } else {
    const updates = fillMissingFields(existingAssumptions as any, SEED_GLOBAL_ASSUMPTIONS);
    if (Object.keys(updates).length > 0) {
      await storage.upsertGlobalAssumptions({ ...existingAssumptions, ...updates } as any);
      results.globalAssumptions.filled++;
    } else {
      results.globalAssumptions.skipped++;
    }
  }

  const existingProperties = await storage.getAllProperties();
  const existingByName = new Map(existingProperties.map(p => [p.name, p]));

  for (const propData of SEED_PROPERTIES) {
    const existing = existingByName.get(propData.name);
    if (!existing) {
      let researchValues: any = null;
      if (generateResearchValues) {
        researchValues = generateResearchValues({
          location: propData.location,
          streetAddress: propData.streetAddress,
          city: propData.city,
          stateProvince: propData.stateProvince,
          market: propData.market,
        });
      }
      await storage.createProperty({ ...propData, researchValues, userId: null } as any);
      results.properties.created++;
    } else {
      const updates = fillMissingFields(existing as any, propData, ["id", "createdAt", "updatedAt", "userId", "name"]);
      if (!existing.researchValues && generateResearchValues) {
        (updates as any).researchValues = generateResearchValues({
          location: existing.location,
          streetAddress: existing.streetAddress,
          city: existing.city,
          stateProvince: existing.stateProvince,
          market: existing.market,
        });
      }
      if (Object.keys(updates).length > 0) {
        await storage.updateProperty(existing.id, updates as any);
        results.properties.filled++;
      } else {
        results.properties.skipped++;
      }
    }
  }

  const allProps = await storage.getAllProperties();
  for (const prop of allProps) {
    const existingCats = await storage.getFeeCategoriesByProperty(prop.id);
    if (existingCats.length === 0) {
      for (const cat of DEFAULT_FEE_CATEGORIES) {
        await storage.createFeeCategory({ propertyId: prop.id, name: cat.name, rate: cat.rate, isActive: true, sortOrder: cat.sortOrder });
        results.propertyFeeCategories.created++;
      }
    } else {
      for (const cat of DEFAULT_FEE_CATEGORIES) {
        const existingCat = existingCats.find(c => c.name === cat.name);
        if (!existingCat) {
          await storage.createFeeCategory({ propertyId: prop.id, name: cat.name, rate: cat.rate, isActive: true, sortOrder: cat.sortOrder });
          results.propertyFeeCategories.created++;
        } else {
          results.propertyFeeCategories.skipped++;
        }
      }
    }
  }

  const existingThemes = await storage.getAllDesignThemes();
  const SEED_THEMES = [
    {
      name: "L+B Brand",
      description: "The native application color system. Derived directly from the app's CSS custom properties — sage green primary, forest green secondary, warm cream backgrounds, and a charcoal sidebar. Earthy, natural, and trustworthy.",
      isDefault: true,
      colors: [
        { name: "Sage Green",   rank: 1, hexCode: "#9FBCA4", description: "PALETTE: Primary brand color. Drives action buttons, active nav items, focus rings, and key highlights. CSS: --primary (hsl 131 18% 68%)" },
        { name: "Forest Green", rank: 2, hexCode: "#257D41", description: "PALETTE: Deep secondary color for contrast elements, secondary buttons, and badges. CSS: --secondary (hsl 145 55% 31%)" },
        { name: "Warm Cream",   rank: 3, hexCode: "#FFF9F5", description: "PALETTE: Page background and warm card surfaces. Creates a soft, welcoming canvas. CSS: --background (hsl 30 100% 98%)" },
        { name: "Charcoal",     rank: 4, hexCode: "#3D3D3D", description: "PALETTE: Dark sidebar background, primary text foreground. Provides depth and contrast. CSS: --foreground / --sidebar (hsl 0 0% 24%)" },
        { name: "Warm Linen",   rank: 5, hexCode: "#F5F2F0", description: "PALETTE: Muted surface color for secondary cards, table row alternates, and input backgrounds. CSS: --muted (hsl 30 20% 95%)" },
        { name: "Warm Border",  rank: 6, hexCode: "#E5E0DC", description: "PALETTE: Subtle border and input outline color. Warm-toned to complement the cream background. CSS: --border (hsl 30 15% 88%)" },
        { name: "Sage",      rank: 1, hexCode: "#9FBCA4", description: "CHART: Primary series — revenue, total income, and primary metrics. CSS: --chart-1" },
        { name: "Forest",    rank: 2, hexCode: "#257D41", description: "CHART: Secondary series — NOI, net income, and profitability metrics. CSS: --chart-2" },
        { name: "Amethyst",  rank: 3, hexCode: "#AF57DB", description: "CHART: Tertiary series — cash flow, EBITDA, and financial health metrics. CSS: --chart-3" },
        { name: "Amber",     rank: 4, hexCode: "#D97706", description: "CHART: Quaternary series — expenses, cost metrics, and budget tracking. CSS: --chart-4" },
        { name: "Crimson",   rank: 5, hexCode: "#EF4444", description: "CHART: Quinary series — alerts, shortfalls, and negative variance. CSS: --chart-5 / --destructive" },
      ],
    },
    {
      name: "Fluid Glass",
      description: "Inspired by Apple's iOS design language, Fluid Glass creates a sense of depth and dimension through translucent layers, subtle gradients, and smooth animations.",
      isDefault: false,
      colors: [
        { name: "Sage Green", rank: 1, hexCode: "#9FBCA4", description: "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements." },
        { name: "Deep Green", rank: 2, hexCode: "#257D41", description: "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights." },
        { name: "Warm Cream", rank: 3, hexCode: "#FFF9F5", description: "PALETTE: Light background for page backgrounds, card surfaces, and warm accents." },
        { name: "Deep Black", rank: 4, hexCode: "#0a0a0f", description: "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens." },
        { name: "Salmon", rank: 5, hexCode: "#F4795B", description: "PALETTE: Accent color for warnings, notifications, and emphasis highlights." },
        { name: "Yellow Gold", rank: 6, hexCode: "#F59E0B", description: "PALETTE: Accent color for highlights, badges, and attention-drawing elements." },
        { name: "Chart Blue", rank: 1, hexCode: "#3B82F6", description: "CHART: Primary chart line color for revenue and key financial metrics." },
        { name: "Chart Red", rank: 2, hexCode: "#EF4444", description: "CHART: Secondary chart line color for expenses and cost-related metrics." },
        { name: "Chart Purple", rank: 3, hexCode: "#8B5CF6", description: "CHART: Tertiary chart line color for cash flow and profitability metrics." },
      ],
    },
    {
      name: "Indigo Blue",
      description: "A bold, professional theme centered on deep indigo-blue tones with cool steel accents. Conveys trust, authority, and modern sophistication — ideal for investor-facing presentations.",
      isDefault: false,
      colors: [
        { name: "Indigo", rank: 1, hexCode: "#4F46E5", description: "PALETTE: Primary brand color for main action buttons, active navigation items, and key highlights." },
        { name: "Deep Navy", rank: 2, hexCode: "#1E1B4B", description: "PALETTE: Dark theme background for navigation sidebars, dark glass panels, and login screens." },
        { name: "Ice White", rank: 3, hexCode: "#F0F4FF", description: "PALETTE: Light background for page backgrounds, card surfaces, and cool accents." },
        { name: "Steel Blue", rank: 4, hexCode: "#64748B", description: "PALETTE: Secondary accent for subtle highlights, card borders, and supporting visual elements." },
        { name: "Coral", rank: 5, hexCode: "#F43F5E", description: "PALETTE: Accent color for warnings, notifications, and emphasis highlights." },
        { name: "Amber", rank: 6, hexCode: "#F59E0B", description: "PALETTE: Accent color for highlights, badges, and attention-drawing elements." },
        { name: "Chart Indigo", rank: 1, hexCode: "#6366F1", description: "CHART: Primary chart line color for revenue and key financial metrics." },
        { name: "Chart Teal", rank: 2, hexCode: "#14B8A6", description: "CHART: Secondary chart line color for expenses and cost-related metrics." },
        { name: "Chart Violet", rank: 3, hexCode: "#A855F7", description: "CHART: Tertiary chart line color for cash flow and profitability metrics." },
      ],
    },
  ];

  const existingNames = new Set(existingThemes.map(t => t.name));
  let lbBrandThemeId: number | null = null;
  for (const theme of SEED_THEMES) {
    if (!existingNames.has(theme.name)) {
      const created = await storage.createDesignTheme(theme);
      if (theme.name === "L+B Brand") lbBrandThemeId = created.id;
      results.designThemes.created++;
    } else {
      if (theme.name === "L+B Brand") {
        const existing = existingThemes.find(t => t.name === "L+B Brand");
        if (existing) lbBrandThemeId = existing.id;
      }
      results.designThemes.skipped++;
    }
  }

  const defaultTheme = await storage.getDefaultDesignTheme();
  const fallbackThemeId = lbBrandThemeId ?? defaultTheme?.id;

  // Seed service templates (idempotent — seedServiceTemplates skips if any exist)
  try {
    await seedServiceTemplates();
    results.serviceTemplates.created = 1; // seedServiceTemplates logs its own count
  } catch {
    results.serviceTemplates.skipped = 1;
  }

  return results;
}

// ══════════════════════════════════════════════════════════════════════
// Smart Sync — 3-way merge using seed manifest + shadow defaults
// ══════════════════════════════════════════════════════════════════════

export interface SmartSyncFieldResult {
  field: string;
  action: "updated" | "skipped" | "filled" | "unchanged";
  oldValue?: unknown;
  newValue?: unknown;
}

export interface SmartSyncEntityResult {
  key: string;
  created: boolean;
  fields: SmartSyncFieldResult[];
}

export interface SmartSyncResults {
  dryRun: boolean;
  globalAssumptions: SmartSyncEntityResult;
  properties: SmartSyncEntityResult[];
  feeCategories: { created: number; updated: number; skipped: number };
}

interface SeedManifest {
  version: number;
  generatedAt: string;
  entities: {
    globalAssumptions: { key: string; fields: Record<string, unknown> };
    properties: Array<{ key: string; fields: Record<string, unknown> }>;
    feeCategories: Array<{ key: string; fields: Record<string, unknown> }>;
  };
}

const SYNC_EXCLUDE_KEYS = new Set(["id", "createdAt", "updatedAt", "userId", "researchValues"]);

/** Deep-ish equality for seed values: handles numbers (epsilon), objects (JSON), null equivalence. */
export function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 0.0001;
  if (typeof a === "object" && typeof b === "object") return JSON.stringify(a) === JSON.stringify(b);
  return String(a) === String(b);
}

function loadManifest(): SeedManifest {
  const manifestPath = resolve(process.cwd(), "seed-manifest.json");
  return JSON.parse(readFileSync(manifestPath, "utf-8"));
}

/** Load all shadow defaults into a lookup Map keyed by "entityType::entityKey::fieldName". */
async function loadShadowDefaults(): Promise<Map<string, unknown>> {
  const rows = await db.select().from(seedDefaults);
  const map = new Map<string, unknown>();
  for (const row of rows) {
    map.set(`${row.entityType}::${row.entityKey}::${row.fieldName}`, row.seedValue);
  }
  return map;
}

/** Bulk upsert shadow defaults after sync. */
async function writeShadowDefaults(
  entityType: string,
  entityKey: string,
  fields: Record<string, unknown>,
): Promise<void> {
  const entries = Object.entries(fields).filter(([k]) => !SYNC_EXCLUDE_KEYS.has(k));
  if (entries.length === 0) return;

  // Batch in chunks of 50 to avoid query-length limits
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    const values = chunk.map(([fieldName, value]) => ({
      entityType,
      entityKey,
      fieldName,
      seedValue: value,
    }));
    await db.insert(seedDefaults).values(values).onConflictDoUpdate({
      target: [seedDefaults.entityType, seedDefaults.entityKey, seedDefaults.fieldName],
      set: { seedValue: sql`EXCLUDED.seed_value`, appliedAt: sql`now()` },
    });
  }
}

/** Merge one entity's fields using the 3-way merge logic. */
function mergeFields(
  manifestFields: Record<string, unknown>,
  currentValues: Record<string, unknown>,
  shadow: Map<string, unknown>,
  entityType: string,
  entityKey: string,
): { updates: Record<string, unknown>; fieldResults: SmartSyncFieldResult[] } {
  const updates: Record<string, unknown> = {};
  const fieldResults: SmartSyncFieldResult[] = [];

  for (const [field, newSeedValue] of Object.entries(manifestFields)) {
    if (SYNC_EXCLUDE_KEYS.has(field)) continue;
    const currentValue = currentValues[field];
    const shadowKey = `${entityType}::${entityKey}::${field}`;
    const lastSeed = shadow.get(shadowKey);

    if (lastSeed !== undefined) {
      // Shadow exists: 3-way merge
      if (valuesEqual(currentValue, lastSeed)) {
        // User never changed it → safe to update
        if (!valuesEqual(newSeedValue, lastSeed)) {
          updates[field] = newSeedValue;
          fieldResults.push({ field, action: "updated", oldValue: currentValue, newValue: newSeedValue });
        } else {
          fieldResults.push({ field, action: "unchanged" });
        }
      } else {
        // User changed it → skip
        fieldResults.push({ field, action: "skipped", oldValue: currentValue, newValue: newSeedValue });
      }
    } else {
      // First run: no shadow record
      if (isFieldEmpty(currentValue)) {
        updates[field] = newSeedValue;
        fieldResults.push({ field, action: "filled", newValue: newSeedValue });
      } else if (valuesEqual(currentValue, newSeedValue)) {
        // Current matches manifest → establish baseline, no update
        fieldResults.push({ field, action: "unchanged" });
      } else {
        // Ambiguous → preserve user value
        fieldResults.push({ field, action: "skipped", oldValue: currentValue, newValue: newSeedValue });
      }
    }
  }

  return { updates, fieldResults };
}

export async function runSmartSync(
  storage: IStorage,
  options: { dryRun?: boolean } = {},
): Promise<SmartSyncResults> {
  const manifest = loadManifest();
  const shadow = await loadShadowDefaults();
  const dryRun = options.dryRun ?? false;

  const results: SmartSyncResults = {
    dryRun,
    globalAssumptions: { key: "singleton", created: false, fields: [] },
    properties: [],
    feeCategories: { created: 0, updated: 0, skipped: 0 },
  };

  // ── Global Assumptions ──────────────────────────────────────────────
  const existingGA = await storage.getGlobalAssumptions();
  if (!existingGA) {
    if (!dryRun) {
      await storage.upsertGlobalAssumptions(manifest.entities.globalAssumptions.fields as any);
      await writeShadowDefaults("globalAssumptions", "singleton", manifest.entities.globalAssumptions.fields);
    }
    results.globalAssumptions.created = true;
  } else {
    const { updates, fieldResults } = mergeFields(
      manifest.entities.globalAssumptions.fields,
      existingGA as unknown as Record<string, unknown>,
      shadow, "globalAssumptions", "singleton",
    );
    results.globalAssumptions.fields = fieldResults.filter(f => f.action !== "unchanged");
    if (!dryRun && Object.keys(updates).length > 0) {
      await storage.upsertGlobalAssumptions({ ...existingGA, ...updates } as any);
    }
    if (!dryRun) {
      await writeShadowDefaults("globalAssumptions", "singleton", manifest.entities.globalAssumptions.fields);
    }
  }

  // ── Properties ──────────────────────────────────────────────────────
  const existingProperties = await storage.getAllProperties();
  const propByName = new Map(existingProperties.map(p => [p.name, p]));

  for (const propManifest of manifest.entities.properties) {
    const existing = propByName.get(propManifest.key);
    if (!existing) {
      if (!dryRun) {
        await storage.createProperty({ ...propManifest.fields, userId: null } as any);
        await writeShadowDefaults("property", propManifest.key, propManifest.fields);
      }
      results.properties.push({ key: propManifest.key, created: true, fields: [] });
    } else {
      const { updates, fieldResults } = mergeFields(
        propManifest.fields,
        existing as unknown as Record<string, unknown>,
        shadow, "property", propManifest.key,
      );
      results.properties.push({
        key: propManifest.key,
        created: false,
        fields: fieldResults.filter(f => f.action !== "unchanged"),
      });
      if (!dryRun && Object.keys(updates).length > 0) {
        await storage.updateProperty(existing.id, updates as any);
      }
      if (!dryRun) {
        await writeShadowDefaults("property", propManifest.key, propManifest.fields);
      }
    }
  }

  // ── Fee Categories (per property) ───────────────────────────────────
  for (const fcManifest of manifest.entities.feeCategories) {
    // Fee categories are global templates — apply to all seed properties
    for (const propManifest of manifest.entities.properties) {
      const prop = propByName.get(propManifest.key);
      if (!prop) continue;
      const existingFCs = await storage.getFeeCategoriesByProperty(prop.id);
      const existingFC = existingFCs.find((fc: any) => fc.name === fcManifest.key);
      if (!existingFC) {
        if (!dryRun) {
          await storage.createFeeCategory({
            propertyId: prop.id,
            name: fcManifest.key,
            rate: (fcManifest.fields.rate as number) ?? 0,
            sortOrder: (fcManifest.fields.sortOrder as number) ?? 0,
            isActive: true,
          });
        }
        results.feeCategories.created++;
      } else {
        results.feeCategories.skipped++;
      }
    }
  }

  return results;
}

