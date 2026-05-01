/**
 * Per-Specialist research-quality scorer (Task #500).
 *
 * Pure-ish function: given a specialistId, gather four measurable signals
 * from the live system and produce a score (0–100) plus a list of named
 * gaps. The result is persisted via `recordQualitySnapshot` so downstream
 * surfaces (Resources tabs, Specialist pages, gaps banner) can read a
 * single value without re-running the computation.
 *
 *   ┌─────────────────────────────────────────────┬────────┐
 *   │ Signal                                      │ Weight │
 *   ├─────────────────────────────────────────────┼────────┤
 *   │ Probe health of REQUIRED resources           │   35   │
 *   │ Required candidate-fields not missing        │   20   │
 *   │ Run freshness (most recent completed run)    │   15   │
 *   │ Has any successful run                       │   10   │
 *   │ Confidence (run reliability + self-reported)│   20   │
 *   └─────────────────────────────────────────────┴────────┘
 *
 * Each signal contributes a 0..1 multiplier × its weight; the sum is
 * rounded to an integer 0..100. Gaps are emitted whenever a sub-signal
 * fails (severity scaled to how badly it fails).
 *
 * "Confidence" combines two observable signals:
 *   • Run reliability — proportion of completed (vs failed/error) runs
 *     in the last 10 attempts. A specialist whose runs frequently fail
 *     produces lower-confidence research, by definition.
 *   • Self-reported confidence — when the most recent completed run's
 *     `metadata.confidence` is a number in 0..1 (or 0..100), we average
 *     it in; missing/non-numeric values fall back to the reliability
 *     score alone.
 *
 * Catalog-driven specialists (Gaspar excluded) only.
 */
import { storage } from "../storage";
import {
  deriveHealthStatus,
  type ProbeStatus,
  type ResourceKind,
  type QualityGap,
} from "@workspace/db";
import { getSpecialistById } from "@engine/analyst/registry/specialist-catalog";

export interface ResearchQualityResult {
  specialistId: string;
  score: number;
  gaps: QualityGap[];
  signals: {
    requiredResources: { total: number; healthy: number; failing: number; gray: number };
    missingFields: { hardOff: number; recommendedMissing: number; observedMissing: number };
    freshness: { lastCompletedAt: string | null; ageDays: number | null; cadenceDays: number | null };
    runHistory: { totalRuns: number; lastStatus: string | null };
    confidence: {
      reliability: number;
      selfReported: number | null;
      combined: number;
    };
  };
}

const FRESHNESS_GREEN_DAYS = 14;
const FRESHNESS_RED_DAYS = 90;

