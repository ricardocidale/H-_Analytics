/**
 * analyst-watchdog.ts — The Analyst's always-on validation engine.
 *
 * The Analyst is not a button you press. It watches everything:
 *
 * 1. SEED TIME: validates every assumption on every new property
 * 2. DATA ENTRY: validates every field change in real time
 * 3. IMPORT: validates document extraction results before applying
 * 4. STALENESS: flags properties whose data is older than 30 days
 * 5. CROSS-PROPERTY: catches inconsistencies across the portfolio
 *
 * The Analyst uses two tiers:
 *   - Tier 0: Deterministic DB lookups (country_defaults, benchmarks)
 *             Zero LLM cost. ~50ms. Runs on every write.
 *   - Tier 1: LLM-enhanced research (web search, comps, synthesis)
 *             Runs on first visit, on demand, or when Tier 0 flags issues.
 *
 * This module handles Tier 0 — the always-on watchdog.
 * For Tier 1, see research-prompt-builders.ts and the guidance routes.
 */

import { storage } from "../storage";
import { COUNTRY_DEFAULTS, type CountryDefaults } from "@shared/countryDefaults";
import { validateAllAssumptions, validateAssumptionRange, type AssumptionValidation } from "./benchmark-lookups";
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
      // For year-based fields, use absolute difference; for rates, use relative deviation
      const isYearField = check.propertyField === "depreciationYears";
      const deviation = isYearField
        ? Math.abs(propertyValue - expectedValue) / expectedValue  // 20 vs 39 = 49% — but threshold is generous
        : Math.abs(propertyValue - expectedValue) / Math.max(Math.abs(expectedValue), 1e-6);
      const exceeds = isYearField
        ? Math.abs(propertyValue - expectedValue) > 5  // Flag if off by more than 5 years
        : deviation > check.threshold;

      if (exceeds) {
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
    if (typeof val === "number" && Number.isFinite(val)) {
      assumptionValues[field] = val;
    }
  }

  const market = property.city || property.stateProvince || countryName;
  const tier = property.qualityTier ?? undefined;

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
    "analyst-watchdog",
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
        "analyst-watchdog",
      );
    }
  }

  const total = results.length;
  const validated = results.filter(r => r.status === "validated").length;
  const flagged = results.filter(r => r.status === "flagged").length;
  const totalFlags = results.reduce((s, r) => s + r.flagged, 0);

  logger.info(
    `Analyst validation complete: ${total} properties (${validated} validated, ${flagged} flagged, ${totalFlags} total flags)`,
    "analyst-watchdog",
  );

  return results;
}

// ═══════════════════════════════════════════════════════════════════
// REAL-TIME WATCHDOG — runs on every property update
// ═══════════════════════════════════════════════════════════════════

export interface FieldAlert {
  field: string;
  value: number;
  expected: string;
  verdict: "above" | "below";
  severity: "warning" | "critical";
  message: string;
}

/**
 * Validate specific fields that just changed on a property.
 * Called from the PATCH /api/properties/:id route — fire and forget.
 * Returns alerts for any field that falls outside known ranges.
 *
 * This is The Analyst watching data entry in real time.
 */
export async function computeFieldAlerts(
  propertyId: number,
  fields: Record<string, unknown>,
): Promise<FieldAlert[]> {
  const alerts: FieldAlert[] = [];
  const property = await storage.getProperty(propertyId);
  if (!property) return alerts;

  const countryName = property.country || "United States";
  const countryDefaults = COUNTRY_DEFAULTS[countryName];

  for (const [field, rawValue] of Object.entries(fields)) {
    if (typeof rawValue !== "number" || !Number.isFinite(rawValue)) continue;
    const value = rawValue;

    if (countryDefaults) {
      const hardFloor = HARD_FLOOR_FIELDS.find(h => h.propertyField === field);
      if (hardFloor) {
        const expected = countryDefaults[hardFloor.field] as number;
        if (expected != null) {
          const deviation = Math.abs(value - expected) / Math.max(Math.abs(expected), 1e-6);
          if (deviation > hardFloor.threshold) {
            const severity = deviation > hardFloor.threshold * 2 ? "critical" : "warning";
            alerts.push({
              field,
              value,
              expected: `${hardFloor.label}: ${formatValue(field, expected)} (${countryName})`,
              verdict: value < expected ? "below" : "above",
              severity,
              message: `The Analyst flags ${hardFloor.label}: ${formatValue(field, value)} deviates ${(deviation * 100).toFixed(0)}% from ${countryName} default of ${formatValue(field, expected)}.`,
            });
          }
        }
      }
    }

    const market = property.city || property.stateProvince || countryName;
    const tier = property.qualityTier ?? undefined;
    const validation = await validateAssumptionRange(field, value, market, tier, countryName);

    if (validation.verdict === "above" || validation.verdict === "below") {
      if (!alerts.some(a => a.field === field)) {
        const deviationPct = Math.abs(validation.deviationPercent ?? 0);
        alerts.push({
          field,
          value,
          expected: validation.benchmarkRange
            ? `${formatValue(field, validation.benchmarkRange.low)}–${formatValue(field, validation.benchmarkRange.high)}`
            : "unknown",
          verdict: validation.verdict,
          severity: deviationPct > 50 ? "critical" : "warning",
          message: validation.explanation,
        });
      }
    }
  }

  return alerts;
}

