import type { Express } from "express";
import { requireAuth, getAuthUser } from "../auth";
import { logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import { insertPortfolioSchema, updatePortfolioSchema } from "@workspace/db";
import { storage } from "../storage";
import {
  HTTP_200_OK,
  HTTP_201_CREATED,
  HTTP_400_BAD_REQUEST,
  HTTP_403_FORBIDDEN,
  HTTP_404_NOT_FOUND,
} from "../constants";

export function register(app: Express) {
  // GET /api/portfolios — list the authenticated user's portfolios
  app.get("/api/portfolios", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const items = await storage.getPortfolios(user.id);
      res.status(HTTP_200_OK).json(items);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch portfolios", error, "PORT-001");
    }
  });

  // POST /api/portfolios — create a new portfolio
  app.post("/api/portfolios", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const validation = insertPortfolioSchema.omit({ userId: true }).safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      const portfolio = await storage.createPortfolio({ ...validation.data, userId: user.id });
      res.status(HTTP_201_CREATED).json(portfolio);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to create portfolio", error, "PORT-002");
    }
  });

  // PATCH /api/portfolios/:id — update name/description
  app.patch("/api/portfolios/:id", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid portfolio ID", code: "PORT-010" });

      const validation = updatePortfolioSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(validation.error) });
      }
      const updated = await storage.updatePortfolio(id, user.id, validation.data);
      if (!updated) return res.status(HTTP_404_NOT_FOUND).json({ error: "Portfolio not found", code: "PORT-011" });
      res.status(HTTP_200_OK).json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update portfolio", error, "PORT-003");
    }
  });

  // DELETE /api/portfolios/:id — delete a portfolio (properties become unassigned)
  app.delete("/api/portfolios/:id", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid portfolio ID", code: "PORT-012" });

      const existing = await storage.getPortfolio(id, user.id);
      if (!existing) return res.status(HTTP_404_NOT_FOUND).json({ error: "Portfolio not found", code: "PORT-013" });

      await storage.deletePortfolio(id, user.id);
      res.status(HTTP_200_OK).json({ success: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete portfolio", error, "PORT-004");
    }
  });

  // GET /api/portfolios/:id/properties — list properties in a portfolio
  app.get("/api/portfolios/:id/properties", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid portfolio ID", code: "PORT-014" });

      const portfolio = await storage.getPortfolio(id, user.id);
      if (!portfolio) return res.status(HTTP_404_NOT_FOUND).json({ error: "Portfolio not found", code: "PORT-015" });

      const items = await storage.getPortfolioProperties(id, user.id);
      res.status(HTTP_200_OK).json(items);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch portfolio properties", error, "PORT-005");
    }
  });

  // PUT /api/properties/:id/portfolio — assign or unassign a property to a portfolio
  app.put("/api/properties/:id/portfolio", requireAuth, async (req, res) => {
    try {
      const user = getAuthUser(req);
      const propertyId = parseRouteId(req.params.id);
      if (!propertyId) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "PORT-016" });

      const { portfolioId } = req.body as { portfolioId: number | null };

      // Ownership check before write — prevent unauthorized mutation
      const existing = await storage.getProperty(propertyId);
      if (!existing) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PORT-018" });
      if (existing.userId !== user.id) return res.status(HTTP_403_FORBIDDEN).json({ error: "Access denied", code: "PORT-019" });

      // Validate target portfolio belongs to user (if assigning)
      if (portfolioId !== null && portfolioId !== undefined) {
        const portfolio = await storage.getPortfolio(portfolioId, user.id);
        if (!portfolio) return res.status(HTTP_404_NOT_FOUND).json({ error: "Portfolio not found", code: "PORT-017" });
      }

      const updated = await storage.updateProperty(propertyId, { portfolioId: portfolioId ?? null });
      if (!updated) return res.status(HTTP_404_NOT_FOUND).json({ error: "Property not found", code: "PORT-018b" });

      res.status(HTTP_200_OK).json(updated);
    } catch (error: unknown) {
      logAndSendError(res, "Failed to update property portfolio assignment", error, "PORT-006");
    }
  });
}
