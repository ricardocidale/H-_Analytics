import { probeAllVendors } from "./llm-health-probe";
import {
  computeRecommendations,
  detectAdminOverrideIssues,
  applyRecommendations,
  getLastRegistryState,
  setLastRegistryState,
  type LlmRegistryState,
  type AdminOverrideIssue,
} from "./llm-recommender";
import { storage } from "../storage";
import { log } from "../logger";
import { isAdminRole } from "@shared/constants";
import { processNotificationEvent } from "../notifications/engine";
import { createEvent } from "../notifications/events";
import type { ResearchConfig } from "@shared/schema";

let _lastNotifiedFingerprint: string | null = null;

function issueFingerprint(issues: AdminOverrideIssue[]): string {
  return issues
    .map(i => `${i.domain}:${i.currentModel}:${i.issue}`)
    .sort()
    .join("|");
}

export async function refreshLlmRegistry(): Promise<LlmRegistryState> {
  log("Starting LLM registry refresh...", "llm-registry");

  const probeResult = await probeAllVendors();
  const recommendations = computeRecommendations(probeResult);

  const ga = await storage.getGlobalAssumptions();
  const config: ResearchConfig = (ga?.researchConfig as ResearchConfig) ?? {};
  const adminIssues = detectAdminOverrideIssues(config, probeResult, recommendations);

  const result = await applyRecommendations(recommendations, probeResult);

  if (adminIssues.length > 0) {
    const fp = issueFingerprint(adminIssues);
    if (fp !== _lastNotifiedFingerprint) {
      await notifyAdminOfIssues(adminIssues);
      _lastNotifiedFingerprint = fp;
    } else {
      log(`Suppressed duplicate LLM issue notification (same ${adminIssues.length} issue(s))`, "llm-registry");
    }
  } else {
    _lastNotifiedFingerprint = null;
  }

  const state: LlmRegistryState = {
    models: probeResult.models,
    recommendations,
    adminIssues,
    vendorStatuses: probeResult.vendorStatuses,
    probedAt: probeResult.probedAt,
    durationMs: probeResult.durationMs,
  };

  setLastRegistryState(state);

  log(
    `Registry refresh complete: ${probeResult.models.length} models, ${recommendations.length} recommendations, ${adminIssues.length} admin issues, ${result.applied.length} auto-applied`,
    "llm-registry"
  );

  return state;
}

async function notifyAdminOfIssues(issues: AdminOverrideIssue[]): Promise<void> {
  try {
    const users = await storage.getAllUsers();
    const admins = users.filter(u => isAdminRole(u.role));
    if (admins.length === 0) return;

    const issueLines = issues.map(issue => {
      const recText = issue.recommendation
        ? ` The Analyst recommends switching to ${issue.recommendation.label} (${issue.recommendation.vendor}).`
        : "";
      return `• ${issue.message}${recText}`;
    }).join("\n");

    const message = `The Analyst detected ${issues.length} issue${issues.length > 1 ? "s" : ""} with your AI model configuration during the latest health check:\n\n${issueLines}\n\nReview your settings in Admin → Intelligence → LLMs to update your model selections.`;

    for (const admin of admins) {
      if (!admin.email) continue;
      const event = createEvent("LLM_MODEL_ISSUE", {
        message,
        metadata: {
          recipientEmail: admin.email,
          issueCount: issues.length,
          issues: issues.map(i => ({
            domain: i.domain,
            currentModel: i.currentModel,
            issue: i.issue,
            recommendedModel: i.recommendation?.modelId,
          })),
        },
      });

      await processNotificationEvent(event);
    }

    log(`Notified ${admins.filter(a => a.email).length} admin(s) of ${issues.length} LLM issue(s)`, "llm-registry");
  } catch (err: unknown) {
    log(`Failed to notify admins of LLM issues: ${err instanceof Error ? err.message : String(err)}`, "llm-registry", "warn");
  }
}

export { getLastRegistryState };
