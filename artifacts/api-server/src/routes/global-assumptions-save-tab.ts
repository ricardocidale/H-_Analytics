/**
 * global-assumptions-save-tab.ts — extracted service for the "Save Company
 * Assumptions tab" flow, callable from both:
 *   - the POST /api/global-assumptions/save-tab route handler, and
 *   - the Rebecca `save_company_assumption_tab` tool.
 *
 * Why extract: the save-tab path carries ~200 lines of behavior beyond the
 * underlying upsert (denylist sanitisation, savedTabs union, compute-cache
 * invalidation, guidance supersession, ICP/funding/revenue telemetry,
 * hard-required-field gates). Inlining any of this in two places would let
 * the agent's writes silently diverge from the UI's writes — a parity gap
 * in behavior, not just surface.
 *
 * The route handler is responsible for: auth, request parsing, audit log
 * (`logActivity` needs Express req), response shaping. This service is
 * responsible for the full save semantics.
 */
import { storage } from "../storage";
import { insertGlobalAssumptionsSchema } from "@workspace/db";
import { invalidateComputeCache } from "../finance/cache";
import { logger } from "../logger";
import { stripCanonicalDenylistedFields } from "./global-assumptions-denylist";

export const COMPANY_ASSUMPTION_TAB_KEYS = [
  "company",
  "funding",
  "revenue",
  "compensation",
  "overhead",
  "property-defaults",
] as const;
export type CompanyAssumptionTabKey = (typeof COMPANY_ASSUMPTION_TAB_KEYS)[number];

export interface SaveCompanyAssumptionTabArgs {
  tabKey: CompanyAssumptionTabKey;
  patch?: Record<string, unknown>;
  fundingInputs?: {
    runwayBufferMonths?: number | null;
    sizingOvershootPct?: number | null;
    trancheGapMonths?: number | null;
    revenueRampDelayMonths?: number | null;
    burnFlexDownPct?: number | null;
  };
  /** When true, remove tabKey from savedTabs instead of adding it. */
  unsave?: boolean;
  userId: number;
}

export interface SaveCompanyAssumptionTabResult {
  savedId: number;
  savedTabs: string[];
  requiredFieldsMissing?: string[];
}

/**
 * Material global-assumption keys that supersede stale company guidance
 * when changed. Mirrors the route's prior inline list (Phase 5C-task-3).
 */
const GA_STALENESS_TRIGGER_KEYS = [
  "baseManagementFee",
  "incentiveManagementFee",
  "inflationRate",
  "companyTaxRate",
  "commissionRate",
  "staffSalary",
] as const;

