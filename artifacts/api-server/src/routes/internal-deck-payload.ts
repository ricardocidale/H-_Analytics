/**
 * internal-deck-payload.ts
 *
 * GET /api/internal/deck-payload/:id?token=<hmac>
 *
 * Returns the full SlidePayload for a single property as JSON, gated by an
 * HMAC-signed short-TTL token (see slides/internal-token.ts). This endpoint
 * exists so the portal's `/internal/deck/:id` React route — which Playwright
 * navigates to during PDF render — can fetch all required data in one
 * authenticated call without depending on a session cookie.
 *
 * The token is bound to a single propertyId, so a leaked token cannot be
 * replayed against another property. There is no auth bypass beyond the
 * specific property the token was minted for.
 */

import { Router, type Request, type Response } from "express";
import { logger } from "../logger";
import { parseRouteId } from "./helpers";
import { buildSlidePayload } from "../slides/build-payload";
import { verifyDeckToken } from "../slides/internal-token";
import {
  HTTP_400_BAD_REQUEST,
  HTTP_401_UNAUTHORIZED,
  HTTP_500_INTERNAL_SERVER_ERROR,
} from "../constants";

const router = Router();

router.get(
  "/api/internal/deck-payload/:id",
  async (req: Request, res: Response) => {
    const propertyId = parseRouteId(req.params.id);
    if (!propertyId) {
      return res.status(HTTP_400_BAD_REQUEST).json({ error: "Invalid property ID", code: "IDCK-001" });
    }

    const token = typeof req.query.token === "string" ? req.query.token : "";
    const verified = verifyDeckToken(token, propertyId);
    if (!verified.ok) {
      return res
        .status(HTTP_401_UNAUTHORIZED)
        .json({ error: `Invalid deck token: ${verified.reason}`, code: "IDCK-002" });
    }

    try {
      // userId=undefined → sources projectionYears from stored global assumptions
      // (falls back to DEFAULT_PROJECTION_YEARS). The token is the only capability
      // check; we deliberately do NOT scope by user.
      const payload = await buildSlidePayload(propertyId, undefined);
      res.setHeader("Cache-Control", "no-store");
      return res.json(payload);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to build deck payload";
      logger.error(
        `[internal-deck-payload] property ${propertyId}: ${message}`,
        "internal-deck-payload",
      );
      return res.status(HTTP_500_INTERNAL_SERVER_ERROR).json({ error: message });
    }
  },
);

export { router as internalDeckPayloadRouter };
