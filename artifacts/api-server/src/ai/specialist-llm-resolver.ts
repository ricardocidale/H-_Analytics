/**
 * Per-Specialist LLM/workflow override resolver.
 *
 * Resolution order for every overridable knob is:
 *
 *   1. Specialist override (`specialist_configs` row column / jsonb key)
 *   2. Global default (`pipeline_policies.tier1_property` for workflow knobs;
 *      hardcoded N+1 orchestrator constants for analyst/synthesis/fallback
 *      models — wired here as a single mapping so the LLM Defaults page can
 *      take it over later without touching call sites)
 *   3. Hardcoded fallback (the same constants live in
 *      `server/ai/research-orchestrator.ts` and
 *      `server/ai/comparables/relaxation-engine.ts`; this module re-exports
 *      them so the LLM Config tab can render the same placeholder text the
 *      runtime would resolve to)
 *
 * Two consumers:
 *
 *   • `server/routes/admin/specialists/_shared.ts` — calls
 *     `getSpecialistGlobalLlmDefaults()` once per `toConfigView` to populate
 *     the "Inheriting global default" placeholders the UI shows next to each
 *     unset override field.
 *
 *   • `server/ai/research-orchestrator.ts` callers + the relaxation engine —
 *     call `resolveSpecialistOrchestratorOverrides(specialistId)` /
 *     `resolveSpecialistPolicyThresholds(specialistId)` to obtain effective
 *     values when a Specialist context is known. Callers that have no
 *     Specialist context fall through to the hardcoded defaults today,
 *     matching the pre-refactor behavior.
 */
import { storage } from "../storage";
import type { OrchestratorModelOverrides } from "./research-orchestrator";
import type {
  SpecialistGlobalLlmDefaults,
  SpecialistWorkflowOverrides,
} from "@workspace/db";

// ── Hardcoded fallback constants (mirror runtime defaults) ───────────────────
// Kept in sync with `server/ai/research-orchestrator.ts` (DEFAULT_*_MODEL)
// and `server/ai/comparables/relaxation-engine.ts` (DEFAULT_POLICY +
// pipeline_policies column defaults).

export const HARDCODED_LLM_DEFAULTS = {
  multiModelEnabled: true,
  analystAModel: "gemini-2-5-flash",
  analystBModel: "claude-sonnet-4-5",
  synthesisModel: "claude-opus-4-6",
  // The orchestrator's "fallback" today is `runResearch` with no override
  // (i.e. each Specialist's own primary model). We surface a sentinel here
  // so the LLM Config tab can label the row "(uses Specialist primary
  // model)" — explicit > silent.
  fallbackModel: null as string | null,
} as const;

export const HARDCODED_WORKFLOW_DEFAULTS: Required<{
  [K in keyof SpecialistWorkflowOverrides]: number;
}> = {
  stalenessThresholdHours: 168, // 7 days — matches pipeline_policies default
  maxConcurrentRuns: 3,
  dailyTokenBudget: 100_000,
  monthlyTokenBudget: 2_000_000,
  relaxationMaxLevel: 5,
  minEvidenceScore: 0.3,
  minCompCount: 3,
  autoRefreshIntervalHours: 24 * 7, // weekly
};

// ── UI placeholder resolution ────────────────────────────────────────────────

/**
 * Resolves the global defaults the LLM Config tab renders as the
 * "Inheriting global default" placeholder for every unset override field.
 *
 * Pipeline policies (`tier1_property`) drive the workflow knobs; the
 * model labels are looked up against `admin_resources` so the UI shows
 * the human-readable display name rather than a raw model id.
 */
