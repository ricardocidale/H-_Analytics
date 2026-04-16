/**
 * seed-validator.ts — The Analyst's deterministic validation pass.
 *
 * Runs after properties are seeded or imported. Checks every financial
 * assumption against country_defaults and hospitality_benchmarks using
 * pure DB lookups (zero LLM cost, ~50ms per property).
 *
 * This is the gate that catches errors like Jano Grande's 9% tax rate
 * for Colombia (should be 35%). The Analyst doesn't need AI to know
 * that — it's a lookup.
 *
 * Flow:
 *   1. Load property from DB
 *   2. Resolve country defaults
 *   3. Check hard-floor fields (tax, depreciation, inflation, CRP)
 *   4. Run validateAllAssumptions() against benchmarks
 *   5. Write assumption_guidance rows
 *   6. Update property validationStatus
 *   7. Log changes to assumption_change_log
 */

import { storage } from "../storage";
import { COUNTRY_DEFAULTS, type CountryDefaults } from "@shared/countryDefaults";
import { validateAllAssumptions, type AssumptionValidation } from "./benchmark-lookups";
import { logger } from "../logger";
import type { Property } from "@shared/schema";

// Fields where country_defaults is authoritative — deviation > threshold = auto-flag
const HARD_FLOOR_FIELDS: Array<{
  field: keyof CountryDefaults & string;
  propertyField: string;
  threshold: number; // max acceptable deviation as decimal (0.05 = ±5%)
  label: string;
}> = [
  { field: "taxRate", propertyField: "taxRate", threshold: 0.10, label: "Corporate Tax Rate" },
  { field: "depreciationYears", propertyField: "depreciationYears", threshold: 0.15, label: "Depreciation Period" },
  { field: "inflationRate", propertyField: "inflationRate", threshold: 0.25, label: "Inflation Rate" },
  { field: "costRateTaxes", propertyField: "costRateTaxes", threshold: 0.30, label: "Property Tax Rate" },
];

export interface ValidationResult {
  propertyId: number;
  propertyName: string;
  status: "validated" | "flagged";
  totalChecked: number;
  withinRange: number;
  flagged: number;
  noData: number;
  flags: Array<{
    field: string;
    value: number;
    expected: string;
    verdict: string;
    source: string;
  }>;
}

/**
 * Validate a single property's assumptions against known data.
 * Returns validation result and updates the property record.
 */
