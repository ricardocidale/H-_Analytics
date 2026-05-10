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
 *   POST   /api/lb-slides/factory/runs/:id/properties          Set property assignments + fire Lucca (Tab 3)
 *   PATCH  /api/lb-slides/factory/runs/:id/slots/:key          Update a single Lucca slot value / approval
 *   POST   /api/lb-slides/factory/runs/:id/approve-all-slots   Mark all Lucca slots approved
 *   POST   /api/lb-slides/factory/runs/:id/trigger-build       Advance draft_review → building (Tab 4)
 *   GET    /api/lb-slides/factory/runs/:id/download            Stream completed deck PDF from R2 (Tab 6)
 *
 * Auto-fire pattern: accept-brief immediately starts Lorenzo; saving properties
 * immediately starts Lucca. Both return 202 Accepted.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod/v4";
import { requireAdmin, getAuthUser } from "../auth";
import { storage } from "../storage";
import { getStorageProviderAsync } from "../providers/storage";
import { logAndSendError, parseRouteId, zodErrorMessage } from "./helpers";
import { logActivity } from "./helpers";
import {
  createSlideFactoryRun,
  getSlideFactoryRun,
  listSlideFactoryRuns,
  updateSlideFactoryRun,
} from "../storage/slide-factory-runs";
import { runLorenzoIngestion } from "../slides/lorenzo-ingestion";
import { runLuccaDraft } from "../slides/lucca-draft";
import { runMarco } from "../slides/marco";
import { runFranco } from "../slides/minions/franco";
import { runMayaForOverriddenSlides } from "../slides/rebuild-maya";
import { validateIngestUrl } from "../ai/iris/tools";
import { logger } from "../logger";
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
// Admin has reviewed and accepted the brief. Auto-fires Lorenzo ingestion and
// advances status → ingesting. Returns 202 Accepted.
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

      const ingesting = await updateSlideFactoryRun(id, {
        briefAccepted: true,
        status: "ingesting",
        startedAt: new Date(),
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "brief-accepted" });

      // Fire-and-forget: Lorenzo updates status to 'ingested' or 'error' when done.
      void runLorenzoIngestion(id);

      return res.status(HTTP_202_ACCEPTED).json(ingesting);
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

      const drafting = await updateSlideFactoryRun(id, {
        slide1PropertyId: parsed.data.slide1PropertyId ?? null,
        slide2PropertyId: parsed.data.slide2PropertyId ?? null,
        slide3PropertyId: parsed.data.slide3PropertyId ?? null,
        slide5PropertyId: parsed.data.slide5PropertyId ?? null,
        status: "drafting",
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "properties-set" });

      // Fire-and-forget: Lucca updates status to 'draft_review' or 'error' when done.
      void runLuccaDraft(id);

      return res.status(HTTP_202_ACCEPTED).json(drafting);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to set property assignments", err);
    }
  },
);

// ── PATCH /api/lb-slides/factory/runs/:id/slots/:key ────────────────────────
// Update a single Lucca slot's value and/or approval state.
// Allowed on 'draft_review' (Tab 4) and 'complete' (Tab 6 override panel).
// Denied on 'rebuilding' to prevent concurrent edits during an in-flight render.
const slotPatchSchema = z.object({
  value: z.string().optional(),
  approved: z.boolean().optional(),
});

/** Slots whose value is a fetchable URL — must be validated to block javascript:,
 *  data:, and private-network hosts before the value lands in the deck payload.
 *  Routes through the canonical Iris ingest validator so we don't drift from the
 *  server's single source of truth for URL safety. Empty string is allowed
 *  (clears the override). */
const URL_VALUED_SLOT_KEYS = new Set<string>(["slide3.interiorPhotoUrl"]);

function validateSlotUrlValue(rawUrl: string): string | null {
  if (rawUrl === "") return null; // empty clears the slot override
  return validateIngestUrl(rawUrl);
}

