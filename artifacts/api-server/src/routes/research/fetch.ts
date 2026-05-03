import type { Express } from "express";
import { storage } from "../../storage";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../../auth";
import { logAndSendError } from "../helpers";

export function registerResearchFetchRoutes(app: Express) {
  app.get("/api/market-research", requireAuth, async (req, res) => {
    try {
      const { type, propertyId } = req.query;
      const parsedPropId = propertyId ? Number(propertyId) : undefined;
      if (
        parsedPropId !== undefined &&
        (!Number.isFinite(parsedPropId) || parsedPropId <= 0)
      ) {
        return res.status(400).json({ error: "Invalid property ID" });
      }
      if (
        parsedPropId &&
        !(await checkPropertyAccess(getAuthUser(req), parsedPropId))
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
      const research = await storage.getMarketResearch(
        type as string,
        getAuthUser(req).id,
        parsedPropId,
      );
      res.json(research || null);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research", error);
    }
  });

  app.get("/api/research/property", requireAuth, async (req, res) => {
    try {
      const { propertyId } = req.query;
      if (
        propertyId &&
        !(await checkPropertyAccess(getAuthUser(req), Number(propertyId)))
      ) {
        return res.status(403).json({ error: "Access denied" });
      }
      const research = await storage.getMarketResearch(
        "property",
        getAuthUser(req).id,
        propertyId ? Number(propertyId) : undefined,
      );
      res.json(research || null);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch research", error);
    }
  });
}
