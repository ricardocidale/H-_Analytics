import type { Request, Response } from "express";
import { storage } from "../../storage";
import { getAuthUser } from "../../auth";
import { isAdminRole } from "@shared/constants";
import { checkSpecialistRuntimeGate } from "../../ai/specialist-llm-resolver";
import type { GlobalAssumptions } from "@workspace/db";

export interface PreflightGatesInput {
  req: Request;
  res: Response;
  type: "property" | "company" | "global";
  propertyId: number | undefined;
  ga: GlobalAssumptions | undefined;
  specialistId?: string;
}

export type PreflightGatesResult =
  | {
      ok: true;
      companyProperties?: Awaited<ReturnType<typeof storage.getAllProperties>>;
    }
  | { ok: false };

/**
 * Runs the company minimum-info gate (company name + start date + ≥1 property)
 * and the catalog locked-hard required-fields gate for property runs. Sends
 * the appropriate 400/404 response and returns `{ ok: false }` when a gate
 * fails. Returns the prefetched company properties for downstream reuse.
 */
export async function runPreflightGates(
  input: PreflightGatesInput,
): Promise<PreflightGatesResult> {
  const { req, res, type, propertyId, ga, specialistId } = input;

  // ── Per-Specialist concurrency / token-budget gate (Task #501) ──
  // Runs before any LLM dispatch (and before SSE headers are set so we
  // can still send a real HTTP status). Skipped when no specialistId
  // is supplied.
  if (specialistId) {
    const gate = await checkSpecialistRuntimeGate(specialistId);
    if (!gate.allowed) {
      res.status(429).json({
        error: `Specialist budget exceeded (${gate.reason}: ${gate.observed}/${gate.limit}). Try again later or raise the limit on the Specialist's LLM Config tab.`,
        code: "SPECIALIST_BUDGET_EXCEEDED",
        specialistId,
        reason: gate.reason,
        limit: gate.limit,
        observed: gate.observed,
      });
      return { ok: false };
    }
  }

  let companyProperties:
    | Awaited<ReturnType<typeof storage.getAllProperties>>
    | undefined;

  if (type === "company") {
    if (!ga) {
      res.status(400).json({
        error:
          "Company assumptions not configured yet. Set up your company name and basic assumptions before generating intelligence.",
      });
      return { ok: false };
    }
    if (!ga.companyName || !ga.modelStartDate) {
      res.status(400).json({
        error:
          "Company name and start date are required before generating intelligence. Set them on the Company Assumptions page.",
        code: "COMPANY_SETUP_INCOMPLETE",
      });
      return { ok: false };
    }
    const reqUser = getAuthUser(req);
    companyProperties = isAdminRole(reqUser.role)
      ? await storage.getAllProperties()
      : await storage.getAllProperties(reqUser.id);
    if (companyProperties.length === 0) {
      res.status(400).json({
        error:
          "Add at least one property to your portfolio before generating company intelligence. The AI needs portfolio data to calibrate management fee benchmarks, staffing models, and overhead assumptions.",
      });
      return { ok: false };
    }
  }

  if (type === "property" && propertyId) {
    const property = await storage.getProperty(propertyId);
    if (!property) {
      res.status(404).json({ error: "Property not found" });
      return { ok: false };
    }
    const [{ getLockedHardCandidateFields }, { findMissingRequiredFields }] =
      await Promise.all([
        import("@engine/analyst/registry/specialist-catalog"),
        import("@engine/analyst/surface/mgmt-co"),
      ]);
    const specialistIds = [
      "property.risk-intelligence",
      "property.executive-summary",
    ] as const;
    const seen = new Set<string>();
    const missingFields: {
      key: string;
      label: string;
      surface: string;
      surfaceAnchor?: string;
    }[] = [];
    for (const sid of specialistIds) {
      const lockedFields = getLockedHardCandidateFields(sid);
      if (lockedFields.length === 0) continue;
      const missingKeys = findMissingRequiredFields(
        property as unknown as Record<string, unknown>,
        lockedFields.map((f) => f.key),
      );
      for (const key of missingKeys) {
        if (seen.has(key)) continue;
        seen.add(key);
        const meta = lockedFields.find((f) => f.key === key)!;
        missingFields.push({
          key,
          label: meta.label,
          surface: meta.surface,
          surfaceAnchor: meta.surfaceAnchor,
        });
      }
    }
    if (missingFields.length > 0) {
      res.status(400).json({
        error: `Required field${missingFields.length === 1 ? "" : "s"} missing on this property: ${missingFields
          .map((m) => m.label)
          .join(", ")}. Fill them in on Property Edit before running research.`,
        code: "REQUIRED_FIELDS_MISSING",
        specialistId: "property.risk-intelligence",
        missingFields,
      });
      return { ok: false };
    }
  }

  return { ok: true, companyProperties };
}
