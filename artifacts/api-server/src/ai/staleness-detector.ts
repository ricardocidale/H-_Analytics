/**
 * Staleness Detector — Analyzes research freshness across all assumption guidance
 * records for a user's properties. Identifies stale, missing, and critically stale
 * fields that directly impact financial projections.
 *
 * Used by GET /api/research/staleness to surface refresh priorities in the Research Hub.
 */

import { storage } from "../storage";
import { logger } from "../logger";

// Fields that directly drive financial projections — staleness here is critical
const CRITICAL_FIELDS = new Set([
  "adr",
  "average_daily_rate",
  "occupancy",
  "occupancy_rate",
  "cap_rate",
  "exit_cap_rate",
  "cost_rate_rooms",
  "cost_rate_fb",
  "cost_rate_other",
  "revenue_per_room",
  "revpar",
  "nightly_property_rate",
]);

const DEFAULT_THRESHOLD_DAYS = 30;

export interface StalenessReport {
  totalFields: number;
  freshCount: number;
  staleCount: number;
  missingCount: number;
  criticallyStale: string[];
  refreshPriority: Array<{
    fieldKey: string;
    entityType: "property" | "company";
    entityId: number;
    entityName: string;
    daysSinceUpdate: number | null;
    reason: "never_researched" | "stale" | "critically_stale";
  }>;
}

export async function detectStaleness(
  userId: number,
  thresholdDays?: number,
): Promise<StalenessReport> {
  const threshold = thresholdDays ?? DEFAULT_THRESHOLD_DAYS;
  const thresholdMs = threshold * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const properties = await storage.getAllProperties(userId);

  let totalFields = 0;
  let freshCount = 0;
  let staleCount = 0;
  let missingCount = 0;
  const criticallyStaleSet = new Set<string>();
  const refreshPriority: StalenessReport["refreshPriority"] = [];

  for (const property of properties) {
    try {
      // scenarioId = null for base (non-scenario) guidance
      const guidance = await storage.getAssumptionGuidance(null, "property", property.id);

      if (guidance.length === 0) {
        // Entire property has never been researched
        missingCount++;
        totalFields++;
        refreshPriority.push({
          fieldKey: "*",
          entityType: "property",
          entityId: property.id,
          entityName: property.name,
          daysSinceUpdate: null,
          reason: "never_researched",
        });
        continue;
      }

      for (const rec of guidance) {
        totalFields++;
        const updatedAt = rec.updatedAt ? new Date(rec.updatedAt).getTime() : null;

        if (updatedAt === null) {
          missingCount++;
          refreshPriority.push({
            fieldKey: rec.assumptionKey,
            entityType: "property",
            entityId: property.id,
            entityName: property.name,
            daysSinceUpdate: null,
            reason: "never_researched",
          });
          continue;
        }

        const ageMs = now - updatedAt;
        const daysSinceUpdate = Math.round(ageMs / (24 * 60 * 60 * 1000));

        if (ageMs < thresholdMs) {
          freshCount++;
        } else {
          const isCritical = CRITICAL_FIELDS.has(rec.assumptionKey);
          if (isCritical) {
            criticallyStaleSet.add(rec.assumptionKey);
            refreshPriority.push({
              fieldKey: rec.assumptionKey,
              entityType: "property",
              entityId: property.id,
              entityName: property.name,
              daysSinceUpdate,
              reason: "critically_stale",
            });
          } else {
            refreshPriority.push({
              fieldKey: rec.assumptionKey,
              entityType: "property",
              entityId: property.id,
              entityName: property.name,
              daysSinceUpdate,
              reason: "stale",
            });
          }
          staleCount++;
        }
      }
    } catch (err: unknown) {
      logger.warn(
        `Staleness check failed for property ${property.id}: ${err instanceof Error ? err.message : err}`,
        "staleness",
      );
    }
  }

  // Sort: critically_stale first, then stale (oldest first), then never_researched
  const reasonOrder: Record<string, number> = {
    critically_stale: 0,
    stale: 1,
    never_researched: 2,
  };

  refreshPriority.sort((a, b) => {
    const orderDiff = reasonOrder[a.reason] - reasonOrder[b.reason];
    if (orderDiff !== 0) return orderDiff;
    // Within same reason group, sort by age descending (oldest first)
    const aDays = a.daysSinceUpdate ?? Infinity;
    const bDays = b.daysSinceUpdate ?? Infinity;
    return bDays - aDays;
  });

  return {
    totalFields,
    freshCount,
    staleCount,
    missingCount,
    criticallyStale: Array.from(criticallyStaleSet),
    refreshPriority,
  };
}
