/**
 * Market Signals routes — Submarket Supply Pipeline + STR Ordinance Events.
 *
 * Mounted under `/api/market-signals/*`. All endpoints are property-scoped,
 * gated by `requireAuth` + `checkPropertyAccess`, and validate request
 * bodies via Zod schemas defined in lib/db/src/schema/intelligence/market-data.ts.
 *
 * No scrapers — Daniela (property.risk-intelligence Specialist) is the
 * sole upstream writer of these tables. Routes are read-mostly with thin
 * upsert/delete admin paths for Specialist plumbing and tests.
 */

import type { Express } from "express";
import { storage } from "../storage";
import { requireAuth, getAuthUser, checkPropertyAccess } from "../auth";
import { logAndSendError, parseRouteId, sendError } from "./helpers";
import {
  insertSubmarketSupplyProjectSchema,
  insertStrOrdinanceEventSchema,
} from "@workspace/db";
import {
  computePipelinePressure,
  computeRevparDrag,
  computeStrTrend,
} from "@shared/market-intelligence-pipeline";
import { z } from "zod";
import { MARKET_SIGNAL_SQFT_FALLBACK } from "../constants";

const computeQuerySchema = z.object({
  baselineRevpar: z.coerce.number().nonnegative().optional(),
  existingInventory: z.coerce.number().nonnegative().optional(),
});

export function register(app: Express) {
  // ── Supply Pipeline ──────────────────────────────────────────────

  app.get("/api/market-signals/:propertyId/supply-pipeline", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (propertyId === null) return sendError(res, 400, "Invalid property ID", "MSIG-007");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-008");
      }
      const projects = await storage.listSupplyProjectsForProperty(propertyId);
      const parsed = computeQuerySchema.parse(req.query);
      const property = await storage.getProperty(propertyId);
      const existingInventory = parsed.existingInventory ?? estimateSubmarketInventory(projects, property);
      const pressure = computePipelinePressure(projects, existingInventory);
      const baselineRevpar = parsed.baselineRevpar ?? 0;
      const drag = baselineRevpar > 0 ? computeRevparDrag(pressure, baselineRevpar) : null;
      res.json({ projects, pressure, drag, existingInventory });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch supply pipeline", error, "MSIG-001");
    }
  });

  app.post("/api/market-signals/:propertyId/supply-pipeline", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (propertyId === null) return sendError(res, 400, "Invalid property ID", "MSIG-009");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-010");
      }
      const body = insertSubmarketSupplyProjectSchema.parse({ ...req.body, propertyId });
      const row = await storage.upsertSupplyProject(body);
      res.json(row);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) return sendError(res, 400, error.issues[0]?.message ?? "Invalid body", "MSIG-011");
      logAndSendError(res, "Failed to upsert supply project", error, "MSIG-002");
    }
  });

  app.delete("/api/market-signals/:propertyId/supply-pipeline/:id", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      const id = parseRouteId(req.params.id);
      if (propertyId === null || id === null) return sendError(res, 400, "Invalid ID", "MSIG-012");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-013");
      }
      await storage.deleteSupplyProject(id, propertyId);
      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete supply project", error, "MSIG-003");
    }
  });

  // ── STR Ordinance Events ─────────────────────────────────────────

  app.get("/api/market-signals/:propertyId/str-events", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (propertyId === null) return sendError(res, 400, "Invalid property ID", "MSIG-014");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-015");
      }
      const events = await storage.listStrEventsForProperty(propertyId);
      const trend = computeStrTrend(events);
      const property = await storage.getProperty(propertyId);
      res.json({
        events,
        trend,
        strExempt: Boolean(property?.strExempt),
      });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to fetch STR events", error, "MSIG-004");
    }
  });

  app.post("/api/market-signals/:propertyId/str-events", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      if (propertyId === null) return sendError(res, 400, "Invalid property ID", "MSIG-016");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-017");
      }
      const body = insertStrOrdinanceEventSchema.parse({ ...req.body, propertyId });
      const row = await storage.upsertStrEvent(body);
      res.json(row);
    } catch (error: unknown) {
      if (error instanceof z.ZodError) return sendError(res, 400, error.issues[0]?.message ?? "Invalid body", "MSIG-018");
      logAndSendError(res, "Failed to upsert STR event", error, "MSIG-005");
    }
  });

  app.delete("/api/market-signals/:propertyId/str-events/:id", requireAuth, async (req, res) => {
    try {
      const propertyId = parseRouteId(req.params.propertyId);
      const id = parseRouteId(req.params.id);
      if (propertyId === null || id === null) return sendError(res, 400, "Invalid ID", "MSIG-019");
      if (!(await checkPropertyAccess(getAuthUser(req), propertyId))) {
        return sendError(res, 403, "Access denied", "MSIG-020");
      }
      await storage.deleteStrEvent(id, propertyId);
      res.json({ ok: true });
    } catch (error: unknown) {
      logAndSendError(res, "Failed to delete STR event", error, "MSIG-006");
    }
  });
}

/** Conservative submarket-inventory fallback when the caller doesn't pass one
 *  via ?existingInventory. Uses the subject property's room count × 30 as a
 *  rough "30 comparable assets" proxy so the gauge isn't divide-by-one wild
 *  during early data collection. */
function estimateSubmarketInventory(
  projects: Array<{ keyCount: number | null }>,
  property: { roomCount?: number | null } | undefined,
): number {
  const subjectRooms = Number(property?.roomCount ?? 0);
  const projectKeys = projects.reduce((sum, p) => sum + (p.keyCount ?? 0), 0);
  const fallback = subjectRooms > 0 ? subjectRooms * 30 : MARKET_SIGNAL_SQFT_FALLBACK;
  return Math.max(fallback, projectKeys);
}
