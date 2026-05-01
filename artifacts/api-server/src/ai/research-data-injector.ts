/**
 * Research Data Injector — formats verified API data for LLM prompt injection.
 *
 * Takes the DataRouteResult map from the smart data router and produces
 * a structured text block that separates:
 *   1. VERIFIED data (API-sourced, with provenance)
 *   2. UNVERIFIED fields (no API data available — LLM must research these)
 *
 * This transforms the LLM's role from "guess the numbers" to
 * "interpret and synthesize verified data points into ranges."
 */

import type { DataRouteResult, ConfidenceLevel } from "./data-routing";
import { DATA_ROUTING_TABLE } from "./data-routing";

// ---------------------------------------------------------------------------
// Human-readable field labels
// ---------------------------------------------------------------------------

const FIELD_LABELS: Record<string, string> = {
  startAdr: "Average Daily Rate (ADR)",
  startOccupancy: "Occupancy Rate",
  adrGrowthRate: "ADR Growth Rate (annual)",
  revShareFB: "F&B Revenue Share",
  revShareEvents: "Events Revenue Share",
  costRateRooms: "Rooms Department Cost Ratio",
  costRateFB: "F&B Department Cost Ratio",
  costRateAdmin: "Administrative & General Cost Ratio",
  costRateMarketing: "Marketing Cost Ratio",
  costRateUtilities: "Utility Cost Ratio",
  acquisitionInterestRate: "Acquisition Interest Rate",
  exitCapRate: "Exit Cap Rate",
  taxRate: "Income Tax Rate",
  depreciationYears: "Depreciation Period (years)",
  baseFeePercent: "Base Management Fee (%)",
  incentiveFeePercent: "Incentive Management Fee (%)",
  propertyTaxRate: "Property Tax Rate",
  staffCompensation: "Staff Compensation",
  walkScore: "Walk Score",
  distanceToAirport: "Distance to Airport",
  hotelTaxRate: "Hotel/Tourism Tax Rate",
  avgTicketFB: "Average F&B Ticket",
  nightlyPropertyRate: "Nightly Property Rate (luxury rental)",
  propertyValue: "Property Value",
};

function getFieldLabel(field: string): string {
  return FIELD_LABELS[field] || field;
}

// ---------------------------------------------------------------------------
// Confidence badge for prompt display
// ---------------------------------------------------------------------------

function confidenceBadge(confidence: ConfidenceLevel): string {
  switch (confidence) {
    case "high": return "[HIGH CONF]";
    case "medium": return "[MED CONF]";
    case "low": return "[LOW CONF]";
  }
}

// ---------------------------------------------------------------------------
// Format a single verified data point
// ---------------------------------------------------------------------------

function formatVerifiedField(result: DataRouteResult): string {
  const label = getFieldLabel(result.field);
  const badge = confidenceBadge(result.confidence);

  if (result.range) {
    const { low, mid, high } = result.range;
    const isPercent = result.field.includes("Rate") || result.field.includes("Share") ||
                      result.field.includes("Percent") || result.field.includes("Occupancy") ||
                      result.field.includes("taxRate");
    const isCurrency = result.field.includes("Adr") || result.field.includes("adr") ||
                       result.field.includes("Rate") && result.field.includes("nightly") ||
                       result.field.includes("Ticket") || result.field.includes("Value") ||
                       result.field.includes("Compensation");

    if (isPercent) {
      // Check if values are already in percentage form (> 1) or decimal form (< 1)
      const fmt = (v: number) => v > 1 ? `${v.toFixed(1)}%` : `${(v * 100).toFixed(1)}%`;
      return `- ${label}: ${fmt(low)} - ${fmt(high)} (mid: ${fmt(mid)}) ${badge}\n  Source: ${result.provenance}`;
    }
    if (isCurrency) {
      return `- ${label}: $${low.toLocaleString()} - $${high.toLocaleString()} (mid: $${mid.toLocaleString()}) ${badge}\n  Source: ${result.provenance}`;
    }
    return `- ${label}: ${low} - ${high} (mid: ${mid}) ${badge}\n  Source: ${result.provenance}`;
  }

  // Single value (no range)
  const v = result.value;
  if (typeof v === "number") {
    const isPercent = result.field.includes("Rate") || result.field.includes("Share") ||
                      result.field.includes("Percent") || result.field.includes("Occupancy") ||
                      result.field.includes("taxRate");
    if (isPercent) {
      const fmt = v > 1 ? `${v.toFixed(2)}%` : `${(v * 100).toFixed(1)}%`;
      return `- ${label}: ${fmt} ${badge}\n  Source: ${result.provenance}`;
    }
    if (result.field === "depreciationYears" || result.field === "walkScore") {
      return `- ${label}: ${v} ${badge}\n  Source: ${result.provenance}`;
    }
    return `- ${label}: $${v.toLocaleString()} ${badge}\n  Source: ${result.provenance}`;
  }

  return `- ${label}: ${v} ${badge}\n  Source: ${result.provenance}`;
}

// ---------------------------------------------------------------------------
// Main: Build verified/unverified data blocks
// ---------------------------------------------------------------------------

export interface VerifiedDataBlock {
  /** Formatted text block of verified API data for prompt injection */
  verified: string;
  /** List of field names that have no API data and need LLM research */
  unverifiedFields: string[];
  /** Formatted text listing of unverified fields for prompt injection */
  unverifiedBlock: string;
  /** Count of verified fields */
  verifiedCount: number;
  /** Count of total fields requested */
  totalFields: number;
  /** Summary statistics */
  summary: {
    highConfidence: number;
    mediumConfidence: number;
    lowConfidence: number;
    avgRelaxationLevel: number;
  };
}