export async function getSpecialistGlobalLlmDefaults(): Promise<SpecialistGlobalLlmDefaults> {
  // Best-effort load; tests mock `storage` and may not stub this method.
  // A missing/throwing call simply falls through to HARDCODED_WORKFLOW_DEFAULTS.
  let tier1: Awaited<ReturnType<typeof storage.getPipelinePolicies>>[number] | undefined;
  try {
    const policies = (await storage.getPipelinePolicies?.()) ?? [];
    tier1 = policies.find(
      (p) => p.policyKey === "tier1_property" || p.tier === 1,
    );
  } catch {
    tier1 = undefined;
  }

  // P6e: resolve display label for each N+1 role.
  // When the admin has persisted a model resource ID on tier1_property, look up
  // that resource by ID for its display name. Otherwise fall back to the
  // hardcoded slug lookup (HARDCODED_LLM_DEFAULTS) so the UI still shows a
  // meaningful placeholder before the admin configures anything.
  const resolveLabel = async (
    resourceId: number | null | undefined,
    fallbackSlug: string | null,
  ): Promise<string | null> => {
    if (resourceId != null) {
      try {
        const row = await storage.getAdminResourceById?.(resourceId);
        if (row && row.kind === "model") return row.displayName;
      } catch {
        // best-effort — fall through to slug lookup
      }
    }
    if (!fallbackSlug) return null;
    try {
      const row = await storage.getAdminResourceBySlug?.("model", fallbackSlug);
      return row ? row.displayName : fallbackSlug;
    } catch {
      return fallbackSlug;
    }
  };

  const [analystAModelLabel, analystBModelLabel, synthesisModelLabel] = await Promise.all([
    resolveLabel(tier1?.analystAModelResourceId, HARDCODED_LLM_DEFAULTS.analystAModel),
    resolveLabel(tier1?.analystBModelResourceId, HARDCODED_LLM_DEFAULTS.analystBModel),
    resolveLabel(tier1?.synthesisModelResourceId, HARDCODED_LLM_DEFAULTS.synthesisModel),
  ]);

  return {
    multiModelEnabled: HARDCODED_LLM_DEFAULTS.multiModelEnabled,
    analystAModelLabel,
    analystBModelLabel,
    synthesisModelLabel,
    fallbackModelLabel: tier1?.fallbackModelResourceId != null
      ? await resolveLabel(tier1.fallbackModelResourceId, null)
      : HARDCODED_LLM_DEFAULTS.fallbackModel,
    analystAModelResourceId: tier1?.analystAModelResourceId ?? null,
    analystBModelResourceId: tier1?.analystBModelResourceId ?? null,
    synthesisModelResourceId: tier1?.synthesisModelResourceId ?? null,
    fallbackModelResourceId: tier1?.fallbackModelResourceId ?? null,
    workflow: {
      stalenessThresholdHours: tier1?.stalenessThresholdHours ?? HARDCODED_WORKFLOW_DEFAULTS.stalenessThresholdHours,
      maxConcurrentRuns: tier1?.maxConcurrentRuns ?? HARDCODED_WORKFLOW_DEFAULTS.maxConcurrentRuns,
      dailyTokenBudget: tier1?.dailyTokenBudget ?? HARDCODED_WORKFLOW_DEFAULTS.dailyTokenBudget,
      monthlyTokenBudget: tier1?.monthlyTokenBudget ?? HARDCODED_WORKFLOW_DEFAULTS.monthlyTokenBudget,
      relaxationMaxLevel: tier1?.relaxationMaxLevel ?? HARDCODED_WORKFLOW_DEFAULTS.relaxationMaxLevel,
      minEvidenceScore: tier1?.minEvidenceScore ?? HARDCODED_WORKFLOW_DEFAULTS.minEvidenceScore,
      minCompCount: tier1?.minCompCount ?? HARDCODED_WORKFLOW_DEFAULTS.minCompCount,
      autoRefreshIntervalHours: tier1?.autoRefreshIntervalHours ?? HARDCODED_WORKFLOW_DEFAULTS.autoRefreshIntervalHours,
    },
  };
}

// ── Runtime resolution ───────────────────────────────────────────────────────