router.patch(
  "/api/lb-slides/factory/runs/:id/slots/:key",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const rawKey = req.params.key;
      if (!rawKey || Array.isArray(rawKey)) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: "Missing or invalid slot key" });
      }
      const slotKey: string = rawKey;

      const parsed = slotPatchSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(HTTP_400_BAD_REQUEST).json({ error: zodErrorMessage(parsed.error) });
      }

      // URL slots get an extra hop of validation — block javascript:, data:,
      // and private/internal hosts before the value lands in the rendered deck.
      if (parsed.data.value !== undefined && URL_VALUED_SLOT_KEYS.has(slotKey)) {
        const urlError = validateSlotUrlValue(parsed.data.value);
        if (urlError) {
          return res.status(HTTP_400_BAD_REQUEST).json({ error: urlError });
        }
      }

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      const slotEditAllowed = run.status === "draft_review" || run.status === "complete";
      if (!slotEditAllowed) {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Slot edits require status 'draft_review' or 'complete', current: '${run.status}'`,
        });
      }
      if (!run.luccaDraft) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No Lucca draft present" });
      }

      const existing = run.luccaDraft[slotKey];
      if (!existing) {
        return res.status(HTTP_404_NOT_FOUND).json({ error: `Slot '${slotKey}' not found in draft` });
      }

      const valueChanged = parsed.data.value !== undefined && parsed.data.value !== existing.value;
      const nowApproving = parsed.data.approved === true && !existing.approved;
      // Distinguish override-after-completion from Tab 4 inline edits so provenance
      // is traceable in the rebuilt deck's AuthoredString.
      const newSource = valueChanged
        ? run.status === "complete"
          ? ("admin-override" as const)
          : ("admin" as const)
        : undefined;

      // An admin override on a complete run is implicit re-approval — the value AND
      // approved=true must move together so the slot can never persist as
      // approved:false with a fresh approvedAt stamp.
      const implicitOverrideApproval =
        valueChanged && newSource === "admin-override" && parsed.data.approved !== false;

      const updatedSlot = {
        ...existing,
        ...(parsed.data.value !== undefined ? { value: parsed.data.value } : {}),
        ...(parsed.data.approved !== undefined
          ? { approved: parsed.data.approved }
          : implicitOverrideApproval
            ? { approved: true }
            : {}),
        ...(newSource !== undefined ? { source: newSource } : {}),
        // Stamp approvedAt when explicitly approving OR on implicit override approval.
        ...(nowApproving || implicitOverrideApproval ? { approvedAt: new Date().toISOString() } : {}),
        ...(parsed.data.approved === false ? { approvedAt: null } : {}),
      };

      const updatedDraft = { ...run.luccaDraft, [slotKey]: updatedSlot };
      const updated = await updateSlideFactoryRun(id, { luccaDraft: updatedDraft });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, {
        action: "slot-updated",
        slotKey,
      });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to update slot", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/approve-all-slots ──────────────────
// Tab 4: Mark every slot in luccaDraft as approved in a single write.
// Requires status 'draft_review'.
router.post(
  "/api/lb-slides/factory/runs/:id/approve-all-slots",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (run.status !== "draft_review") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Approve-all requires status 'draft_review', current: '${run.status}'`,
        });
      }
      if (!run.luccaDraft) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No Lucca draft present" });
      }

      const now = new Date().toISOString();
      const approvedDraft: Record<string, typeof run.luccaDraft[string]> = {};
      for (const [key, slot] of Object.entries(run.luccaDraft)) {
        approvedDraft[key] = {
          ...slot,
          approved: true,
          approvedAt: slot.approvedAt ?? now,
        };
      }

      const updated = await updateSlideFactoryRun(id, { luccaDraft: approvedDraft });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "all-slots-approved" });
      return res.status(HTTP_200_OK).json(updated);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to approve all slots", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/trigger-build ──────────────────────
// Tab 4: Admin has approved all Lucca slots. Advances draft_review → building.
// Returns 409 if any slot is still unapproved.
router.post(
  "/api/lb-slides/factory/runs/:id/trigger-build",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });

      const allowedStatuses = ["draft_review", "error"] as const;
      if (!(allowedStatuses as readonly string[]).includes(run.status)) {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Trigger-build requires status 'draft_review' or 'error', current: '${run.status}'`,
        });
      }

      // For draft_review: require all Lucca slots to be approved.
      // For error re-triggers: skip this check — the draft was already approved previously.
      if (run.status === "draft_review") {
        if (!run.luccaDraft) {
          return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({ error: "No Lucca draft present" });
        }
        const unapproved = Object.entries(run.luccaDraft)
          .filter(([, slot]) => !slot.approved)
          .map(([key]) => key);
        if (unapproved.length > 0) {
          return res.status(HTTP_409_CONFLICT).json({
            error: `${unapproved.length} slot(s) not yet approved: ${unapproved.slice(0, 3).join(", ")}${unapproved.length > 3 ? "…" : ""}`,
          });
        }
      }

      const isRetrigger = run.status === "error";
      const building = await updateSlideFactoryRun(id, { status: "building" });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, {
        action: isRetrigger ? "build-retriggered" : "build-triggered",
      });

      // Fire-and-forget Marco dispatch — same pattern as runLorenzoIngestion / runLuccaDraft.
      // Marco's internal failures transition the run to 'error' as a best-effort terminal state.
      void runMarco(id);

      return res.status(HTTP_202_ACCEPTED).json(building);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to trigger build", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/cancel ─────────────────────────────
// Detail panel: Admin cancels a run that is stuck in 'building'. Transitions
// status → 'error' and sets completedAt so the panel stops polling.
router.post(
  "/api/lb-slides/factory/runs/:id/cancel",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (run.status !== "building") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Cancel requires status 'building', current: '${run.status}'`,
        });
      }

      const cancelled = await updateSlideFactoryRun(id, {
        status: "error",
        completedAt: new Date(),
      });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "build-cancelled" });
      return res.status(HTTP_200_OK).json(cancelled);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to cancel slide factory run", err);
    }
  },
);

