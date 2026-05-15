/**
 * server/routes/structure-comparison.ts — Operating-structure comparison endpoint.
 *
 * Wires Task #809: given a property, run the engine once to produce baseline
 * yearly financials, then call `compareOperatingStructures` to overlay the
 * six structures (own / franchise / HMA / lease tenant / lease landlord /
 * hybrid) and return the comparison bundle.
 *
 * Endpoint: POST /api/properties/:id/structure-comparison
 * Auth: requireAuth (any signed-in user can compare structures for their
 *   accessible properties).
 * Body: { globalAssumptions, structures? } — `structures` is optional and
 *   defaults to all six.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import superjson from "superjson";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../auth";
import { logger } from "../logger";
import { parseRouteId } from "./helpers";
import { withModelConstants } from "../finance/apply-model-constants";
import { withFinancialHydration } from "../defaults";
import { recomputeSinglePropertyAndStamp } from "../finance/recompute";
import { compareOperatingStructures } from "@calc/analysis/structure-comparison";
import {
  OPERATING_STRUCTURE_IDS,
  type OperatingStructureId,
  type StructureOverlayPatch,
} from "@shared/constants-operating-structures";
import { DEFAULT_EXIT_CAP_RATE } from "@shared/constants";
import type { PropertyInput, GlobalInput } from "@engine/types";

const STRUCTURE_ID_SET = new Set<OperatingStructureId>(OPERATING_STRUCTURE_IDS);

// Per-structure overlay patch — every field optional, all numeric scalars are
// finite. Validating bounds in the calc layer is intentional: a UI slider
// could legitimately produce a 0 or a very high value, and we want the calc
// path to surface implausible numbers rather than silently reject them here.
const overlayPatchSchema = z
  .object({
    feeOverlay: z
      .object({
        brandRoyaltyOnRooms: z.number().finite().nonnegative().optional(),
        brandMarketingOnRooms: z.number().finite().nonnegative().optional(),
        brandReservationOnRooms: z.number().finite().nonnegative().optional(),
        hmaBaseOnTotalRevenue: z.number().finite().nonnegative().optional(),
        hmaIncentiveOnGop: z.number().finite().nonnegative().optional(),
        keepBaselineMgmtFee: z.boolean().optional(),
      })
      .partial()
      .optional(),
    lease: z
      .object({
        baseRentRevenueShare: z.number().finite().nonnegative().optional(),
        percentageRentOnRevenue: z.number().finite().nonnegative().optional(),
        rentEscalator: z.number().finite().optional(),
        operatorTakeCapOfGop: z.number().finite().min(0).max(1).optional(),
      })
      .partial()
      .optional(),
    capexFactor: z.number().finite().nonnegative().optional(),
    downsideNoiHaircut: z.number().finite().min(0).max(1).optional(),
  })
  .partial();

const requestSchema = z.object({
  globalAssumptions: z.record(z.unknown()),
  // At least one structure when provided. Omit the field entirely to compare
  // all six. An empty array would yield an undefined recommendation, so we
  // reject it explicitly.
  structures: z
    .array(z.string())
    .min(1, "Provide at least one operating structure or omit the field")
    .optional()
    .refine(
      (xs) => !xs || xs.every((x) => STRUCTURE_ID_SET.has(x as OperatingStructureId)),
      { message: "Unknown operating structure id" },
    ),
  // Per-structure scenario overrides. Keys must be valid structure ids; values
  // are partial patches deep-merged onto the country-resolved overlay.
  overlays: z
    .record(z.string(), overlayPatchSchema)
    .optional()
    .refine(
      (rec) => !rec || Object.keys(rec).every((k) => STRUCTURE_ID_SET.has(k as OperatingStructureId)),
      { message: "Unknown operating structure id in overlays" },
    ),
  projectionYears: z.number().int().positive().max(30).optional(),
});

function sanitizeNumbers(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "number") return Number.isFinite(obj) ? obj : null;
  if (Array.isArray(obj)) return obj.map(sanitizeNumbers);
  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      result[key] = sanitizeNumbers(value);
    }
    return result;
  }
  return obj;
}

function sendSuperjson(res: Response, data: unknown): void {
  const safe = sanitizeNumbers(data);
  res.setHeader("X-Superjson", "true");
  res.json(superjson.serialize(safe));
}

export function registerStructureComparisonRoutes(router: Router): void {
  router.post(
    "/api/properties/:id/structure-comparison",
    requireAuth,
    async (req: Request, res: Response) => {
      try {
        const propertyId = parseRouteId(req.params.id);
        if (!propertyId) {
          return res.status(400).json({ error: "Invalid property ID", code: "STRC-001" });
        }

        const validation = requestSchema.safeParse(req.body);
        if (!validation.success) {
          return res.status(400).json({
            error: "Invalid input",
            details: validation.error.issues.map((i) => ({
              path: i.path.join("."),
              message: i.message,
            code: "STRC-003" })),
          });
        }

        // Per-property authorization (admins, owners, and viewers of shared
        // properties only). Returns null for both "not found" and
        // "not authorized" — collapse to 404 so we don't leak existence.
        const property = await checkPropertyAccess(getAuthUser(req), propertyId);
        if (!property) return res.status(404).json({ error: "Property not found", code: "STRC-002" });

        const { globalAssumptions: rawGlobal, structures, overlays, projectionYears } = validation.data;
        const globalAssumptions = await withModelConstants(rawGlobal);

        const [hydratedProp] = await withFinancialHydration([property as Record<string, unknown>]);
        const result = await recomputeSinglePropertyAndStamp({
          property: hydratedProp as unknown as PropertyInput,
          globalAssumptions: globalAssumptions as unknown as GlobalInput,
          projectionYears,
        });

        const totalProjectCost = property.purchasePrice ?? 0;
        const initialDebt = totalProjectCost * (property.acquisitionLTV ?? 0);
        const initialEquity = totalProjectCost - initialDebt;
        const principalPaidOverHold = result.yearly.reduce(
          (s, y) => s + y.principalPayment,
          0,
        );
        // Outstanding debt at exit = initial debt minus cumulative principal
        // paid down over the hold. Allowed to go negative only as a guardrail —
        // negative balance is non-physical, so floor at zero. (This floor is on
        // the *debt* number, not on terminal equity proceeds, which the calc
        // intentionally allows to go negative.)
        const exitDebtBalance = Math.max(0, initialDebt - principalPaidOverHold);

        const comparison = compareOperatingStructures({
          propertyId,
          propertyName: property.name ?? `Property #${propertyId}`,
          country: (property as { country?: string | null }).country ?? null,
          totalProjectCost,
          initialEquity,
          exitDebtBalance,
          exitCapRate: property.exitCapRate ?? DEFAULT_EXIT_CAP_RATE,
          yearly: result.yearly,
          structures: structures as OperatingStructureId[] | undefined,
          overlays: overlays as
            | Partial<Record<OperatingStructureId, StructureOverlayPatch>>
            | undefined,
        });

        return sendSuperjson(res, {
          ...comparison,
          engineVersion: result.engineVersion,
          baselineOutputHash: result.outputHash,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Structure comparison failed";
        logger.error(`Structure comparison error: ${message}`, "structure-comparison");
        return res
          .status(500)
          .json({
            error:
              process.env.NODE_ENV === "production" ? "Structure comparison failed" : message,
          });
      }
    },
  );
}
