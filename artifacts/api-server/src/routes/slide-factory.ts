/**
 * Slide factory run management routes.
 *
 * These routes support the 6-tab LB slide factory wizard (V2). The brief file
 * itself is uploaded by the browser directly to R2 via a presigned URL
 * (POST /api/uploads/request-url) — these endpoints only record the R2 key
 * and drive run state transitions.
 *
 * Tab 2 (Lorenzo ingestion), Tab 4 (Lucca draft), and Tab 5 (Marco dispatch)
 * are triggered by dedicated agent-dispatch routes added in later build units.
 *
 * Endpoints:
 *   POST   /api/lb-slides/factory/runs                         Create a new run
 *   GET    /api/lb-slides/factory/runs                         List runs (newest first)
 *   GET    /api/lb-slides/factory/runs/:id                     Get a specific run
 *   POST   /api/lb-slides/factory/runs/:id/brief               Record uploaded brief (Tab 1)
 *   POST   /api/lb-slides/factory/runs/:id/accept-brief        Accept brief, advance to brief_ready
 *   POST   /api/lb-slides/factory/runs/:id/trigger-ingestion   Start Lorenzo ingestion (Tab 2)
 *   POST   /api/lb-slides/factory/runs/:id/properties          Set property assignments (Tab 3)
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { requireAdmin, getAuthUser } from "../auth";
import { storage } from "../storage";
import { logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import { logActivity } from "./helpers";
import {
  createSlideFactoryRun,
  getSlideFactoryRun,
  listSlideFactoryRuns,
  updateSlideFactoryRun,
} from "../storage/slide-factory-runs";
import { runLorenzoIngestion } from "../slides/lorenzo-ingestion";
import {
  HTTP_200_OK,
  HTTP_201_CREATED,
  HTTP_202_ACCEPTED,
  HTTP_400_BAD_REQUEST,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_422_UNPROCESSABLE_ENTITY,
} from "../constants";

const router = Router();

// ── POST /api/lb-slides/factory/runs ────────────────────────────────────────
router.post("/api/lb-slides/factory/runs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const run = await createSlideFactoryRun(user.id);
    logActivity(req, "create", "slide_factory_run", run.id, `run-${run.id}`);
    return res.status(HTTP_201_CREATED).json(run);
  } catch (err: unknown) {
    logAndSendError(res, "Failed to create slide factory run", err);
  }
});

// ── GET /api/lb-slides/factory/runs ─────────────────────────────────────────
router.get("/api/lb-slides/factory/runs", requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const runs = await listSlideFactoryRuns(user.id);
    return res.status(HTTP_200_OK).json(runs);
  } catch (err: unknown) {
    logAndSendError(res, "Failed to list slide factory runs", err);
  }
});

// ── GET /api/lb-slides/factory/runs/:id ─────────────────────────────────────
router.get("/api/lb-slides/factory/runs/:id", requireAdmin, async (req: Request, res: Response) => {
  try {
    const user = getAuthUser(req);
    const id = parseRouteId(req.params.id);
    if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });
    const run = await getSlideFactoryRun(id, user.id);
    if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
    return res.status(HTTP_200_OK).json(run);
  } catch (err: unknown) {
    logAndSendError(res, "Failed to get slide factory run", err);
  }
});

// ── POST /api/lb-slides/factory/runs/:id/brief ──────────────────────────────
// Records the R2 key of a brief already uploaded by the browser.
// The browser obtains a presigned upload URL via POST /api/uploads/request-url,
// uploads the PDF/PPTX directly to R2, then calls this endpoint with the key.
const briefSchema = z.object({
  r2Key: z.string().min(1),
  filename: z.string().min(1),
});

router.post(
  "/api/lb-slides/factory/runs/:id/brief",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const parsed = briefSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (run.status !== "new") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Brief can only be uploaded when status is 'new', current: '${run.status}'`,
        });
      }

      const updated = await updateSlideFactoryRun(id, {
        briefR2Key: parsed.data.r2Key,
        briefFilename: parsed.data.filename,
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "brief-uploaded" });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to record brief upload", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/accept-brief ───────────────────────
// Admin has reviewed and accepted the brief. Advances status → brief_ready.
router.post(
  "/api/lb-slides/factory/runs/:id/accept-brief",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (!run.briefR2Key) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No brief uploaded yet" });
      }
      if (run.status !== "new") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Brief can only be accepted when status is 'new', current: '${run.status}'`,
        });
      }

      const updated = await updateSlideFactoryRun(id, {
        briefAccepted: true,
        status: "brief_ready",
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "brief-accepted" });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to accept brief", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/trigger-ingestion ──────────────────
// Tab 2: Starts the Lorenzo ingestion pipeline for this run.
// Requires status 'brief_ready' (brief uploaded and accepted).
// Immediately advances status → 'ingesting' and fires the Lorenzo job
// asynchronously. Returns 202 Accepted; poll GET /runs/:id for status updates.
router.post(
  "/api/lb-slides/factory/runs/:id/trigger-ingestion",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (!run.briefR2Key) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No brief uploaded yet" });
      }
      if (run.status !== "brief_ready") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Ingestion requires status 'brief_ready', current: '${run.status}'`,
        });
      }

      const ingesting = await updateSlideFactoryRun(id, {
        status: "ingesting",
        startedAt: new Date(),
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, {
        action: "ingestion-triggered",
      });

      // Fire-and-forget: Lorenzo updates status to 'ingested' or 'error' when done.
      void runLorenzoIngestion(id);

      return res.status(HTTP_202_ACCEPTED).json(ingesting);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to trigger ingestion", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/properties ─────────────────────────
// Tab 3: Admin sets which properties appear on slides 1, 2, 3, and 5.
// Requires status 'ingested' (Lorenzo has finished producing the spec).
// Ownership of each property ID is verified before writing.
const propertiesSchema = z.object({
  slide1PropertyId: z.number().int().nullable().optional(),
  slide2PropertyId: z.number().int().nullable().optional(),
  slide3PropertyId: z.number().int().nullable().optional(),
  slide5PropertyId: z.number().int().nullable().optional(),
});

router.post(
  "/api/lb-slides/factory/runs/:id/properties",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const parsed = propertiesSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (run.status !== "ingested") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Property assignments require status 'ingested', current: '${run.status}'`,
        });
      }

      // Verify ownership of each non-null property ID
      const SLIDE_FIELDS = [
        ["slide1PropertyId", parsed.data.slide1PropertyId],
        ["slide2PropertyId", parsed.data.slide2PropertyId],
        ["slide3PropertyId", parsed.data.slide3PropertyId],
        ["slide5PropertyId", parsed.data.slide5PropertyId],
      ] as const;

      for (const [field, propId] of SLIDE_FIELDS) {
        if (propId == null) continue;
        const prop = await storage.getProperty(propId);
        if (!prop || prop.userId !== user.id) {
          return res.status(HTTP_400_BAD_REQUEST).json({
            error: `Property ID ${propId} for ${field} not found or not owned by you`,
          });
        }
      }

      const updated = await updateSlideFactoryRun(id, {
        slide1PropertyId: parsed.data.slide1PropertyId ?? null,
        slide2PropertyId: parsed.data.slide2PropertyId ?? null,
        slide3PropertyId: parsed.data.slide3PropertyId ?? null,
        slide5PropertyId: parsed.data.slide5PropertyId ?? null,
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "properties-set" });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to set property assignments", err);
    }
  },
);

export { router as slideFactoryRouter };