export async function validateFieldChanges(
  propertyId: number,
  changedFields: Record<string, unknown>,
): Promise<FieldAlert[]> {
  try {
    const alerts = await computeFieldAlerts(propertyId, changedFields);

    const flagCount = alerts.filter(a => a.severity === "critical").length + alerts.filter(a => a.severity === "warning").length;
    if (flagCount > 0) {
      await storage.updateProperty(propertyId, {
        validationStatus: "flagged",
        flaggedFieldCount: flagCount,
      });
    } else {
      await storage.updateProperty(propertyId, {
        validationStatus: "validated",
        flaggedFieldCount: 0,
        lastValidatedAt: new Date(),
      });
    }

    return alerts;
  } catch (err: unknown) {
    logger.warn(`Analyst watchdog error for property ${propertyId}: ${err instanceof Error ? err.message : err}`, "analyst-watchdog");
    return [];
  }
}

/**
 * Check all properties for staleness. Run from ambient scheduler.
 * Properties with lastValidatedAt > 30 days ago get marked "stale".
 */
export async function checkStaleness(): Promise<number> {
  try {
    const properties = await storage.getAllProperties();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    let staleCount = 0;

    for (const prop of properties) {
      if (prop.validationStatus === "validated" && prop.lastValidatedAt) {
        const validatedAt = new Date(prop.lastValidatedAt);
        if (validatedAt < thirtyDaysAgo) {
          await storage.updateProperty(prop.id, { validationStatus: "stale" });
          staleCount++;
        }
      }
    }

    if (staleCount > 0) {
      logger.info(`Analyst staleness check: ${staleCount} properties marked stale`, "analyst-watchdog");
    }

    return staleCount;
  } catch (err: unknown) {
    logger.warn(`Analyst staleness check failed: ${err instanceof Error ? err.message : err}`, "analyst-watchdog");
    return 0;
  }
}

/**
 * Portfolio consistency check — catches cross-property anomalies.
 * Run from ambient scheduler after staleness check.
 */
export async function checkPortfolioConsistency(): Promise<string[]> {
  const warnings: string[] = [];

  try {
    const properties = await storage.getAllProperties();
    if (properties.length < 2) return warnings;

    // Check: same country, wildly different tax rates
    const byCountry = new Map<string, Array<{ name: string; taxRate: number }>>();
    for (const p of properties) {
      const country = p.country || "Unknown";
      const taxRate = p.taxRate;
      if (taxRate != null) {
        if (!byCountry.has(country)) byCountry.set(country, []);
        byCountry.get(country)!.push({ name: p.name || `#${p.id}`, taxRate });
      }
    }

    for (const [country, props] of Array.from(byCountry.entries())) {
      if (props.length < 2) continue;
      const rates = props.map((p: { taxRate: number }) => p.taxRate);
      const min = Math.min(...rates);
      const max = Math.max(...rates);
      if (max - min > 0.10) { // >10pp spread in same country
        warnings.push(
          `Tax rate inconsistency in ${country}: ${props.map((p: { name: string; taxRate: number }) => `${p.name} (${(p.taxRate * 100).toFixed(0)}%)`).join(", ")}`
        );
      }
    }

    // Check: exit cap rate below 6% or above 15% (unrealistic)
    for (const p of properties) {
      const cap = p.exitCapRate;
      if (cap != null && (cap < 0.06 || cap > 0.15)) {
        warnings.push(
          `${p.name || `#${p.id}`}: exit cap rate ${(cap * 100).toFixed(1)}% is outside reasonable range (6%–15%)`
        );
      }
    }

    // Check: ADR growth rate > inflation + 2% (aggressive)
    for (const p of properties) {
      const growth = p.adrGrowthRate;
      if (growth != null && growth > 0.05) {
        warnings.push(
          `${p.name || `#${p.id}`}: ADR growth ${(growth * 100).toFixed(1)}%/yr exceeds 5% — The Analyst recommends justification`
        );
      }
    }

    if (warnings.length > 0) {
      logger.info(`Analyst portfolio check: ${warnings.length} warnings`, "analyst-watchdog");
    }

  } catch (err: unknown) {
    logger.warn(`Analyst portfolio check failed: ${err instanceof Error ? err.message : err}`, "analyst-watchdog");
  }

  return warnings;
}

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

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
