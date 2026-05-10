import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../../auth";
import { logAndSendError } from "../helpers";
import { isAdminRole } from "@shared/constants";
import {
  HTTP_204_NO_CONTENT,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
} from "../../constants";

export function registerResearchFetchRoutes(app: Express) {
  app.get("/api/market-research", requireAuth, async (req, res) => {
    try {
      const { type, propertyId } = req.query;
      const parsedPropId = propertyId ? Number(propertyId) : undefined;
      if (
        parsedPropId !== undefined &&
        (!Number.isFinite(parsedPropId) || parsedPropId <= 0)
      ) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "RFET-005" });
      }
      if (
        parsedPropId &&
        !(await checkPropertyAccess(getAuthUser(req), parsedPropId))
      ) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "RFET-006" });
      }
      const research = await storage.getMarketResearch(
        type as string,
        getAuthUser(req).id,
        parsedPropId,
      );
      res.json(research || null);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research", error, "RFET-001");
    }
  });

  app.get("/api/research/property", requireAuth, async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (
        propertyId &&
        !(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))
      ) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "RFET-007" });
      }
      const research = await storage.getMarketResearch(
        "property",
        getAuthUser(req).id,
        propertyId ? Number(propertyId) : undefined,
      );
      res.json(research || null);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research", error, "RFET-002");
    }
  });

  /**
   * DELETE /api/market-research/:id
   * Hard-delete a market_research record. Users may only delete their own
   * records; admins may delete any record (no userId scope applied).
   */
  app.delete("/api/market-research/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid id", code: "RFET-008" });
      }
      const user = getAuthUser(req);
      const scopedUserId = isAdminRole(user.role) ? undefined : user.id;
      await storage.deleteMarketResearch(id, scopedUserId);
      res.status(HTTP_204_NO_CONTENT).end();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete market research", error, "RFET-003");
    }
  });

  /**
   * DELETE /api/research/runs/:id
   * Hard-delete a research_run row (admin only — run records are audit logs).
   * Cascades to relaxation_traces and coverage_snapshots via FK constraints.
   */
  app.delete("/api/research/runs/:id", requireAuth, async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isFinite(id) || id <= 0) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid id", code: "RFET-009" });
      }
      const user = getAuthUser(req);
      if (!isAdminRole(user.role)) {
        return res.status(HTTP_403_FORBIDDEN).json({ error: "Admin access required", code: "RFET-010" });
      }
      await storage.deleteResearchRun(id);
      res.status(HTTP_204_NO_CONTENT).end();
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete research run", error, "RFET-004");
    }
  });
}