export async function saveCompanyAssumptionTab(
  args: SaveCompanyAssumptionTabArgs,
): Promise<SaveCompanyAssumptionTabResult> {
  const { tabKey, patch, fundingInputs, unsave, userId } = args;

  const current = await storage.getGlobalAssumptions(userId);
  const baseRow = (current ?? {}) as Record<string, unknown>;

  // Sanitize patch to drop canonically-owned fields (e.g. `depreciationYears`)
  // before merge. The save-tab path must enforce the same denylist as
  // PUT /api/global-assumptions; otherwise a non-admin management user could
  // bypass the Constants-tab admin gate by submitting a crafted `patch`.
  const sanitizedPatch = stripCanonicalDenylistedFields(
    (patch ?? {}) as Record<string, unknown>,
  );
  const merged = { ...baseRow, ...sanitizedPatch };
  delete merged.id;
  delete merged.createdAt;
  delete merged.updatedAt;
  delete (merged as Record<string, unknown>).companyLogoUrl;

  const existingSaved: string[] = Array.isArray(baseRow.savedTabs)
    ? (baseRow.savedTabs as string[]).filter((k) =>
        (COMPANY_ASSUMPTION_TAB_KEYS as readonly string[]).includes(k),
      )
    : [];
  const nextSaved = unsave
    ? existingSaved.filter((k) => k !== tabKey)
    : Array.from(new Set([...existingSaved, tabKey]));
  (merged as Record<string, unknown>).savedTabs = nextSaved;

  // Full schema validation: every required field (including jsonb columns
  // like standardAcqPackage / debtAssumptions) must be present. This matches
  // PUT /api/global-assumptions and prevents partially-invalid rows from
  // being persisted (CodeRabbit PR-94). The previous fallback wrote `merged`
  // as-is when full validation failed — that was a behavior carry-over from
  // the workspace-port commit, not an intentional incremental-save path.
  const partialValidation = insertGlobalAssumptionsSchema.partial().safeParse(merged);
  if (!partialValidation.success) {
    throw new SaveCompanyAssumptionTabValidationError(
      partialValidation.error.issues.map((i) => i.message).join("; "),
    );
  }
  const fullValidation = insertGlobalAssumptionsSchema.safeParse(merged);
  if (!fullValidation.success) {
    throw new SaveCompanyAssumptionTabValidationError(
      fullValidation.error.issues.map((i) => i.message).join("; "),
    );
  }
  const dataToWrite = fullValidation.data;

  const saved = await storage.upsertGlobalAssumptions(dataToWrite, userId);
  invalidateComputeCache();

  // Phase 5C-task-3: supersede stale company guidance when material inputs change.
  const patchKeys = Object.keys(sanitizedPatch);
  const hasGaKeyChange = patchKeys.some(
    (k) =>
      (GA_STALENESS_TRIGGER_KEYS as readonly string[]).includes(k) &&
      (sanitizedPatch as Record<string, unknown>)[k] !==
        (baseRow as Record<string, unknown>)[k],
  );
  if (hasGaKeyChange) {
    storage
      .markAssumptionGuidanceSuperseded("company", userId, null)
      .catch((err) =>
        logger.warn(
          `Failed to supersede company guidance (save-tab): ${err instanceof Error ? err.message : err}`,
          "global-assumptions",
        ),
      );
  }

  // G1.5b-pre-a: Save is data-only. The Analyst dispatches ONLY on explicit
  // <AnalystButton /> press (rule: .claude/rules/analyst-trigger-discipline.md).
  // We still report hard-required field gaps so the form can highlight them,
  // and we emit observed-missing telemetry so admins can promote candidate
  // fields via the Required Fields tab.
  let requiredFieldsMissing: string[] | null = null;

  if (tabKey === "company") {
    // Phase 4: emit observed-missing telemetry for Specialist C
    // (`mgmt-co.icp-intelligence`) on the Company Assumptions save.
    try {
      const [
        { findObservedMissingCandidateFields },
        { getSpecialistById },
      ] = await Promise.all([
        import("@engine/analyst/surface/mgmt-co"),
        import("@engine/analyst/registry/specialist-catalog"),
      ]);
      const ICP_ID = "mgmt-co.icp-intelligence";
      const def = getSpecialistById(ICP_ID);
      if (def) {
        const cfg = await storage.getOrCreateSpecialistConfig(ICP_ID);
        const observed = findObservedMissingCandidateFields(
          saved as Record<string, unknown>,
          def.candidateFields ?? [],
          (cfg as { fieldRequirements?: Record<string, "hard" | "recommended" | "off"> })
            .fieldRequirements,
        );
        await storage.recordObservedMissingFields(ICP_ID, observed);
      }
    } catch (icpErr: unknown) {
      logger.warn(
        `ICP observed-missing emission failed: ${icpErr instanceof Error ? icpErr.message : String(icpErr)}`,
        "global-assumptions",
      );
    }
  }

  if (tabKey === "funding" || tabKey === "revenue") {
    const [
      {
        MGMT_CO_FUNDING_ID,
        MGMT_CO_REVENUE_ID,
        findMissingRequiredFields,
        findObservedMissingCandidateFields,
      },
      { deriveHardRequiredFieldKeys },
      { getSpecialistById, getLockedHardCandidateKeys },
    ] = await Promise.all([
      import("@engine/analyst/surface/mgmt-co"),
      import("./admin/specialists"),
      import("@engine/analyst/registry/specialist-catalog"),
    ]);

    const activeSpecialistId =
      tabKey === "funding" ? MGMT_CO_FUNDING_ID : MGMT_CO_REVENUE_ID;
    const activeCfg = await storage.getOrCreateSpecialistConfig(activeSpecialistId);
    const activeDef = getSpecialistById(activeSpecialistId);

    // Funding gate-source is the dispatch-payload namespace
    // (CapitalRaiseInputs — runwayBufferMonths, etc.) the user fills in on
    // the funding tab. Revenue gate-source is the freshly-saved row — the
    // transform that lives in the AnalystButton handler applies `?? DEFAULT_*`
    // fallbacks that would mask missing values, so gating against the saved
    // row is the truthful surface here too.
    const gateSource: Record<string, unknown> =
      tabKey === "funding"
        ? ((fundingInputs ?? {}) as Record<string, unknown>)
        : (saved as Record<string, unknown>);

    const fieldRequirements = (activeCfg as {
      fieldRequirements?: Record<string, "hard" | "recommended" | "off">;
    }).fieldRequirements;

    const gateFields = deriveHardRequiredFieldKeys(
      fieldRequirements,
      activeCfg.requiredFields,
      getLockedHardCandidateKeys(activeSpecialistId),
    );
    const missing = findMissingRequiredFields(gateSource, gateFields);
    if (missing.length > 0) requiredFieldsMissing = missing;

    // Observed-missing telemetry is best-effort — a failure here must not
    // mask the successful save or the user-facing `requiredFieldsMissing`
    // gate computed above (CodeRabbit PR-94, matching the company-tab
    // try/catch pattern but scoped to just the telemetry write).
    try {
      const observedMissing = findObservedMissingCandidateFields(
        gateSource,
        activeDef?.candidateFields ?? [],
        fieldRequirements,
      );
      await storage.recordObservedMissingFields(activeSpecialistId, observedMissing);
    } catch (telemetryErr: unknown) {
      logger.warn(
        `${tabKey} observed-missing emission failed: ${telemetryErr instanceof Error ? telemetryErr.message : String(telemetryErr)}`,
        "global-assumptions",
      );
    }
  }

  return {
    savedId: saved.id,
    savedTabs: nextSaved,
    ...(requiredFieldsMissing && requiredFieldsMissing.length > 0
      ? { requiredFieldsMissing }
      : {}),
  };
}

export class SaveCompanyAssumptionTabValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SaveCompanyAssumptionTabValidationError";
  }
}
