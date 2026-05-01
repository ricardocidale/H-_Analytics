/**
 * Due-diligence insight generator — surfaces open DD findings on each
 * property as risk insights so they appear in the property risk overlay
 * alongside leverage / assumption / macro insights.
 *
 * The DD summary is the single source of truth (see
 * `server/storage/property-dd.ts`). We only emit an insight when the
 * checklist has been seeded for the property AND it has either a
 * Caution / Stop indicator or open findings text. A DD that is fully
 * "go" with no findings stays out of the overlay to avoid noise.
 */

import type { Property } from "@workspace/db";
import type { RiskInsight } from "@shared/risk-types";
import type { DdSummary } from "@shared/dd-template";
import { propertyEntity } from "./helpers";

/**
 * Build a single RiskInsight for a property's DD summary, or null if the
 * checklist has nothing risk-worthy to report.
 */
function buildInsightForProperty(p: Property, summary: DdSummary): RiskInsight | null {
  const hasOpenFindings = summary.openFindings.length > 0;
  const hasBlockers = summary.blockedItems > 0;
  const hasStopGate = summary.blockedStopGateItems > 0;

  if (summary.totalItems === 0) return null;
  if (!hasOpenFindings && !hasBlockers) return null;

  const severity: RiskInsight["severity"] = hasStopGate
    ? "critical"
    : hasBlockers
      ? "warning"
      : "caution";

  const findingsList = summary.openFindings
    .slice(0, 5)
    .map((f) => `• [${f.workstream}] ${f.label}: ${f.findings}`)
    .join("\n");

  const overflow = summary.openFindings.length > 5
    ? `\n…and ${summary.openFindings.length - 5} more open finding(s).`
    : "";

  const narrative =
    `Hospitality due-diligence on ${p.name} is ${summary.goIndicator.toUpperCase()}: ${summary.goReason}.` +
    (findingsList ? `\n\nOpen findings recorded by the deal team:\n${findingsList}${overflow}` : "");

  const dataPoints: RiskInsight["dataPoints"] = [
    { label: "DD progress", value: `${summary.completedItems}/${summary.totalItems} complete` },
    { label: "Blocked items", value: String(summary.blockedItems) },
  ];
  if (hasStopGate) {
    dataPoints.push({ label: "Stop-gate blockers", value: String(summary.blockedStopGateItems) });
  }
  if (summary.spendCommitted > 0 || summary.budgetTotal > 0) {
    dataPoints.push({
      label: "DD spend",
      value: `$${summary.spendCommitted.toLocaleString()} of $${summary.budgetTotal.toLocaleString()} budgeted`,
    });
  }

  const actionItems: string[] = [];
  if (hasStopGate) {
    actionItems.push("Resolve every stop-gate blocker before approving the acquisition.");
  }
  if (hasBlockers && !hasStopGate) {
    actionItems.push("Triage the blocked DD items with the workstream owners.");
  }
  if (hasOpenFindings) {
    actionItems.push("Reflect each open finding in the underwriting (price reduction, escrow, or seller credit).");
  }
  actionItems.push("Open the Due Diligence tab on the property to update status, owner, and findings.");

  return {
    category: "operational",
    severity,
    title: `Due-diligence findings on ${p.name}`,
    narrative,
    dataPoints,
    actionItems,
    affectedEntities: [propertyEntity(p)],
  };
}

/**
 * Generate DD-derived risk insights for every property that has a DD
 * checklist. The summary loader is injected so the orchestrator can pass
 * `storage.getPropertyDdSummary` without this module taking a runtime
 * dependency on the storage singleton.
 */
export async function generateDueDiligenceInsights(
  properties: Property[],
  loadSummary: (propertyId: number) => Promise<DdSummary>,
): Promise<RiskInsight[]> {
  const insights: RiskInsight[] = [];
  await Promise.all(
    properties.map(async (p) => {
      try {
        const summary = await loadSummary(p.id);
        const insight = buildInsightForProperty(p, summary);
        if (insight) insights.push(insight);
      } catch {
        // DD checklist not yet seeded or storage error — skip silently;
        // a missing checklist is a normal early-stage state, not a risk.
      }
    }),
  );
  return insights;
}