export async function validatePropertyAssumptions(propertyId: number): Promise<ValidationResult> {
  const property = await storage.getProperty(propertyId);
  if (!property) throw new Error(`Property ${propertyId} not found`);

  const flags: ValidationResult["flags"] = [];
  let totalChecked = 0;
  let withinRange = 0;
  let noData = 0;

  // ── Step 1: Hard-floor checks against country_defaults ──────────
  const countryName = property.country || "United States";
  const countryDefaults = COUNTRY_DEFAULTS[countryName];

  if (countryDefaults) {
    for (const check of HARD_FLOOR_FIELDS) {
      const propertyValue = (property as Record<string, unknown>)[check.propertyField];
      if (propertyValue == null || typeof propertyValue !== "number") continue;

      const expectedValue = countryDefaults[check.field] as number;
      if (expectedValue == null) continue;

      totalChecked++;
      const deviation = Math.abs(propertyValue - expectedValue) / Math.max(Math.abs(expectedValue), 1e-6);

      if (deviation > check.threshold) {
        flags.push({
          field: check.propertyField,
          value: propertyValue,
          expected: `${check.label}: ${formatValue(check.propertyField, expectedValue)} (${countryName})`,
          verdict: propertyValue < expectedValue ? "below" : "above",
          source: `country_defaults[${countryName}]`,
        });

        // Write assumption_guidance row
        await storage.upsertAssumptionGuidance({
          entityType: "property",
          entityId: propertyId,
          assumptionKey: check.propertyField,
          valueLow: expectedValue * (1 - check.threshold),
          valueMid: expectedValue,
          valueHigh: expectedValue * (1 + check.threshold),
          confidence: "high",
          sourceName: `${countryName} country defaults`,
          reasoning: `${check.label} for ${countryName} is ${formatValue(check.propertyField, expectedValue)}. Current value ${formatValue(check.propertyField, propertyValue)} deviates by ${(deviation * 100).toFixed(0)}%.`,
          dataQuality: {
            sourceCount: 1,
            sourceTypes: ["db_table"],
            dataAgeDays: 0,
            rangeSpreadPct: check.threshold * 200,
            sourcesConverge: true,
            qualityScore: 90,
            qualityNarrative: `Authoritative source: ${countryName} tax/regulatory defaults.`,
          },
        });

        // Log to change log
        await storage.logAssumptionChange({
          entityType: "property",
          entityId: propertyId,
          fieldName: check.propertyField,
          previousValue: String(propertyValue),
          newValue: null, // The Analyst flags but doesn't auto-change
          changeSource: "analyst",
          reason: `Flagged: ${check.label} ${formatValue(check.propertyField, propertyValue)} deviates from ${countryName} default ${formatValue(check.propertyField, expectedValue)}`,
        });
      } else {
        withinRange++;
      }
    }
  }

  // ── Step 2: Benchmark validation for all mapped fields ──────────
  const assumptionValues: Record<string, number> = {};
  const benchmarkFields = [
    "startAdr", "startOccupancy", "maxOccupancy", "adrGrowthRate",
    "costRateRooms", "costRateFB", "costRateAdmin", "costRateMarketing",
    "costRatePropertyOps", "costRateUtilities", "costRateIT", "costRateFFE",
    "costRateOther", "costRateInsurance", "exitCapRate",
  ];

  for (const field of benchmarkFields) {
    const val = (property as Record<string, unknown>)[field];
    if (typeof val === "number" && Number.isFinite(val) && val !== 0) {
      assumptionValues[field] = val;
    }
  }

  const market = property.city || property.stateProvince || countryName;
  const tier = (property as Record<string, unknown>).qualityTier as string | undefined;

  const benchmarkResults = await validateAllAssumptions(
    assumptionValues,
    market,
    tier,
    countryName,
  );

  for (const result of benchmarkResults) {
    totalChecked++;
    if (result.verdict === "within") {
      withinRange++;
    } else if (result.verdict === "no_data") {
      noData++;
    } else {
      // above or below
      flags.push({
        field: result.fieldName,
        value: result.userValue,
        expected: result.benchmarkRange
          ? `${formatValue(result.fieldName, result.benchmarkRange.low)}–${formatValue(result.fieldName, result.benchmarkRange.high)}`
          : "unknown",
        verdict: result.verdict,
        source: result.benchmarkRange?.source ?? "hospitality_benchmarks",
      });

      // Write assumption_guidance row
      if (result.benchmarkRange) {
        await storage.upsertAssumptionGuidance({
          entityType: "property",
          entityId: propertyId,
          assumptionKey: result.fieldName,
          valueLow: result.benchmarkRange.low,
          valueMid: result.benchmarkRange.mid,
          valueHigh: result.benchmarkRange.high,
          confidence: "moderate",
          sourceName: result.benchmarkRange.source ?? "hospitality benchmarks",
          sourceDate: result.benchmarkRange.sourceYear?.toString() ?? null,
          reasoning: result.explanation,
        });
      }
    }
  }

  // ── Step 3: Update property validation status ──────────
  const status = flags.length > 0 ? "flagged" : "validated";
  await storage.updateProperty(propertyId, {
    validationStatus: status,
    lastValidatedAt: new Date(),
    flaggedFieldCount: flags.length,
  });

  const resultSummary: ValidationResult = {
    propertyId,
    propertyName: property.name || `Property #${propertyId}`,
    status,
    totalChecked,
    withinRange,
    flagged: flags.length,
    noData,
    flags,
  };

  logger.info(
    `Analyst validation: ${resultSummary.propertyName} — ${status} (${withinRange} ok, ${flags.length} flagged, ${noData} no data)`,
    "seed-validator",
  );

  return resultSummary;
}

/**
 * Validate ALL properties in the database. Used after seed runs.
 */
export async function validateAllProperties(): Promise<ValidationResult[]> {
  const properties = await storage.getAllProperties();
  const results: ValidationResult[] = [];

  for (const prop of properties) {
    try {
      const result = await validatePropertyAssumptions(prop.id);
      results.push(result);
    } catch (err: unknown) {
      logger.error(
        `Analyst validation failed for property ${prop.id}: ${err instanceof Error ? err.message : err}`,
        "seed-validator",
      );
    }
  }

  const total = results.length;
  const validated = results.filter(r => r.status === "validated").length;
  const flagged = results.filter(r => r.status === "flagged").length;
  const totalFlags = results.reduce((s, r) => s + r.flagged, 0);

  logger.info(
    `Analyst validation complete: ${total} properties (${validated} validated, ${flagged} flagged, ${totalFlags} total flags)`,
    "seed-validator",
  );

  return results;
}

function formatValue(field: string, value: number): string {
  const pctFields = [
    "taxRate", "costRateTaxes", "costRateRooms", "costRateFB", "costRateAdmin",
    "costRateMarketing", "costRatePropertyOps", "costRateUtilities", "costRateIT",
    "costRateFFE", "costRateOther", "costRateInsurance", "exitCapRate",
    "startOccupancy", "maxOccupancy", "adrGrowthRate", "inflationRate",
    "countryRiskPremium",
  ];
  if (pctFields.includes(field)) return `${(value * 100).toFixed(1)}%`;
  if (field === "depreciationYears") return `${value} years`;
  if (field === "startAdr") return `$${value.toFixed(0)}`;
  return String(value);
}