// ── POST /api/lb-slides/factory/runs/:id/rebuild ────────────────────────────
// Tab 6: Trigger a lightweight PDF re-render after admin has overridden one or
// more slots on a completed run. Transitions complete → rebuilding, fires Franco
// asynchronously, and writes status + deckR2Key + completedAt atomically on
// success. On failure, reverts to complete so the admin can retry.
// Returns 409 if the run is already rebuilding (single-flight guard).
router.post(
  "/api/lb-slides/factory/runs/:id/rebuild",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });

      if (run.status === "rebuilding") {
        return res.status(HTTP_409_CONFLICT).json({
          error: "A rebuild is already in progress for this run",
        });
      }
      if (run.status !== "complete") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Rebuild requires status 'complete', current: '${run.status}'`,
        });
      }

      const rebuilding = await updateSlideFactoryRun(id, { status: "rebuilding" });
      logActivity(req, "update", "slide_factory_run", id, `run-${id}`, { action: "rebuild-started" });

      // Fire-and-forget Franco render. skipDeckKeyWrite=true so we can write
      // status + deckR2Key + completedAt in a single atomic call on success.
      // Use req.log inside the IIFE so all rebuild work is correlated with the
      // originating request in the structured logs (project guideline).
      // Fall back to the module logger in test environments where req.log is
      // not wired up by Pino middleware.
      const reqLog = req.log ?? logger;
      void (async () => {
        try {
          const { deckR2Key } = await runFranco(id, {
            caller: "rebuild",
            skipDeckKeyWrite: true,
          });
          // Run Maya for overridden slides BEFORE flipping to complete so a
          // concurrent override cannot race in while Maya is still evaluating.
          try {
            await runMayaForOverriddenSlides(id);
          } catch (mayaErr) {
            reqLog.error(
              `[rebuild] run ${id}: runMayaForOverriddenSlides failed — ${String(mayaErr)}`,
            );
          }
          await updateSlideFactoryRun(id, {
            status: "complete",
            deckR2Key,
            completedAt: new Date(),
          });
          reqLog.info(`[rebuild] run ${id}: rebuild complete (${deckR2Key})`);
        } catch (err) {
          reqLog.error(
            `[rebuild] run ${id}: Franco failed — reverting to complete: ${String(err)}`,
          );
          // Revert so the admin can trigger another rebuild.
          await updateSlideFactoryRun(id, { status: "complete" }).catch(() => {});
        }
      })();

      return res.status(HTTP_202_ACCEPTED).json(rebuilding);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to start rebuild", err);
    }
  },
);

// ── GET /api/lb-slides/factory/runs/:id/download ─────────────────────────────
// Tab 6: Stream the completed deck PDF from R2. Returns 422 when deckR2Key is
// absent (precondition not met — deck not yet generated, regardless of status).
// Returns 409 when the run is in 'complete' status but deckR2Key is present yet
// some other conflict exists (should not normally occur).
router.get(
  "/api/lb-slides/factory/runs/:id/download",
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const user = getAuthUser(req);
      const id = parseRouteId(req.params.id);
      if (!id) return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid run ID" });

      const run = await getSlideFactoryRun(id, user.id);
      if (!run) return res.status(HTTP_404_NOT_FOUND).json({ error: "Not found" });
      if (!run.deckR2Key) {
        return res.status(HTTP_422_UNPROCESSABLE_ENTITY).json({
          error: "Deck PDF not yet generated for this run",
        });
      }
      if (run.status !== "complete") {
        return res.status(HTTP_409_CONFLICT).json({
          error: `Deck not ready — run status is ${run.status}`,
        });
      }

      const sp = await getStorageProviderAsync();
      const { buffer } = await sp.downloadBuffer(run.deckR2Key);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="slide-deck-run-${run.id}.pdf"`,
      );
      res.setHeader("Cache-Control", "no-store");
      return res.send(buffer);
    } catch (err: unknown) {
      logAndSendError(res, "Failed to download factory deck", err);
    }
  },
);

export { router as slideFactoryRouter };
