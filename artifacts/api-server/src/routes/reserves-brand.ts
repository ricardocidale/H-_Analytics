/**
 * server/routes/reserves-brand.ts — Reserves & Brand Costs deep-dive bundle
 * (Task #808). Single GET endpoint that calls the `reserves_brand_bundle`
 * calc skill against a property + its derived annual revenue, and returns
 * the JSON the client panel renders.
 */
import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser } from "../auth";
import { logger } from "../logger";
import { logAndSendError, parseRouteId } from "./helpers";
import { executeComputationTool } from "@calc/dispatch";
import { computePropertyMetrics } from "@calc/research/property-metrics";
import { isAdminRole } from "@shared/constants";

const DEFAULT_HOLD_PERIOD_YEARS = 10;

export function register(app: Express) {
  app.get(
    "/api/properties/:id/reserves-brand-bundle",
    requireAuth,
    async (req, res) => {
      try {
        const propertyId = parseRouteId(req.params.id);
        if (!propertyId) {
          return res.status(400).json({ error: "Invalid property ID", code: "RSVB-002" });
        }

        const user = getAuthUser(req);
        const property = await storage.getProperty(propertyId);
        if (!property) {
          return res.status(404).json({ error: "Property not found", code: "RSVB-003" });
        }
        if (property.userId !== user.id && !isAdminRole(user.role)) {
          return res.status(403).json({ error: "Forbidden", code: "RSVB-004" });
        }

        // Derive annual revenue from the property's own ADR/occupancy/room
        // count via the deterministic property-metrics calc. This keeps the
        // panel consistent with the rest of the app (same engine, same
        // numbers).
        const metrics = computePropertyMetrics({
          room_count: property.roomCount ?? 10,
          adr: property.startAdr ?? 250,
          occupancy: property.maxOccupancy ?? property.startOccupancy ?? 0.55,
        });

        const currentYear = new Date().getFullYear();

        const pipSchedule = (property.pipScheduleJson as
          | Array<{ yearOffset: number; scope?: string; estimatedCost?: number }>
          | null
          | undefined) ?? null;

        const bundleJson = executeComputationTool("reserves_brand_bundle", {
          property_name: property.name,
          room_count: property.roomCount ?? 10,
          annual_revenue: metrics.annual_total_revenue,
          // Brand-fee rates (franchise/royalty/marketing/loyalty/reservation/
          // tech) are defined as % of *room* revenue, not total revenue, so
          // pass it through separately.
          annual_room_revenue: metrics.annual_room_revenue,
          hold_period_years: DEFAULT_HOLD_PERIOD_YEARS,
          ffe_reserve_rate: property.costRateFFE ?? undefined,
          base_management_fee_rate: property.baseManagementFeeRate ?? undefined,
          incentive_management_fee_rate: property.incentiveManagementFeeRate ?? undefined,
          franchise_fee_rate: property.franchiseFeeRate,
          royalty_fee_rate: property.royaltyFeeRate,
          brand_marketing_fee_rate: property.brandMarketingFeeRate,
          loyalty_program_fee_rate: property.loyaltyProgramFeeRate,
          reservation_fee_rate: property.reservationFeeRate,
          brand_technology_fee_rate: property.brandTechnologyFeeRate,
          hma_term_years: property.hmaTermYears,
          hma_termination_notice_months: property.hmaTerminationNoticeMonths,
          hma_contract_start_year: property.hmaContractStartYear,
          hma_termination_fee_months: property.hmaTerminationFeeMonths,
          pip_schedule: pipSchedule,
          condo_dues_pct_revenue: property.condoDuesPctRevenue,
          condo_exposure_notes: property.condoExposureNotes,
          condo_pending_special_assessments: property.condoPendingSpecialAssessments,
          country: property.country,
          state_province: property.stateProvince,
          location_type: property.locationType,
          year_built: property.yearBuilt,
          last_renovation_year: property.lastRenovationYear,
          current_year: currentYear,
        });

        // executeComputationTool returns a JSON string (or null if the tool
        // name doesn't resolve, or a JSON-encoded `{ error }` if dispatch
        // throws / validation fails). Parse + check before returning the
        // bundle so the panel always receives an object, not a string.
        if (bundleJson === null) {
          return res
            .status(500)
            .json({ error: "reserves_brand_bundle tool not registered", code: "RSVB-005" });
        }
        const bundle = JSON.parse(bundleJson) as Record<string, unknown>;
        if (typeof bundle.error === "string") {
          return res.status(500).json({ error: bundle.error });
        }

        res.json({
          propertyId: property.id,
          propertyName: property.name,
          hospitalityType: property.hospitalityType,
          annualRevenue: metrics.annual_total_revenue,
          bundle,
        });
      } catch (error: unknown) {
        logger.error(
          `reserves-brand bundle failed: ${error instanceof Error ? error.message : String(error)}`,
          "reserves-brand",
        );
        return logAndSendError(res, "reserves-brand-bundle failed", error, "RSVB-001");
      }
    },
  );
}
