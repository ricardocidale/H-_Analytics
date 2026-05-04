/**
 * internal-lb-deck-payload.ts
 *
 * GET /api/internal/lb-deck-payload?token=<hmac>
 *
 * Returns the full LbSlidePayload (6 per-slide sub-payloads) as JSON,
 * gated by an HMAC short-TTL LB token (see slides/lb-token.ts).
 *
 * This endpoint exists so the portal's `/internal/lb-deck` React route —
 * which Playwright navigates during PDF render — can fetch all 6 payloads
 * in one authenticated request without a session cookie.
 *
 * Token namespace: "lb.*" — separate from per-property "propertyId.*" tokens.
 * A per-property token submitted here is rejected as wrong-kind.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../logger";
import { buildLbPayload } from "../slides/build-lb-payload";
import { verifyLbDeckToken } from "../slides/lb-token";
import {
  HTTP_401_UNAUTHORIZED,
  HTTP_503_SERVICE_UNAVAILABLE,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

router.get(
  "/api/internal/lb-deck-payload",
  async (req: Request, res: Response) => {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const verified = verifyLbDeckToken(token);
    if (!verified.ok) {
      return res
        .status(HTTP_401_UNAUTHORIZED)
        .json({ error: `Invalid LB deck token: ${verified.reason}` });
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