/**
 * Resolves the effective N+1 orchestrator model overrides for one
 * Specialist by reading its `specialist_configs` row and translating
 * the four AdminResource ids into model slug strings the orchestrator
 * understands.
 *
 * Returns `undefined` when the Specialist has no row OR has no model
 * overrides set — in that case the orchestrator falls through to its
 * hardcoded defaults (preserving pre-refactor behavior at every call
 * site that had no Specialist context to begin with).
 */
export async function resolveSpecialistOrchestratorOverrides(
  specialistId: string | null | undefined,
): Promise<OrchestratorModelOverrides | undefined> {
  if (!specialistId) return undefined;
  const cfg = await storage.getSpecialistConfig(specialistId);
  if (!cfg) return undefined;

  const ids = [
    cfg.modelResourceId,
    cfg.analystAModelResourceId,
    cfg.analystBModelResourceId,
    cfg.synthesisModelResourceId,
    cfg.fallbackModelResourceId,
  ];
  const noModels = ids.every((id) => id == null);
  if (noModels && cfg.multiModelEnabled == null) return undefined;

  const slugs = await Promise.all(
    ids.map(async (id) => {
      if (id == null) return null;
      const row = await storage.getAdminResourceById(id);
      return row && row.kind === "model" ? row.slug : null;
    }),
  );
  const [p, a, b, s, f] = slugs;
  return {
    primaryModel: p ?? undefined,
    analystAModel: a ?? undefined,
    analystBModel: b ?? undefined,
    synthesisModel: s ?? undefined,
    fallbackModel: f ?? undefined,
    multiModelEnabled: cfg.multiModelEnabled ?? undefined,
  };
}

/**
 * Resolves the effective tier-1 policy thresholds for one Specialist.
 * Specialist `workflowOverrides` keys win, then global pipeline policy,
 * then hardcoded defaults. Used by the relaxation engine when a
 * Specialist context is available.
 */
export async function resolveSpecialistPolicyThresholds(
  specialistId: string | null | undefined,
): Promise<{
  minEvidenceScore: number;
  minCompCount: number;
  relaxationMaxLevel: number;
  stalenessThresholdHours: number;
}> {
  let tier1: Awaited<ReturnType<typeof storage.getPipelinePolicies>>[number] | undefined;
  try {
    const policies = (await storage.getPipelinePolicies?.()) ?? [];
    tier1 = policies.find(
      (p) => p.policyKey === "tier1_property" || p.tier === 1,
    );
  } catch {
    tier1 = undefined;
  }
  let overrides: SpecialistWorkflowOverrides | null = null;
  if (specialistId) {
    try {
      const cfg = await storage.getSpecialistConfig?.(specialistId);
      overrides = cfg?.workflowOverrides ?? null;
    } catch {
      overrides = null;
    }
  }
  return {
    minEvidenceScore:
      overrides?.minEvidenceScore ??
      tier1?.minEvidenceScore ??
      HARDCODED_WORKFLOW_DEFAULTS.minEvidenceScore,
    minCompCount:
      overrides?.minCompCount ??
      tier1?.minCompCount ??
      HARDCODED_WORKFLOW_DEFAULTS.minCompCount,
    relaxationMaxLevel: Math.min(
      overrides?.relaxationMaxLevel ??
        tier1?.relaxationMaxLevel ??
        HARDCODED_WORKFLOW_DEFAULTS.relaxationMaxLevel,
      5,
    ),
    stalenessThresholdHours:
      overrides?.stalenessThresholdHours ??
      tier1?.stalenessThresholdHours ??
      HARDCODED_WORKFLOW_DEFAULTS.stalenessThresholdHours,
  };
}

/**
 * Resolves the effective per-Specialist runtime cost/concurrency limits
 * (Task #501). Used by the dispatch-time gates on
 * `POST /api/research/generate` and `runAnalystScoped` to enforce
 * `SpecialistWorkflowOverrides` against actual recent spend.
 *
 * Resolution order matches the rest of this module:
 *   1. Specialist `workflowOverrides` (per-Specialist override)
 *   2. Global `pipeline_policies.tier1_property` row
 *   3. Hardcoded fallback constants
 */
