/**
 * buildPropertyContext.ts — Builds a textual summary of portfolio properties
 * for injection into AI chat system prompts.
 *
 * All financial metrics are computed via deterministic tools (calc/dispatch.ts).
 * No inline arithmetic.
 */
import { executeComputationTool } from "../../calc/dispatch.js";
import type { Property } from "../../shared/schema/index.js";
import { logger } from "../logger";

export function buildPropertyContext(properties: Property[]): string {
  return properties.map((p) => {
    let metrics: Record<string, number> = {};
    try {
      const metricsJson = executeComputationTool("compute_property_metrics", {
        room_count: p.roomCount,
        adr: p.startAdr,
        occupancy: p.maxOccupancy,
        cost_rate_rooms: p.costRateRooms,
        cost_rate_fb: p.costRateFB,
        cost_rate_admin: p.costRateAdmin,
        cost_rate_marketing: p.costRateMarketing,
        cost_rate_property_ops: p.costRatePropertyOps,
        cost_rate_utilities: p.costRateUtilities,
        cost_rate_ffe: p.costRateFFE,
        cost_rate_other: p.costRateOther,
        rev_share_events: p.revShareEvents,
        rev_share_fb: p.revShareFB,
        rev_share_other: p.revShareOther,
        catering_boost_pct: p.cateringBoostPercent,
      });
      if (metricsJson) {
        metrics = JSON.parse(metricsJson);
      }
    } catch (e: unknown) {
      logger.error(`Failed to compute metrics for ${p.name}: ${e instanceof Error ? e.message : e}`, "buildPropertyContext");
    }
    const totalInvestment = (p.purchasePrice ?? 0) + (p.buildingImprovements ?? 0) + (p.preOpeningCosts ?? 0) + (p.operatingReserve ?? 0);
    return [
      `Property: ${p.name}`,
      `  Location: ${p.location}`,
      `  Rooms: ${p.roomCount}`,
      `  ADR: $${p.startAdr}`,
      `  Max Occupancy: ${Math.round((p.maxOccupancy ?? 0) * 100)}%`,
      `  Purchase Price: $${(p.purchasePrice ?? 0).toLocaleString()}`,
      `  Total Investment: $${totalInvestment.toLocaleString()}`,
      `  Type: ${p.type}`,
      `  Status: ${p.status}`,
      `  RevPAR: $${metrics.revpar ?? "N/A"}`,
      `  Annual Revenue: $${metrics.annual_total_revenue?.toLocaleString() ?? "N/A"}`,
      `  Annual NOI: $${metrics.annual_noi?.toLocaleString() ?? "N/A"}`,
      `  NOI Margin: ${metrics.noi_margin_pct ?? "N/A"}%`,
      `  GOP Margin: ${metrics.gop_margin_pct ?? "N/A"}%`,
    ].join("\n");
  }).join("\n\n");
}