export async function computeSpecialistResearchQuality(
  specialistId: string,
): Promise<ResearchQualityResult> {
  const def = getSpecialistById(specialistId);
  const config = def ? await storage.getOrCreateSpecialistConfig(specialistId) : null;
  const assignmentRows = await storage.listSpecialistAssignments(specialistId);
  const now = new Date();

  // ── Signal 1: probe health of required resources ─────────────────────
  let requiredTotal = 0;
  let requiredHealthy = 0;
  let requiredFailing = 0;
  let requiredGray = 0;
  const failingSlugs: string[] = [];
  const grayResourceSlugs: string[] = [];
  const unboundSlugs: string[] = [];

  for (const row of assignmentRows) {
    if (!row.required) continue;
    requiredTotal += 1;
    if (!row.resourceId) {
      requiredGray += 1;
      unboundSlugs.push(row.assignmentSlug);
      continue;
    }
    const resource = await storage.getAdminResourceById(row.resourceId);
    if (!resource) {
      requiredGray += 1;
      grayResourceSlugs.push(row.assignmentSlug);
      continue;
    }
    const latest = await storage.getLatestHealthCheck(resource.id);
    const band = deriveHealthStatus({
      lastStatus: (latest?.status as ProbeStatus | undefined) ?? null,
      lastCheckedAt: latest?.checkedAt ?? null,
      kind: resource.kind as ResourceKind,
      now,
    });
    if (band === "green") requiredHealthy += 1;
    else if (band === "red") {
      requiredFailing += 1;
      failingSlugs.push(resource.slug);
    } else if (band === "gray") {
      requiredGray += 1;
      grayResourceSlugs.push(resource.slug);
    }
    // amber counts as partial credit (handled below)
  }

  let resourceMultiplier = 1;
  if (requiredTotal > 0) {
    // Failing resources hurt the most; amber/gray cost partial credit.
    const partial = requiredTotal - requiredHealthy - requiredFailing - requiredGray;
    resourceMultiplier =
      (requiredHealthy + partial * 0.5 + requiredGray * 0.25) / requiredTotal;
    resourceMultiplier = Math.max(0, Math.min(1, resourceMultiplier));
  }

  // ── Signal 2: missing required candidate fields ──────────────────────
  const fieldRequirements = (config?.fieldRequirements ?? {}) as Record<string, "hard" | "recommended" | "off">;
  const observedMissing = (config?.lastObservedMissing ?? []) as string[];
  let hardOff = 0;
  let recommendedMissing = 0;
  for (const key of observedMissing) {
    const mode = fieldRequirements[key] ?? "off";
    if (mode === "hard") hardOff += 1;
    else if (mode === "recommended") recommendedMissing += 1;
  }
  const candidateCount = (def?.candidateFields ?? []).length;
  // Penalty: each hard missing = full weight; each recommended missing = half;
  // observed-but-off fields don't penalize because admin chose to ignore them.
  let fieldsMultiplier = 1;
  if (candidateCount > 0) {
    const penalty = Math.min(1, (hardOff + recommendedMissing * 0.5) / Math.max(1, candidateCount));
    fieldsMultiplier = 1 - penalty;
  }

  // ── Signal 3: run freshness ──────────────────────────────────────────
  const runs = await storage.getResearchRunsForSpecialist(specialistId, 10);
  const completed = runs.filter((r) => r.status === "completed" && r.completedAt);
  const lastCompletedAt = completed[0]?.completedAt ?? null;
  const cadenceDays = config?.refreshCadenceDays ?? def?.refreshCadenceDays ?? null;
  let freshnessMultiplier = 0;
  let ageDays: number | null = null;
  if (lastCompletedAt) {
    ageDays = Math.max(0, Math.floor((now.getTime() - new Date(lastCompletedAt).getTime()) / 86_400_000));
    const ceiling = cadenceDays ? Math.max(cadenceDays * 2, FRESHNESS_GREEN_DAYS) : FRESHNESS_RED_DAYS;
    if (ageDays <= (cadenceDays ?? FRESHNESS_GREEN_DAYS)) freshnessMultiplier = 1;
    else if (ageDays >= ceiling) freshnessMultiplier = 0;
    else {
      const span = ceiling - (cadenceDays ?? FRESHNESS_GREEN_DAYS);
      freshnessMultiplier = 1 - (ageDays - (cadenceDays ?? FRESHNESS_GREEN_DAYS)) / span;
    }
  }

  // ── Signal 4: has any successful run ─────────────────────────────────
  const totalRuns = runs.length;
  const lastStatus = runs[0]?.status ?? null;
  const availabilityMultiplier = completed.length > 0 ? 1 : 0;

  // ── Signal 5: confidence (run reliability + self-reported) ───────────
  // Reliability = completed / total over the last 10 attempts. A
  // specialist that frequently errors out produces lower-confidence
  // research even when the most recent run happens to succeed.
  const reliability = totalRuns > 0 ? completed.length / totalRuns : 0;

  // Self-reported confidence: many specialists stash a 0..1 (or 0..100)
  // confidence number on `research_runs.metadata.confidence`. We tolerate
  // either scale and ignore non-numeric values so older rows don't skew.
  let selfReported: number | null = null;
  const lastMeta = (completed[0]?.metadata ?? null) as Record<string, unknown> | null;
  if (lastMeta && typeof lastMeta.confidence === "number" && Number.isFinite(lastMeta.confidence)) {
    const raw = lastMeta.confidence as number;
    const normalized = raw > 1 ? raw / 100 : raw;
    selfReported = Math.max(0, Math.min(1, normalized));
  }
  const confidenceMultiplier = selfReported === null
    ? reliability
    : (reliability + selfReported) / 2;

  // ── Combine ──────────────────────────────────────────────────────────
  const score = Math.round(
    resourceMultiplier * 35
      + fieldsMultiplier * 20
      + freshnessMultiplier * 15
      + availabilityMultiplier * 10
      + confidenceMultiplier * 20,
  );

  // ── Gaps (max ~6, ranked by severity) ────────────────────────────────
  const gaps: QualityGap[] = [];
  if (failingSlugs.length > 0) {
    gaps.push({
      code: "required_resources_failing",
      label: `${failingSlugs.length} required resource${failingSlugs.length > 1 ? "s" : ""} failing: ${failingSlugs.slice(0, 3).join(", ")}`,
      severity: "critical",
    });
  }
  if (unboundSlugs.length > 0) {
    gaps.push({
      code: "required_assignment_unbound",
      label: `${unboundSlugs.length} required slot${unboundSlugs.length > 1 ? "s" : ""} not bound to any resource`,
      severity: "critical",
    });
  }
  if (hardOff > 0) {
    gaps.push({
      code: "hard_required_fields_missing",
      label: `${hardOff} hard-required field${hardOff > 1 ? "s" : ""} missing on most recent run`,
      severity: "critical",
    });
  }
  if (recommendedMissing > 0) {
    gaps.push({
      code: "recommended_fields_missing",
      label: `${recommendedMissing} recommended field${recommendedMissing > 1 ? "s" : ""} missing`,
      severity: "warning",
    });
  }
  if (!lastCompletedAt) {
    gaps.push({
      code: "no_successful_run",
      label: "No successful research run on record",
      severity: "warning",
    });
  } else if (ageDays !== null && cadenceDays && ageDays > cadenceDays) {
    gaps.push({
      code: "research_stale",
      label: `Research is ${ageDays}d old (cadence ${cadenceDays}d)`,
      severity: ageDays > cadenceDays * 2 ? "critical" : "warning",
    });
  }
  if (grayResourceSlugs.length > 0) {
    gaps.push({
      code: "required_resources_unprobed",
      label: `${grayResourceSlugs.length} required resource${grayResourceSlugs.length > 1 ? "s" : ""} never tested`,
      severity: "info",
    });
  }
  if (totalRuns >= 3 && reliability < 0.5) {
    gaps.push({
      code: "low_run_reliability",
      label: `Only ${Math.round(reliability * 100)}% of recent runs completed (last ${totalRuns})`,
      severity: reliability < 0.25 ? "critical" : "warning",
    });
  }
  if (selfReported !== null && selfReported < 0.5) {
    gaps.push({
      code: "low_self_reported_confidence",
      label: `Most recent run reported confidence ${Math.round(selfReported * 100)}%`,
      severity: selfReported < 0.25 ? "critical" : "warning",
    });
  }

  return {
    specialistId,
    score,
    gaps: gaps.slice(0, 6),
    signals: {
      requiredResources: {
        total: requiredTotal,
        healthy: requiredHealthy,
        failing: requiredFailing,
        gray: requiredGray,
      },
      missingFields: {
        hardOff,
        recommendedMissing,
        observedMissing: observedMissing.length,
      },
      freshness: {
        lastCompletedAt: lastCompletedAt ? new Date(lastCompletedAt).toISOString() : null,
        ageDays,
        cadenceDays: cadenceDays ?? null,
      },
      runHistory: { totalRuns, lastStatus },
      confidence: {
        reliability: Math.round(reliability * 100) / 100,
        selfReported: selfReported === null ? null : Math.round(selfReported * 100) / 100,
        combined: Math.round(confidenceMultiplier * 100) / 100,
      },
    },
  };
}

/**
 * Compute and persist. Returns the freshly-recorded snapshot row plus the
 * full result so callers can return the computation transparently.
 */
export async function recomputeAndRecordSpecialistQuality(specialistId: string) {
  const result = await computeSpecialistResearchQuality(specialistId);
  await storage.recordQualitySnapshot({
    specialistId,
    score: result.score,
    gaps: result.gaps,
    signals: result.signals as unknown as Record<string, unknown>,
  });
  return result;
}