/**
 * Takes the DataRouteResult map and formats it for prompt injection.
 *
 * @param results - Map of field name -> DataRouteResult from fetchMultipleFields
 * @param requestedFields - Optional: all fields that were requested (to identify gaps).
 *                          If not provided, uses all routable fields.
 */
export function buildVerifiedDataBlock(
  results: Map<string, DataRouteResult>,
  requestedFields?: string[],
): VerifiedDataBlock {
  const allFields = requestedFields ?? Object.keys(DATA_ROUTING_TABLE);

  // Separate verified (has value) from unverified (no value or missing)
  const verified: DataRouteResult[] = [];
  const unverifiedFields: string[] = [];

  for (const field of allFields) {
    const result = results.get(field);
    if (result && result.value != null) {
      verified.push(result);
    } else {
      unverifiedFields.push(field);
    }
  }

  // Sort verified by confidence (high first), then alphabetically
  const confidenceOrder: Record<ConfidenceLevel, number> = { high: 0, medium: 1, low: 2 };
  verified.sort((a, b) => {
    const co = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (co !== 0) return co;
    return a.field.localeCompare(b.field);
  });

  // Build verified text block
  let verifiedText = "";
  if (verified.length > 0) {
    verifiedText = `=== VERIFIED DATA FROM APIs (${verified.length} data points) ===\n`;
    verifiedText += `Use these as ground truth. Your ranges MUST include these data points.\n\n`;

    // Group by relaxation level for clarity
    const byLevel = new Map<number, DataRouteResult[]>();
    for (const v of verified) {
      const group = byLevel.get(v.relaxationLevel) ?? [];
      group.push(v);
      byLevel.set(v.relaxationLevel, group);
    }

    const levelLabels: Record<number, string> = {
      0: "Exact Match (highest confidence)",
      1: "Type Relaxed",
      2: "Geography Relaxed (metro area)",
      3: "Quality Tier Relaxed",
      4: "State/Region Level",
      5: "Country Level (widest ranges)",
    };

    for (const [level, items] of Array.from(byLevel.entries()).sort((a, b) => a[0] - b[0])) {
      if (items.length > 0) {
        verifiedText += `\n--- L${level}: ${levelLabels[level] ?? `Level ${level}`} ---\n`;
        for (const item of items) {
          verifiedText += formatVerifiedField(item) + "\n";
        }
      }
    }

    verifiedText += `\n=== END VERIFIED DATA ===\n`;
  }

  // Build unverified text block
  let unverifiedBlock = "";
  if (unverifiedFields.length > 0) {
    unverifiedBlock = `\n=== UNVERIFIED FIELDS (${unverifiedFields.length} — LLM research needed) ===\n`;
    unverifiedBlock += `No API data available for these fields. Provide your best estimates\n`;
    unverifiedBlock += `based on industry knowledge, with source citations:\n\n`;
    for (const field of unverifiedFields) {
      const routes = DATA_ROUTING_TABLE[field];
      const routeDesc = routes
        ? ` (attempted: ${routes.map(r => r.service).join(", ")})`
        : "";
      unverifiedBlock += `- ${getFieldLabel(field)}${routeDesc}\n`;
    }
    unverifiedBlock += `\n=== END UNVERIFIED FIELDS ===\n`;
  }

  // Summary statistics
  const highConf = verified.filter(v => v.confidence === "high").length;
  const medConf = verified.filter(v => v.confidence === "medium").length;
  const lowConf = verified.filter(v => v.confidence === "low").length;
  const avgRelax = verified.length > 0
    ? verified.reduce((s, v) => s + v.relaxationLevel, 0) / verified.length
    : 0;

  return {
    verified: verifiedText,
    unverifiedFields,
    unverifiedBlock,
    verifiedCount: verified.length,
    totalFields: allFields.length,
    summary: {
      highConfidence: highConf,
      mediumConfidence: medConf,
      lowConfidence: lowConf,
      avgRelaxationLevel: Math.round(avgRelax * 10) / 10,
    },
  };
}

/**
 * Convenience: Build the full injection block (verified + unverified) as a single string.
 * This is what gets inserted into the LLM prompt.
 */
export function buildPromptInjectionBlock(
  results: Map<string, DataRouteResult>,
  requestedFields?: string[],
): string {
  const block = buildVerifiedDataBlock(results, requestedFields);

  if (block.verifiedCount === 0 && block.unverifiedFields.length === 0) {
    return ""; // Nothing to inject
  }

  let output = "\n\n";

  if (block.verifiedCount > 0) {
    output += block.verified;
    output += `\nIMPORTANT: For verified fields above, your recommended ranges MUST encompass the API data point.\n`;
    output += `If your analysis suggests a different range, explain WHY the API data may not apply.\n`;
  }

  if (block.unverifiedFields.length > 0) {
    output += block.unverifiedBlock;
  }

  // Add synthesis instructions
  output += `\n--- DATA SYNTHESIS INSTRUCTIONS ---\n`;
  output += `1. For VERIFIED fields: use the API data as your anchor point. Provide a range that includes it.\n`;
  output += `2. For UNVERIFIED fields: research from industry reports and provide ranges with source citations.\n`;
  output += `3. Note the relaxation level (L0=exact, L5=country). Higher levels = wider expected ranges.\n`;
  output += `4. A confidence of "low" means the data came from a highly relaxed search — weight accordingly.\n`;
  output += `--- END INSTRUCTIONS ---\n`;

  return output;
}
