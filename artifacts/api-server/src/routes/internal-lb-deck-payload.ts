/**
 * internal-lb-deck-payload.ts
 *
 * GET /api/internal/lb-deck-payload?token=<hmac>
 *
 * Returns the full LbSlidePayload (6 per-slide sub-payloads) as JSON,
 * gated by one of two HMAC short-TTL token kinds:
 *
 *   - `lb.*`      — legacy LB-deck render. Reads property assignments from
 *                   `lb_slides_config`. Used by the manual configure-and-
 *                   render workflow (admin → LB Slides → Render).
 *
 *   - `factory.*` — slide-factory render. Reads property assignments and
 *                   lucca-drafted slot copy from `slide_factory_runs.<runId>`.
 *                   Token payload includes `runId`. Used by Franco the
 *                   deck-render minion (post-Marco completion) and the
 *                   Rebecca `produce_slide_factory_deck` tool.
 *
 * The route tries the factory verifier first (cheap, prefix-discriminated),
 * falls back to the legacy verifier. Both paths land at the same response
 * shape so the React page (`/internal/lb-deck`) is token-agnostic.
 *
 * This endpoint exists so the portal's `/internal/lb-deck` React route —
 * which Playwright navigates during PDF render — can fetch all 6 payloads
 * in one authenticated request without a session cookie.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../logger";
import { buildLbPayload, buildLbPayloadFromFactoryRun } from "../slides/build-lb-payload";
import { verifyLbDeckToken } from "../slides/lb-token";
import { verifyFactoryDeckToken } from "../slides/factory-token";
import { getSlideFactoryRunById } from "../storage/slide-factory-runs";
import {
  HTTP_401_UNAUTHORIZED,
  HTTP_404_NOT_FOUND,
  HTTP_409_CONFLICT,
  HTTP_503_SERVICE_UNAVAILABLE,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

router.get(
  "/api/internal/lb-deck-payload",
  async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";

    // ── Factory token branch (try first — prefix-discriminated, no DB hit on miss) ──
    const factoryVerified = verifyFactoryDeckToken(token);
    if (factoryVerified.ok) {
      try {
        const run = await getSlideFactoryRunById(factoryVerified.runId);
        if (!run) {
          return res.status(HTTP_404_NOT_FOUND).json({
            error: `Slide factory run ${factoryVerified.runId} not found`,
          });
        }
        if (run.status !== "complete") {
          return res.status(HTTP_409_CONFLICT).json({
            error: `Slide factory run ${run.id} is not complete (status: ${run.status})`,
          });
        }
        const payload = await buildLbPayloadFromFactoryRun(run);
        res.setHeader("Cache-Control", "no-store");
        return res.json(payload);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Failed to build factory deck payload";
        if (message.includes("not fully configured")) {
          return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: message });
        }
        logger.error(`[internal-lb-deck-payload][factory] ${message}`, "internal-lb-deck-payload");
        return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
      }
    }

    // ── Legacy LB token fallback ───────────────────────────────────────────────
    const verified = verifyLbDeckToken(token);
    if (!verified.ok) {
      // Prefer the factory verifier's reason when the token looked factory-shaped
      // (e.g., expired, wrong signature) — otherwise surface the legacy reason.
      const reason =
        factoryVerified.reason !== "wrong-kind" ? factoryVerified.reason : verified.reason;
      return res
        .status(HTTP_401_UNAUTHORIZED)
        .json({ error: `Invalid LB deck token: ${reason}` });
    }

    try {
      const payload = await buildLbPayload();
      res.setHeader("Cache-Control", "no-store");
      return res.json(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to build LB deck payload";
      // "not fully configured" is a user-actionable state, not a 500
      if (message.includes("not fully configured")) {
        return res.status(HTTP_503_SERVICE_UNAVAILABLE).json({ error: message });
      }
      logger.error(`[internal-lb-deck-payload] ${message}`, "internal-lb-deck-payload");
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as internalLbDeckPayloadRouter };