export async function resolveSpecialistRuntimeLimits(
  specialistId: string | null | undefined,
): Promise<{
  maxConcurrentRuns: number;
  dailyTokenBudget: number;
  monthlyTokenBudget: number;
}> {
  let tier1: Awaited<ReturnType<typeof storage.getPipelinePolicies>>[number] | undefined;
  try {
    const policies = (await storage.getPipelinePolicies?.()) ?? [];
    tier1 = policies.find(
      (p) => p.policyKey === "tier1_property" || p.tier === 1,
    );
  } catch {
    tier1 = undefined;
  }
  let overrides: SpecialistWorkflowOverrides | null = null;
  if (specialistId) {
    try {
      const cfg = await storage.getSpecialistConfig?.(specialistId);
      overrides = cfg?.workflowOverrides ?? null;
    } catch {
      overrides = null;
    }
  }
  return {
    maxConcurrentRuns:
      overrides?.maxConcurrentRuns ??
      tier1?.maxConcurrentRuns ??
      HARDCODED_WORKFLOW_DEFAULTS.maxConcurrentRuns,
    dailyTokenBudget:
      overrides?.dailyTokenBudget ??
      tier1?.dailyTokenBudget ??
      HARDCODED_WORKFLOW_DEFAULTS.dailyTokenBudget,
    monthlyTokenBudget:
      overrides?.monthlyTokenBudget ??
      tier1?.monthlyTokenBudget ??
      HARDCODED_WORKFLOW_DEFAULTS.monthlyTokenBudget,
  };
}

/**
 * Pre-dispatch gate (Task #501). Verifies that running a new research
 * run for `specialistId` would not violate the resolved per-Specialist
 * concurrency or token-budget limits. Read-only — callers handle the
 * 429 response shape themselves.
 *
 * Returns:
 *   • `{ allowed: true }` when the run can proceed (or when no
 *     `specialistId` is provided — every gate is per-Specialist by
 *     design and runs without one bypass these limits, matching
 *     pre-Task-501 behavior).
 *   • `{ allowed: false, reason, limit, observed }` when a limit is
 *     exceeded. `reason` is the override key the gate tripped on so
 *     the route can produce a human-readable error.
 */
export type SpecialistRuntimeGateResult =
  | { allowed: true }
  | {
      allowed: false;
      reason: "maxConcurrentRuns" | "dailyTokenBudget" | "monthlyTokenBudget";
      limit: number;
      observed: number;
    };

export async function checkSpecialistRuntimeGate(
  specialistId: string | null | undefined,
  now: Date = new Date(),
): Promise<SpecialistRuntimeGateResult> {
  if (!specialistId) return { allowed: true };
  const limits = await resolveSpecialistRuntimeLimits(specialistId);

  // Concurrency
  const running = (await storage.countRunningResearchRunsForSpecialist?.(specialistId)) ?? 0;
  if (running >= limits.maxConcurrentRuns) {
    return {
      allowed: false,
      reason: "maxConcurrentRuns",
      limit: limits.maxConcurrentRuns,
      observed: running,
    };
  }

  // Daily token budget (24h rolling window)
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const dailyTokens = (await storage.sumTokensUsedForSpecialistSince?.(specialistId, dayAgo)) ?? 0;
  if (dailyTokens >= limits.dailyTokenBudget) {
    return {
      allowed: false,
      reason: "dailyTokenBudget",
      limit: limits.dailyTokenBudget,
      observed: dailyTokens,
    };
  }

  // Monthly token budget (30-day rolling window)
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const monthlyTokens = (await storage.sumTokensUsedForSpecialistSince?.(specialistId, monthAgo)) ?? 0;
  if (monthlyTokens >= limits.monthlyTokenBudget) {
    return {
      allowed: false,
      reason: "monthlyTokenBudget",
      limit: limits.monthlyTokenBudget,
      observed: monthlyTokens,
    };
  }

  return { allowed: true };
}
